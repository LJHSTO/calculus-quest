const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const root = path.resolve(__dirname, "..");
const route = require("../data/multi-scene-learning-route.json");
const candidate = route.chapters.find((c) => c.id === "V14-C3").modules
  .flatMap((m) => m.knowledgePoints).find((k) => k.id === "GH-07-K03")
  .resourceCandidates.find((r) => r.type === "simulation");

async function main() {
  const port = await new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cq-substitution-simulation-"));
  const child = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HOST: "127.0.0.1", DB_PATH: path.join(temp, "test.db"),
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
    const executablePath = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
    ].find((file) => file && fs.existsSync(file));
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1294, height: 512 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await page.setContent('<style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe sandbox="allow-scripts allow-forms"></iframe>');
    await page.evaluate(() => {
      window.observedCoursewareEvents = [];
      window.addEventListener("message", (event) => {
        if (event.data?.type === "maic_learning_event") {
          window.observedCoursewareEvents.push(event.data.payload?.event_type || event.data.payload?.eventType);
        } else if (event.data?.type === "cq:interaction") {
          window.observedCoursewareEvents.push(event.data.eventType);
        }
      });
    });
    const frame = await (await page.locator("iframe").elementHandle()).contentFrame();
    await frame.goto(`${base}/resources/${candidate.root}/${candidate.file}`);
    await frame.waitForFunction(() => typeof state !== "undefined" && W > 100 && H > 100);
    async function setSlider(id, value) {
      await frame.locator(`#${id}-slider`).fill(String(value));
    }
    async function geometry() {
      return frame.evaluate(() => {
        const rectangles = [];
        const ticks = [];
        const original = ctx.strokeRect;
        const originalText = ctx.fillText;
        ctx.fillText = function(text, x, y, ...args) {
          if (/^-?\d+(\.\d+)?$/.test(text)) {
            const width = this.measureText(text).width;
            ticks.push({ left: x - width / 2, right: x + width / 2, y });
          }
          return originalText.call(this, text, x, y, ...args);
        };
        ctx.strokeRect = function(x, y, w, h) {
          rectangles.push({ x, y, w, h, color: this.strokeStyle });
          return original.call(this, x, y, w, h);
        };
        try { draw(); } finally { ctx.strokeRect = original; ctx.fillText = originalText; }
        return { width: W, height: H, rectangles, ticks, slope: state.slope,
          warning: state.showGapWarning, running: state.running, paused: state.paused };
      });
    }
    await setSlider("slope", 4);
    await setSlider("pos", 3);
    await setSlider("width", 1);
    let checks = 0;
    for (const viewport of [{ width: 1294, height: 512 }, { width: 1850, height: 824 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(100);
      for (const scale of [0.5, 1, 2]) {
        await setSlider("scale", scale);
        for (const slope of [0.1, 0.5, 1, 2, 4]) {
          await setSlider("slope", slope);
          for (const pos of [-3, 0, 3]) {
            await setSlider("pos", pos);
            for (const width of [0.1, 0.5, 1]) {
              await setSlider("width", width);
              const g = await geometry();
              assert.ok(g.rectangles.length >= 2);
              assert.ok(g.rectangles.every((r) => r.x >= 0 && r.x + r.w <= g.width
                && r.y >= 0 && r.y + r.h <= g.height), `线段越界：${JSON.stringify(g)}`);
              assert.ok(Math.abs(g.rectangles[1].w / g.rectangles[0].w - slope) < 1e-8,
                "x轴和u轴应使用相同单位比例，像素宽度比必须等于导数");
              for (let i = 1; i < g.ticks.length; i++) {
                if (g.ticks[i].y === g.ticks[i - 1].y) {
                  assert.ok(g.ticks[i].left > g.ticks[i - 1].right + 4, "相邻刻度文字不能重叠");
                }
              }
              checks++;
            }
          }
        }
      }
    }
    await page.setViewportSize({ width: 1294, height: 512 });
    await frame.locator("#preset1").click();
    await setSlider("scale", 0.5);
    const before = await geometry();
    await setSlider("scale", 2);
    const after = await geometry();
    assert.notEqual(after.rectangles[0].w, before.rectangles[0].w, "坐标滑块不能只更新数字");
    await frame.locator("#preset4").click();
    const warning = await geometry();
    assert.equal(warning.warning, true, "预设4不能立即清空错误对比");
    assert.equal(warning.rectangles.length, 3);
    await frame.locator("#mainBtn").click();
    await frame.locator("#mainBtn").click();
    const paused = await geometry();
    assert.equal(paused.paused, true);
    assert.ok(Math.abs(paused.rectangles[1].w / paused.rectangles[0].w - paused.slope) < 1e-8,
      "动画暂停时不能展示与导数倍数矛盾的中间线段长度");
    await frame.locator("#mainBtn").click();
    await frame.waitForFunction(() => state.ended, null, { timeout: 10000 });
    assert.match(await frame.locator("#infoBox").innerText(), /dx\s*=\s*du/);
    await frame.locator("#resetBtn").click();
    assert.equal((await geometry()).warning, false);
    await frame.locator("#preset4").click();
    const directory = path.join(root, "output", "playwright", "换元模拟审校");
    fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, "导数因子对比-1294.png") });
    await frame.locator("#formulaDisplay").scrollIntoViewIfNeeded();
    await frame.waitForFunction(() => {
      const rect = document.getElementById("formulaDisplay").getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight;
    }, null, { timeout: 5000 });
    await page.screenshot({ path: path.join(directory, "参数与公式-1294-复核.png") });
    const eventTypes = await page.evaluate(() => window.observedCoursewareEvents);
    assert.ok(eventTypes.includes("parameter_commit"), "真实控件应通过平台事件桥产生参数提交事件");
    assert.ok(!eventTypes.some((type) => ["challenge_result", "independent_check_completed"].includes(type)),
      "完成模拟不等于通过独立题目检查");
    assert.deepEqual(errors, []);
    console.log(`换元模拟浏览器通过：${checks}组真实滑块组合、等尺度线段比例、边界、缩放、错误预设、暂停继续及重置。`);
  } finally {
    await browser?.close();
    child.kill();
    if (child.exitCode === null) {
      await Promise.race([new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 4000))]);
    }
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
