'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core');
const base=process.env.STUDENT_UX_BASE_URL;assert(base&&process.env.SYNTHETIC_STUDY_DIR,'Synthetic study server only');
const out=fs.mkdtempSync(path.resolve('output')+'/r18-evidence-');
async function api(p){const r=await fetch(base+'/api/admin/three-arm'+p);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');return(await r.json()).data;}
(async()=>{
 const exported=await api('/export'),protocol=process.env.STUDY_TIMELINE_PROTOCOL||exported.protocol.fingerprint;
 const data=await api('/timeline?mode=preview&fingerprint='+protocol);
 assert(data.summaries.length);assert(data.timeline.some(e=>e.type==='assistant'));assert(data.timeline.some(e=>e.type==='user'));
 assert(data.checks.some(e=>e.status==='incorrect'));assert(data.checks.some(e=>e.status==='correct'));assert(data.checks.some(e=>e.status==='skipped'&&e.correct===null));
 for(const run of data.summaries){
  const own=data.checks.filter(r=>r.runId===run.runId&&r.phase==='independent_check');assert.equal(new Set(own.map(r=>r.checkId)).size,own.length,'同一次检查的事件和学习记忆不重复算分');
 }
 assert(data.modelCalls.every(c=>c.fallback===true||c.reportedModel===require('../lib/llm').runtimeInfo().model));
 assert(data.modelCalls.filter(c=>c.status==='completed').every(c=>Number.isFinite(c.queueMs)&&Number.isFinite(c.executionMs)&&Number.isFinite(c.totalMs)));
 const foreign=await api('/timeline?mode=formal&fingerprint='+protocol);assert.equal(foreign.timeline.length,0,'体验记录不得出现在正式导出');
 const runId=data.summaries[0].runId,scoped=await api('/timeline?mode=preview&fingerprint='+protocol+'&runId='+runId);assert(scoped.timeline.every(e=>e.runId===runId));
 const browser=await chromium.launch({channel:'chrome',headless:true});try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/three-arm-admin.html');await page.locator('#study-admin-enter').click();await page.getByRole('button',{name:'学生交互证据回放',exact:true}).click();
  await page.getByLabel('交互回放数据来源').selectOption('preview');await page.getByLabel('交互回放协议版本').selectOption(protocol);await page.getByLabel('交互回放学习轮次').selectOption(runId);await page.getByRole('button',{name:'读取学生交互',exact:true}).click();await page.getByRole('button',{name:'下载事件长表 CSV',exact:true}).waitFor();
  await page.getByLabel('交互回放类别').selectOption('对话与等待');await page.getByLabel('搜索交互回放').fill('assistant');assert(await page.locator('#study-admin-content section details').count());
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载模型调用 CSV',exact:true}).click();await(await download).saveAs(path.join(out,'模型调用.csv'));
  assert(fs.readFileSync(path.join(out,'模型调用.csv'),'utf8').includes('reportedModel'));
  await page.screenshot({path:path.join(out,'学生交互回放.png'),fullPage:true});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'timeline.json'),JSON.stringify(data,null,2));fs.writeFileSync(path.join(out,'raw-export.json'),JSON.stringify(exported,null,2));
 const result={passed:true,runIds:data.summaries.map(r=>r.runId),summaries:data.summaries,events:data.timeline.length,modelCalls:data.modelCalls.length,checks:data.checks.length,issues:data.issues};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({out,...result}));
})().catch(e=>{console.error(e);process.exitCode=1;});
