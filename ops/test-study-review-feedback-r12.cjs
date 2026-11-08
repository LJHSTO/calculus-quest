'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../lib/three-arm-study'),'utf8');
const start=source.indexOf('  function review(user,cycles=[])'),end=source.indexOf('  function probe(',start);assert(start>0&&end>start);
const stages=require('../app/shared/study-stages'),contract=require('../app/shared/learner-preferences');
const at='2026-11-08T01:00:00Z';
const rows=[
 {id:'practice-1',unit_id:'GH-01-K01-formative',question_id:'fl-r12-formative-GH-01-K01-1',phase:'formative',is_correct:1,created_at:at},
 {id:'practice-2',unit_id:'GH-01-K01-formative',question_id:'fl-r12-formative-GH-01-K01-2',phase:'formative',is_correct:0,created_at:at},
 ...[7,10,11,12].flatMap(v=>['pre','post'].map(phase=>({id:`protected-${v}-${phase}`,unit_id:'V14-C1-'+phase,question_id:`fl-r${v}-${phase}-X-1`,phase,is_correct:1,created_at:at})))
];
for(const arm of ['A','B','C']){
 const context={supportHistory:(_user,cycles)=>cycles,get:()=>({id:'synthetic',arm,configuredAt:at,reviewedStages:[]}),fail:message=>{throw Error(message);},db:{getQuizResultsByUser:()=>structuredClone(rows)},correctValue:r=>r.is_correct===1,publicRun:r=>r,stages,rows:()=>[{document:JSON.stringify({revision:1,at:'2026-11-08T00:00:00Z',answers:contract.defaults()})}],parse:r=>JSON.parse(r.document),now:()=> '2026-11-08T02:00:00Z',readRecord:()=>null,contract,researchFeedback:require('../lib/research-feedback')};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);const data=context.review('synthetic');
 assert.equal(data.results.length,2,arm+'回顾仅统计形成测');assert.equal(data.ordinary.answered,2);assert.equal(data.ordinary.scored,2);assert.equal(data.ordinary.correct,1);
 assert(!JSON.stringify(data).includes('protected-'),arm+'任何嵌套统计不得泄漏前后测题号或判断');
 if(arm==='B'){assert.equal(data.linked[0].configurationResults.length,2);assert.equal(data.phases.flatMap(p=>p.results).length,2);}
}
assert.equal(rows.length,10,'回顾不改原答数据');console.log('A/B/C回顾反馈保护通过：形成反馈保留，r7/r10/r11/r12前后测不进入普通/关联统计。');
