'use strict';
// Offline scoring preserves the original responses and never overwrites the study database.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const bank=require('../lib/assessments/functions-limits-r10'),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const questions=new Map(['pre','post'].flatMap(p=>['X','Y'].flatMap(f=>bank.questions(p,f))).map(q=>[q.id,q]));
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
function packet(exported){
 const rows=exported.data?.tables?.quiz_results||exported.tables?.quiz_results||exported.quiz_results||[];
 const selected=rows.filter(r=>questions.get(r.question_id)?.type==='short_answer'&&!['__unknown__','__skip__'].includes(r.response));
 const mapping=[],items=[];
 for(const r of selected){const q=questions.get(r.question_id),blindId=crypto.randomUUID(),material={prompt:q.question,response:r.response,criteria:q.rubric.map(x=>x.criterion)};mapping.push({blindId,resultId:r.id,userId:r.user_id,questionId:r.question_id,phase:r.phase,responseHash:hash(r.response),materialHash:hash(material)});items.push({blindId,...material,points:[null,null,null,null],reason:''});}
 for(let i=items.length-1;i>0;i--){const j=crypto.randomInt(i+1);[items[i],items[j]]=[items[j],items[i]];}
 return {mapping:{version:bank.version,inputDigest:hash(exported),rows:mapping},rating:{version:bank.version,rater:'',items}};
}
function validateRating(rating,mapping){
 assert.equal(rating.version,bank.version);assert.ok(typeof rating.rater==='string'&&rating.rater.trim(),'请填写评分者代号');
 const ids=new Set(mapping.rows.map(r=>r.blindId));assert.equal(rating.items.length,ids.size);
 const seen=new Set();for(const item of rating.items){assert.ok(ids.has(item.blindId)&&!seen.has(item.blindId),'未知或重复评分编号');seen.add(item.blindId);assert.ok(Array.isArray(item.points)&&item.points.length===4&&item.points.every(v=>v===0||v===1),'每项必须为0或1');assert.equal(hash({prompt:item.prompt,response:item.response,criteria:item.criteria}),mapping.rows.find(r=>r.blindId===item.blindId).materialHash,'题干、原回答和量规不得修改');}
}
function reconcile(mapping,a,b,adjudication=null){
 validateRating(a,mapping);validateRating(b,mapping);assert.notEqual(a.rater,b.rater,'需要两位不同评分者');
 if(adjudication){assert.ok(![a.rater,b.rater].includes(adjudication.rater),'裁决者须独立于前两位评分者');validateRating(adjudication,mapping);}
 const records=mapping.rows.map(m=>{const x=a.items.find(i=>i.blindId===m.blindId),y=b.items.find(i=>i.blindId===m.blindId),agree=x.points.every((v,i)=>v===y.points[i]),z=adjudication?.items.find(i=>i.blindId===m.blindId),final=agree?x.points:z?.points||null;return {...m,raterA:{id:a.rater,points:x.points,reason:x.reason},raterB:{id:b.rater,points:y.points,reason:y.reason},agreement:agree,adjudication:!agree&&z?{rater:adjudication.rater,points:z.points,reason:z.reason}:null,score:final?final.reduce((s,v)=>s+v,0):null,maxScore:4,status:final?'human_scored':'needs_adjudication'};});
 return {version:bank.version,inputDigest:mapping.inputDigest,at:new Date().toISOString(),records,agreement:{exactItemAgreement:records.length?records.filter(r=>r.agreement).length/records.length:null,n:records.length,note:'这是原始一致率；正式报告另计算适用的ICC或加权kappa及区间。'},scoringHashes:{a:hash(a),b:hash(b),adjudication:adjudication?hash(adjudication):null}};
}
if(require.main===module){try{const [mode,...args]=process.argv.slice(2);if(mode==='prepare'){const [input,dir]=args;assert.ok(input&&dir,'prepare 管理导出.json 新建评分目录');assert.ok(!fs.existsSync(dir),'评分目录必须为新目录，防止覆盖');const p=packet(read(input));fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'主试保管-编号映射.json'),JSON.stringify(p.mapping,null,2));for(const r of ['甲','乙'])fs.writeFileSync(path.join(dir,`评分者${r}.json`),JSON.stringify({...p.rating,rater:'评分者'+r},null,2));console.log('已生成两份盲评材料；编号映射只由主试保管。');}else if(mode==='reconcile'){const [mapping,a,b,output,adjudication]=args;assert.ok(output&&!fs.existsSync(output),'结果文件必须是新文件');const result=reconcile(read(mapping),read(a),read(b),adjudication?read(adjudication):null);fs.writeFileSync(output,JSON.stringify(result,null,2));console.log('已保留双人评分并生成裁决清单。');}else throw Error('用法：prepare <管理导出.json> <新目录>，或 reconcile <映射.json> <甲.json> <乙.json> <新结果.json> [裁决.json]');}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={packet,validateRating,reconcile};
