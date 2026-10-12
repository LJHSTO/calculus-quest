"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright-core");
const root = path.resolve(__dirname, "..");
const resource = "resources/open-maic/GH-02-极限与连续：直觉探索/interactive/10_图像上的左右极限：误解修复挑战.html";
async function main() {
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, "." + decodeURIComponent(new URL(req.url, "http://local").pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    const mime = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css" };
    res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      headless: true, args: ["--no-proxy-server"]
    });
    for (const viewport of (process.env.CHALLENGE_MOBILE_ONLY
      ? [{ width: 390, height: 844 }]
      : [{ width: 1600, height: 1000 }, { width: 390, height: 844 }])) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const base = process.env.CHALLENGE_TEST_URL || `http://127.0.0.1:${server.address().port}`;
      await page.goto(`${base}/${resource.split("/").map(encodeURIComponent).join("/")}`, { waitUntil: "load" });
      await page.locator('[onclick="startGame()"]').click();
      for (const selector of ["#hud", "#targetDisplay", "#btnLeft", "#btnRight"]) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box && box.x >= -1 && box.y >= -1
          && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
        `${selector} 必须完整位于 ${viewport.width} 视口内: ${JSON.stringify(box)}`);
      }
      const sides = ["Left", "Right", "Left", "Left", "Right", "Right"];
      for (let i = 0; i < sides.length; i++) {
        await page.waitForFunction(level => document.querySelector("#hudLevel").textContent === `${level}/6`
          && !document.querySelector("#btnLeft").disabled, i + 1);
        await page.locator(`#btn${sides[i]}`).click();
        await page.waitForTimeout(1600);
        assert.deepEqual(errors, [], `第 ${i + 1} 关不得中断动画`);
        await page.evaluate(() => window.dispatchEvent(new Event("resize")));
        await page.waitForTimeout(150);
        const painted = await page.locator("#gameCanvas").evaluate(canvas => {
          const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          let opaque = 0;
          for (let j = 3; j < data.length; j += 400) if (data[j] > 0) opaque++;
          return opaque;
        });
        assert.ok(painted > 100, "窗口尺寸变化后画布仍须持续绘制");
      }
      await page.locator('[onclick="restartGame()"]').waitFor({ state: "visible", timeout: 15000 });
      await page.locator('[onclick="restartGame()"]').click();
      await page.waitForFunction(() => document.querySelector("#hudLevel").textContent === "1/6");
      await page.locator("#btnRight").click();
      await page.waitForFunction(() => document.querySelector("#hudLevel").textContent === "2/6", null, { timeout: 15000 });
      assert.deepEqual(errors, [], "答错后的解释和切关不得报错");
      fs.mkdirSync(path.join(root, "output/playwright/整章交互回归"), { recursive: true });
      await page.screenshot({ path: path.join(root, `output/playwright/整章交互回归/极限挑战-${viewport.width}.png`) });
      await page.close();
      console.log(`极限挑战 ${viewport.width}: 六关、重玩、答错恢复、尺寸变化与画布像素通过`);
    }
    const page = await browser.newPage();
    const base = process.env.CHALLENGE_TEST_URL || `http://127.0.0.1:${server.address().port}`;
    const dots = "resources/open-maic/GH-01-函数、坐标与图像读法入门/interactive/08_坐标点与函数图像：拖动实验.html";
    await page.goto(`${base}/${dots.split("/").map(encodeURIComponent).join("/")}`);
    await page.evaluate(() => {
      spawnParticles(100, 100, 20, 52, 211, 153);
      for (let i = 0; i < 100; i++) drawParticles();
      if (state.particles.length) throw Error("过期粒子必须回收");
    });
    await page.close();
    console.log("坐标拖动实验粒子完整生命周期通过");
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
