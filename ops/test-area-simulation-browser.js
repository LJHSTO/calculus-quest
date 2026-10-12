const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const root = path.resolve(__dirname, "..");
const resource = "/resources/open-maic/GH-06-积分直觉：面积、累积与原函数/interactive/03_小矩形逼近面积：拖动实验.html";
async function main() {
  const port = await new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const value = server.address().port;
      server.close(() => resolve(value));
    });
  });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cq-area-simulation-"));
  const child = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HOST: "127.0.0.1", DB_PATH: path.join(temp, "test.db"),
      LLM_PROVIDER: "mock", NODE_ENV: "test" }
  });
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
      if ((await fetch(`${base}/api/health`).catch(() => null))?.ok) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const executablePath = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
    ].find((file) => file && fs.existsSync(file));
    browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1294, height: 512 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + resource);
    await page.waitForFunction(() => typeof state !== "undefined"
      && document.querySelector("#canvas")?.width > 100);
    const read = () => page.evaluate(() => ({
      progress: state.animationProgress, running: state.running, paused: state.paused,
      ended: state.ended, count: state.partitionCount, functionType: state.functionType
    }));
    await page.locator("#mainBtn").click();
    await page.waitForFunction(() => state.animationProgress > 0);
    await page.locator("#mainBtn").click();
    const paused = await read();
    assert.equal(paused.paused, true);
    await page.waitForTimeout(150);
    assert.equal((await read()).progress, paused.progress, "暂停后矩形数量不能继续变化");
    await page.locator("#mainBtn").click();
    await page.waitForFunction(() => state.ended, null, { timeout: 5000 });
    assert.equal((await read()).progress, 1);
    await page.locator("#mainBtn").click();
    await page.waitForTimeout(150);
    assert.ok((await read()).running, "完成后重新开始必须重新申请动画帧");
    await page.locator("#partition_count-slider").fill("100");
    const high = await page.evaluate(() => ({
      sum: calcRiemannSum(100, functionsDef[state.functionType].fn,
        ...functionsDef[state.functionType].range),
      lowSum: calcRiemannSum(10, functionsDef[state.functionType].fn,
        ...functionsDef[state.functionType].range),
      exact: functionsDef[state.functionType].integral(...functionsDef[state.functionType].range)
    }));
    assert.ok(Math.abs(high.sum - high.exact) < Math.abs(high.lowSum - high.exact)
      && Math.abs(high.sum - high.exact) < 0.05, JSON.stringify(high));
    await page.locator('[data-func="sin"]').click();
    const switched = await read();
    assert.equal(switched.functionType, "sin");
    assert.equal(switched.progress, 0, "切换函数应重置当前动画");
    await page.screenshot({ path: path.join(root, "output", "playwright", "面积模拟审校-1294.png") });
    assert.deepEqual(errors, []);
    console.log("面积模拟浏览器通过：暂停继续、完成重开、100分割逼近、函数切换重置与无脚本异常。");
  } finally {
    await browser?.close();
    child.kill();
    if (child.exitCode === null) await new Promise((resolve) => setTimeout(resolve, 300));
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
