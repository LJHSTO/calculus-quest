const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const root = path.resolve(__dirname, "..");
async function main() {
  const port = await new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const value = server.address().port;
      server.close(() => resolve(value));
    });
  });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cq-accumulation-"));
  const child = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HOST: "127.0.0.1", DB_PATH: path.join(directory, "test.db"),
      LLM_PROVIDER: "mock", NODE_ENV: "test" }
  });
  let logs = "";
  child.stdout.on("data", (data) => { logs += data; });
  child.stderr.on("data", (data) => { logs += data; });
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      try { healthy = (await fetch(`${base}/api/health`)).ok; } catch {}
      if (healthy || child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(healthy, logs);
    browser = await chromium.launch({ headless: true, executablePath: [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
    ].find((file) => file && fs.existsSync(file)) });
    const page = await browser.newPage({ viewport: { width: 1294, height: 512 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install();
    await page.goto(base);
    await page.setContent('<style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe sandbox="allow-scripts allow-forms"></iframe>');
    await page.evaluate(() => {
      window.events = [];
      window.addEventListener("message", (event) => {
        if (event.data?.type === "cq:interaction") window.events.push(event.data.eventType);
        if (event.data?.type === "maic_learning_event") {
          window.events.push(event.data.payload?.event_type || event.data.payload?.eventType);
        }
      });
    });
    const frame = await (await page.locator("iframe").elementHandle()).contentFrame();
    await frame.goto(`${base}/resources/open-maic/GH-06-积分直觉：面积、累积与原函数/interactive/08_定积分作为累积：拖动实验.html`);
    await page.clock.runFor(500);
    async function verifyLayout() {
      const layout = await frame.evaluate(() => {
        const boxes = ["controls", "canvas", "hud", "main-btn", "reset-btn"].map((id) => {
          const r = document.getElementById(id).getBoundingClientRect();
          return { id, ...r.toJSON(), visible: r.width > 0 && r.height > 0
            && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
        });
        return { boxes, canvasWidth: W, canvasHeight: H,
          body: document.body.outerHTML.slice(0, 220),
          controlsStyle: document.getElementById("controls").getAttribute("style"),
          canvasStyle: document.getElementById("canvas-container").getAttribute("style") };
      });
      assert.ok(layout.boxes.every((box) => box.visible), JSON.stringify(layout));
      const [controls, canvas, hud, button] = layout.boxes;
      assert.ok(canvas.width >= 900 && canvas.height >= 370, JSON.stringify(layout));
      assert.ok(controls.right <= canvas.left && hud.bottom <= canvas.top && canvas.bottom <= button.top,
        "状态栏、控制区、画布和操作按钮不能互相覆盖");
      assert.ok(Math.abs(layout.canvasHeight - canvas.height) < 1 && Math.abs(layout.canvasWidth - canvas.width) < 1,
        "绘图坐标须匹配真实显示尺寸");
    }
    await verifyLayout();
    const read = () => frame.evaluate(() => ({
      time: state.time, volume: state.volume, speed: state.simSpeed,
      running: state.running, paused: state.paused, ended: state.ended
    }));
    await frame.locator("#main-btn").click();
    await page.clock.runFor(1000);
    const normal = await read();
    assert.ok(normal.time > 0.9 && normal.time < 1.1);
    await frame.locator("#sim_speed-slider").fill("2");
    assert.equal((await read()).speed, 2);
    await page.clock.runFor(1000);
    const faster = await read();
    assert.ok(faster.time - normal.time > 1.9 && faster.time - normal.time < 2.1);
    await frame.locator("#main-btn").click();
    assert.equal(await frame.locator("#main-btn").innerText(), "继续");
    const paused = await read();
    await page.clock.runFor(1000);
    assert.equal((await read()).time, paused.time);
    await frame.locator("#amplitude-slider").fill("5");
    assert.deepEqual(await read(), { time: 0, volume: 0, speed: 2, running: false, paused: false, ended: false });
    await frame.getByRole("button", { name: /净流出/ }).click();
    assert.equal((await read()).speed, 1, "预设须同步真实速度字段");
    await frame.locator("#main-btn").click();
    await page.clock.runFor(21000);
    const drained = await read();
    assert.equal(drained.time, 20);
    assert.equal(drained.ended, true);
    assert.ok(drained.volume < 0);
    assert.ok(Math.abs(drained.volume - (1.5 / 1.5 * (1 - Math.cos(30)) - 40)) < 1e-9);
    const screenshots = path.join(root, "output", "playwright", "累积模拟审校");
    fs.mkdirSync(screenshots, { recursive: true });
    await verifyLayout();
    await page.screenshot({ path: path.join(screenshots, "净流出-1294-r2.png") });
    await frame.locator("#main-btn").click();
    assert.equal((await read()).running, true, "重新开始应直接进入新一轮");
    await frame.getByRole("button", { name: /正弦波动/ }).click();
    await frame.locator("#main-btn").click();
    await page.clock.runFor(21000);
    const fillAudit = await frame.evaluate(() => {
      let points = [];
      const strips = [];
      const originals = Object.fromEntries(["beginPath", "moveTo", "lineTo", "fill"].map((key) => [key, ctx[key]]));
      ctx.beginPath = function() { points = []; return originals.beginPath.call(this); };
      for (const key of ["moveTo", "lineTo"]) ctx[key] = function(x, y) {
        points.push({ x, y }); return originals[key].call(this, x, y);
      };
      ctx.fill = function(...args) {
        if (/^rgba\((59, 130, 246|239, 68, 68), 0\.15\)$/.test(this.fillStyle)) {
          strips.push({ positive: this.fillStyle.includes("59, 130"), points: [...points] });
        }
        return originals.fill.apply(this, args);
      };
      try { draw(); } finally { Object.assign(ctx, originals); }
      return { strips, zeroY: 15 + (H * 0.42 - 15) / 2, width: W };
    });
    assert.ok(fillAudit.strips.some((strip) => strip.positive) && fillAudit.strips.some((strip) => !strip.positive));
    for (const strip of fillAudit.strips) {
      assert.ok(strip.points.every((point) => strip.positive
        ? point.y <= fillAudit.zeroY + 1e-8 : point.y >= fillAudit.zeroY - 1e-8));
      const xs = strip.points.map((point) => point.x);
      assert.ok(Math.max(...xs) - Math.min(...xs) <= (fillAudit.width - 70) * 0.05 / 20 + 1e-8,
        "面积填色不得跨过相反符号区间");
    }
    await page.screenshot({ path: path.join(screenshots, "正负面积-1294-r2.png") });
    await page.setViewportSize({ width: 1850, height: 824 });
    await page.clock.runFor(100);
    await verifyLayout();
    await page.screenshot({ path: path.join(screenshots, "正负面积-1850-r2.png") });
    const events = await page.evaluate(() => window.events);
    assert.ok(events.includes("parameter_commit"));
    assert.ok(!events.some((event) => ["challenge_result", "independent_check_completed"].includes(event)));
    assert.deepEqual(errors, []);
    console.log("累积模拟浏览器通过：真实速度、暂停继续、参数重置、净流出、重开、正负填色与非判题事件。");
  } finally {
    await browser?.close();
    child.kill();
    if (child.exitCode === null) await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 4000))
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
