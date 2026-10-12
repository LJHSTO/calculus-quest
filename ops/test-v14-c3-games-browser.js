const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const route = require("../data/multi-scene-learning-route.json");
const basePath = "/calculus_quest";
const chapter = route.chapters.find((item) => item.id === "V14-C3");
const browserCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft Edge\\Application\\msedge.exe"
].filter(Boolean);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHealth(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode})\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${baseUrl}${basePath}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server health timeout\n${logs.join("")}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 4000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function gameCandidates() {
  return (chapter?.modules || []).flatMap((module) => (
    (module.knowledgePoints || []).flatMap((knowledgePoint) => (
      (knowledgePoint.resourceCandidates || [])
        .filter((candidate) => candidate.type === "game")
        .map((candidate) => ({ module, knowledgePoint, candidate }))
    ))
  ));
}

function encodedResourcePath(candidate) {
  return `/${["resources", ...candidate.root.split("/"), ...candidate.file.split("/")]
    .map(encodeURIComponent)
    .join("/")}`;
}

function createIssueCollector(page) {
  const issues = [];
  page.on("pageerror", (error) => {
    issues.push({ kind: "pageerror", message: String(error?.stack || error) });
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      issues.push({ kind: "console", message: message.text() });
    }
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "";
    if (!/ERR_ABORTED/i.test(failure)) {
      issues.push({ kind: "requestfailed", url: request.url(), message: failure });
    }
  });
  return issues;
}

async function openGame(context, baseUrl, entry, options = {}) {
  const page = await context.newPage();
  const issues = createIssueCollector(page);
  await page.addInitScript(() => {
    window.__coursewareEvidence = [];
    window.addEventListener("openmaic:learning-evidence", (event) => {
      window.__coursewareEvidence.push(event.detail);
    });
  });
  if (options.clock) {
    await page.clock.install({ time: new Date("2026-09-03T00:00:00Z") });
  }
  const url = `${baseUrl}${basePath}${encodedResourcePath(entry.candidate)}`;
  let surface = page;
  if (process.env.TEST_EMBEDDED === "1") {
    await page.goto(`${baseUrl}${basePath}/`, { waitUntil: "domcontentloaded" });
    await page.setContent('<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0}</style><iframe sandbox="allow-scripts allow-forms allow-pointer-lock"></iframe>');
    const frame = await (await page.locator("iframe").elementHandle()).contentFrame();
    await frame.goto(url, { waitUntil: "domcontentloaded" });
    surface = new Proxy(frame, {
      get(target, key) {
        const owner = key === "close" || !(key in target) ? page : target;
        const value = owner[key];
        return typeof value === "function" ? value.bind(owner) : value;
      }
    });
  } else {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }
  await surface.locator("body").waitFor({ state: "visible" });
  await surface.waitForFunction(() => document.readyState === "complete");
  if (options.clock) await page.clock.runFor(500);
  else await page.waitForTimeout(500);
  assert.equal(
    await surface.evaluate(() => Boolean(window.OpenMaicLearningEvidence)),
    true,
    `${entry.knowledgePoint.id}: learning-evidence runtime was not injected`
  );
  return { page: surface, issues };
}

async function evidence(page, eventType) {
  return page.evaluate((type) => (
    window.__coursewareEvidence.filter((event) => event.event_type === type)
  ), eventType);
}

async function installControlledRaf(page) {
  await page.evaluate(() => {
    let nextId = 1;
    const callbacks = new Map();
    let timestamp = performance.now();
    window.requestAnimationFrame = (callback) => {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => callbacks.delete(id);
    window.__coursewareRunFrames = (count, stepMs) => {
      timestamp = Math.max(timestamp, performance.now());
      for (let index = 0; index < count; index += 1) {
        timestamp += stepMs;
        const frameCallbacks = [...callbacks.values()];
        callbacks.clear();
        frameCallbacks.forEach((callback) => callback(timestamp));
      }
      return callbacks.size;
    };
  });
}

async function runAnimationFrames(page, count, stepMs = 50) {
  return page.evaluate(
    ({ frames, step }) => window.__coursewareRunFrames(frames, step),
    { frames: count, step: stepMs }
  );
}

function assertNoIssues(issues, label) {
  assert.deepEqual(issues, [], `${label}浏览器异常：${JSON.stringify(issues, null, 2)}`);
}

async function testAreaGame(context, baseUrl, entry) {
  const { page, issues } = await openGame(context, baseUrl, entry, { clock: true });
  try {
    await page.locator("#start-screen button").click();
    await page.locator("#controls-panel").waitFor({ state: "visible" });

    const controlLabel = await page.locator("#width-slider").locator("xpath=preceding-sibling::*[1]").innerText();
    assert.match(controlLabel, /矩形数量/, "面积 game 应把滑块标为矩形数量");

    const initialAccuracy = Number((await page.locator("#coverage-value").innerText()).replace("%", ""));
    const targetAccuracy = 93;
    assert.ok(
      initialAccuracy < targetAccuracy,
      `首关默认配置不应天然达标：${initialAccuracy}% >= ${targetAccuracy}%`
    );

    await page.getByRole("button", { name: /清除全部/ }).click();
    assert.equal((await evidence(page, "reset_used")).length, 0, "空清除不能产生 reset_used 证据");

    await page.locator("#btn-left").click();
    await page.clock.fastForward(5100);
    assert.equal(
      await page.locator("#level-complete-screen").evaluate((element) => element.classList.contains("hidden")),
      true,
      "空清除和重复模式不能让关卡完成"
    );

    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#width-slider").inputValue(), "6");
    const keyboardAccuracy = Number((await page.locator("#coverage-value").innerText()).replace("%", ""));
    assert.ok(keyboardAccuracy >= targetAccuracy, "键盘增加矩形数量后应达到首关目标");
    await page.clock.runFor(50);
    await page.locator("#level-complete-screen:not(.hidden)").waitFor({ state: "visible" });

    const results = await evidence(page, "challenge_result");
    assert.equal(results.length, 1);
    assert.equal(results[0].is_correct, true);
    assert.equal(results[0].independent, true);
    assert.equal(results[0].attempt_number, 1);
    assert.ok(results[0].accuracy >= targetAccuracy / 100);
    for (let level = 1; level < 5; level += 1) {
      await page.locator('#level-complete-screen button[onclick="nextLevel()"]').click();
      await page.locator("#width-slider").focus();
      await page.locator("#width-slider").press("End");
      await page.clock.runFor(5150);
      await page.locator("#level-complete-screen:not(.hidden)").waitFor({ state: "visible" });
    }
    await page.locator('#level-complete-screen button[onclick="nextLevel()"]').click();
    await page.locator("#victory-screen:not(.hidden)").waitFor({ state: "visible" });
    assert.equal((await evidence(page, "scene_completed")).length, 1);
    assert.deepEqual(issues, [], `面积 game 浏览器异常：${JSON.stringify(issues, null, 2)}`);
  } finally {
    await page.close();
  }

  const timeoutRun = await openGame(context, baseUrl, entry, { clock: true });
  try {
    await timeoutRun.page.evaluate(() => {
      window.requestAnimationFrame = () => 0;
    });
    await timeoutRun.page.locator("#start-screen button").click();
    const levelTime = Number(await timeoutRun.page.locator("#timer-value").innerText());
    await timeoutRun.page.clock.runFor((levelTime + 1) * 1000);
    await timeoutRun.page.locator("#gameover-screen:not(.hidden)").waitFor({ state: "visible" }).catch(async (error) => {
      console.error("面积游戏超时诊断", await timeoutRun.page.evaluate(() => ({
        timer: document.getElementById("timer-value")?.textContent,
        gameover: document.getElementById("gameover-screen")?.outerHTML.slice(0, 500),
        text: document.body.innerText.slice(-1500)
      })));
      throw error;
    });
    const results = await evidence(timeoutRun.page, "challenge_result");
    assert.equal(results.length, 1);
    assert.equal(results[0].is_correct, false);
    assert.equal(results[0].attempt_number, 1);
    assert.deepEqual(timeoutRun.issues, [], `面积 game 超时路径异常：${JSON.stringify(timeoutRun.issues, null, 2)}`);
  } finally {
    await timeoutRun.page.close();
  }
}

async function testDisplacementGame(context, baseUrl, entry) {
  const { page, issues } = await openGame(context, baseUrl, entry);
  try {
    await installControlledRaf(page);
    await page.locator("#start-overlay button").click();
    await page.getByRole("button", { name: "出发！", exact: true }).click();
    await runAnimationFrames(page, 205, 50);
    await page.locator("#result-overlay:not(.hidden)").waitFor({ state: "visible" });

    assert.equal(await page.locator("#result-score").innerText(), "+0");
    assert.match(await page.locator("#result-title").innerText(), /再试一次/);
    const results = await evidence(page, "challenge_result");
    assert.equal(results.length, 1);
    assert.equal(results[0].is_correct, false);
    assert.equal(results[0].score, 0);
    assert.equal(results[0].position, 0);
    assert.equal(results[0].had_positive_velocity, false);
    assert.equal(results[0].had_negative_velocity, false);

    await page.locator("#result-btn").click();
    await page.locator("#level-overlay:not(.hidden)").waitFor({ state: "visible" });
    assert.match(await page.locator("#level-title").innerText(), /第 1 关/);
    const resets = await evidence(page, "reset_used");
    assert.equal(resets.length, 1);
    assert.equal(resets[0].reason, "retry_level");
    const targets = [8, -5, 3, -2, 0];
    let heldButton = "";
    async function holdControl(id) {
      if (id === heldButton) return;
      await page.mouse.up();
      heldButton = id;
      if (id) {
        const bounds = await page.locator(`#${id}`).boundingBox();
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await page.mouse.down();
      }
    }
    async function driveToWaypoint(target) {
      for (let tick = 0; tick < 100; tick += 1) {
        const position = parseFloat(await page.locator("#hud-position").innerText());
        const velocity = parseFloat(await page.locator("#vel-val").innerText());
        const error = target - position;
        if (Math.abs(error) < 0.2 && Math.abs(velocity) < 0.2) {
          await holdControl("btn-brake");
          return;
        }
        const braking = velocity * error >= 0 && velocity * velocity / 16 >= Math.abs(error) - 0.1;
        await holdControl(braking ? "btn-brake"
          : Math.abs(velocity) >= 3 && velocity * error > 0 ? ""
            : error > 0 ? "btn-forward" : "btn-reverse");
        await runAnimationFrames(page, 2, 50);
        assert.equal(await page.locator("#result-overlay").isVisible(), false,
          `赛车应有足够时间通过实际控件到达 ${target}m`);
      }
      assert.fail(`赛车未能通过实际控件接近 ${target}m`);
    }
    const screenshots = path.join(root, "output", "playwright", "全场景交互");
    fs.mkdirSync(screenshots, { recursive: true });
    for (const [level, target] of targets.entries()) {
      await page.getByRole("button", { name: "出发！", exact: true }).click();
      if (target === 0) await driveToWaypoint(2);
      await driveToWaypoint(target);
      await runAnimationFrames(page, 320, 50);
      await holdControl("");
      await page.locator("#result-overlay:not(.hidden)").waitFor({ state: "visible" });
      const result = (await evidence(page, "challenge_result")).at(-1);
      assert.equal(result.is_correct, true, `赛车第${level + 1}关必须通过`);
      assert.ok(Math.abs(result.position - target) < 1);
      if (target === 0) {
        assert.equal(result.had_positive_velocity, true);
        assert.equal(result.had_negative_velocity, true);
        assert.ok(result.total_distance >= 2);
      }
      await page.screenshot({
        path: path.join(screenshots, `位移赛车-第${level + 1}关-${process.env.TEST_EMBEDDED === "1" ? "嵌入" : "独立"}.png`)
      });
      await page.locator("#result-btn").click();
    }
    assert.match(await page.locator("#level-title").innerText(), /第 1 关/);
    await page.getByRole("button", { name: "出发！", exact: true }).click();
    assert.equal(await page.locator("#hud-score").innerText(), "0", "通关重开应清空上一局奖励分");
    const completed = await evidence(page, "scene_completed");
    assert.equal(completed.length, 1);
    assert.equal(completed[0].score, 5);
    assert.equal(completed[0].max_score, 5);
    assertNoIssues(issues, "位移赛车 game ");
  } finally {
    await page.close();
  }
}

async function testAntiderivativeGame(context, baseUrl, entry) {
  const { page, issues } = await openGame(context, baseUrl, entry, { clock: true });
  try {
    await installControlledRaf(page);
    await page.locator("#start-btn").click();
    await page.getByRole("button", { name: "x² + C", exact: true }).click();
    await page.locator("#c-badge").click();
    await page.locator("#submit-btn").click();

    let results = await evidence(page, "challenge_result");
    assert.equal(results.length, 1);
    assert.equal(results[0].is_correct, false);
    assert.equal(results[0].selected_answer, "x² + C");

    const timerBefore = await page.locator("#timer-display").innerText();
    await page.clock.runFor(2100);
    const timerAfterWrong = await page.locator("#timer-display").innerText();
    assert.notEqual(timerAfterWrong, timerBefore, "错误提交后计时必须继续");

    await page.getByRole("button", { name: "x + C", exact: true }).click();
    await page.locator("#c-badge").click();
    await page.locator("#submit-btn").click();
    results = await evidence(page, "challenge_result");
    assert.deepEqual(results.map((result) => result.is_correct), [false, true]);
    assert.deepEqual(results.map((result) => result.attempt_number), [1, 2]);

    const timerAtSuccess = await page.locator("#timer-display").innerText();
    await page.clock.runFor(900);
    await page.locator("#success-overlay").waitFor({ state: "visible" });
    await page.clock.runFor(2000);
    assert.equal(
      await page.locator("#timer-display").innerText(),
      timerAtSuccess,
      "正确提交后计时必须停止"
    );
    for (const answer of ["x² + C", "x³ + C", "sin(x) + C", "eˣ + C", "ln|x| + C"]) {
      await page.locator("#next-btn").click();
      await page.getByRole("button", { name: answer, exact: true }).click();
      await page.locator("#c-badge").click();
      await page.locator("#submit-btn").click();
      await page.clock.runFor(1000);
      await page.locator("#success-overlay").waitFor({ state: "visible" });
    }
    await page.locator("#next-btn").click();
    await page.locator("#end-screen").waitFor({ state: "visible" });
    assert.equal((await evidence(page, "scene_completed")).length, 1);
    assertNoIssues(issues, "原函数 game ");
  } finally {
    await page.close();
  }
}

async function testVariableUpperLimitGame(context, baseUrl, entry) {
  const { page, issues } = await openGame(context, baseUrl, entry);
  const screenshotDir = path.join(root, "output", "playwright", "全场景交互");
  fs.mkdirSync(screenshotDir, { recursive: true });
  try {
    await page.locator("#startScreen button").click();
    const slider = page.locator("#xSlider");
    assert.equal(await page.locator("#xValue").innerText(), "0.0");
    await slider.evaluate((element) => {
      element.value = "50";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(await page.locator("#xValue").innerText(), "2.5");

    await page.getByRole("button", { name: "💡 提示", exact: true }).click();
    assert.equal((await evidence(page, "hint_requested")).length, 1);
    await page.locator("#pauseBtn").click();
    await page.locator("#pauseOverlay:not(.hidden)").waitFor({ state: "visible" });
    await page.locator("#pauseOverlay button").click();
    await page.getByRole("button", { name: "重置本关", exact: true }).click();
    assert.equal((await evidence(page, "reset_used")).length, 1);
    await page.waitForTimeout(650);

    const canvas = page.locator("#gameCanvas");
    const box = await canvas.boundingBox();
    assert.ok(box && box.width > 300 && box.height > 200, "变上限积分画布不可用");
    const plotWidth = box.width - 85;
    const plotHeight = box.height - 80;
    const from = {
      x: box.x + box.width - 60,
      y: box.y + box.height / 2
    };
    const to = {
      x: box.x + 55 + (0.25 / 5) * plotWidth,
      y: box.y + 30 + plotHeight / 2
    };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(() => (
      window.__coursewareEvidence.some((event) => event.event_type === "challenge_result")
    ));

    const results = await evidence(page, "challenge_result");
    assert.equal(results.length, 1);
    assert.equal(results[0].is_correct, true);
    assert.equal(results[0].hint_count, 1);
    assert.equal(results[0].reset_count, 1);
    assert.equal(results[0].independent, false);

    await page.evaluate(() => window.restartGame());
    assert.equal(await page.locator("#xValue").innerText(), "0.0");
    assert.equal((await evidence(page, "reset_used")).length, 2);
    const partitions = [
      { end: 5, minY: 0, maxY: 4, count: 10, f: () => 2 },
      { end: 4, minY: 0, maxY: 4.5, count: 10, f: (x) => x },
      { end: 5, minY: 0, maxY: 8, count: 12, f: (x) => 0.3 * x * x },
      { end: Math.PI * 1.2, minY: -0.5, maxY: 3.5, count: 14, f: (x) => 2 * Math.sin(x) + 1 },
      { end: 4, minY: -0.5, maxY: 3.5, count: 10, f: (x) => 1.5 * Math.abs(x - 2) }
    ];
    for (const [level, partition] of partitions.entries()) {
      await slider.focus();
      await slider.press("End");
      assert.equal(await page.locator("#xValue").innerText(), partition.end.toFixed(1),
        `变上限第${level + 1}关滑块上限必须等于图区上限`);
      for (let index = 0; index < partition.count; index += 1) {
        await page.waitForTimeout(700);
        const bounds = await canvas.boundingBox();
        const x = (index + 0.5) * partition.end / partition.count;
        const placement = {
          from: { x: bounds.width - 60, y: bounds.height / 2 },
          to: {
            x: 55 + x / partition.end * (bounds.width - 85),
            y: 30 + (partition.maxY - partition.f(x)) / (partition.maxY - partition.minY)
              * (bounds.height - 80)
          }
        };
        assert.ok(placement.to.x >= 0 && placement.to.x <= bounds.width
          && placement.to.y >= 0 && placement.to.y <= bounds.height,
          `变上限第${level + 1}关第${index + 1}块目标不可越界`);
        await page.mouse.move(bounds.x + placement.from.x, bounds.y + placement.from.y);
        await page.mouse.down();
        await page.mouse.move(bounds.x + placement.to.x, bounds.y + placement.to.y, { steps: 8 });
        await page.mouse.up();
        assert.equal(await page.locator("#progressDisplay").innerText(),
          `${index + 1}/${partition.count}`);
      }
      await page.locator("#levelCompleteScreen:not(.hidden)").waitFor({ state: "visible" });
      assert.equal(await page.locator("#levelAccuracy").innerText(), "100%");
      await page.screenshot({
        path: path.join(screenshotDir, `变上限积分-第${level + 1}关-${process.env.TEST_EMBEDDED === "1" ? "嵌入" : "独立"}.png`)
      });
      await page.locator('#levelCompleteScreen button[onclick="nextLevel()"]').click();
    }
    await page.locator("#gameCompleteScreen:not(.hidden)").waitFor({ state: "visible" });
    assert.equal((await evidence(page, "scene_completed")).length, 1);
    await page.locator('#gameCompleteScreen button[onclick="restartGame()"]').click();
    assert.equal(await page.locator("#levelDisplay").innerText(), "1/5");
    assert.equal(await page.locator("#progressDisplay").innerText(), "0/10");
    assertNoIssues(issues, "变上限积分 game ");
  } finally {
    await page.close();
  }
}

async function selectNewtonExpression(page, zoneSelector) {
  const canvas = page.locator("#gameCanvas");
  const box = await canvas.boundingBox();
  assert.ok(box, "牛顿-莱布尼茨 game 画布不可用");
  await page.mouse.click(box.x + 85, box.y + 70);
  await page.locator(zoneSelector).click();
}

async function testNewtonLeibnizGame(context, baseUrl, entry) {
  const { page, issues } = await openGame(context, baseUrl, entry, { clock: true });
  try {
    await installControlledRaf(page);
    await page.evaluate(() => {
      Math.random = () => 0;
    });
    assert.equal(await page.evaluate(() => typeof window.showStart), "function");
    await page.locator("#startScreen button").click();
    await page.locator("#hintBtn").click();
    assert.equal((await evidence(page, "hint_requested")).length, 1);

    await page.clock.fastForward(3100);
    await runAnimationFrames(page, 58, 50);
    await selectNewtonExpression(page, "#zoneDeterminate");

    await runAnimationFrames(page, 58, 50);
    await selectNewtonExpression(page, "#zoneError");

    const results = await evidence(page, "challenge_result");
    assert.deepEqual(results.map((result) => result.is_correct), [false, true]);
    assert.deepEqual(results.map((result) => result.expected_zone), ["error", "error"]);
    assert.deepEqual(results.map((result) => result.selected_zone), ["determinate", "error"]);
    assert.equal(results[0].hint_count, 1);
    assert.equal(results[0].independent, false);
    assert.equal(results[1].independent, true);
    await page.evaluate(() => {
      const original = CanvasRenderingContext2D.prototype.fillText;
      window.__classificationPaint = [];
      CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...rest) {
        if (String(text).startsWith("∫")) window.__classificationPaint.push({ text, x, y });
        return original.call(this, text, x, y, ...rest);
      };
    });
    const reached = new Set(["第1关"]);
    for (let tick = 0; tick < 100; tick += 1) {
      await page.evaluate(() => { window.__classificationPaint = []; });
      await runAnimationFrames(page, 20, 50);
      if (await page.locator("#endScreen").isVisible()) break;
      if (await page.locator("#levelUpScreen").isVisible()) {
        await page.clock.runFor(2100);
        const pendingFrames = await runAnimationFrames(page, 1, 50);
        assert.ok(pendingFrames > 0, "分类游戏换关后必须恢复动画循环");
      }
      reached.add(await page.locator("#levelBadge").innerText());
      const painted = await page.evaluate(() => window.__classificationPaint.at(-1));
      if (painted) {
        const bounds = await page.locator("#gameCanvas").boundingBox();
        await page.mouse.click(bounds.x + painted.x, bounds.y + painted.y);
        await page.locator("#zoneError").click();
      }
    }
    await page.locator("#endScreen:not(.hidden)").waitFor({ state: "visible" });
    assert.deepEqual([...reached], ["第1关", "第2关", "第3关"]);
    const completed = await evidence(page, "scene_completed");
    assert.equal(completed.length, 1);
    assert.equal(completed[0].completed, true);
    const finalResults = await evidence(page, "challenge_result");
    assert.equal(completed[0].score, finalResults.filter((result) => result.is_correct).length,
      "分类学习分数不可使用连击奖励分");
    assert.equal(completed[0].max_score, finalResults.length);
    await page.clock.runFor(500);
    const endBounds = await page.locator("#endScreen").boundingBox();
    const viewport = page.viewportSize();
    assert.ok(endBounds.y >= -1 && endBounds.y + endBounds.height <= viewport.height + 1,
      `分类游戏结束页必须位于可见视口：${JSON.stringify(endBounds)}`);
    await page.locator('#endScreen button[onclick="startGame()"]').click({ trial: true });
    const screenshots = path.join(root, "output", "playwright", "全场景交互");
    fs.mkdirSync(screenshots, { recursive: true });
    await page.screenshot({
      path: path.join(screenshots, `牛顿分类-三关完成-${process.env.TEST_EMBEDDED === "1" ? "嵌入" : "独立"}.png`)
    });
    await page.locator('#endScreen button[onclick="showStart()"]').click();
    await page.locator("#startScreen button").click();
    assert.equal(await page.locator("#levelBadge").innerText(), "第1关");
    await page.clock.fastForward(3100);
    for (let tick = 0; tick < 150 && !await page.locator("#endScreen").isVisible(); tick += 1) {
      await runAnimationFrames(page, 20, 50);
      if (await page.locator("#levelUpScreen").isVisible()) await page.clock.runFor(2100);
    }
    await page.locator("#endScreen:not(.hidden)").waitFor({ state: "visible" });
    const missed = (await evidence(page, "challenge_result")).filter((result) => result.selected_zone === "missed");
    assert.equal(missed.length, 3, "三次漏接应结束该局，不能继续生成漏接事件");
    assert.ok(missed.every((result) => result.independent === false),
      "漏接属于过程错误，不能伪装成已完成的独立作答");
    const failed = (await evidence(page, "scene_completed")).at(-1);
    assert.equal(failed.completed, false);
    assert.equal(failed.score, 0);
    assert.equal(failed.max_score, 3);
    assert.equal(failed.wrong_count, 3);
    assert.equal(failed.missed_count, 3);
    await page.locator('#endScreen button[onclick="startGame()"]').click();
    await page.locator("#pauseBtn").click();
    const pausedProgress = await page.locator("#progressFill").getAttribute("style");
    await runAnimationFrames(page, 100, 50);
    assert.equal(await page.locator("#progressFill").getAttribute("style"), pausedProgress);
    await page.locator('#pauseScreen button[onclick="togglePause()"]').click();
    await runAnimationFrames(page, 20, 50);
    assert.notEqual(await page.locator("#progressFill").getAttribute("style"), pausedProgress);
    await page.locator("#pauseBtn").click();
    await page.locator('#pauseScreen button[onclick="quitGame()"]').click();
    await page.locator("#startScreen").waitFor({ state: "visible" });
    await page.locator("#startScreen button").click();
    assert.equal(await page.locator("#scoreVal").innerText(), "0");
    await page.clock.fastForward(3100);
    for (let item = 0; item < 22; item += 1) {
      const errorItem = item >= 17;
      const poolIndex = errorItem ? item - 17 : item;
      await page.evaluate((randomValues) => {
        Math.random = () => randomValues.length ? randomValues.shift() : 0.5;
      }, [errorItem ? 0 : 0.9, (poolIndex + 0.5) / (errorItem ? 5 : 17), 0, 0.5, 0.5]);
      let painted;
      for (let wait = 0; wait < 12 && !painted; wait += 1) {
        await page.evaluate(() => { window.__classificationPaint = []; });
        await runAnimationFrames(page, 10, 50);
        if (await page.locator("#levelUpScreen").isVisible()) await page.clock.runFor(2100);
        painted = await page.evaluate(() => window.__classificationPaint.at(-1));
      }
      assert.ok(painted, `分类第${item + 1}条表达式必须真实出现在画布`);
      const bounds = await page.locator("#gameCanvas").boundingBox();
      await page.mouse.click(bounds.x + painted.x, bounds.y + painted.y);
      const zone = errorItem ? "Error" : item < 9 ? "Determinate" : "Indefinite";
      await page.locator(`#zone${zone}`).click();
      const checked = (await evidence(page, "challenge_result")).at(-1);
      assert.equal(checked.challenge_id, `GH-07-K02-classification-item-${item + 1}`);
      assert.equal(checked.is_correct, true, `分类第${item + 1}条表达式应判为${zone}`);
    }
    assertNoIssues(issues, "牛顿-莱布尼茨 game ");
  } finally {
    await page.close();
  }
}

function exactTextPattern(value) {
  return new RegExp(`^${String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

async function placeSubstitutionPiece(page, value, zoneId) {
  const piece = page.locator(".piece:not(.placed)").filter({ hasText: exactTextPattern(value) }).first();
  await piece.click();
  await page.locator(`#zone-${zoneId}`).click();
}

async function finishSubstitutionLevel(page, answers) {
  const layout = await page.evaluate(() => {
    const ids = ["hud", "scale-canvas", "problem-area", "drop-zones", "toolbox"];
    return [...ids.map((id) => document.getElementById(id)),
      ...document.querySelectorAll(".piece, .drop-zone")].map((node) => {
      const r = node.getBoundingClientRect();
      return { name: node.id || node.textContent, visible: r.width > 0 && r.height > 0
        && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
    });
  });
  assert.ok(layout.every((item) => item.visible),
    `换元游戏的天平与所有作答控件必须无需滚动即可看到：${JSON.stringify(layout)}`);
  const screenshots = path.join(root, "output", "playwright", "全场景交互");
  fs.mkdirSync(screenshots, { recursive: true });
  const level = (await page.locator("#level-display").innerText()).split("/")[0];
  await page.screenshot({ path: path.join(screenshots,
    `换元游戏-第${level}关-${process.env.TEST_EMBEDDED === "1" ? "嵌入" : "独立"}.png`) });
  for (const [zoneId, value] of Object.entries(answers)) {
    await placeSubstitutionPiece(page, value, zoneId);
  }
  await page.locator("#win-screen").waitFor({ state: "visible" });
}

async function testSubstitutionGame(context, baseUrl, entry) {
  const { page, issues } = await openGame(context, baseUrl, entry);
  try {
    await page.locator("#start-btn").click();
    await placeSubstitutionPiece(page, "x·dx", "du");
    let results = await evidence(page, "challenge_result");
    assert.equal(results.length, 1);
    assert.equal(results[0].is_correct, false);
    assert.equal(results[0].selected_answer, "x·dx");

    await finishSubstitutionLevel(page, { du: "2x·dx" });
    results = await evidence(page, "challenge_result");
    assert.deepEqual(results.slice(0, 2).map((result) => result.is_correct), [false, true]);
    assert.deepEqual(results.slice(0, 2).map((result) => result.attempt_number), [1, 2]);

    const remainingLevels = [
      { du: "3x²·dx", factor: "3x²" },
      { lower: "0", upper: "2" },
      { du_factor: "½du", lower: "1", upper: "5" },
      { du_factor: "-du", lower: "1", upper: "0" }
    ];
    for (const answers of remainingLevels) {
      await page.locator("#next-level-btn").click();
      await finishSubstitutionLevel(page, answers);
    }

    await page.locator("#next-level-btn").click();
    const completed = await evidence(page, "scene_completed");
    assert.equal(completed.length, 1);
    assert.equal(completed[0].completed, true);
    assert.equal(completed[0].wrong_count, 1);

    await page.locator("#time-display").evaluate((element) => {
      element.textContent = "9:59";
    });
    await page.locator("#next-level-btn").click();
    assert.equal(await page.locator("#level-display").innerText(), "1/5");
    assert.equal((await evidence(page, "reset_used")).length, 1);
    const timeBefore = await page.locator("#time-display").innerText();
    assert.equal(timeBefore, "0:00", "换元 game 重开后必须立即清除上一局计时显示");
    await page.waitForFunction(() => document.getElementById("time-display")?.textContent !== "0:00");
    assert.notEqual(await page.locator("#time-display").innerText(), timeBefore, "换元 game 最终页重开后计时必须恢复");
    assertNoIssues(issues, "换元法 game ");
  } finally {
    await page.close();
  }
}

async function assignPartsCard(page, label, slotId) {
  await page.locator(`.func-card[data-label="${label}"]`).click();
  await page.locator(slotId).click();
}

async function testIntegrationByPartsGame(context, baseUrl, entry) {
  const { page, issues } = await openGame(context, baseUrl, entry, { clock: true });
  const screenshots = path.join(root, "output", "playwright", "全场景交互");
  fs.mkdirSync(screenshots, { recursive: true });
  try {
    await installControlledRaf(page);
    assert.equal(await page.evaluate(() => typeof window.resetSelection), "function");
    assert.equal(await page.evaluate(() => typeof window.confirmChoice), "function");
    await page.locator("#start-screen button").click();
    await page.clock.runFor(1100);

    await assignPartsCard(page, "x", "#slot-u");
    await assignPartsCard(page, "ln(x)", "#slot-dv");
    await page.locator("#btn-confirm").click();
    let results = await evidence(page, "challenge_result");
    assert.equal(results.length, 1);
    assert.equal(results[0].is_correct, false);
    assert.equal(results[0].selected_u, "x");
    assert.equal(results[0].selected_dv, "ln(x)");
    assert.equal(results[0].mathematically_valid_split, true);
    assert.equal(results[0].error_type, "inefficient_strategy");

    await page.clock.runFor(3100);
    await assignPartsCard(page, "ln(x)", "#slot-u");
    await assignPartsCard(page, "x", "#slot-dv");
    await page.locator("#btn-confirm").click();
    results = await evidence(page, "challenge_result");
    assert.deepEqual(results.map((result) => result.is_correct), [false, true]);
    assert.deepEqual(results.map((result) => result.attempt_number), [1, 2]);
    assert.deepEqual(results.map((result) => result.independent), [true, false],
      "自动揭示选择后的重试必须标为受提示作答");
    assert.equal(results[1].hint_count, 1);

    const timerAtCorrect = await page.locator("#timer-display").innerText();
    await page.clock.runFor(2500);
    assert.equal(
      await page.locator("#timer-display").innerText(),
      timerAtCorrect,
      "分部积分正确动画期间计时必须冻结"
    );
    await page.clock.runFor(600);
    assert.equal(await page.locator("#level-screen").evaluate((element) => element.classList.contains("hidden")), true,
      "推导不能被自动结算框打断");
    await page.locator("#btn-result").click();
    await page.locator("#level-screen:not(.hidden)").waitFor({ state: "visible" });
    for (const [u, dv] of [["x²", "eˣ"], ["x", "sin(x)"], ["eˣ", "cos(x)"], ["arctan(x)", "x"]]) {
      await page.locator("#level-next-btn").click();
      await page.clock.runFor(1100);
      await assignPartsCard(page, u, "#slot-u");
      await assignPartsCard(page, dv, "#slot-dv");
      await page.locator("#btn-confirm").click();
      await page.clock.runFor(3200);
      await page.locator("#btn-result:not(.hidden)").waitFor({ state: "visible" });
      assert.equal(await page.locator(".btn-hint").isDisabled(), true);
      assert.equal(await page.locator(".btn-reset").isDisabled(), true);
      await page.locator("#chain-area .step-done").waitFor({ state: "visible" });
      await page.locator("#explanation.show").waitFor({ state: "visible" });
      const layout = await page.evaluate(() => ["hud", "target-area", "slot-area", "cards-area",
        "controls-area", "chain-area", "explanation"].map((id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { id, visible: r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0
          && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
      }));
      assert.ok(layout.every((item) => item.visible), JSON.stringify(layout));
      const cardsFit = await page.evaluate(() => {
        const area = document.getElementById("cards-area").getBoundingClientRect();
        return [...document.querySelectorAll(".func-card")].every((card) => {
          const r = card.getBoundingClientRect();
          return r.x >= area.x && r.y >= area.y && r.right <= area.right + 1 && r.bottom <= area.bottom + 1;
        });
      });
      assert.equal(cardsFit, true, "所有候选卡片应完整显示，不能只检查面板外框");
      assert.equal(await page.evaluate(() => {
        const target = document.getElementById("target-area").getBoundingClientRect();
        const formula = document.getElementById("target-integral").getBoundingClientRect();
        return formula.top >= target.top && formula.bottom <= target.bottom
          && formula.left >= target.left && formula.right <= target.right;
      }), true, "原积分公式不能被题目框裁切");
      await page.screenshot({ path: path.join(screenshots,
        `分部积分-${u}-${process.env.TEST_EMBEDDED === "1" ? "嵌入" : "独立"}${process.env.TEST_GAME_VIEWPORT_WIDTH ? `-${process.env.TEST_GAME_VIEWPORT_WIDTH}px` : ""}.png`) });
      await page.locator("#btn-result").click();
      await page.locator("#level-screen:not(.hidden)").waitFor({ state: "visible" });
      if (u === "eˣ") {
        assert.match(await page.locator("#chain-area").innerText(), /u = eˣ, dv = cos\(x\) dx/,
          "第四关第二种有效选择必须展示对应推导");
        const latest = (await evidence(page, "challenge_result")).at(-1);
        assert.equal(latest.is_correct, true);
        assert.equal(latest.accepted_choices.length, 2);
      }
    }
    await page.locator("#level-next-btn").click();
    await page.locator("#game-complete-screen:not(.hidden)").waitFor({ state: "visible" });
    const completed = await evidence(page, "scene_completed");
    assert.equal(completed.length, 1);
    assert.equal(completed[0].score, 5);
    assert.equal(completed[0].max_score, 5);
    assertNoIssues(issues, "分部积分 game ");
  } catch (error) {
    await page.screenshot({ path: path.join(screenshots, "分部积分-失败诊断.png") }).catch(() => {});
    error.message += `\n浏览器异常：${JSON.stringify(issues)}`;
    throw error;
  } finally {
    await page.close();
  }
}

async function main() {
  assert.ok(chapter, "V14-C3 chapter must exist");
  const games = gameCandidates();
  assert.equal(games.length, 7, "V14-C3 must keep seven game scenes");
  const gamesByKnowledgePoint = Object.fromEntries(
    games.map((entry) => [entry.knowledgePoint.id, entry])
  );
  ["GH-06-K01", "GH-06-K02", "GH-06-K03", "GH-07-K01", "GH-07-K02", "GH-07-K03", "GH-07-K04"]
    .forEach((knowledgePointId) => {
      assert.ok(gamesByKnowledgePoint[knowledgePointId], `${knowledgePointId} game must exist`);
    });

  const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(executablePath, "Chrome or Edge executable was not found");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-v14-c3-games-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  let child;
  let browser;

  try {
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: root,
      env: {
        ...process.env,
        DB_PATH: path.join(tmpDir, "games-browser.db"),
        HOST: "127.0.0.1",
        BASE_PATH: `${basePath}/`,
        LLM_PROVIDER: "mock",
        RATE_LIMIT_MAX: "5000",
        NODE_ENV: "test"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
    await waitForHealth(baseUrl, child, logs);

    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ["--disable-extensions", "--enable-webgl", "--use-angle=swiftshader"]
    });
    const context = await browser.newContext({
      viewport: process.env.TEST_EMBEDDED === "1"
        ? { width: Number(process.env.TEST_GAME_VIEWPORT_WIDTH) || 1294, height: 532 }
        : { width: Number(process.env.TEST_GAME_VIEWPORT_WIDTH) || 1440, height: 960 },
      reducedMotion: "reduce"
    });
    context.setDefaultTimeout(5000);
    const tests = {
      "GH-06-K01": testAreaGame,
      "GH-06-K02": testDisplacementGame,
      "GH-06-K03": testAntiderivativeGame,
      "GH-07-K01": testVariableUpperLimitGame,
      "GH-07-K02": testNewtonLeibnizGame,
      "GH-07-K03": testSubstitutionGame,
      "GH-07-K04": testIntegrationByPartsGame
    };
    const target = process.env.TEST_GAME_KNOWLEDGE_POINT || "";
    assert.ok(!target || tests[target], `未知游戏测试目标：${target}`);
    const verified = [];
    for (const [knowledgePointId, test] of Object.entries(tests)) {
      if (target && knowledgePointId !== target) continue;
      const startedAt = Date.now();
      console.log(`开始游戏回归：${knowledgePointId}`);
      await test(context, baseUrl, gamesByKnowledgePoint[knowledgePointId]);
      verified.push(knowledgePointId);
      console.log(`游戏回归通过：${knowledgePointId}，耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)} 秒`);
    }

    console.log(JSON.stringify({
      ok: true,
      games: verified.length,
      verified
    }));
  } finally {
    await browser?.close().catch(() => {});
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
