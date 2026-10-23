"use strict";
const assert=require('node:assert/strict'),{build,csv}=require('./export-pilot-review-materials');
(async()=>{
 await assert.rejects(()=>build({source:'unverified',questions:[],sha256:'x'}),/线上/);
 const r=await build({source:'production-courseware',sha256:'synthetic-only',questions:[{source:'synthetic.archivedQuestions.0',q:{id:'synthetic-q',type:'single',question:'合成题，非学生材料',options:[{value:'A',label:'测试'}],answer:['A'],analysis:'结构测试'}},
 {source:'synthetic.questions.0',q:{id:'synthetic-empty',type:'short_answer',question:'合成缺失材料',answer:[]}}]});
 const a=r.rows.find(x=>x.题目编号==='synthetic-q');assert.equal(a.教师甲结论,'');assert.equal(a.材料摘要.length,64);assert.equal(a.使用范围.startsWith('历史'),true);
 assert.equal(r.manifest.teacherReviewCompleted,false);assert.equal(r.checks.find(x=>x.题目编号==='synthetic-empty').结构检查.includes('简答量规缺失'),true);
 assert.equal(csv([{字段:'逗号,双引号"与换行\n'}]).includes('双引号""'),true);
 console.log('通过：审校材料来源声明、内容摘要、归档标记、缺项检查、中文CSV转义及人工结论留空。');
})().catch(e=>{console.error(e);process.exitCode=1;});
