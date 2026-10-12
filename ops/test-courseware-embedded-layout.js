const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const route = require("../data/multi-scene-learning-route.json");
const resources = route.chapters.find((item) => item.id === "V14-C3").modules
  .flatMap((module) => (module.knowledgePoints || []).flatMap((point) =>
    (point.resourceCandidates || []).map((candidate) => candidate)));
const browserPath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
].find((item) => item && fs.existsSync(item));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function main() {
  assert.ok(browserPath, "需要 Chrome 或 Edge");
  const port = await freePort();
  const dbPath = path.join(root, "tmp", `embedded-layout-${process.pid}.db`);
  const server = spawn(process.execPath, ["server.js", String(port)], {
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      DB_PATH: dbPath,
      ADMIN_TOKEN: "embedded-layout-test",
      LLM_PROVIDER: "mock",
      GRADING_LLM_PROVIDER: "mock",
      PROACTIVE_POLICY_MODE: "off"
    }
  });
  let browser;
  try {
    for (let i = 0; i < 80; i += 1) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
    const mobile = process.env.TEST_MOBILE === "1";
    const viewport = {
      width: Number(process.env.TEST_VIEWPORT_WIDTH || (mobile ? 390 : 1294)),
      height: Number(process.env.TEST_VIEWPORT_HEIGHT || (mobile ? 620 : 512))
    };
    assert.ok(Object.values(viewport).every((value) => Number.isInteger(value) && value > 0),
      "测试视口宽高必须为正整数");
    const page = await browser.newPage({ viewport, hasTouch: mobile });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.setContent('<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0}</style><iframe sandbox="allow-scripts allow-forms allow-pointer-lock" allow="autoplay; fullscreen"></iframe>');
    const handle = await page.locator("iframe").elementHandle();
    const frame = await handle.contentFrame();
    const failures = [];
    for (const candidate of resources) {
      const url = `http://127.0.0.1:${port}/resources/${candidate.root}/${candidate.file}`;
      await frame.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(450);
      const result = await frame.evaluate(() => {
        const viewport = { width: innerWidth, height: innerHeight };
        const visualNodes = [...document.querySelectorAll("canvas,svg,.canvas-wrap,#game-area,#target-area,.main-content,.game-area,.stage,.overlay:not(.hidden),#start-screen:not(.hidden)")];
        const canvas = visualNodes.find((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 120 && rect.height > 120;
        });
        const rect = canvas?.getBoundingClientRect();
        const controls = [...document.querySelectorAll("input,button,select,textarea")].filter((node) => {
          const box = node.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        });
        const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
          || document.documentElement.scrollHeight > document.documentElement.clientHeight + 1;
        return {
          hasVisual: Boolean(canvas),
          canvas: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null,
          viewport,
          overflow,
          controls: controls.length,
          visualNodes: visualNodes.length
        };
      });
      if (result.overflow) {
        console.error("embedded overflow", candidate.file, JSON.stringify(await frame.evaluate(() => ({
          document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight,
            document.documentElement.clientWidth, document.documentElement.clientHeight],
          body: getComputedStyle(document.body).cssText,
          nodes: [...document.body.children].map((node) => ({
            tag: node.tagName, id: node.id, className: node.className,
            rect: node.getBoundingClientRect().toJSON(),
            style: getComputedStyle(node).cssText
          }))
        })), null, 2));
      }
      {
        const dir = path.join(root, "output", "playwright", mobile ? "手机课件" : "桌面课件",
          `${viewport.width}x${viewport.height}`);
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, `${path.basename(candidate.root).slice(0, 5)}-${path.basename(candidate.file, ".html")}.png`) });
      }
      if (mobile) {
        if (!result.hasVisual || result.overflow || !result.controls
          || result.canvas.left < -2 || result.canvas.right > result.viewport.width + 2
          || result.canvas.top < -2 || result.canvas.bottom > result.viewport.height + 2) {
          failures.push({ file: candidate.file, ...result });
        }
        continue;
      }
      assert.equal(result.hasVisual, true, `${candidate.file} 没有可见画布: ${JSON.stringify(result)}`);
      assert.equal(result.overflow, false, `${candidate.file} 页面溢出: ${JSON.stringify(result)}`);
      assert.ok(result.canvas.left >= -2 && result.canvas.right <= result.viewport.width + 2
        && result.canvas.top >= -2 && result.canvas.bottom <= result.viewport.height + 2,
      `${candidate.file} 画布越界: ${JSON.stringify(result)}`);
      assert.ok(result.controls > 0, `${candidate.file} 没有可操作控件`);
    }
    assert.deepEqual(failures, [], `手机课件越界：${JSON.stringify(failures)}`);
    console.log(`embedded courseware layout tests passed (${resources.length} scenes, ${viewport.width}x${viewport.height})`);
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
