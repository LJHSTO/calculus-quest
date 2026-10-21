"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const { chromium } = require("playwright-core");
const root = path.resolve(__dirname, ".."), out = path.join(root, "output/课件内与作答区嵌入-2026-10-18");
const checks = [];
async function state(page) { return page.evaluate(async () => (await (await fetch("api/learning/study-workbench", { headers: { Authorization: `Bearer ${sessionStorage.getItem("study-workbench-token")}` } })).json()).data); }
async function ready(page, name) { for (let i = 0; i < 150; i++) { const s = await state(page); if (s?.session?.stage === name) { await page.waitForTimeout(60); return s; } await page.waitForTimeout(40); } throw new Error(`未进入${name}`); }
async function answer(page) { await page.locator('input[name=probe][value=unknown]').check(); await page.getByRole("button", { name: "提交并继续", exact: true }).click(); }
async function support(page) { await answer(page); await ready(page,"explore"); await page.waitForTimeout(1100); await page.getByRole("button", { name:"完成尝试，继续",exact:true }).click(); await ready(page,"t1"); await answer(page); await ready(page,"support"); }
async function register(page,url) { await page.goto(url); await page.locator("#ack").check(); await page.locator("#start").click(); await ready(page,"t0"); }
async function main() {
  fs.mkdirSync(out,{recursive:true});
  const launch = spawnSync(process.execPath,[path.join(__dirname,"start-study-workbench-preview.js"),"embedded"],{cwd:root,windowsHide:true,encoding:"utf8"}); assert.equal(launch.status,0,launch.stderr); const preview=JSON.parse(launch.stdout);
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1366,height:900}}), errors=[]; page.on("pageerror",e=>errors.push(e.message));
    await register(page,preview.url);
    for(let unit=0;unit<6;unit++) {
      await support(page); const frame=page.frameLocator("iframe"), hint=frame.locator("[data-cq-embedded-help]"); await hint.waitFor();
      await page.getByRole("button",{name:"在课件步骤里看线索",exact:true}).click(); await hint.scrollIntoViewIfNeeded();
      const geometry=await hint.evaluate(el=>{const r=el.getBoundingClientRect(), prev=el.previousElementSibling, p=prev.getBoundingClientRect();return {normalFlow:getComputedStyle(el).position==='static',width:r.width,overlap:Math.max(0,Math.min(r.right,p.right)-Math.max(r.left,p.left))*Math.max(0,Math.min(r.bottom,p.bottom)-Math.max(r.top,p.top)),parent:el.parentElement.id||el.parentElement.className,shadowText:el.shadowRoot.textContent.includes('当前步骤线索')||el.shadowRoot.textContent.includes('预测作答线索')};});
      assert.equal(geometry.normalFlow,true); assert.equal(geometry.overlap,0); assert.ok(geometry.width>=180 && geometry.shadowText);
      assert.equal(await page.locator(".help").count(),0);
      if(unit===3) {
        const nativeSlider=frame.locator('#x-position-slider'), prediction=frame.locator('#prediction-input');
        assert.equal(await prediction.isVisible(),false);
        await nativeSlider.focus(); await nativeSlider.press('Home');
        for(let step=0;step<5;step++) await nativeSlider.press('PageUp');
        await nativeSlider.press('ArrowLeft');
        await prediction.waitFor({state:'visible'}); await prediction.fill('4');
        assert.equal(await hint.evaluate(el=>el.parentElement.id),'pred-unlocked');
        assert.equal(await prediction.inputValue(),'4');
        await hint.getByRole('button',{name:'关闭帮助',exact:true}).click({trial:true});
        assert.equal(await hint.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.previousElementSibling.getBoundingClientRect();return r.y>=p.bottom && r.y>=0 && r.bottom<=innerHeight;}),true);
        await page.screenshot({path:path.join(out,'课件原生预测作答-桌面.png')});
        await frame.locator('#reset-btn').click(); await prediction.waitFor({state:'hidden'});
        assert.equal(await hint.evaluate(el=>el.parentElement.id),'controls');
        assert.equal(await hint.isVisible(),true);
      }
      const slider=frame.locator('input[type=range]').first(); await slider.focus(); await slider.press("Home"); await slider.press("ArrowRight"); const value=await slider.inputValue();
      await hint.scrollIntoViewIfNeeded(); await page.waitForTimeout(1150);
      if(unit===0) await page.screenshot({path:path.join(out,"课件内部线索-桌面.png"),fullPage:true});
      // Child-origin messages still need the current offer channel.
      await frame.locator("body").evaluate(()=>parent.postMessage({type:"cq:embedded-action",channel:"expired-channel",action:"close"},"*"));
      assert.equal((await state(page)).session.stage,"support");
      await frame.getByRole("button",{name:"带着线索写想法",exact:true}).click(); await page.locator(".practice-hint .task-hint").waitFor();
      assert.equal(await hint.count(),0);
      const draft=`工程练习${unit+1}：先观察关系，再说明判断依据。`;
      await page.locator("#practice-response").fill(draft);
      await page.getByRole("button",{name:"在课件步骤里看线索",exact:true}).click(); await hint.waitFor(); assert.equal(await slider.inputValue(),value);
      await page.locator("#practice-response").focus(); await page.locator(".practice-hint .task-hint").waitFor(); assert.equal(await hint.count(),0); assert.equal(await page.locator("#practice-response").inputValue(),draft);
      if(unit===0) {
        await page.locator(".guided-practice").scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(out,"练习作答区线索-桌面.png")});
        await page.setViewportSize({width:390,height:844}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.screenshot({path:path.join(out,"练习作答区线索-窄屏.png")}); await page.setViewportSize({width:1366,height:900});
        // A reload restores the server-saved assisted draft, not a score.
        await page.locator("#practice-response").blur(); await page.waitForTimeout(180); await page.reload(); await ready(page,"support"); assert.equal(await page.locator("#practice-response").inputValue(),draft);
      }
      await page.getByRole("button",{name:"保存想法并独立试一题",exact:true}).click(); await ready(page,"outcome");
      assert.equal(await page.locator("iframe,.task-hint,.practice-hint").count(),0);
      const protectedStatus=await page.evaluate(async()=>{const r=await fetch("api/learning/assistant/ask",{method:"POST",headers:{Authorization:`Bearer ${sessionStorage.getItem("study-workbench-token")}`,"Content-Type":"application/json"},body:JSON.stringify({question:"提示当前题目"})});return r.status;}); assert.equal(protectedStatus,409);
      await answer(page); await ready(page,"survey"); for(const name of ["interruption","control","effort"])await page.locator(`input[name=${name}][value=skip]`).check();
      await page.getByRole("button",{name:"保存并进入下一单元",exact:true}).click(); await ready(page,unit===5?"complete":"t0"); checks.push({unit:unit+1,passed:true,geometry});
    }
    const extra=await browser.newPage({viewport:{width:1366,height:900}}); await register(extra,preview.url); await support(extra);
    await extra.frameLocator("iframe").getByRole("button",{name:"关闭帮助",exact:true}).click(); await ready(extra,"outcome"); await extra.locator("#withdraw").click(); await ready(extra,"withdrawn"); assert.equal(await extra.locator("iframe,.task-hint").count(),0);
    const data=(await(await fetch(new URL("/api/admin/research/study-workbench",preview.url))).json()).data;
    assert.equal(data.protocol.assignmentVersion,"nonrandomized-demo-v1");
    const completed=data.sessions.find(s=>s.stage==="complete"); assert.ok(completed.units.every(u=>u.condition==="in_task" && u.practiceResponse.startsWith("工程练习") && !Object.hasOwn(u,"practiceScore")));
    assert.ok(data.events.some(e=>e.event.type==="practice_draft"&&e.event.countsAsAssessment===false));
    assert.ok(data.events.some(e=>e.event.processEvent?.type==="courseware_support_mounted"));
    assert.ok(completed.units.some(u=>u.exposure?.readingEstablished===false)); assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,"真实嵌入验收.json"),JSON.stringify({passed:true,generatedAt:new Date().toISOString(),checks,additional:["原生预测框按真实操作解锁，提示跟随并在重置后回到控件区","拒绝过期消息通道","位置切换保留课件参数和草稿","草稿刷新恢复，不作为掌握评分","独立测量移除帮助并拒绝助教","子页面关闭与退出终止","单臂工程演示，不冒充随机实验"],dataClass:"engineering_synthetic_only",errors},null,2));
    console.log("通过：六知识点真实嵌入、作答区切换、草稿/参数保留、测量保护和关闭退出");
  } finally {await browser.close();try{process.kill(preview.pid);}catch{}}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
