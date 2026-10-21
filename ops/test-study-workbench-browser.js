"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const { chromium } = require("playwright-core");
const root = path.resolve(__dirname, ".."), out = path.join(root, "output/OpenMAIC迁移与研究方案-2026-10-17");
const checks = [], errors = [];
async function state(page) { return page.evaluate(async () => (await (await fetch("api/learning/study-workbench", { headers: { Authorization: `Bearer ${sessionStorage.getItem("study-workbench-token")}` } })).json()).data); }
async function ready(page, expected) {
  for (let i = 0; i < 100; i++) { const s = await state(page); if (s?.session?.stage === expected) { await page.waitForTimeout(40); return s; } await page.waitForTimeout(50); }
  throw new Error(`阶段未达到${expected}`);
}
async function answer(page, value) { await page.locator(`input[name=probe][value="${value}"]`).check(); await page.getByRole("button", { name: "提交并继续", exact: true }).click(); }
async function create(context, url) {
  const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
  await page.goto(url); await page.locator("#ack").check(); await page.locator("#start").click(); await ready(page, "t0"); return page;
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  try {
    for (const kind of ["recheck", "placement"]) {
      const launch = spawnSync(process.execPath, [path.join(__dirname, "start-study-workbench-preview.js"), kind], { cwd: root, windowsHide: true, encoding: "utf8" });
      assert.equal(launch.status, 0, launch.stderr); const preview = JSON.parse(launch.stdout);
      try {
        const origin = new URL(preview.url).origin;
        assert.equal((await fetch(`${origin}/api/learning/study-workbench`)).status, 401);
        const geometries = [];
        for (let person = 0; person < 2; person++) {
          const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
          const page = await create(context, preview.url);
          const guard = await page.evaluate(async () => {
            const r = await fetch("api/learning/assistant/ask", { method: "POST", headers: { Authorization: `Bearer ${sessionStorage.getItem("study-workbench-token")}`, "Content-Type": "application/json" }, body: JSON.stringify({ question: "帮我回答当前题目" }) });
            return { status: r.status, code: (await r.json()).code };
          });
          assert.deepEqual(guard, { status: 409, code: "common_probe_protected" });
          const initial = await state(page); assert.ok(!JSON.stringify(initial).includes('"correct"'));
          for (let unit = 0; unit < (kind === "recheck" ? 6 : 1); unit++) {
            await answer(page, String(([1, 1, 0, 1, 2, 1][unit] + 1) % 3)); await ready(page, "explore");
            if (unit === 0) {
              await page.reload(); await ready(page, "explore");
              const range = page.frameLocator("iframe").locator('input[type="range"]').first();
              await range.waitFor(); await range.focus(); await range.press("ArrowRight");
            }
            await page.waitForTimeout(1100);
            await page.getByRole("button", { name: "完成尝试，继续", exact: true }).click(); await ready(page, "t1");
            await answer(page, String([1, 0, 1, 0, 0, 0][unit]));
            await page.waitForTimeout(150); let current = await state(page);
            if (current.session.stage === "support") {
              await page.locator(".help").waitFor();
              const geometry = await page.evaluate(() => {
                const f = document.querySelector("iframe").getBoundingClientRect(), h = document.querySelector(".help").getBoundingClientRect();
                return { width: f.width, height: f.height, helpWidth: h.width, helpHeight: h.height, maxButtonHeight: Math.max(...[...document.querySelectorAll('.help button')].map(b => b.getBoundingClientRect().height)), overlap: Math.max(0, Math.min(f.right,h.right)-Math.max(f.left,h.left))*Math.max(0,Math.min(f.bottom,h.bottom)-Math.max(f.top,h.top)), overflow: document.documentElement.scrollWidth > innerWidth, placement: document.querySelector(".help-inline") ? "inline" : "sidebar" };
              });
              assert.ok(geometry.width >= 960 && geometry.height >= 500, JSON.stringify(geometry)); assert.equal(geometry.overlap, 0); assert.equal(geometry.overflow, false); assert.ok(geometry.maxButtonHeight <= 60, "帮助按钮不可被挤成竖排长条");
              if (kind === "placement") {
                geometries.push(geometry); await page.screenshot({ path: path.join(out, `研究工作台-${geometry.placement === "inline" ? "课件上方" : "课件侧边"}.png`), fullPage: true });
                await page.setViewportSize({ width: 390, height: 844 });
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                await page.screenshot({ path: path.join(out, "研究工作台-窄屏.png"), fullPage: true });
                await page.setViewportSize({ width: 1366, height: 900 });
              }
              await page.locator(".help").scrollIntoViewIfNeeded(); await page.waitForTimeout(1250);
              await page.getByRole("button", { name: "关闭帮助", exact: true }).click();
            }
            await ready(page, "outcome"); await answer(page, "skip"); await ready(page, "survey");
            for (const field of ["interruption", "control", "effort"]) await page.locator(`input[name=${field}][value=skip]`).check();
            await page.getByRole("button", { name: "保存并进入下一单元", exact: true }).click(); await ready(page, unit === 5 ? "complete" : "t0");
          }
          if (kind === "placement") { await page.locator("#withdraw").click(); await ready(page, "withdrawn"); }
          assert.equal(await page.locator("#error").isVisible(), false); await context.close();
        }
        const exported = (await (await fetch(`${origin}/api/admin/research/study-workbench`)).json()).data;
        assert.equal(exported.sessions.length, 2);
        assert.ok(exported.events.some(row => row.event.detail?.processEvent || row.event.processEvent));
        if (kind === "recheck") {
          assert.ok(exported.sessions.every(s => s.stage === "complete" && s.units.length === 6 && s.units.every(u => u.status === "complete" && u.probes.outcome.correct === null && u.survey.control === null)));
          assert.equal(exported.sessions.flatMap(s => s.units).filter(u => u.decision.action === "cancel").length, 6);
          assert.equal(exported.sessions.flatMap(s => s.units).filter(u => u.decision.action === "present").length, 6);
          fs.writeFileSync(path.join(out, "仅工程预演-完整轨迹.json"), JSON.stringify(exported, null, 2));
        } else {
          assert.deepEqual(geometries.map(g => g.placement).sort(), ["inline", "sidebar"]);
          assert.equal(geometries[0].width, geometries[1].width);
          assert.equal(geometries[0].helpWidth, geometries[1].helpWidth); assert.equal(geometries[0].helpHeight, geometries[1].helpHeight);
          assert.ok(exported.sessions.every(s => s.stage === "withdrawn" && s.units.filter(u => u.status === "assigned_not_entered").length === 4));
        }
        assert.ok(exported.sessions.flatMap(s => s.units).some(u => u.exposure?.readingEstablished === false));
        checks.push({ kind, result: "通过", checks: ["真实注册与服务端独立判分", "共同探针阻止助教解答", "课件滑块交互与过程事件", "刷新恢复", "条件锁定", "曝光与关闭", "未作答和问卷缺失不补零", "全部已分配单元记录"], geometry: geometries });
      } finally { try { process.kill(preview.pid); } catch {} }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, "研究工作台浏览器验收.json"), JSON.stringify({ passed: true, dataClass: "engineering_synthetic_only", checks, errors }, null, 2));
    console.log("通过：重核对条件的两人十二单元，以及位置条件的两人两单元；均为工程账号");
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
