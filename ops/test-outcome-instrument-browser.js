const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const outcomes = require("../lib/proactive-outcomes/archive/v14-c3-v3");
const route = require("../data/multi-scene-learning-route.json");

const root = path.resolve(__dirname, "..");
const chapter = route.chapters.find((item) => item.id === "V14-C3");
const output = path.join(root, "output", "playwright", "独立测量v3");
const keys = { near_transfer: ["b", "a", "c", "c", "b"],
  representation_transfer: ["a", "c", "b", "b", "a"], retention: ["c", "b", "a", "a", "c"] };
const endpoint = "/api/learning/proactive/outcomes";
const basePath = process.env.TEST_BASE_PATH || "";

async function api(page, pathname, body) {
  return page.evaluate(async ({ pathname, body }) => {
    const response = await fetch(pathname, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.authToken}` },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, payload: await response.json() };
  }, { pathname, body });
}

async function start(dbPath, port) {
  const logs = [];
  const child = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DB_PATH: dbPath, HOST: "127.0.0.1", BASE_PATH: basePath, NODE_ENV: "test",
      LLM_PROVIDER: "mock", GRADING_LLM_PROVIDER: "mock", PROACTIVE_POLICY_MODE: "active",
      PROACTIVE_PARTICIPATION_MODE: "implicit-pilot", PROACTIVE_EXPERIMENT_ID: "outcome-v3-browser",
      PROACTIVE_OUTCOME_INSTRUMENT_VERSION: "v14-c3-outcomes-v3",
      PROACTIVE_RETENTION_DELAY_HOURS: "0", PROACTIVE_RETENTION_CLOSE_HOURS: "120",
      PROACTIVE_RETENTION_REMINDER_HOURS: "0,96", RATE_LIMIT_MAX: "5000" }
  });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(logs.join(""));
    try {
      if ((await fetch(`http://127.0.0.1:${port}${basePath}/api/health`)).ok) return child;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await stop(child);
  throw new Error("隔离测量服务未启动");
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 4000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function registerAndUnlock(page, base, suffix) {
  await page.goto(base);
  await page.locator('[data-auth-mode="register"]').click();
  await page.locator("#nickname").fill(`独立测量${suffix}${Date.now()}`);
  await page.locator("#register-password").fill("outcome-browser-password");
  await page.locator("#register-password-confirm").fill("outcome-browser-password");
  await page.locator("#login-submit").click();
  await page.locator("#auth-gate").waitFor({ state: "hidden" });
  // The pre/post submissions only establish measurement eligibility for this fixture.
  for (const phase of ["pre", "post"]) {
    const quiz = phase === "pre" ? chapter.flow.preQuiz : chapter.flow.postQuiz;
    const response = await api(page, "/api/learning/quiz/submit", {
      chapterId: "V14-C3", unitId: `V14-C3-${phase}`, phase,
      answers: quiz.questions.map((question) => ({ questionId: question.id,
        response: ["multiple", "short_answer"].includes(question.type) ? question.answer : question.answer[0] }))
    });
    assert.equal(response.status, 200);
  }
  await page.reload();
  await page.locator("#app-loader").waitFor({ state: "hidden" });
  await page.locator('[data-view="learn"]').first().click();
  if (!await page.locator("#lesson-rail").isVisible()) {
    await page.locator("#lesson-rail-toggle").click();
  }
  const open = page.locator(".outcome-path-step.is-available");
  await open.waitFor({ state: "visible" });
  const navigation = await page.evaluate(() => {
    const chapter = getChapter("V14-C3");
    const reviewed = chapter.units.filter((unit) => unit.type === "knowledge").map((unit) => ({
      id: unit.id, action: KnowledgeAssistant.outcomeNavigationAction(unit)
    }));
    const post = chapter.units.find((unit) => unit.assessmentPhase === "post");
    const path = ensureAgenticPath();
    const original = path.pendingPlan;
    path.pendingPlan = { unitId: post.id, phase: "post" };
    const pendingAction = KnowledgeAssistant.outcomeNavigationAction(post);
    path.pendingPlan = original;
    return { reviewed, pendingAction };
  });
  assert.equal(navigation.reviewed.length, 7);
  assert.ok(navigation.reviewed.every((entry) => entry.action === null),
    "后测已提交也不能让七个回看课件的按钮跳去迁移测量");
  assert.equal(navigation.pendingAction, null, "迁移入口不能覆盖待确认的后测学习路径");
  await open.click();
  await page.locator(".knowledge-outcome-stage.is-available").waitFor();
}

async function checkFigure(fieldset, name) {
  const image = fieldset.locator("img");
  await image.scrollIntoViewIfNeeded();
  const response = await image.evaluate(async (node) => {
    const result = await fetch(node.src);
    return { status: result.status, type: result.headers.get("content-type") };
  });
  assert.equal(response.status, 200, "题图必须可由实际静态服务访问");
  assert.match(response.type, /image\/svg\+xml/);
  await image.evaluate((node) => node.decode());
  const pixels = await image.evaluate((node) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(node, 0, 0, 640, 300);
    const data = ctx.getImageData(0, 0, 640, 300).data;
    let painted = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.min(data[i], data[i + 1], data[i + 2]) < 200 && data[i + 3] > 0) painted += 1;
    }
    const box = node.getBoundingClientRect();
    return { painted, width: box.width, height: box.height, natural: node.naturalWidth };
  });
  assert.ok(pixels.painted > 1000 && pixels.width >= 400 && pixels.natural === 640,
    `图形必须清晰可见且有实际数学内容：${JSON.stringify(pixels)}`);
  assert.ok(Math.abs(pixels.width / pixels.height - 640 / 300) < 0.01);
  await fieldset.screenshot({ path: path.join(output, `${name}.png`) });
}

async function answerStage(page, stageId, answers, hasFigures = false) {
  const active = page.locator(".knowledge-outcome-active");
  await active.waitFor({ state: "visible" });
  for (let i = 0; i < 5; i += 1) {
    const fieldset = active.locator("fieldset").nth(i);
    if (hasFigures) await checkFigure(fieldset, `${stageId}-第${i + 1}题`);
    const input = fieldset.locator(`input[value="${answers[i]}"]`);
    if (!await input.isChecked()) {
      const saved = page.waitForResponse((response) => response.url().includes(`${endpoint}/draft`));
      await input.check();
      assert.equal((await saved).status(), 200);
    }
  }
  const submitted = page.waitForResponse((response) => response.url().includes(`${endpoint}/submit`));
  await active.locator(".knowledge-outcome-submit").click();
  const response = await submitted;
  assert.equal(response.status(), 200);
  await active.waitFor({ state: "hidden" });
  return response.json();
}

async function main() {
  const browserPath = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"]
    .find((candidate) => fs.existsSync(candidate));
  assert.ok(browserPath);
  fs.mkdirSync(output, { recursive: true });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cq-outcome-r3-"));
  const dbPath = path.join(temp, "test.db");
  const port = await new Promise((resolve) => {
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1", () => {
      const value = socket.address().port;
      socket.close(() => resolve(value));
    });
  });
  const base = `http://127.0.0.1:${port}${basePath}/`;
  let child;
  let browser;
  try {
    child = await start(dbPath, port);
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await registerAndUnlock(page, base, "新版");
    for (const [index, stageId] of outcomes.stageIds.entries()) {
      await page.setViewportSize(index === 1
        ? { width: 1920, height: 1080 } : { width: 1366, height: 768 });
      await page.locator(".knowledge-outcome-stage.is-available > button").click();
      const payload = await answerStage(page, stageId, keys[stageId], index === 1);
      assert.equal(payload.data.answerReviewReleased, index === 2);
      if (index < 2) {
        const review = payload.data.stages.find((stage) => stage.id === stageId).review;
        assert.equal(Object.hasOwn(review.items[0], "correctOption"), false);
      } else {
        for (const stage of payload.data.stages) {
          assert.equal(stage.review.score, 5);
          assert.equal(stage.review.instrumentVersion, outcomes.version);
        }
      }
      await page.locator(".knowledge-outcome-review").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "返回任务列表", exact: true }).click();
      console.log(`${stageId} 实际作答和回看入口通过。`);
    }
    await page.locator(".knowledge-outcome-stage").nth(1).getByRole("button", { name: "回看作答" }).click();
    assert.equal(await page.locator(".knowledge-outcome-review img").count(), 5);
    for (let i = 0; i < 5; i += 1) {
      await checkFigure(page.locator(".knowledge-outcome-review-item").nth(i), `回看-第${i + 1}题`);
    }

    const legacy = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await registerAndUnlock(legacy, base, "旧版");
    const started = await api(legacy, `${endpoint}/start`, { chapterId: "V14-C3", stageId: "near_transfer" });
    assert.equal(started.status, 200);
    const sessionId = started.payload.sessionId;
    // Simulate an already-started v2 session only while the isolated database is closed.
    await stop(child);
    child = null;
    const SQL = await require("sql.js")();
    const database = new SQL.Database(fs.readFileSync(dbPath));
    try {
      database.run("UPDATE proactive_outcome_sessions SET instrument_version = ?, draft_response_json = ? WHERE id = ?",
        ["v14-c3-outcomes-v2", JSON.stringify({ "V14-C3-NT-01": "a" }), sessionId]);
      fs.writeFileSync(dbPath, Buffer.from(database.export()));
    } finally { database.close(); }
    child = await start(dbPath, port);
    await legacy.reload();
    await legacy.locator("#app-loader").waitFor({ state: "hidden" });
    await legacy.locator('[data-view="learn"]').first().click();
    if (!await legacy.locator(".knowledge-outcome-active").isVisible()) {
      if (!await legacy.locator("#lesson-rail").isVisible()) await legacy.locator("#lesson-rail-toggle").click();
      await legacy.locator(".outcome-path-step.is-active").click();
    }
    await legacy.locator(".knowledge-outcome-active").waitFor();
    assert.equal(await legacy.locator('input[name="outcome-near_transfer-V14-C3-NT-01"][value="a"]').isChecked(), true);
    const state = await api(legacy, `${endpoint}?chapterId=V14-C3`);
    assert.equal(state.payload.data.stages[0].instrumentVersion, "v14-c3-outcomes-v2");
    const rejected = await api(legacy, `${endpoint}/draft`, { chapterId: "V14-C3", stageId: "near_transfer",
      sessionId, responses: { "V14-C3-NT-r3-01": "b" } });
    assert.equal(rejected.status, 400, "旧会话不得接受新版题号");
    const preserved = await api(legacy, `${endpoint}?chapterId=V14-C3`);
    assert.deepEqual(preserved.payload.data.activeSession.responses, { "V14-C3-NT-01": "a" });
    const legacySubmitted = await answerStage(legacy, "near_transfer", ["a", "a", "c", "a", "a"]);
    const review = legacySubmitted.data.stages[0].review;
    assert.equal(review.instrumentVersion, "v14-c3-outcomes-v2");
    assert.equal(review.items[0].id, "V14-C3-NT-01");
    assert.equal(review.items[0].responseLabel, "增加 7 L");
    assert.equal(Object.hasOwn(review.items[0], "correctOption"), false);
    for (const stageId of ["representation_transfer", "retention"]) {
      const opened = await api(legacy, `${endpoint}/start`, { chapterId: "V14-C3", stageId });
      assert.equal(opened.status, 200);
      const skipped = await api(legacy, `${endpoint}/skip`, {
        chapterId: "V14-C3", sessionId: opened.payload.sessionId, reason: "technical_issue"
      });
      assert.equal(skipped.status, 200);
    }
    const released = await api(legacy, `${endpoint}?chapterId=V14-C3`);
    assert.equal(released.payload.data.answerReviewReleased, true);
    assert.equal(released.payload.data.stages[0].review.score, 5, "旧会话实际服务端仍按v2判分");
    assert.equal(released.payload.data.stages[0].review.items[0].correctOption, "a",
      "回看答案缓存必须按版本隔离，不能复用v3的b");
    await stop(child);
    child = null;
    const missingVersionDb = new SQL.Database(fs.readFileSync(dbPath));
    try {
      missingVersionDb.run("UPDATE proactive_outcome_attempts SET instrument_version = ? WHERE id = ?",
        ["unavailable-version-fixture", legacySubmitted.attemptId]);
      fs.writeFileSync(dbPath, Buffer.from(missingVersionDb.export()));
    } finally { missingVersionDb.close(); }
    child = await start(dbPath, port);
    await legacy.reload();
    await legacy.locator("#app-loader").waitFor({ state: "hidden" });
    if (!await legacy.locator("#lesson-rail").isVisible()) await legacy.locator("#lesson-rail-toggle").click();
    await legacy.locator(".outcome-path-step.is-submitted").click();
    const unavailableReview = legacy.locator(".knowledge-outcome-review");
    await unavailableReview.waitFor({ state: "visible" });
    assert.match(await unavailableReview.innerText(), /原题库版本暂不可用/);
    assert.equal(await unavailableReview.locator(".knowledge-outcome-review-item").count(), 0,
      "未知版本不得借用当前题目展示历史结果");
    assert.deepEqual(errors, []);
    console.log("独立测量桌面回归通过：v3三阶段实际作答判分、五图显示与回看、延迟答案开放、v2恢复与错版草稿拒绝、未知历史版本安全提示。");
  } finally {
    await browser?.close();
    await stop(child);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
