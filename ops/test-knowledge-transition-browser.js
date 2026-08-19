const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const viewport = testViewport();
const screenshotPath = path.join(
  root,
  "tmp",
  `knowledge-transition-browser-${viewport.width}x${viewport.height}.png`
);
const browserCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

function testViewport() {
  const match = String(process.env.TEST_VIEWPORT || "1440x1000").match(/^(\d{2,4})x(\d{2,4})$/);
  if (!match) return { width: 1440, height: 1000 };
  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

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
      const response = await fetch(`${baseUrl}/api/health`);
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

function browserExecutable() {
  const executable = browserCandidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) throw new Error("No Chrome or Edge executable found.");
  return executable;
}

function collectBrowserIssues(page) {
  const issues = [];
  page.on("pageerror", (error) => {
    issues.push(`pageerror ${page.url()}: ${error.stack || error.message || error}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (/favicon\.ico/i.test(message.text())) return;
    issues.push(`console ${page.url()}: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "";
    if (/ERR_ABORTED/i.test(failure)) return;
    issues.push(`requestfailed ${request.url()}: ${failure}`);
  });
  return issues;
}

async function register(page) {
  await page.locator("#auth-gate").waitFor({ state: "visible", timeout: 20000 });
  await page.locator('[data-auth-mode="register"]').click();
  const nickname = `路径回归${Date.now().toString().slice(-6)}`;
  await page.locator("#nickname").fill(nickname);
  await page.locator("#register-password").fill("knowledge-transition-123");
  await page.locator("#register-password-confirm").fill("knowledge-transition-123");
  await page.locator("#login-submit").click();
  await page.locator("#auth-status").filter({ hasText: nickname }).waitFor({ timeout: 20000 });
}

async function prepareKnowledgePoint(page, unitId) {
  const result = await page.evaluate(async (targetUnitId) => {
    const unit = getUnit(targetUnitId);
    if (!unit) return { ok: false, reason: "missing_unit" };
    const path = ensureAgenticPath();
    state.completed = [];
    state.submittedQuizzes = [];
    state.quizResults = [];
    state.quizAttempts = {};
    state.quizDrafts = {};
    state.pendingKnowledgeTransition = null;
    state.knowledgeTransitionChoices = {};
    state.selectedKnowledgeScenes = {};
    path.pendingPlan = null;
    path.pendingAt = "";
    path.skipped = {};
    path.unlocked = Array.from(new Set([agenticInitialUnitId(), targetUnitId]));
    path.visibleUnits = [...path.unlocked];
    await agenticOpenUnit(targetUnitId);
    const selected = setKnowledgeSceneType(targetUnitId, "simulation");
    renderAll();
    return {
      ok: selected || selectedKnowledgeSceneType(getUnit(targetUnitId)) === "simulation",
      currentUnitId,
      selectedScene: selectedKnowledgeSceneType(getUnit(targetUnitId)),
      completionAllowed: agenticUnitCompletionAllowed(targetUnitId)
    };
  }, unitId);
  assert.equal(result.ok, true, `无法为 ${unitId} 选择互动场景: ${JSON.stringify(result)}`);
  assert.equal(result.currentUnitId, unitId);
  assert.equal(result.selectedScene, "simulation");
  assert.equal(result.completionAllowed, true);
}

async function completeCurrentKnowledgePoint(page) {
  await page.locator("#complete-lesson").filter({ hasText: "完成本节并选择下一步" }).click();
  const ready = page.locator('[data-knowledge-transition-stage="ready"]');
  await ready.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(400);
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset?.knowledgeTransition || ""),
    "continue",
    "完成知识点后应自动聚焦到下一步选择的第一个可操作按钮"
  );
  return ready;
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-knowledge-transition-browser-"));
  const dbPath = path.join(tmpDir, "knowledge-transition-browser.db");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  let child;
  let browser;
  const connectOverCdp = Boolean(process.env.PLAYWRIGHT_CDP_URL);

  try {
    child = spawn(process.execPath, ["server.js", String(port)], {
      cwd: root,
      env: {
        ...process.env,
        DB_PATH: dbPath,
        HOST: "127.0.0.1",
        LLM_PROVIDER: "mock",
        GRADING_LLM_PROVIDER: "mock",
        GRADING_API_KEY: "",
        OPENAI_COMPATIBLE_API_KEY: "",
        INNOSPARK_API_KEY: "",
        NODE_ENV: "test"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
    child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
    await waitForHealth(baseUrl, child, logs);

    browser = connectOverCdp
      ? await chromium.connectOverCDP(process.env.PLAYWRIGHT_CDP_URL)
      : await chromium.launch({ executablePath: browserExecutable(), headless: true });
    const context = connectOverCdp
      ? browser.contexts()[0] || await browser.newContext()
      : await browser.newContext({ viewport });
    const page = await context.newPage();
    if (connectOverCdp) await page.setViewportSize(viewport);
    const issues = collectBrowserIssues(page);
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.locator("#app-loader").waitFor({ state: "hidden", timeout: 20000 });
    await register(page);
    await page.locator('[data-view="learn"]').first().click();
    await page.locator("#complete-lesson").waitFor({ state: "visible", timeout: 20000 });

    await prepareKnowledgePoint(page, "GH-01-K01");
    const preview = page.locator('[data-knowledge-transition-stage="preview"]');
    await preview.waitFor({ state: "visible", timeout: 10000 });
    await expectPreviewCard(page, preview);
    await page.waitForTimeout(500);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const readyK1 = await completeCurrentKnowledgePoint(page);
    await readyK1.locator('[data-knowledge-transition="continue"]').click();
    await page.waitForFunction(() => currentUnitId === "GH-01-K02", null, { timeout: 10000 });
    assert.equal(
      await page.evaluate(() => state.knowledgeTransitionChoices?.["GH-01-K01"]?.choice),
      "continue"
    );
    assert.equal(
      await page.evaluate(() => Boolean(ensureAgenticPath().skipped?.["GH-01-K01-formative"])),
      true,
      "直接继续应只跳过这一个可选即时检测"
    );

    await prepareKnowledgePoint(page, "GH-01-K02");
    await page.locator('[data-knowledge-transition-stage="preview"]').waitFor({ state: "visible", timeout: 10000 });
    const readyK2 = await completeCurrentKnowledgePoint(page);
    await readyK2.locator('[data-knowledge-transition="formative"]').click();
    await page.waitForFunction(() => currentUnitId === "GH-01-K02-formative", null, { timeout: 10000 });
    assert.equal(
      await page.evaluate(() => state.knowledgeTransitionChoices?.["GH-01-K02"]?.choice),
      "formative"
    );
    assert.equal(
      await page.evaluate(() => Boolean(ensureAgenticPath().skipped?.["GH-01-K02-formative"])),
      false,
      "做小题的选择不能被错误标记为已跳过"
    );

    // A learner may revisit the knowledge point after the formative attempt
    // was already recorded. The explicit "do the formative" choice must still
    // control the review CTA instead of being replaced by evidence inference.
    await page.evaluate(async () => {
      const formativeId = "GH-01-K02-formative";
      state.completed = Array.from(new Set([...(state.completed || []), formativeId]));
      state.submittedQuizzes = Array.from(new Set([...(state.submittedQuizzes || []), formativeId]));
      state.quizAttempts = {
        ...(state.quizAttempts || {}),
        [formativeId]: {
          unitId: formativeId,
          adaptiveFormative: true,
          submittedAt: "2026-08-19T10:00:00.000+08:00",
          records: []
        }
      };
      saveState();
      await agenticOpenUnit("GH-01-K02");
    });
    assert.equal(
      await page.evaluate(() => currentUnitId),
      "GH-01-K02",
      "已有检测记录后应能返回原知识点"
    );
    assert.equal(
      (await page.locator("#complete-lesson").textContent()).trim(),
      "复习后做小题测一测",
      "显式选择做小题后，复习按钮不能被已有检测记录改写为直接继续"
    );
    await page.locator("#complete-lesson").click();
    await page.waitForFunction(() => currentUnitId === "GH-01-K02-formative", null, { timeout: 10000 });

    assert.deepEqual(issues, []);
    console.log(`knowledge transition browser tests passed (${viewport.width}x${viewport.height}, ${screenshotPath})`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopChild(child);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function expectPreviewCard(page, preview) {
  assert.match(await preview.textContent(), /完成当前互动后，选择下一步/);
  assert.match(await preview.textContent(), /互动场景已经选好/);
  assert.match(await preview.textContent(), /完成互动后可选：直接继续或做小题测一测/);
  assert.equal(await preview.locator("button").count(), 0, "预览阶段不能出现可误点的选择按钮");
  assert.equal(
    (await page.locator("#complete-lesson").textContent()).trim(),
    "完成本节并选择下一步"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
