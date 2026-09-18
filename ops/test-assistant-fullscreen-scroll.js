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
    // Exercise the real fullscreen move and its inline floating-position styles.
    await page.locator('[data-classroom-action="fullscreen"]').click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(300);
    const positionInFullscreen = await page.locator(".knowledge-assistant-panel").evaluate(el => el.style.left);
    assert.ok(positionInFullscreen, "全屏浮窗必须有实际定位，才能覆盖退出时的回归路径");
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
    if (remote) {
      await page.locator('[data-knowledge-provider][data-verification="verified"]').waitFor();
      console.log("公网真实模型回答验证通过。");
    }
    fs.mkdirSync(path.join(root, "output/playwright/知点回归"), { recursive: true });
    await page.screenshot({ path: path.join(root, "output/playwright/知点回归/退出全屏恢复.png") });
    assert.deepEqual(errors, []);
    console.log("知点全屏退出恢复、侧栏可见和顶部滚动稳定回归通过。");
  } finally {
    await browser?.close();
    server?.kill();
    if (server && server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
