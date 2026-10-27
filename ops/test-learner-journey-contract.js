'use strict';
const assert=require('node:assert/strict');
const C=require('../app/shared/learner-preferences');
const a=C.defaults();for(const x of Object.values(a))x.reason='default';
assert.equal(C.profile(a,require('../lib/research-controls').defaults).maxEscalations,1,'两条支持路径都至多追加一轮');
assert.equal(typeof C.optionsFor,'function','需要按研究条件区分选项');
assert.ok(!C.optionsFor('D5',true).some(x=>x[0]==='request'),'实验组不能把被动助手选成常规条件');
assert.ok(C.optionsFor('D5',false).some(x=>x[0]==='request'),'普通学习保留个人关闭主动帮助的选择');
const x=structuredClone(a);x.D5.value='request';assert.throws(()=>C.validate(x,{experimental:true}),/主动/);
for(const d of C.dimensions){
  assert.ok(C.reasonsFor(d.id).length>=4);
  for(const o of C.optionsFor(d.id,true))assert.ok(C.previewFor(d.id,o[0]).length>20);
}
assert.notDeepEqual(C.reasonsFor('D1'),C.reasonsFor('D6'));
const J=require('../lib/learner-journey'),pre=[{id:'p1',question_id:'q1',phase:'pre',created_at:'2026-10-26T00:00:00Z'}];
const preparation={required:true,chapterId:'V14-C1',results:[{chapter_id:'V14-C1',unit_id:'V14-C1-pre',phase:'pre',question_id:'q1'}],questionIds:['q1'],generation:2};
assert.equal(J.preparation({...preparation,results:[]}).stage,'pretest');
assert.equal(J.preparation(preparation).stage,'configuration');
assert.equal(J.preparation({...preparation,record:{generation:2}}).stage,'ready');
assert.equal(J.preparation({...preparation,record:{generation:1}}).stage,'configuration');
assert.equal(J.preparation({...preparation,record:{revision:1}}).stage,'ready','保留已有旧版本配置');
assert.equal(J.preparation({...preparation,enrollment:{arm:'control'}}).required,false,'预试按组别走，不强迫对照组配置');
assert.equal(J.admission([],['q1'],true).kind,'fresh');
assert.equal(J.admission(pre,['q1'],true).kind,'reuse_pretest');
assert.equal(J.admission(pre,['q1','q2'],true).kind,'new_round_required');
assert.equal(J.admission([...pre,{phase:'post'}],['q1'],true).kind,'new_round_required');
assert.equal(J.admission([...pre,{phase:'post'}],['q1'],true,true).kind,'resume_rehearsal');
assert.equal(J.admission([...pre,{phase:'post'}],['q1'],true,true).priorLearning,true);
assert.equal(J.admission(pre,['q1','q2'],true,true).pretestComplete,false);
assert.equal(J.preparation({...preparation,results:[],entryRequired:true}).stage,'entry');
assert.equal(J.preparation({...preparation,results:[],entryRequired:true,entry:{mode:'ordinary'}}).stage,'pretest');
for(const [value,placement,format] of [['inline','inline','plain'],['compact','inline','disclosure'],['sidebar','sidebar','plain'],['sidebar_compact','sidebar','disclosure']]){
 const answers=structuredClone(a);answers.D4.value=value;const profile=C.profile(answers,{});
 assert.equal(profile.placement,placement);assert.equal(profile.presentationFormat,format);assert.equal(C.displayValue(placement,format),value);
 assert.equal(profile.authorityLevel,'A1','D4不改变D5的确认规则');assert.equal(profile.supportInquiryEnabled,true);
}
assert.equal(J.editWindow({stage:'configuration'},{currentUnitId:'GH-01-K01'},[]).allowed,true);
assert.equal(J.editWindow({stage:'ready'},{currentUnitId:'GH-01-K01'},[]).allowed,false);
assert.equal(J.editWindow({stage:'ready'},{currentUnitId:'GH-01-K01-formative'},[{unit_id:'GH-01-K01-formative',phase:'formative',question_id:'GH-01-K01-check-q1',is_correct:1}]).allowed,true);
assert.equal(J.editWindow({stage:'ready'},{currentUnitId:'GH-01-K01-formative'},[{unit_id:'GH-01-K01-formative',phase:'formative',question_id:'GH-01-K01-check-q1',is_correct:0}]).allowed,false,'待补诊断题期间不能修改');
const {includesRecord}=require('../lib/pilot-replay');
const e={status:'active',generation:1,consentAt:'2026-10-26T01:00:00Z',reusedPretest:{resultIds:['p1'],explicitConsentAt:'2026-10-26T01:00:00Z'}};
assert.equal(includesRecord(e,'quiz_results',{id:'p1',learning_generation:1,created_at:'2026-10-26T00:00:00Z'}),true);
assert.equal(includesRecord(e,'events',{id:'p1',learning_generation:1,created_at:'2026-10-26T00:00:00Z'}),false);
assert.equal(includesRecord({...e,status:'withdrawn'},'quiz_results',{id:'p1'}),false);
console.log('学生流程契约通过：实验组选项、普通学习选择、逐维理由、逐项行为解释。');
