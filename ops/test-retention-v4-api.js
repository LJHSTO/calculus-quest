const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const route = require("../data/multi-scene-learning-route.json");
const chapterId = process.env.RETENTION_TEST_CHAPTER || "V14-C1";
const functionsLimits = chapterId === "V14-C1";
const instrumentVersion = functionsLimits ? "functions-limits-retention-r3" : "v14-c3-retention-v4";
const itemCount = functionsLimits ? 18 : 7;
const chapter = route.chapters.find((item) => item.id === chapterId);
const endpoint = "/api/learning/proactive/outcomes";

async function main() {
  const root = path.resolve(__dirname, "..");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-retention-v4-"));
  const dbPath = path.join(dir, "test.db");
  const port = await new Promise((resolve) => {
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1", () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  let child, token, browser;
  const nickname = `保持测量${Date.now()}`;
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await exited;
  }
  async function start() {
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test", HOST: "127.0.0.1", BASE_PATH: "",
        DB_PATH: dbPath, LLM_PROVIDER: "mock", GRADING_LLM_PROVIDER: "mock",
        ADMIN_TOKEN: "retention-test-admin",
        PROACTIVE_POLICY_MODE: "active", PROACTIVE_PARTICIPATION_MODE: "implicit-pilot",
        PROACTIVE_EXPERIMENT_ID: "retention-v4-test", RATE_LIMIT_MAX: "5000",
        PROACTIVE_EXPERIMENT_CHAPTER_ID: chapterId,
        PROACTIVE_OUTCOME_INSTRUMENT_VERSION: instrumentVersion,
        PROACTIVE_ASSIGNMENT_SALT: "retention-synthetic-test-salt",
        PROACTIVE_RETENTION_CLOSE_HOURS: "0",
        PROACTIVE_RETENTION_DELAY_HOURS: "0" }
    });
    let logs = "";
    child.stdout.on("data", (data) => { logs += data; });
    child.stderr.on("data", (data) => { logs += data; });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("保持测量测试服务启动超时");
  }
  async function api(url, body) {
    const response = await fetch(`${base}${url}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, payload: await response.json() };
  }
  async function agePost(hours) {
    await stop();
    const SQL = await require("sql.js")();
    const database = new SQL.Database(fs.readFileSync(dbPath));
    try {
      database.run("UPDATE quiz_results SET created_at = ? WHERE phase = 'post'",
        [new Date(Date.now() - hours * 3600000).toISOString()]);
      fs.writeFileSync(dbPath, Buffer.from(database.export()));
    } finally { database.close(); }
    await start();
  }
  try {
    await start();
    const registered = await api("/api/auth/register", {
      nickname, email: "", password: "retention-test-password"
    });
    assert.equal(registered.status, 200);
    token = registered.payload.token;
    for (const phase of ["pre", "post"]) {
      const quiz = phase === "pre" ? chapter.flow.preQuiz : chapter.flow.postQuiz;
      const submitted = await api("/api/learning/quiz/submit", {
        chapterId: chapter.id, unitId: `${chapter.id}-${phase}`, phase,
        answers: quiz.questions.map((question) => ({ questionId: question.id,
          response: question.type === "short_answer" ? "__unknown__" : question.type === "multiple" ? question.answer : question.answer[0] }))
      });
      assert.equal(submitted.status, 200);
    }
    const body = { chapterId: chapter.id, stageId: "retention" };
    for (const hours of [0, 71.99]) {
      if (hours) await agePost(hours);
      const state = (await api(`${endpoint}?chapterId=${chapterId}`)).payload.data;
      assert.equal(state.retentionDelayHours, 72, "配置0小时不能绕过新版72小时门槛");
      assert.equal(state.posttest.ready, true, "模型未评分不阻断提交完成");
      assert.deepEqual(state.stages.map((s) => s.id), ["retention"]);
      assert.equal(state.stages[0].status, "locked");
      assert.equal(Object.hasOwn(state.stages[0], "items"), false);
      assert.equal((await api(`${endpoint}/start`, body)).status, 409);
    }
    await agePost(72.01);
    const available = (await api(`${endpoint}?chapterId=${chapterId}`)).payload.data;
    assert.equal(available.stages[0].status, "available");
    assert.equal(available.stages[0].items.length, itemCount);
    assert.equal(available.retentionCloseHours, null);
    assert.equal(available.retentionWindow.closeAt, "");
    for (const hours of [120, 720, 24 * 366]) {
      await agePost(hours);
      const later = (await api(`${endpoint}?chapterId=${chapterId}`)).payload.data;
      assert.equal(later.stages[0].status, "available", `${hours}小时后仍可开始`);
      assert.equal(later.retentionWindow.status, "open");
      assert.equal(later.stages[0].closeAt, "");
      assert.deepEqual(later.retentionWindow.dueReminderHours, [72, 96]);
    }
    assert.notEqual((await api(`${endpoint}/start`, { ...body, stageId: "near_transfer" })).status, 200);
    const started = await api(`${endpoint}/start`, body);
    assert.equal(started.status, 200);
    assert.equal(started.payload.data.agentAssistanceBlocked, true);
    const sessionId = started.payload.sessionId;
    const keys = functionsLimits
      ? require("../lib/assessments/functions-limits-retention-r3").items.map((q, i) =>
        i === itemCount - 1 ? "__unknown__" : String.fromCharCode(65 + q.row[2]))
      : ["c", "b", "a", "a", "c", "c", "b"];
    const responses = Object.fromEntries(available.stages[0].items.map((item, i) => [item.id, keys[i]]));
    assert.equal((await api(`${endpoint}/draft`, { ...body, sessionId, responses })).status, 200);
    await agePost(24 * 400);
    const resumed = (await api(`${endpoint}?chapterId=${chapterId}`)).payload.data;
    assert.deepEqual(resumed.activeSession.responses, responses);
    assert.equal(resumed.stages[0].status, "active", "长期暂停不自动超窗");
    const beforeSubmitAdmin = await fetch(`${base}/api/admin/research/proactive-decisions?experimentId=retention-v4-test`, {
      headers: { Authorization: "Bearer retention-test-admin" }
    });
    const beforeSubmit = (await beforeSubmitAdmin.json()).data;
    assert.equal(beforeSubmit.protocol.definition.retentionCloseHours, null);
    assert.equal(beforeSubmit.participantAnalysis[0].retention_window.close_at, "");
    assert.equal(beforeSubmit.participantAnalysis[0].retention_window.expired, false);
    assert.equal(beforeSubmit.participantAnalysis[0].retention_window.closing_soon, false);
    const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((file) => fs.existsSync(file));
    assert.ok(executablePath);
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await page.locator("#login-identifier").fill(nickname);
    await page.locator("#login-password").fill("retention-test-password");
    await page.locator("#login-submit").click();
    await page.locator("#auth-gate").waitFor({ state: "hidden" });
    await page.locator('[data-view="learn"]').first().click();
    await page.evaluate(() => KnowledgeAssistant.openOutcomeStage("retention"));
    const active = page.locator(".knowledge-outcome-active");
    await active.waitFor({ state: "visible" });
    assert.equal(await page.locator("#knowledge-outcomes-title").innerText(), "保持测量");
    assert.equal(await active.locator("fieldset").count(), itemCount);
    assert.equal(await active.locator("input:checked").count(), itemCount);
    if (functionsLimits) {
      for (const fieldset of await active.locator("fieldset").all()) {
        assert.deepEqual(await fieldset.locator("input").evaluateAll(inputs => inputs.map(input => input.value)),
          ["A", "B", "C", "D", "__unknown__"]);
        assert.equal((await fieldset.locator(".unknown-choice-option").innerText()).trim(), "我不会");
      }
    }
    const figure = active.locator("img");
    if (await figure.count()) {
      await figure.first().scrollIntoViewIfNeeded();
      await figure.first().evaluate((image) => image.decode());
    }
    const output = path.join(root, "output", "playwright", functionsLimits ? "函数极限保持测量" : "保持测量v4");
    fs.mkdirSync(output, { recursive: true });
    for (const width of [1366, 1920]) {
      await page.setViewportSize({ width, height: width === 1366 ? 768 : 1080 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, `${itemCount}题保持测量-${width}.png`) });
    }
    const browserSubmit = page.waitForResponse((response) => response.url().endsWith(`${endpoint}/submit`));
    await active.locator(".knowledge-outcome-submit").click();
    assert.equal((await browserSubmit).status(), 200);
    await page.locator(".knowledge-outcome-review").waitFor({ state: "visible" });
    assert.equal(await page.locator(".knowledge-outcome-review-item").count(), itemCount);
    assert.deepEqual(errors, []);
    const submitted = await api(`${endpoint}/submit`, { ...body, sessionId, responses, durationMs: 60000 });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.payload.data.agentAssistanceBlocked, false);
    assert.equal(submitted.payload.data.stages[0].review.score, functionsLimits ? 17 : 7);
    assert.equal(submitted.payload.data.answerReviewReleased, true);
    assert.equal((await api(`${endpoint}/submit`, { ...body, sessionId, responses })).status, 200);
    const adminResponse = await fetch(`${base}/api/admin/research/proactive-decisions?experimentId=retention-v4-test`, {
      headers: { Authorization: "Bearer retention-test-admin" }
    });
    assert.equal(adminResponse.status, 200);
    const admin = (await adminResponse.json()).data;
    assert.equal(admin.outcomes.summary[0].instrument_version, instrumentVersion);
    assert.equal(admin.participantAnalysis[0].outcomes.near_transfer.status, "not_applicable");
    assert.notEqual(admin.participantAnalysis[0].retention_window.status, "waiting_for_transfer");
    console.log(`${chapterId}保持测量 API：72小时前锁定、120/720/8784小时仍开放、9600小时草稿恢复与提交、${itemCount}题、后台无截止、幂等及帮助锁释放通过。`);
  } finally { await browser?.close(); await stop(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
