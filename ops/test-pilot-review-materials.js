"use strict";
const assert=require('node:assert/strict'),{build,csv}=require('./export-pilot-review-materials');
(async()=>{
 await assert.rejects(()=>build({source:'unverified',questions:[],sha256:'x'}),/线上/);
 const r=await build({source:'production-courseware',sha256:'synthetic-only',questions:[{source:'synthetic.archivedQuestions.0',q:{id:'synthetic-q',type:'single',question:'合成题，非学生材料',options:[{value:'A',label:'测试'}],answer:['A'],analysis:'结构测试'}},
 {source:'synthetic.questions.0',q:{id:'synthetic-empty',type:'short_answer',question:'合成缺失材料',answer:[]}}]});
 const a=r.rows.find(x=>x.题目编号==='synthetic-q');assert.equal(a.教师甲结论,'');assert.equal(a.材料摘要.length,64);assert.equal(a.使用范围.startsWith('历史'),true);
 assert.equal(r.manifest.teacherReviewCompleted,false);assert.equal(r.checks.find(x=>x.题目编号==='synthetic-empty').结构检查.includes('简答量规缺失'),true);
 assert.equal(r.rows.filter(x=>x.材料来源.startsWith('支架后检查')).length,90);
 const primary=r.rows.find(x=>x.题目编号==='GH-01-K01-probe-L1-fl-r2');assert.ok(primary);
 assert.equal(JSON.parse(primary.选项).filter(x=>x.value!=='__unknown__').length,4);
 assert.deepEqual(JSON.parse(primary.现有答案),['B']);
 const chapter=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1');
 const current=[];
 for(const phase of ['preQuiz','postQuiz','formativeQuiz'])for(const q of chapter.flow[phase].questions)current.push({q,source:phase});
 for(const m of chapter.modules)for(const p of m.knowledgePoints)for(const q of p.formativeQuiz.questions)current.push({q,source:p.id});
 const local=await build({source:'local-courseware',sha256:'synthetic-structure-only',questions:current});
 assert.equal(local.rows.length,177);
 for(const q of local.rows)assert.doesNotMatch(q.题干,/如图|看下图|观察下图|见图|图中|回看课件|使用落点模拟器/,q.题目编号+'不得依赖未附图像');
 assert.equal(csv([{字段:'逗号,双引号"与换行\n'}]).includes('双引号""'),true);
 console.log('通过：审校材料来源声明、内容摘要、归档标记、缺项检查、中文CSV转义及人工结论留空。');
})().catch(e=>{console.error(e);process.exitCode=1;});
