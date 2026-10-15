"use strict";

// Layout fixtures unlock navigation only. They do not simulate student learning
// or establish usability with human participants.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "output", "playwright", "学习布局复核");
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"]
  .filter(Boolean).find(candidate => fs.existsSync(candidate));
const results = [];

async function freePort() {
  return new Promise(resolve => {
    const listener = net.createServer();
    listener.listen(0, "127.0.0.1", () => {
      const port = listener.address().port;
      listener.close(() => resolve(port));
    });
  });
}

async function openFixture(page) {
  await page.evaluate(() => {
    currentChapterId = "V14-C1";
    const chapter = getChapter();
    const unit = chapter.units.find(entry => entry.type === "knowledge");
    const route = ensureAgenticPath();
    if (!route.unlocked.includes(unit.id)) route.unlocked.push(unit.id);
    if (!route.visibleUnits.includes(unit.id)) route.visibleUnits.push(unit.id);
    currentUnitId = unit.id;
    route.pendingPlan = null;
    switchView("learn");
    renderAll();
    KnowledgeAssistant.sync();
  });
  await page.locator('[data-workspace-canvas="interactive"]').click();
}

async function assertFrame(page, label) {
  const frameElement = page.locator("iframe[data-courseware-frame]");
  await frameElement.waitFor();
  await page.locator(".iframe-loader").waitFor({ state: "hidden" });
  await frameElement.scrollIntoViewIfNeeded();
  const frame = await (await frameElement.elementHandle()).contentFrame();
  await frame.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(250);
  const box = await frameElement.boundingBox();
  const metrics = await frame.evaluate(() => ({
    title: document.title,
    viewport: { width: innerWidth, height: innerHeight },
    controls: [...document.querySelectorAll('button,input,select,[role="button"]')]
      .filter(node => {
        const style = getComputedStyle(node), rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
      }).length
  }));
  const expected = { minFrameWidth: Math.min(700, page.viewportSize().width - 40), minFrameHeight: 480,
    actualViewportMatchesOuterFrame: true, noHorizontalOverflow: true, lessonHitTargetsUncovered: true };
  assert.ok(box.width >= expected.minFrameWidth, `${label}: iframe width ${box.width}`);
  assert.ok(box.height >= 480, `${label}: iframe height ${box.height}`);
  assert.ok(Math.abs(box.width - metrics.viewport.width) < 2,
    `${label}: outer and actual iframe viewports must agree`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${label}: page overflow ${overflow}`);
  const hitTest = await frameElement.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const visible = { left: Math.max(0, rect.left), top: Math.max(0, rect.top),
      right: Math.min(innerWidth, rect.right), bottom: Math.min(innerHeight, rect.bottom) };
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
        visible.top = Math.max(visible.top, box.top);
        visible.bottom = Math.min(visible.bottom, box.bottom);
      }
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
        visible.left = Math.max(visible.left, box.left);
        visible.right = Math.min(visible.right, box.right);
      }
    }
    const points = [];
    for (const x of [.15, .5, .85]) for (const y of [.15, .5, .85]) {
      const hit = document.elementFromPoint(visible.left + (visible.right - visible.left) * x,
        visible.top + (visible.bottom - visible.top) * y);
      points.push(hit === element);
    }
    return { visibleRectangle: visible, sampledPoints: points.length,
      unobstructed: visible.bottom > visible.top && visible.right > visible.left && points.every(Boolean) };
  });
  assert.ok(hitTest.unobstructed, `${label}: visible iframe hit targets must not be covered ${JSON.stringify(hitTest)}`);
  const state = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    pane: document.querySelector(".core-learning-workspace").dataset.workspacePane,
    scene: document.querySelector(".core-learning-workspace").dataset.classroomSurface,
    sceneType: document.querySelector(".multi-scene-scene-option.active")?.dataset.knowledgeScene,
    pathExpanded: document.querySelector("#lesson-rail-toggle").getAttribute("aria-expanded") === "true",
    assistantExpanded: document.querySelector("#workspace-tools-toggle").getAttribute("aria-expanded") === "true",
    researchObserverOpen: document.body.classList.contains("research-observatory-open")
  }));
  results.push({ label, input: { ...state, contentTitle: metrics.title }, expected,
    actual: { frame: box, actualViewport: metrics.viewport, visibleControls: metrics.controls,
      horizontalOverflow: overflow, hitTest, lessonHitTargetsUncovered: hitTest.unobstructed }, passed: true });
  return frame;
}

async function main() {
  assert.ok(executablePath, "需要 Chrome 或 Edge");
  fs.mkdirSync(output, { recursive: true });
  const run = fs.mkdtempSync(path.join(output, "运行-"));
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root, windowsHide: true, stdio: "ignore",
    env: { ...process.env, HOST: "127.0.0.1", BASE_PATH: "", NODE_ENV: "test",
      DB_PATH: path.join(run, "layout.db"), ADMIN_TOKEN: crypto.randomBytes(24).toString("hex"),
      LLM_PROVIDER: "mock", GRADING_LLM_PROVIDER: "mock", PROACTIVE_POLICY_MODE: "off",
      PROACTIVE_PUBLIC_CHAPTER_ONLY: "true", PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C1",
      RATE_LIMIT_MAX: "10000" }
  });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(`${base}/api/health`)).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, "隔离测试服务必须通过健康检查");
    browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    await page.goto(base);
    await page.locator("#app-loader").waitFor({ state: "hidden" });
    await page.locator('[data-auth-mode="register"]').click();
    await page.locator("#nickname").fill(`布局验收${Date.now()}`);
    await page.locator("#register-password").fill("layout-isolated-check");
    await page.locator("#register-password-confirm").fill("layout-isolated-check");
    await page.locator("#login-submit").click();
    await page.locator("#auth-gate").waitFor({ state: "hidden" });
    await openFixture(page);
    assert.equal(await page.locator(".proactive-hud-toggle-btn").count(), 0,
      "学生默认页面不能出现研究观察入口");
    for (const viewport of [
      { width: 1920, height: 1080 }, { width: 1366, height: 768 },
      { width: 1181, height: 768 }, { width: 1180, height: 768 },
      { width: 1093, height: 614 }, { width: 1024, height: 768 }, { width: 390, height: 844 }
    ]) {
      await page.setViewportSize(viewport);
      if (viewport.width <= 1180) await page.locator('button[data-workspace-pane="course"]').click();
      for (const scene of viewport.width === 1366 || viewport.width === 1024
        ? ["simulation", "game", "mindMap", "visualization3d"] : ["simulation"]) {
        await page.locator(`[data-knowledge-scene="${scene}"]`).click();
        const frame = await assertFrame(page, `${viewport.width}×${viewport.height}-${scene}`);
        if (scene === "simulation") {
          const control = frame.locator('input[type="range"]').first();
          if (await control.count()) {
            await control.scrollIntoViewIfNeeded();
            await control.click();
            await control.press("ArrowRight");
          }
        }
      }
      await page.screenshot({ path: path.join(output, `学生课件-${viewport.width}.png`) });
      if (viewport.width <= 1180) {
        await page.locator('button[data-workspace-pane="assistant"]').click();
        assert.equal(await page.locator(".player").isVisible(), false);
        assert.equal(await page.locator(".workspace-tabs").isVisible(), true);
        await page.locator('button[data-workspace-pane="path"]').click();
        assert.equal(await page.locator("#lesson-rail").isVisible(), true);
        await page.locator('button[data-workspace-pane="course"]').click();
      }
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    const lectureToggle = page.locator('[data-classroom-action="toggle-lecture"]');
    if (await lectureToggle.getAttribute("aria-label") === "显示讲解") await lectureToggle.click();
    await page.evaluate(() => LearningWorkspace.sync());
    assert.equal(await lectureToggle.getAttribute("aria-label"), "隐藏讲解",
      "学生主动恢复讲解后，同一课件同步不能再次替学生收起");
    await lectureToggle.click();
    for (const [pathExpanded, assistantExpanded] of [[false, false], [false, true], [true, false], [true, true]]) {
      for (const [selector, expanded] of [["#workspace-tools-toggle", assistantExpanded], ["#lesson-rail-toggle", pathExpanded]]) {
        if ((await page.locator(selector).getAttribute("aria-expanded") === "true") !== expanded) {
          await page.locator(selector).click();
        }
      }
      await assertFrame(page, `1366-路径${pathExpanded ? "开" : "关"}-助手${assistantExpanded ? "开" : "关"}`);
    }
    await page.goto(`${base}/?research=1`);
    await page.locator("#app-loader").waitFor({ state: "hidden" });
    await openFixture(page);
    await page.locator('[data-knowledge-scene="simulation"]').click();
    await page.locator(".proactive-hud-toggle-btn").click();
    const panel = page.locator("#proactive-observatory");
    await panel.waitFor({ state: "visible" });
    assert.equal(await panel.locator("[data-dimension]").count(), 6);
    const course = await page.locator("iframe[data-courseware-frame]").boundingBox();
    const inspection = await panel.boundingBox();
    assert.ok(course.x + course.width <= inspection.x + 1, "研究观察台必须与课件并排，不能遮挡课件");
    await assertFrame(page, "1366-六维观察台并排");
    await page.screenshot({ path: path.join(output, "研究观察-1366.png") });
    await page.setViewportSize({ width: 1024, height: 768 });
    assert.equal(await page.locator("#learn-view").isVisible(), false,
      "紧凑窗口研究观察必须切入独立检查页");
    await panel.locator("[data-observatory-close]").click();
    assert.equal(await page.locator("#learn-view").isVisible(), true);
    assert.equal(await page.locator(".core-learning-workspace > .lesson-rail").evaluate(node => node.inert), false);
    fs.writeFileSync(path.join(output, "验收结果.json"), JSON.stringify({ passed: true,
      generatedAt: new Date().toISOString(), results,
      limitations: ["合成布局检查，不代表真人可用性验证", "1093×614为1366屏幕125%缩放后的近似CSS工作区，未操纵浏览器原生缩放", "本脚本覆盖首知识点四类课件；全部24份课件另运行正式课件回归"] }, null, 2));
    console.log(`布局通过：${results.length} 个课件状态；学生与研究入口分离；报告 ${output}`);
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill();
  }
}
main().catch(error => {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "验收结果.json"), JSON.stringify({ passed: false,
    generatedAt: new Date().toISOString(), results, error: String(error.stack || error) }, null, 2));
  console.error(error); process.exitCode = 1;
});
