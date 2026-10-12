const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const resource = "/resources/open-maic/GH-06-积分直觉：面积、累积与原函数/interactive/14_原函数和不定积分：拖动实验.html";

async function main() {
  const port = await new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const value = server.address().port;
      server.close(() => resolve(value));
    });
  });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cq-antiderivative-"));
  const child = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HOST: "127.0.0.1", DB_PATH: path.join(temp, "test.db"), LLM_PROVIDER: "mock", NODE_ENV: "test" }
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
    await page.waitForFunction(() => typeof state !== "undefined" && document.querySelector("#canvas")?.width > 100);

    const read = () => page.evaluate(() => ({
      running: state.running, ended: state.ended, progress: state.progress,
      C: state.C, density: state.density, obX: state.obX, speed: state.speed,
      canvas: (() => { const r = document.querySelector("#canvas").getBoundingClientRect(); return { width: r.width, height: r.height }; })()
    }));
    const initial = await read();
    assert.ok(initial.canvas.width >= 500 && initial.canvas.height >= 220);
    await page.locator("#constant_C-slider").fill("3");
    await page.locator("#derivative_at_point-slider").fill("-2.5");
    const adjusted = await read();
    assert.equal(adjusted.C, 3);
    assert.equal(adjusted.obX, -2.5);
    await page.locator("#mainBtn").click();
    await page.waitForFunction(() => state.progress > 0);
    await page.locator("#mainBtn").click();
    const paused = await read();
    assert.equal(paused.running, false);
    await page.waitForTimeout(120);
    assert.equal((await read()).progress, paused.progress);
    await page.locator("#mainBtn").click();
    await page.waitForFunction(() => state.ended, null, { timeout: 5000 });
    await page.locator("#mainBtn").click();
    await page.waitForFunction(() => state.running && state.progress > 0);
    await page.locator("#resetBtn").click();
    const reset = await read();
    assert.deepEqual(
      { C: reset.C, density: reset.density, obX: reset.obX, speed: reset.speed, progress: reset.progress, ended: reset.ended },
      { C: 0, density: 10, obX: 1, speed: 1, progress: 0, ended: false }
    );
    await page.locator('[data-fn="trig"]').click();
    const trig = await read();
    assert.equal(trig.progress, 0);
    assert.equal(await page.locator("#canvas").evaluate((el) => el.getBoundingClientRect().width > 500), true);
    fs.mkdirSync(path.join(root, "output", "playwright"), { recursive: true });
    for (const viewport of [{ width: 1294, height: 512 }, { width: 1850, height: 824 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(700);
      const checks = await page.evaluate(() => {
        const failures = [];
        let samples = 0;
        for (const key of Object.keys(FUNCTIONS)) {
          selectFunction(key);
          for (const C of [-3, 0, 3]) {
            state.C = C;
            computeCurvePoints();
            if (state.curvePoints.length !== 301
                || state.curvePoints[0].x !== X_MIN
                || state.curvePoints[300].x !== X_MAX) failures.push("曲线采样范围随常数改变");
            for (const x of [-2.5, 0, 2.5]) {
              const fn = FUNCTIONS[key];
              const h = 0.00001;
              const numerical = (fn.antiderivative(x + h, C) - fn.antiderivative(x - h, C)) / (2 * h);
              if (Math.abs(numerical - fn.derivative(x)) > 1e-7) failures.push(`${key}: 原函数求导不匹配`);
              samples++;
            }
          }
        }
        selectFunction("quadratic");
        const originalMove = ctx.moveTo;
        const originalLine = ctx.lineTo;
        let from;
        let segments = 0;
        try {
          ctx.moveTo = function(x, y) { from = { x, y }; originalMove.call(this, x, y); };
          ctx.lineTo = function(x, y) {
            const worldX = toWorld((from.x + x) / 2, (from.y + y) / 2).x;
            const actualSlope = -(y - from.y) / (x - from.x) * W / H;
            if (Math.abs(actualSlope - FUNCTIONS[selectedFn].derivative(worldX)) > 1e-7) {
              failures.push("屏幕斜率与数学斜率不一致");
            }
            segments++;
            originalLine.call(this, x, y);
          };
          for (const density of [4, 10, 20]) {
            state.density = density;
            drawSlopeField();
          }
        } finally {
          ctx.moveTo = originalMove;
          ctx.lineTo = originalLine;
        }
        resetSimulation();
        return { samples, segments, failures };
      });
      assert.deepEqual(checks.failures, []);
      assert.equal(checks.samples, 27);
      assert.equal(checks.segments, 516);
      const box = await page.locator("#canvas").boundingBox();
      for (const [offset, expected] of [[2, -2.5], [box.width - 2, 2.5]]) {
        await page.mouse.click(box.x + offset, box.y + box.height / 2);
        assert.equal((await read()).obX, expected, "画布拖动与滑块必须使用同一观察点范围");
        assert.equal(Number(await page.locator("#derivative_at_point-slider").inputValue()), expected);
      }
      await page.locator("#resetBtn").click();
      await page.locator("#mainBtn").click();
      await page.waitForFunction(() => state.ended);
      const painted = await page.locator("#canvas").evaluate((el) => {
        const pixels = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
        let count = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) count++;
        return count;
      });
      assert.ok(painted > 1000, "画布必须有实际绘制内容");
      await page.screenshot({ path: path.join(root, "output", "playwright", `原函数模拟审校-${viewport.width}.png`) });
    }
    assert.deepEqual(errors, []);
    console.log("原函数模拟浏览器通过：两种桌面视口、54组求导复算、1032段斜率场映射、观察点边界、画布像素、暂停继续、完成重开和函数切换。");
  } finally {
    await browser?.close();
    child.kill();
    if (child.exitCode === null) await new Promise((resolve) => setTimeout(resolve, 300));
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
