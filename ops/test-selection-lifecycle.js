"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright-core");
const root = path.resolve(__dirname, "..");
async function main() {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="lesson-player"><p id="parent-text">函数为每个输入确定唯一输出。</p><iframe data-courseware-frame sandbox="allow-scripts" srcdoc="<p id=lesson>从两个方向观察函数的变化。</p><button>继续尝试</button>"></iframe></main><aside><div id="toolbar" hidden>问知点　记一笔</div></aside>');
    await page.addScriptTag({ path: path.join(root, "app/main/courseware-context.js") });
    await page.evaluate(() => {
      window.events = [];
      window.controller = CoursewareContextCore.createBrowserController({
        root: document.querySelector("main"), sidebarRoot: document.querySelector("aside"),
        getCourseMeta: () => ({unitId:"GH-01-K01",sceneType:"game"}),
        onTextSelection: p => {events.push(p.source); document.querySelector("#toolbar").hidden=false;},
        onTextSelectionCleared: () => {document.querySelector("#toolbar").hidden=true;}
      });
    });
    const frame = await (await page.locator("iframe").elementHandle()).contentFrame();
    await frame.addScriptTag({ path: path.join(root, "app/main/courseware-bridge.js") });
    async function select(context, selector) {
      await context.evaluate(sel => { const r=document.createRange(); r.selectNodeContents(document.querySelector(sel));getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new MouseEvent("pointerup",{bubbles:true})); }, selector);
      await page.waitForFunction(() => !document.querySelector("#toolbar").hidden);
    }
    await select(frame,"#lesson");
    await frame.locator("#lesson").click();
    assert.equal(await frame.evaluate(()=>getSelection().isCollapsed),true,"复现步骤确实取消课件选区");
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#toolbar").evaluate(n=>n.hidden),true,"课件内取消选区后工具条必须消失");
    await select(frame,"#lesson");
    await frame.evaluate(()=>getSelection().removeAllRanges());
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#toolbar").evaluate(n=>n.hidden),true,"脚本/键盘清除课件选区后工具条必须消失");
    await select(page,"#parent-text");
    await page.evaluate(()=>getSelection().removeAllRanges());
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#toolbar").evaluate(n=>n.hidden),true,"主页面清除选区后工具条必须消失");
    assert.deepEqual(await page.evaluate(()=>events),["iframe","iframe","document"]);
    console.log("选区生命周期通过：沙箱课件点击取消、清除选区、主页面清除选区。");
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
