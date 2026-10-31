"use strict";
const crypto=require("node:crypto");
const contract=require("../app/shared/learner-preferences");
const measures=require('./assessments/three-arm-design-v1');
const VERSION="learner-design-feedback-20261031-v1";
const ARMS={A:{label:"固定配置",editable:false,linkedFeedback:false},B:{label:"自主配置与关联反馈",editable:true,linkedFeedback:true},C:{label:"自主配置",editable:true,linkedFeedback:false}};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const correctValue=r=>r.is_correct===null||r.is_correct===undefined||![0,1].includes(Number(r.is_correct))?null:Number(r.is_correct)===1;
function createStore({db,preferences,clock=Date.now}){
  let initialized=false;
  function sql(){const d=db.getDbSync();if(!initialized){d.run(`
    CREATE TABLE IF NOT EXISTS three_arm_runs(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,study_id TEXT NOT NULL,mode TEXT NOT NULL,arm TEXT NOT NULL,document TEXT NOT NULL,UNIQUE(owner_id,study_id,mode,arm));
    CREATE UNIQUE INDEX IF NOT EXISTS three_arm_formal_owner ON three_arm_runs(owner_id,study_id) WHERE mode='formal';
    CREATE TABLE IF NOT EXISTS three_arm_records(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,kind TEXT NOT NULL,slot TEXT NOT NULL,document TEXT NOT NULL,UNIQUE(run_id,kind,slot));
    CREATE TABLE IF NOT EXISTS three_arm_protocols(id TEXT PRIMARY KEY,document TEXT NOT NULL);
  `);initialized=true;}return d;}
  function rows(q,p=[]){const s=sql().prepare(q);try{s.bind(p);const out=[];while(s.step())out.push(s.getAsObject());return out;}finally{s.free();}}
  const now=()=>new Date(clock()).toISOString();
  const parse=r=>r?JSON.parse(r.document):null;
  function protocol(){
    let p=parse(rows('SELECT document FROM three_arm_protocols WHERE id=?',[VERSION])[0]);
    const editPolicy='same_initial_and_module_review_windows_B_C_v2';
    if(!p){const answers=contract.defaults();for(const a of Object.values(answers))a.reason='default';p={id:VERSION,createdAt:now(),baselineVersion:'common-six-dimensions-v1',answers,teacherReview:{status:'pending',reviewer:null,at:null},configurationContract:contract.version,assessmentVersion:'three-core-formative-v1',editPolicy,feedbackPolicy:'configuration-exposure-independent-performance-v1'};sql().run('INSERT INTO three_arm_protocols VALUES(?,?)',[VERSION,JSON.stringify(p)]);}
    else if(p.editPolicy!==editPolicy){p={...p,editPolicy,editPolicyHistory:[...(p.editPolicyHistory||[]),{previous:p.editPolicy,changedAt:now()}]};sql().run('UPDATE three_arm_protocols SET document=? WHERE id=?',[JSON.stringify(p),VERSION]);db.saveNow();}
    return p;
  }
  const get=user=>parse(rows('SELECT document FROM three_arm_runs WHERE id=?',[user])[0]);
  function save(run){sql().run('UPDATE three_arm_runs SET document=? WHERE id=?',[JSON.stringify(run),run.id]);db.saveNow();return run;}
  function resolve(owner,choice){
    if(!choice)return null;
    if(!Object.hasOwn(ARMS,choice)&&choice!=='assigned')fail('实验入口不存在',404);
    const mode=choice==='assigned'?'formal':'preview';
    const existing=parse(rows('SELECT document FROM three_arm_runs WHERE owner_id=? AND study_id=? AND mode=?'+(mode==='preview'?' AND arm=?':''),[owner.id,VERSION,mode,...(mode==='preview'?[choice]:[])])[0]);
    if(existing)return existing;
    if(mode==='formal')fail('请先阅读说明并确认参加本次研究',409);
    return create(owner,choice,'preview');
  }
  function create(owner,arm,mode){
    const p=protocol(),id='study_'+crypto.randomUUID();
    const run={id,ownerId:owner.id,studyId:VERSION,mode,arm,createdAt:now(),configuredAt:null,baselineAt:null,finalSurveyAt:null,reviewedModules:[],consentedAt:mode==='formal'?now():null,baselineVersion:p.baselineVersion,teacherReview:p.teacherReview,status:'active'};
    // Each run owns a distinct user foreign key throughout the existing data
    // model. It is not an authentication account and cannot be logged into.
    db.upsertUser(id,`实验记录·${mode==='preview'?'体验':'正式'}·${arm}·${id}`,run.createdAt,run.createdAt,{nicknameNorm:'internal:'+id,email:'',emailNorm:'',passwordHash:''});
    sql().run('INSERT INTO three_arm_runs VALUES(?,?,?,?,?,?)',[id,owner.id,VERSION,mode,arm,JSON.stringify(run)]);
    preferences.enterOrdinary(id);
    preferences.save(id,{answers:p.answers,expectedRevision:0,generation:db.currentLearningGeneration(id),experimental:true,selectionSource:'defaults_button',configurationWindow:{kind:'common_baseline',baselineVersion:p.baselineVersion}});
    db.saveNow();return run;
  }
  function enroll(owner,input){
    const old=parse(rows("SELECT document FROM three_arm_runs WHERE owner_id=? AND study_id=? AND mode='formal'",[owner.id,VERSION])[0]);if(old)return old;
    if(input.consent!==true)fail('请先确认自愿参加');
    const p=protocol();if(p.teacherReview.status!=='approved')fail('研究负责人尚未确认共同默认配置；三个体验入口已开放',409);
    // Concealed random blocks of six keep the three conditions balanced.
    const n=rows("SELECT id FROM three_arm_runs WHERE study_id=? AND mode='formal'",[VERSION]).length;
    const block=Math.floor(n/6),slot=String(block);
    let plan=parse(rows("SELECT document FROM three_arm_records WHERE run_id=? AND kind='allocation' AND slot=?",[VERSION,slot])[0]);
    if(!plan){const arms=['A','A','B','B','C','C'];for(let i=arms.length-1;i>0;i--){const j=crypto.randomInt(i+1);[arms[i],arms[j]]=[arms[j],arms[i]];}plan={arms,createdAt:now()};sql().run('INSERT INTO three_arm_records VALUES(?,?,?,?,?)',[crypto.randomUUID(),VERSION,'allocation',slot,JSON.stringify(plan)]);}
    return create(owner,plan.arms[n%6],'formal');
  }
  function confirm(user){const run=get(user);if(!run)fail('实验轮次不存在',404);save({...run,configuredAt:run.configuredAt||now(),pendingConfiguration:null});return get(user);}
  function editWindow(run,snapshot,blocked=false){
    if(!run)return null;
    if(run.arm==='A')return {allowed:false,kind:'fixed_configuration',message:'本组使用共同默认配置，六项设置保持固定。每次帮助仍可拒绝或结束。'};
    const unit=snapshot?.currentUnitId||'';
    const inQuiz=/-(pre|post|formative|retention|transfer)$/.test(unit)&&!(snapshot?.submittedQuizzes||[]).includes(unit);
    const scheduled=!run.configuredAt||Boolean(run.pendingConfiguration);
    return {allowed:scheduled&&!blocked&&!inQuiz,kind:!run.configuredAt?'initial_configuration':run.pendingConfiguration?'module_review_configuration':'outside_configuration_window',module:run.pendingConfiguration?.module||null,message:blocked||inQuiz?'完成当前独立作答后，再返回设置。':scheduled?'这是本次配置窗口。保存后，设置将用于下一阶段学习。':'本阶段设置已固定。完成本部分三个知识点并进入学习回顾后，可以选择调整。'};
  }
  function publicRun(run){if(!run)return null;const {ownerId,...p}=run;return {...p,...ARMS[run.arm],instrumentVersion:VERSION};}
  function readRecord(user,kind,slot='once'){return parse(rows('SELECT document FROM three_arm_records WHERE run_id=? AND kind=? AND slot=?',[user,kind,slot])[0]);}
  function record(user,kind,slot,data){const old=parse(rows('SELECT document FROM three_arm_records WHERE run_id=? AND kind=? AND slot=?',[user,kind,slot])[0]);if(old)return old;const document={at:now(),...data};sql().run('INSERT INTO three_arm_records VALUES(?,?,?,?,?)',[crypto.randomUUID(),user,kind,slot,JSON.stringify(document)]);db.saveNow();return document;}
  function supportHistory(user,cycles){
    const safeJson=x=>{try{return JSON.parse(x||'{}');}catch{return {};}};
    if(!rows("SELECT name FROM sqlite_master WHERE type='table' AND name='proactive_interventions'").length)return cycles;
    const linked=new Set(cycles.map(c=>c.inquiry?.decisionId).filter(Boolean));
    const receipts=new Map(rows('SELECT payload,created_at FROM events WHERE user_id=?',[user]).map(r=>({p:safeJson(r.payload),at:r.created_at})).filter(({p})=>p.eventType==='proactive_surface_visible'&&p.data?.qualifiedVisible===true).map(({p,at})=>[p.data.decisionId,at]));
    const direct=rows('SELECT i.*,d.scope_key,d.scene_type,d.evidence_snapshot_json FROM proactive_interventions i JOIN proactive_decisions d ON d.id=i.decision_id WHERE i.user_id=? ORDER BY i.created_at DESC',[user]).filter(r=>!linked.has(r.decision_id));
    return [...cycles,...direct.map(r=>{const seen=safeJson(r.followup_outcome_json).shownExposure?.qualifiedVisible===true?r.shown_at:receipts.get(r.decision_id);return {id:r.id,scope:r.scope_key,sceneType:r.scene_type||'slide',profileRevision:safeJson(r.evidence_snapshot_json).engineeringControl?.revision||0,createdAt:r.created_at,status:['offered','shown'].includes(r.status)?'offered':'closed',content:{},exposure:seen?{at:seen}:null,confirmedAt:r.resolution==='accepted'?r.resolved_at:null,source:'direct_policy_support'};})].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  }
  function review(user,cycles=[]){
    cycles=supportHistory(user,cycles);
    const run=get(user);if(!run)fail('实验轮次不存在',404);
    const results=db.getQuizResultsByUser(user).filter(r=>['formative','post'].includes(r.phase));
    const scored=results.filter(r=>correctValue(r)!==null);
    const pendingModule=['GH-01','GH-02'].find(m=>!(run.reviewedModules||[]).includes(m)&&[1,2,3].every(n=>results.filter(r=>r.unit_id===`${m}-K0${n}-formative`).length>=3))||null;
    const base={run:publicRun(run),pendingModule,results:results.map(r=>({id:r.id,unitId:r.unit_id,questionId:r.question_id,phase:r.phase,correct:correctValue(r),at:r.created_at})),ordinary:{answered:results.length,scored:scored.length,correct:scored.filter(r=>correctValue(r)).length},linked:null};
    if(run.arm!=='B')return base;
    const history=rows('SELECT document FROM learner_preference_history WHERE user_id=? ORDER BY rowid',[user]).map(parse);
    base.linked=history.map((config,i)=>{
      const end=history[i+1]?.at||now();
      const relevant=cycles.filter(c=>c.profileRevision===config.revision);
      const visible=relevant.filter(c=>c.exposure?.at);
      const after=results.filter(r=>visible.some(c=>r.unit_id===c.scope+'-formative'&&Date.parse(r.created_at)>=Date.parse(c.exposure.at))&&Date.parse(r.created_at)<Date.parse(end));
      return {revision:config.revision,at:config.at,until:history[i+1]?.at||null,answers:config.answers,behavior:contract.behaviorSummary(config.answers),offered:relevant.filter(c=>c.inquiry||c.content).length,visible:visible.length,accepted:relevant.filter(c=>c.confirmedAt||c.status==='engaged').length,
        cycleIds:relevant.map(c=>c.id),experiences:relevant.map(c=>({id:c.id,scope:c.scope,sceneType:c.sceneType,at:c.exposure?.at||c.inquiry?.exposure?.at||c.createdAt,seen:Boolean(c.exposure?.at),status:c.status})),independentResults:after.map(r=>({id:r.id,unitId:r.unit_id,questionId:r.question_id,correct:correctValue(r),at:r.created_at})),interpretation:visible.length?'可结合这段经历判断是否保留设置，下一次独立检测再看看变化。':'尚没有实际看到帮助后的独立作答，先保留为未观察到。'};
    });return base;
  }
  function probe(user,cycles=[]){
    if(!get(user))return null;
    const prior=parse(rows("SELECT document FROM three_arm_records WHERE run_id=? AND kind='experience_probe' AND slot='once'",[user])[0]);
    if(prior)return null;
    cycles=supportHistory(user,cycles);
    const c=[...cycles].reverse().find(c=>(c.exposure?.at||c.inquiry?.exposure?.at)&&['closed','expired'].includes(c.status));
    return c?{id:c.id,at:c.exposure?.at||c.inquiry.exposure.at,scope:c.scope,sceneType:c.sceneType,kind:c.exposure?'帮助内容':'帮助询问'}:null;
  }
  function answerProbe(user,input,cycles){const p=probe(user,cycles);if(!p||p.id!==input.id)fail('这次体验反馈已结束',409);for(const k of ['usefulness','timing','disruption'])if(input[k]!=null&&(!Number.isInteger(input[k])||input[k]<1||input[k]>5))fail('请选择1–5，或跳过');return record(user,'experience_probe','once',{event:p,skipped:input.skipped===true,usefulness:input.usefulness??null,timing:input.timing??null,disruption:input.disruption??null,note:String(input.note||'').slice(0,600),instrumentStatus:'study_specific_pilot_items'});}
  function claimProbe(user,input,cycles){const p=probe(user,cycles);if(!p||p.id!==input.id)return {claimed:false};if(rows("SELECT id FROM three_arm_records WHERE run_id=? AND kind='probe_display' AND slot='once'",[user]).length)return {claimed:false};record(user,'probe_display','once',{event:p,receipt:'server_claim_before_display_not_exposure'});return {claimed:true,probe:p};}
  function surveyItems(user,stage){const run=get(user);if(!run)fail('实验轮次不存在',404);if(!['baseline','final'].includes(stage))fail('问卷阶段不存在');return measures.surveys.filter(q=>q.time===(stage==='baseline'?'前测前':'即时后测后')&&q.group.split(' ').includes(run.arm));}
  function submitSurvey(user,stage,input){const run=get(user),items=surveyItems(user,stage);if(stage==='final'&&!db.getQuizResultsByUser(user).some(r=>r.phase==='post'))fail('请先完成后测',409);const answers={};for(const q of items){const v=input.answers?.[q.id];const max=q.id==='ai_experience'?4:q.id==='topic_experience'?3:5;if(v!==null&&(!Number.isInteger(v)||v<1||v>max))fail('请逐项作答，或明确选择不愿回答');answers[q.id]=v;}const old=readRecord(user,'survey',stage);if(old)return old;
    const result=record(user,'survey',stage,{instrumentVersion:measures.version,answers,subscales:stage==='final'?contract.scoreSurvey(answers):null,sourceStatus:items.map(q=>({id:q.id,status:q.status,source:q.source})),note:String(input.note||'').slice(0,1000)});save({...run,[stage==='baseline'?'baselineAt':'finalSurveyAt']:result.at});return result;
  }
  function completeReview(user,input,cycles){
    const data=review(user,cycles);if(!data.pendingModule)return publicRun(get(user));
    if(input.module!==data.pendingModule)fail('回顾阶段已更新，请重新读取',409);
    if(data.run.editable&&!['keep','change'].includes(input.decision))fail('请选择保持或调整设置');
    const answers={};for(const k of ['review_understanding','review_action']){const v=input[k];if(v!==null&&(!Number.isInteger(v)||v<1||v>5))fail('请回答两道体验题或选择不愿回答');answers[k]=v;}
    record(user,'review',input.module,{snapshot:data,answers,decision:data.run.editable?input.decision:'fixed',reason:data.run.editable?String(input.reason||'').slice(0,1000):null,instrumentStatus:'study_specific_pilot_items'});
    const run=get(user);return publicRun(save({...run,reviewedModules:[...new Set([...(run.reviewedModules||[]),input.module])],pendingConfiguration:data.run.editable&&input.decision==='change'?{module:input.module,openedAt:now()}:null}));
  }
  function judgmentState(user){const run=get(user);if(!run)fail('实验轮次不存在',404);const attempt=readRecord(user,'configuration_judgment');const post=db.getQuizResultsByUser(user).filter(r=>r.phase==='post').map(r=>r.created_at).sort().at(-1);const unlockAt=post?new Date(Date.parse(post)+72*3600000).toISOString():null;const stages=rows("SELECT stage FROM proactive_outcome_attempts WHERE user_id=?",[user]).map(r=>r.stage);const eligible=Boolean(post&&clock()>=Date.parse(unlockAt)&&stages.includes('retention')&&stages.includes('transfer'));return {status:attempt?'submitted':run.activeJudgment?'active':eligible?'available':'locked',unlockAt,reason:'后测满72小时，并完成独立保持与迁移测量后开放。',draft:run.activeJudgment?.draft||{},revision:run.activeJudgment?.revision||0,items:eligible||run.activeJudgment?measures.configurationCases.map(({guide,...item})=>item):[],submittedAt:attempt?.at||null};}
  function judgment(user,input){const run=get(user),state=judgmentState(user);if(input.action==='start'){if(state.status==='active')return state;if(state.status!=='available')fail(state.reason,409);save({...run,activeJudgment:{startedAt:now(),draft:{},revision:0}});return judgmentState(user);}if(state.status!=='active')fail('请先开始配置判断任务',409);if(input.revision!==state.revision)fail('作答已在另一页面更新，请重新读取',409);
    const answers={};for(const q of measures.configurationCases){const value=input.answers?.[q.id];if(value!==undefined&&typeof value!=='string')fail('回答格式无效');answers[q.id]=String(value??run.activeJudgment.draft[q.id]??'').slice(0,3000);}
    if(input.action==='draft'){save({...run,activeJudgment:{...run.activeJudgment,draft:answers,revision:state.revision+1}});return judgmentState(user);}
    if(input.action==='submit'){if(Object.values(answers).some(v=>!v.trim()))fail('请逐题回答，或填写“暂时无法判断”');record(user,'configuration_judgment','once',{instrumentVersion:measures.version,startedAt:run.activeJudgment.startedAt,answers,status:'pending_manual_rating',maxScore:36,score:null,outsidePractice:String(input.outsidePractice||'').slice(0,1000)});save({...run,activeJudgment:null});return judgmentState(user);}fail('任务操作无效');
  }
  function rateJudgment(input){const attempt=readRecord(input.runId,'configuration_judgment');if(!attempt)fail('作答记录不存在',404);if(!String(input.rater||'').trim())fail('请填写评分人编号');const scores={};for(const q of measures.configurationCases){const s=input.scores?.[q.id];if(!Array.isArray(s)||s.length!==3||s.some(n=>!Number.isInteger(n)||n<0||n>2))fail('每题三个评分点均须为0、1或2');scores[q.id]=s;}const rater=String(input.rater).slice(0,100);return record(input.runId,'judgment_rating',rater,{scores,total:Object.values(scores).flat().reduce((a,b)=>a+b,0),maxScore:36,rater,comment:String(input.comment||'').slice(0,2000),rubricVersion:measures.version});}
  function ratingCases(){return {instrument:measures,attempts:rows("SELECT run_id,document FROM three_arm_records WHERE kind='configuration_judgment'").map(r=>({runId:r.run_id,...parse(r),ratings:rows("SELECT document FROM three_arm_records WHERE run_id=? AND kind='judgment_rating'",[r.run_id]).map(parse)}))};}
  function approveBaseline(input){const p=protocol();if(!String(input.reviewer||'').trim()||input.confirmed!==true)fail('请填写配置审阅人并确认');if(rows("SELECT id FROM three_arm_runs WHERE mode='formal' AND study_id=?",[VERSION]).length)fail('已有正式参与者，不能修改本轮默认配置',409);const next={...p,teacherReview:{status:'approved',reviewer:String(input.reviewer).slice(0,100),at:now(),note:String(input.note||'').slice(0,600)}};sql().run('UPDATE three_arm_protocols SET document=? WHERE id=?',[JSON.stringify(next),VERSION]);db.saveNow();return next;}
  function exportData(){
    const runs=rows('SELECT document FROM three_arm_runs WHERE study_id=?',[VERSION]).map(parse),ids=runs.map(r=>r.id),tables={};
    const existing=new Set(rows("SELECT name FROM sqlite_master WHERE type='table'").map(r=>r.name));
    for(const name of ['quiz_results','events','snapshots','learning_notes','learning_assistant_messages','learning_assistant_conversations','learner_preferences','learner_preference_history','learner_support_cycles','interaction_evidence_snapshots','experiment_assignments','proactive_participation','proactive_decisions','proactive_interventions','proactive_policy_state','proactive_outcome_sessions','proactive_outcome_attempts']){
      if(existing.has(name))tables[name]=ids.length?rows(`SELECT * FROM ${name} WHERE user_id IN (${ids.map(()=>'?').join(',')})`,ids):[];
    }
    return {version:VERSION,protocol:protocol(),instruments:measures,runs,records:rows("SELECT run_id,kind,slot,document FROM three_arm_records WHERE kind!='allocation'").map(r=>({...r,document:parse(r)})),tables,joinKey:'run.id = all learning tables user_id; preview excluded from formal analysis'};
  }
  return {get,resolve,enroll,confirm,editWindow,publicRun,record,readRecord,review,completeReview,probe,answerProbe,claimProbe,surveyItems,submitSurvey,judgmentState,judgment,rateJudgment,ratingCases,protects:user=>Boolean(get(user)?.activeJudgment),protocol,approveBaseline,exportData};
}
module.exports={createStore,VERSION,ARMS};
