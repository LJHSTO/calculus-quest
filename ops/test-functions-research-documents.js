"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright-core");
const root = path.resolve(__dirname, "..");
const names = [
  "函数与极限主动Agent完整设计与验收指标-2026-09-16",
  "函数与极限L0至L5完整支架设计",
  "函数与极限教师人工审核材料",
  "函数与极限被试说明与完整问卷-规范修订版"
];

async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(root, "research/审核数据/教师审核题目快照.json"), "utf8"));
  assert.equal(snapshot.questions.length, 108);
  assert.equal(new Set(snapshot.questions.map(q => q.id)).size, 108);
  const review = fs.readFileSync(path.join(root, `research/${names[2]}.md`), "utf8");
  for (const q of snapshot.questions) {
    assert.ok(review.includes(`#### ${q.id}\n`), `missing item ${q.id}`);
    assert.ok(review.includes(q.question || q.prompt), `missing prompt ${q.id}`);
    for (const option of q.options || []) assert.ok(review.includes(option.label), `missing option ${q.id}`);
  }
  const scaffold = fs.readFileSync(path.join(root, `research/${names[1]}.md`), "utf8");
  assert.equal((scaffold.match(/#### L0：/g) || []).length, 6);
  for (let level = 1; level <= 5; level++) assert.equal((scaffold.match(new RegExp(`#### L${level}：`, "g")) || []).length, 6);
  const design = fs.readFileSync(path.join(root, `research/${names[0]}.md`), "utf8");
  for (const unwanted of ["本轮测试通过", "运行命令", "源码与证据索引", "L0沉默"]) assert.ok(!design.includes(unwanted));

  const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(p => fs.existsSync(p));
  assert.ok(executablePath);
  const output = path.join(root, "output/playwright/研究文档排版验收");
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    for (const name of names) {
      const html = fs.readFileSync(path.join(root, `research/${name}.html`), "utf8");
      assert.ok(!html.includes("\uFFFD"));
      assert.ok(!/TODO|TBD|Lorem ipsum/.test(html));
      for (const width of [1366, 768]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(pathToFileURL(path.join(root, `research/${name}.html`)).href);
        await page.evaluate(() => document.fonts.ready);
        const metrics = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth, viewport: innerWidth,
          tables: document.querySelectorAll("table").length,
          h1: document.querySelectorAll("h1").length,
          replacement: document.body.textContent.includes("\uFFFD")
        }));
        assert.ok(metrics.width <= metrics.viewport + 1, `${name}: horizontal overflow`);
        assert.equal(metrics.h1, 1);
        assert.ok(metrics.tables > 0);
        assert.equal(metrics.replacement, false);
        const validContents = await page.locator("details a").evaluateAll(links =>
          links.length > 0 && links.every(link => document.getElementById(link.getAttribute("href").slice(1))));
        assert.ok(validContents, "目录必须指向实际章节");
        await page.screenshot({ path: path.join(output, `${name}-${width}-首页.png`) });
      }
      await page.setViewportSize({ width: 1366, height: 900 });
      const target = name.includes("教师") ? page.locator("h2").filter({ hasText: "八、L0" })
        : name.includes("支架") ? page.locator("h3").filter({ hasText: "6.1" }) : page.locator("h2").nth(3);
      if (await target.count()) await target.first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${name}-内容页.png`) });
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.screenshot({ path: path.join(output, `${name}-末页.png`) });
    }
  } finally { await browser.close(); }
  console.log("文档验收通过：108题、6套L0-L5、四份HTML、中文编码及1366/768宽度无横向溢出。");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
