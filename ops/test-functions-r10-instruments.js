'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const bank=require('../lib/assessments/functions-limits-r10'),probe=require('../lib/assessments/functions-limits-probes-r10'),delayed=require('../lib/assessments/functions-limits-delayed-r10'),supports=require('../lib/courseware/functions-limits-r10/supports');
const preferences=require('../app/shared/learner-preferences'),measures=require('../lib/assessments/three-arm-design-v1'),crypto=require('node:crypto');
const checks=[],check=(label,fn)=>{fn();checks.push(label);console.log('通过：'+label);};
check('X/Y/Z同蓝图、每卷32分，8选择4简答，阶段题号隔离',()=>{let all=[];for(const f of ['X','Y','Z']){const qs=bank.forms(f);assert.equal(qs.length,12);assert.equal(qs.reduce((s,q)=>s+q.points,0),32);assert.equal(qs.filter(q=>q.type==='single').length,8);assert.equal(qs.filter(q=>q.type==='short_answer').length,4);assert.ok(qs.every(q=>q.equivalence.validationStatus==='content_aligned_not_empirically_equated'));for(const q of qs){if(q.type==='single'){assert.equal(q.options.filter(o=>o.value===q.answer[0]).length,1);assert.equal(new Set(q.options.map(o=>o.label)).size,6);}else{assert.equal(q.rubric.length,4);assert.equal(q.rubric.reduce((s,r)=>s+r.points,0),4);}}for(const phase of ['pre','post'])all.push(...bank.questions(phase,f).map(q=>q.id));}assert.equal(new Set(all).size,72);assert.deepEqual(bank.forms('X').map(q=>[q.type,q.points,q.pairId,q.equivalence.constructId]),bank.forms('Y').map(q=>[q.type,q.points,q.pairId,q.equivalence.constructId]));});
check('定义域、空实心点、左右参数与误差保证数学核验',()=>{for(const f of ['X','Y','Z']){const p=bank.variants[f],a=p.a,qs=bank.forms(f),chosen=i=>qs[i].options.find(o=>o.value===qs[i].answer[0]).label;assert.match(chosen(0),/不违反/);assert.equal(a+1,2*a+1-a);assert.match(chosen(2),/甲点在/);const predicted=x=>2*x+1,alternative=x=>predicted(x)+(x-a+1)*(x-a);assert.equal(alternative(a-1),predicted(a-1));assert.equal(alternative(a),predicted(a));assert.notEqual(alternative(a+1),predicted(a+1));const lo=a-2,curve=x=>x+20*(x-lo)*(x-lo-1)*(x-lo-2);for(const x of [lo,lo+1,lo+2])assert.equal(curve(x),x);assert.ok(curve(lo+.25)>curve(lo+.75));for(const x of [a-.1,a+.1,a+2])assert.ok(Math.abs((x*x-a*a)/(x-a)-(x+a))<1e-10);assert.match(qs[3].referenceAnswer,/不是同一函数/);assert.match(qs[3].referenceAnswer,/限制/);assert.equal(a-1.75<a-1.25,true);assert.equal(a+.25>a-1.25,true);assert.match(chosen(5),/否定/);assert.equal(chosen(6),String(2*p.t+1));const bad=1+.75*p.e;assert.ok(Math.abs(bad-1)<p.e&&2*Math.abs(bad-1)>p.e);for(const factor of [.999,.5,-.5,-.999])assert.ok(2*Math.abs(factor*p.e/2)<p.e);assert.equal(2+(p.end-1),1+p.end);assert.equal(3*a+1-2*a,a+1);assert.match(chosen(10),/三者|等于点值/);}});
check('公开前后测不泄露答案与量规，保留不会和跳过',()=>{for(const phase of ['pre','post'])for(const f of ['X','Y']){const p=bank.publicForm(phase,f);assert.equal(p.agentAssistanceAllowed,false);assert.equal(p.feedbackPolicy,'acknowledgement_only');for(const q of p.items){for(const key of ['answer','analysis','rubric','referenceAnswer','commentPrompt'])assert.equal(q[key],undefined);if(q.type==='single'){assert.ok(q.options.some(o=>o.value==='__unknown__'));assert.ok(q.options.some(o=>o.value==='__skip__'));}}}});
check('66道检查合法、18道共同题含定义域及空实心点，阶段跳过不判错',()=>{const ids=[];for(let i=0;i<6;i++)for(let v=0;v<11;v++){const q=probe.raw(i,v);ids.push(q.id);assert.equal(q.options.filter(o=>o.value===q.answer).length,1);assert.equal(new Set(q.options.map(o=>o.label)).size,4);assert.equal(q.instrumentVersion,'functions-limits-probes-r10');}assert.equal(new Set(ids).size,66);assert.match(probe.raw(1,9).subSkill,/domain/);assert.match(probe.raw(1,10).subSkill,/point_and_nearby/);for(let i=0;i<6;i++)for(const stage of ['t0','t1','outcome','return_probe']){const p=probe.publicProbe(i,stage);assert.equal(p.answer,undefined);assert.equal(p.analysis,undefined);const correct=probe.raw(i,{t0:0,t1:1,outcome:2,return_probe:7}[stage]);assert.equal(probe.gradeProbe(i,stage,correct.answer).correct,true);assert.equal(probe.gradeProbe(i,stage,'skip').correct,null);assert.equal(probe.gradeProbe(i,stage,'__unknown__').correct,false);}assert.throws(()=>probe.gradeProbe(0,'t0','injected'));});
check('延迟保持8题、情境迁移6题，域限制继续覆盖',()=>{assert.equal(delayed.retention.length,8);assert.equal(delayed.transfer.length,6);assert.equal(new Set([...delayed.retention,...delayed.transfer].map(q=>q.id)).size,14);assert.ok(delayed.retention.some(q=>q.id==='fl-r10-retention-domain'));for(const q of [...delayed.retention,...delayed.transfer])assert.equal(q.options.filter(o=>o.value===q.answer[0]).length,1);assert.ok(delayed.transfer.every(q=>q.transferScope==='near_context_transfer_not_far_transfer'));});
check('六知识点五级支架完整，误差零倍率与定义域有防错说明',()=>{for(const id of bank.ids){const s=supports[id];assert.ok(s);for(const key of ['selfExplanationPrompt','conceptHint','subgoalPrompt','nextStepPrompt','partialExamplePrompt'])assert.ok(s[key].length>=16);}assert.match(supports['GH-01-K02'].conceptHint,/原式允许/);assert.match(supports['GH-02-K01'].conceptHint,/不要除以0/);assert.match(supports['GH-02-K01'].nextStepPrompt,/不等于目标点/);});
check('L5误差正文与活动统一，相关检查仍使用不同规则和条件',()=>{
 const activityModule=require('../lib/support-activity'),body=supports['GH-02-K01'].partialExamplePrompt;
 const activity=activityModule.create({scope:'GH-02-K01',plan:{primaryGoal:'cognitive',knowledgeScaffoldLevel:'L5'}});
 assert.equal(activity.kind,'range');assert.equal(activity.independent,false);assert.equal(activity.evidenceScope,'assisted_support_interaction');
 for(const pattern of [/g\(x\)=3x\+1/,/靠近2/,/靠近7|趋近7/,/0\.3/]){assert.match(body,pattern);assert.match(activity.intro,pattern);}
 assert.equal(activity.range.multiplier,3);assert.equal(activity.range.epsilon,.3);assert.ok(!body.includes('3x−2')&&!body.includes('0.9'));
 assert.ok(!/δ\s*[=≤]|答案|选[A-D]/.test(body),'正文应保留活动中选择范围的任务');
 for(let cent=1;cent<=30;cent++){
  const delta=cent/100,valid=delta<=.1;
  assert.equal(activityModule.rangeFeedback(delta).startsWith('对所有'),valid);
  if(valid)for(const ratio of [-.99,-.5,.5,.99])assert.ok(Math.abs((3*(2+ratio*delta)+1)-7)<.3);
  else {const distance=(.1+delta)/2;assert.ok(distance<delta&&3*distance>.3);}
 }
 for(let variant=0;variant<8;variant++)assert.match(probe.raw(3,variant).prompt,/4倍/);
 for(const form of ['X','Y','Z'])assert.match(bank.forms(form)[7].question,/y=2x\+/);
 const first=probe.raw(3,0),radius=Number(first.options.find(o=>o.value===first.answer).label);
 assert.equal(radius,.07);assert.match(first.prompt,/小于0\.28/);assert.match(first.analysis,/4×0\.07=0\.28/);
 assert.notEqual(radius,activity.range.epsilon/activity.range.multiplier,'首题不能沿用L5活动的0.1');
 assert.deepEqual(first.options.map(o=>o.label),['0.07','0.14','0.21','0']);
 for(const ratio of [.5,.99])assert.ok(4*radius*ratio<.28);
 for(const wrong of [.14,.21]){const distance=(radius+wrong)/2;assert.ok(distance<wrong&&4*distance>.28);}
 const priorProbe=require('../lib/assessments/functions-limits-probes-r7');
 for(let variant=1;variant<11;variant++){
  const previous=priorProbe.raw(3,variant),current=probe.raw(3,variant);
  for(const field of ['prompt','options','answer','analysis'])assert.deepEqual(current[field],previous[field],'其他误差变体保持：'+variant+' '+field);
 }
 assert.notEqual(first.prompt,activity.intro);assert.equal(probe.publicProbe(3,'t0').answer,undefined);
});
check('延迟测量按历史版本分派，r10不能给r7题号重判',()=>{
 const registry=require('../lib/proactive-outcomes/functions-limits-r10'),old=require('../lib/assessments/functions-limits-delayed-r7');
 assert.equal(registry.forVersion(registry.version),registry);assert.equal(registry.forVersion('unregistered-version'),null);
 const original=registry.forVersion(old.version);assert.ok(original);assert.equal(original.version,old.version);
 for(const stage of ['retention','transfer']){
  assert.deepEqual(original.publicStage(stage).items.map(q=>q.id),old[stage].map(q=>q.id));
  const responses=Object.fromEntries(old[stage].map(q=>[q.id,q.answer[0]]));
  assert.equal(original.grade(stage,responses).score,old[stage].length);
  assert.equal(registry.grade(stage,responses),null);
 }
 for(const version of ['functions-limits-retention-r1','functions-limits-retention-r2','functions-limits-retention-r3','functions-limits-retention-r4'])assert.equal(registry.forVersion(version)?.version,version);
});
check('新增中文文本没有编码替换字符、未定义或占位文本',()=>{for(const file of ['lib/assessments/functions-limits-r10.js','lib/assessments/functions-limits-probes-r10.js','lib/assessments/functions-limits-delayed-r10.js','lib/courseware/functions-limits-r10/supports.js']){const s=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');assert.ok(!s.includes('\uFFFD'));assert.ok(!/TODO|Lorem ipsum/.test(s));}});
const surveyChecks=[],surveyCheck=(label,fn)=>{check(label,fn);surveyChecks.push(label);};
surveyCheck('问卷只更新材料说明，原题、量表分组、六维设置及三组回顾契约保持',()=>{
 const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
 const expected={surveys:'16cbf7c253af6b6326aa3fc04365ab62e9ea10a02d88e42643469e21ff68e8f6',groups:'9fec34b4b576c554fced057fa6f7a4a1da1d70c2353b8465e949c80d2b2d89ae',items:'f7661999f851914c102ab16be10815fc1d2f79b2830c4c81eb168ff283d7b53c',cases:'ae49d2f8f5e46bf8f60f41bfff4432252306ed747d8cbf2659b02b93e284df2d',configurationRubric:'f5da108d33ef68d028c4d95823c532d77b53d71dccf707a8124366f03d6186e5',understanding:'09e4b439ed05cf50be050de68ed9cef32f400016771b501fa7ab87b427566b1b',dimensions:'4900bc748263f6a17a532e0e2b001e261a311a258953119bb363aa9b7108eec8'};
 const actual={surveys:preferences.surveys,groups:preferences.instrument.groups,items:measures.surveys.map(({id,text,time,group,scale,allowNotApplicable,notApplicableLabel})=>({id,text,time,group,scale,allowNotApplicable,notApplicableLabel})),cases:measures.configurationCases,configurationRubric:measures.configurationRubric,understanding:measures.understanding,dimensions:preferences.dimensions};
 for(const key of Object.keys(expected))assert.equal(digest(actual[key]),expected[key],key+'与本次改动前契约一致');
 assert.equal(preferences.version,'learner-preferences-20261030-v7');
 assert.equal(preferences.instrument.version,'pilot-questionnaire-functions-r10-20261106');
 assert.equal(measures.version,'three-arm-measures-functions-r10-20261106');
 assert.match(preferences.instrument.instructions,/讲解、交互和应用例子/);
 assert.match(measures.scoringNotes.singleItems,/不作为内在动机总量表/);
});
surveyCheck('前后五项同措辞，问卷题量不增加，前端与测量清单逐项一致',()=>{
 assert.deepEqual(Object.fromEntries(Object.entries(preferences.surveys).map(([key,items])=>[key,items.length])),{baseline:5,final:16,configuration:3});
 assert.equal(measures.surveys.length,33);
 assert.deepEqual(measures.surveys.reduce((counts,item)=>{counts[item.time]=(counts[item.time]||0)+1;return counts;},{}),{'前测前':7,'即时后测后':19,'中段回顾后':2,'中段回顾后的决定':1,'三天后主要测验完成后':1,'一次合格可见的帮助或询问结束后':3});
 for(const [id,text] of preferences.surveys.baseline){assert.equal(preferences.surveys.final.find(item=>item[0]===id)[1],text);assert.equal(measures.surveys.find(item=>item.id==='baseline_'+id).text,text);assert.equal(measures.surveys.find(item=>item.id===id).text,text);}
 for(const [id,text] of preferences.surveys.final)assert.equal(measures.surveys.find(item=>item.id===id).text,text);
 for(const [id,text] of preferences.surveys.configuration)assert.equal(measures.surveys.find(item=>item.id==='configuration_'+id).text,text);
});
surveyCheck('成熟分量表四项齐备才计均分，不愿回答和不适用不补为零或中点',()=>{
 const groups=preferences.instrument.groups,complete=Object.fromEntries(Object.values(groups).flat().map(id=>[id,3])),scored=preferences.scoreSurvey(complete);
 assert.deepEqual(Object.keys(scored).sort(),['autonomySatisfaction','competenceSatisfaction']);
 for(const [group,ids] of Object.entries(groups)){
  assert.equal(ids.length,4);assert.equal(scored[group].mean,3);assert.equal(scored[group].total,4);assert.equal(scored[group].answered,4);
  for(const missing of [null,undefined,'na','skip',0,6,NaN]){
   const answers={...complete,[ids[0]]:missing},result=preferences.scoreSurvey(answers);
   assert.equal(result[group].mean,null);assert.equal(result[group].missingRule,'all_four_required_no_imputation');
   for(const other of Object.keys(groups).filter(key=>key!==group))assert.equal(result[other].mean,3);
  }
 }
 for(const score of Object.values(preferences.scoreSurvey({})))assert.equal(score.mean,null);
});
const out=path.resolve(__dirname,'../output/综合课程-r10-20261106');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'测量材料数学与契约检查.json'),JSON.stringify({passed:true,version:bank.version,checks,scope:'数学、题目结构和公开接口自查；不构成教师审题、心理测量效度或卷别经验等值'},null,2));
fs.writeFileSync(path.join(out,'问卷回归检查.json'),JSON.stringify({passed:true,version:preferences.instrument.version,checks:surveyChecks,unchangedQuestionCounts:{baseline:5,final:16,configuration:3,inventoryIncludingBackgroundAndEventItems:33},constructs:{validatedSourceSubscales:['自主需要满足四题','能力需要满足四题'],selfWrittenItems:'自我效能、兴趣、价值、脑力投入及体验条目保留原题；不增加总分'},scope:'本次只验证材料与现有计分契约；任务指导语适配仍需认知访谈及预试'},null,2));
