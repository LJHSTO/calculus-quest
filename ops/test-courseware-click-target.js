"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright-core");
const { exerciseBasicControls } = require("./test-courseware-browser");

async function main() {
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"]
    .filter(Boolean).find(candidate => fs.existsSync(candidate));
  assert.ok(executablePath, "需要 Chrome 或 Edge");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<button id="decoy" hidden onclick="window.decoyClicks++">返回</button>
      <button id="start" onclick="window.started++">开始挑战</button><script>
      window.started=0;window.decoyClicks=0;
      document.querySelector('#start').scrollIntoView=function(){
        document.querySelector('#decoy').hidden=false;
        HTMLElement.prototype.scrollIntoView.call(this);
      };
      </script>`);
    const actions = await exerciseBasicControls(page, "V14-C1动态控件回归");
    const outcome = await page.evaluate(() => ({ started, decoyClicks }));
    assert.equal(outcome.started, 1, "初始命中的开始按钮必须真正被点击");
    assert.equal(outcome.decoyClicks, 0, "滚动过程中出现的新按钮不能替代初始点击目标");
    assert.equal(actions[0].id, "start");
    console.log("动态可见按钮列表回归通过：新增按钮不改变已确认的真实点击目标。");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
