"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const root = path.resolve(__dirname, "..");
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-assistant-scroll-"));
  const port = await new Promise(resolve => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
  const remote = process.env.ASSISTANT_TEST_URL;
  const base = remote || `http://127.0.0.1:${port}`;
  const server = remote ? null : spawn(process.execPath, ["server.js", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DB_PATH: path.join(dir, "test.db"), NODE_ENV: "test",
      HOST: "127.0.0.1", LLM_PROVIDER: "mock", GRADING_LLM_PROVIDER: "mock",
      PROACTIVE_POLICY_MODE: "off", RATE_LIMIT_MAX: "5000" }
  });
  let logs = "", browser;
  server?.stdout.on("data", x => { logs += x; });
  server?.stderr.on("data", x => { logs += x; });
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(base + "/api/health", { signal: AbortSignal.timeout(10000) })).ok) { ready = true; break; } } catch {}
      if (remote && i >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(fs.existsSync);
    browser = await chromium.launch({ executablePath, headless: true, args: ["--no-proxy-server"] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.setDefaultTimeout(remote ? 90000 : 30000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator('[data-auth-mode="register"]').click();
    await page.locator("#nickname").fill(`工程验收勿纳入分析${Date.now().toString().slice(-7)}`);
    await page.locator("#register-password").fill("fullscreen-test-password");
    await page.locator("#register-password-confirm").fill("fullscreen-test-password");
    await page.locator("#login-submit").click();
    await page.locator("#auth-gate").waitFor({ state: "hidden" });
    await page.evaluate(() => {
      const unit = getChapter().units.find(item => item.type === "knowledge");
      const route = ensureAgenticPath();
      if (!route.unlocked.includes(unit.id)) route.unlocked.push(unit.id);
      currentUnitId = unit.id; currentChapterId = unit.chapterId;
      switchView("learn"); renderAll(); KnowledgeAssistant.sync();
    });
    await page.locator('[data-openmaic-state="ready"]').waitFor({ timeout: 30000 });
    await page.locator(".knowledge-assistant-launcher").click();
    await page.waitForTimeout(400);
    const opening = page.locator("[data-knowledge-quick] button").first();
    const openingText = await opening.textContent();
    await opening.click({ delay: 180 });
    assert.equal(await page.locator("[data-knowledge-input]").inputValue(), openingText,
      "示例问题点击必须填入输入框");
    await page.locator("[data-knowledge-input]").fill("");
    // Exercise the real fullscreen move and its inline floating-position styles.
    await page.locator('[data-classroom-action="fullscreen"]').click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(300);
    const positionInFullscreen = await page.locator(".knowledge-assistant-panel").evaluate(el => el.style.left);
    assert.ok(positionInFullscreen, "全屏浮窗必须有实际定位，才能覆盖退出时的回归路径");
    const fullscreenQuestion = page.locator("[data-knowledge-quick] button").last();
    const fullscreenQuestionText = await fullscreenQuestion.textContent();
    await fullscreenQuestion.click({ delay: 180 });
    assert.equal(await page.locator("[data-knowledge-input]").inputValue(), fullscreenQuestionText,
      "全屏示例问题必须响应");
    await page.locator("[data-knowledge-input]").fill("");
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement);
    await page.waitForTimeout(300);
    const restored = await page.evaluate(() => {
      const root = document.querySelector("#knowledge-assistant-root");
      const pane = document.querySelector("#workspace-pane-chat");
      const panel = root.querySelector(".knowledge-assistant-panel");
      const box = panel.getBoundingClientRect(), host = pane.getBoundingClientRect();
      return { inSidebar: pane.contains(root), left: box.left, right: box.right,
        hostLeft: host.left, hostRight: host.right, width: box.width };
    });
    assert.ok(restored.inSidebar && restored.width > 100
      && restored.left >= restored.hostLeft - 2 && restored.right <= restored.hostRight + 2,
    `退出全屏后知点必须恢复到侧栏内: ${JSON.stringify(restored)}`);
    // Freeze activity at the top and force repeated legitimate context refreshes.
    let releaseReply;
    const replyGate = new Promise(resolve => { releaseReply = resolve; });
    await page.route("**/api/learning/assistant/ask", async route => {
      await replyGate;
      await route.continue();
    });
    await page.addStyleTag({ content: "[data-knowledge-messages] { min-height: 1400px !important; }" });
    await page.locator("[data-knowledge-input]").fill("请解释函数的输入与输出。");
    await page.locator("[data-knowledge-send]").click();
    const positions = await page.evaluate(async () => {
      const scroll = document.querySelector("[data-knowledge-scroll]");
      scroll.scrollTop = 0;
      const values = [];
      for (let i = 0; i < 8; i++) {
        KnowledgeAssistant.sync();
        await new Promise(resolve => setTimeout(resolve, 100));
        values.push(scroll.scrollTop);
      }
      return values;
    });
    releaseReply();
    assert.ok(positions.every(value => value < 5), `模型回答期间阅读顶部不得被自动拉回底部: ${positions}`);
    await page.waitForFunction(() => !document.querySelector("[data-knowledge-send]").disabled);
    for (const [intent, expected] of [
      ["self_check", "我理解为："],
      ["rephrase", "请换一种方式解释刚才这部分，尽量更直观一些。"],
      ["practice", "请围绕刚才的内容出一道小题，先不要给答案。"]
    ]) {
      const button = page.locator(`[data-assistant-intent="${intent}"]`).last();
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.evaluate(() => KnowledgeAssistant.sync());
      await page.mouse.up();
      assert.equal(await page.locator("[data-knowledge-input]").inputValue(), expected,
        `巩固按钮 ${intent} 在刷新期间仍须响应点击`);
    }
    await page.locator('[data-assistant-intent="self_check"]').last().focus();
    await page.evaluate(() => KnowledgeAssistant.sync());
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("[data-knowledge-input]").inputValue(), "我理解为：",
      "键盘焦点必须在刷新后保留");
    await page.locator("[data-knowledge-input]").fill("");
    if (remote) {
      await page.locator('[data-knowledge-provider][data-verification="verified"]').waitFor();
      console.log("公网真实模型回答验证通过。");
    }
    fs.mkdirSync(path.join(root, "output/playwright/知点回归"), { recursive: true });
    await page.screenshot({ path: path.join(root, "output/playwright/知点回归/退出全屏恢复.png") });
    assert.deepEqual(errors, []);
    console.log("示例问题、三种巩固操作、键盘焦点、全屏点击与退出恢复、顶部滚动稳定回归通过。");
  } finally {
    await browser?.close();
    server?.kill();
    if (server && server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
