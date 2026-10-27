"use strict";

// Formative measurement is separate from assistance and from formal outcomes.
// Immutable opportunity snapshots retain the sampling frame, including silence.
const crypto = require("node:crypto");
const VERSION = "pilot-measurement-v1";
const LEARNER_DESIGN = "learner-configurable-20-v1";
const REHEARSAL_POLICY = 'full-proactive-rehearsal-20261027-v1';
const preferenceContract = require('../app/shared/learner-preferences');
const points = Object.keys(require("./support-goals").CURRICULUM);
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const tokenHash = value => hash(String(value || ""));
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (v, max = 1200) => typeof v === "string" ? v.trim().slice(0, max) : "";
const defaults = Object.freeze({ intervalSeconds:60, silentProbability:.35, triggeredProbability:1,
  minGapSeconds:90, maxProbes:8, maxPerStratum:4, expiresSeconds:90 });
const consentDefaults = "本预试检查学习帮助是否合适。系统会记录学习操作、作答、支持及问卷回答，并在部分学习时刻邀请你回答简短问题。参加自愿，可以跳过问题或退出，不影响正常学习与课程成绩。系统不会根据操作少就判断你不想学。";
function sampling(value = {}) {
  const p = { ...defaults, ...value };
  for (const key of Object.keys(p)) if (!Object.hasOwn(defaults,key)) fail("包含未支持的抽样参数");
  for (const [key,min,max] of [["intervalSeconds",30,300],["silentProbability",.01,1],["triggeredProbability",.01,1],
    ["minGapSeconds",30,900],["maxProbes",1,12],["maxPerStratum",1,8],["expiresSeconds",30,180]]) {
    if (!Number.isFinite(p[key]) || p[key]<min || p[key]>max || (!key.endsWith("Probability") && !Number.isInteger(p[key]))) fail("抽样参数超出范围："+key);
  }
  return p;
}
function createStore({ db, clock = Date.now, random = () => crypto.randomInt(0, 2**32) / 2**32, implementation = {} }) {
  let initialized = false;
  function sql() {
    const d=db.getDbSync();
    if(!initialized) {
      d.run(`CREATE TABLE IF NOT EXISTS pilot_versions(id TEXT PRIMARY KEY, project TEXT NOT NULL, seq INTEGER NOT NULL, join_hash TEXT UNIQUE NOT NULL, document TEXT NOT NULL, UNIQUE(project,seq));
        CREATE TABLE IF NOT EXISTS pilot_enrollments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,generation INTEGER NOT NULL,version_id TEXT NOT NULL,status TEXT NOT NULL,document TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS pilot_enrollment_user ON pilot_enrollments(user_id);
        CREATE TABLE IF NOT EXISTS pilot_opportunities(id TEXT PRIMARY KEY,enrollment_id TEXT NOT NULL,slot TEXT NOT NULL,status TEXT NOT NULL,document TEXT NOT NULL,UNIQUE(enrollment_id,slot));
        CREATE TABLE IF NOT EXISTS pilot_answers(opportunity_id TEXT PRIMARY KEY,document TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS pilot_events(id TEXT PRIMARY KEY,enrollment_id TEXT NOT NULL,at TEXT NOT NULL,document TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS pilot_raters(id TEXT PRIMARY KEY,project TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,document TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS pilot_annotations(id TEXT PRIMARY KEY,opportunity_id TEXT NOT NULL,rater_id TEXT NOT NULL,revision INTEGER NOT NULL,document TEXT NOT NULL,UNIQUE(opportunity_id,rater_id,revision));`);
      d.run('CREATE TABLE IF NOT EXISTS pilot_allocations(version_id TEXT PRIMARY KEY,document TEXT NOT NULL)');
      initialized=true;
    }
    return d;
  }
  function rows(q,p=[]) {const s=sql().prepare(q);try{s.bind(p);const out=[];while(s.step())out.push(s.getAsObject());return out;}finally{s.free();}}
  const parse = row => row ? JSON.parse(row.document) : null;
  const now = () => new Date(clock()).toISOString();
  function event(enrollment,type,detail={}) {
    const record={id:crypto.randomUUID(),enrollmentId:enrollment,at:now(),type,...detail};
    sql().run("INSERT INTO pilot_events VALUES(?,?,?,?)",[record.id,enrollment,record.at,JSON.stringify(record)]);
  }
  const version = id => parse(rows("SELECT * FROM pilot_versions WHERE id=?",[id])[0]);
  // An explicit experience override, separate from the immutable consent/version
  // and original assignment. Reading an old rehearsal must not rewrite its rows.
  function experience(e) {
    if(!e || e.studyDesign!==LEARNER_DESIGN || version(e.versionId)?.useMode!=='internal_rehearsal')return e;
    e.useMode='internal_rehearsal';
    if(e.status!=='active')return e;
    if(!e.experiencePolicy)e.originalAssignment={arm:e.arm,stage:e.stage,allocatedAt:e.allocatedAt||null};
    e.experiencePolicy=REHEARSAL_POLICY;
    if(e.arm==='control')e.arm='configurable';
    if(e.stage==='ready'&&!e.configuration)e.stage='configuration';
    return e;
  }
  const enrollment = user => experience(parse(rows("SELECT * FROM pilot_enrollments WHERE user_id=? ORDER BY rowid DESC LIMIT 1",[user])[0]));
  const assignedArm = (e,plan) => version(e.versionId).useMode==='internal_rehearsal'?'configurable':plan.schedule[e.allocationIndex];
  function enrolled(user,generation) {const e=enrollment(user);return e&&e.status==="active"&&e.generation===generation?e:null;}
  function createVersion(input) {
    const project=text(input.project,80);
    if(!/^[a-zA-Z0-9_-]{3,80}$/.test(project))fail("项目编号须为3–80位字母、数字、下划线或短横线");
    for(const field of ["title","reason","responsible","contact","reviewReference","retention","withdrawal"])
      if(!text(input[field]))fail("请填写："+({title:"预试名称",reason:"版本建立或修改原因",responsible:"负责人",contact:"联系方式",reviewReference:"研究审核依据",retention:"数据保存期限与范围",withdrawal:"退出与数据处理方式"}[field]));
    const previous=rows("SELECT * FROM pilot_versions WHERE project=? ORDER BY seq DESC LIMIT 1",[project])[0];
    if((input.previousVersionId||null)!==(previous?.id||null))fail("版本已更新，请读取最新版本后再建立修订版",409);
    const doc={id:crypto.randomUUID(),project,sequence:(previous?.seq||0)+1,previousVersionId:previous?.id||null,
      createdAt:now(),instrumentVersion:VERSION,annotationCodebookVersion:"teacher-case-v1",title:text(input.title),reason:text(input.reason),responsible:text(input.responsible),
      contact:text(input.contact),reviewReference:text(input.reviewReference),retention:text(input.retention),withdrawal:text(input.withdrawal),
      consentText:text(input.consentText,6000)||(consentDefaults+(input.design===LEARNER_DESIGN?' 本轮最多20人，随机分配为两种学习方式，各10人：一组没有主动帮助，另一组可设置六项帮助偏好并说明选择理由。两组均可主动向知点提问，使用相同课程与测验。部分测量条目为研究自编，仅用于预试。':'')),sampling:sampling(input.sampling),implementation,
      scope:points,studyType:input.design===LEARNER_DESIGN?LEARNER_DESIGN:"formative_not_randomized_effectiveness_trial"};
    if(input.design&&input.design!==LEARNER_DESIGN)fail('预试设计版本无效');
    if(doc.studyType===LEARNER_DESIGN){doc.capacity=20;doc.learningFlowVersion='pretest-first-v2';doc.useMode=input.useMode==='rehearsal'?'internal_rehearsal':'human_pilot';doc.allocationMethod='concealed_random_permutation_10_control_10_configurable';doc.questionnaireVersion=preferenceContract.version;doc.measurementPurpose='feasibility_not_confirmatory_effectiveness';doc.configurationContract=preferenceContract;doc.sampling={...doc.sampling,triggeredProbability:1};}
    if(doc.studyType===LEARNER_DESIGN){doc.followup={minimumDelayHours:72,exportWindowAfterFinishHours:168,scope:'same_generation_independent_outcomes_only'};doc.consentText+=' 主流程结束后，可按研究安排在后测至少72小时后返回完成独立保持与迁移测量，以页面开放时间为准。本版本在主流程结束后7天内纳入这类测量作答；其他后续学习不自动纳入。未参加不会被记为答错。';}
    if(doc.studyType===LEARNER_DESIGN){doc.journeyVersion='guided-journey-20261026-v3';doc.allowPretestReuse=true;doc.configurationPolicy=preferenceContract.configurationPolicy;}
    if(doc.useMode==='internal_rehearsal'){
      doc.allocationMethod='all_configurable_internal_rehearsal';doc.experiencePolicy=REHEARSAL_POLICY;
      if(!text(input.consentText))doc.consentText=consentDefaults+' 这是内部功能演练，所有加入者均可设置六项帮助偏好，使用完整主动支持功能，不随机分组。助手根据学习过程询问或提示，你可以拒绝或暂停。演练记录不能作为正式实验的组间比较数据。';
    }
    doc.hash=hash(doc);
    const joinCode=crypto.randomBytes(12).toString("hex");
    sql().run("INSERT INTO pilot_versions VALUES(?,?,?,?,?)",[doc.id,project,doc.sequence,tokenHash(joinCode),JSON.stringify(doc)]);
    if(doc.studyType===LEARNER_DESIGN){const schedule=doc.useMode==='internal_rehearsal'?Array(20).fill('configurable'):[...Array(10).fill('control'),...Array(10).fill('configurable')];for(let i=schedule.length-1;i>0;i--){const j=crypto.randomInt(i+1);[schedule[i],schedule[j]]=[schedule[j],schedule[i]];}sql().run('INSERT INTO pilot_allocations VALUES(?,?)',[doc.id,JSON.stringify({schedule,method:doc.allocationMethod})]);}
    event("", "protocol_created", {versionId:doc.id,hash:doc.hash,reason:doc.reason});db.saveNow();
    return {version:doc,joinCode};
  }
  function preview(code) {const v=parse(rows("SELECT * FROM pilot_versions WHERE join_hash=?",[tokenHash(code)])[0]);if(!v)fail("预试加入码无效",404);return v;}
  function start(user,generation,input,runtime) {
    const v=preview(input.joinCode);
    if(input.consent!==true||input.versionHash!==v.hash)fail("请阅读并确认当前版本的知情同意说明");
    const old=enrollment(user);if(old?.status==="active") {if(old.versionId!==v.id||old.generation!==generation)fail("已有进行中的预试，请先退出或完成",409);return state(user,generation);}
    if(rows("SELECT id FROM pilot_enrollments WHERE user_id=? AND version_id=?",[user,v.id]).length)fail("本版本已参加或退出；再次预试需建立新版本，保留原记录",409);
    const count=rows('SELECT id FROM pilot_enrollments WHERE version_id=?',[v.id]).length;
    if(v.studyType===LEARNER_DESIGN&&count>=20)fail('本轮20个名额已使用；退出者保留原分配，不自动补位',409);
    const e={id:crypto.randomUUID(),participantCode:"P-"+crypto.randomBytes(5).toString("hex"),versionId:v.id,project:v.project,
      generation,status:"active",consentAt:now(),versionHash:v.hash,consentVersion:VERSION,baselineRuntime:runtime};
    if(v.studyType===LEARNER_DESIGN){Object.assign(e,{studyDesign:LEARNER_DESIGN,learningFlowVersion:v.learningFlowVersion||'legacy-v1',stage:'baseline',allocationIndex:count,arm:null,configuration:null,baselineSurvey:null});}
    sql().run("INSERT INTO pilot_enrollments VALUES(?,?,?,?,?,?)",[e.id,user,generation,v.id,e.status,JSON.stringify(e)]);
    event(e.id,"consented",{versionId:v.id,versionHash:v.hash,runtime});db.saveNow();return state(user,generation);
  }
  function opportunities(e) {return rows("SELECT * FROM pilot_opportunities WHERE enrollment_id=? ORDER BY rowid",[e.id]).map(r=>({...parse(r),status:r.status}));}
  function closePending(e,reason) {for(const o of opportunities(e).filter(o=>o.status==="pending")) {sql().run("UPDATE pilot_opportunities SET status=? WHERE id=?",[reason,o.id]);event(e.id,reason,{opportunityId:o.id});}}
  function pending(e) {
    let dirty=false;
    for(const o of opportunities(e).filter(o=>o.status==="pending")) if(Date.parse(o.expiresAt)<=clock()) {sql().run("UPDATE pilot_opportunities SET status='expired' WHERE id=?",[o.id]);event(e.id,"probe_expired",{opportunityId:o.id,missingNotNegative:true});dirty=true;}
    if(dirty)db.saveNow();return opportunities(e).find(o=>o.status==="pending")||null;
  }
  function state(user,generation) {
    const e=enrollment(user);if(!e)return {enrollment:null};
    const active=enrolled(user,generation),p=active?pending(active):null,v=version(e.versionId);
    return {enrollment:e,version:v,generationMismatch:e.generation!==generation,
      pending:p?{id:p.id,scope:p.scope,at:p.at,expiresAt:p.expiresAt}:null,
      completedProbes:opportunities(e).filter(o=>o.sampled).length};
  }
  function observe(user,generation,input) {
    const e=enrolled(user,generation);if(!e)return null;
    if(e.studyDesign===LEARNER_DESIGN&&e.stage!=='ready')return null;
    // Equal periodic sampling opportunities for both arms. Candidate-triggered
    // probes would add a measurement treatment only to the proactive arm.
    if(e.studyDesign===LEARNER_DESIGN&&input.source==='candidate')return null;
    const v=version(e.versionId),cfg=v.sampling,existing=pending(e),all=opportunities(e);
    const slot=input.source==="candidate"?"candidate:"+Math.floor(clock()/(cfg.intervalSeconds*1000)):"window:"+Math.floor(clock()/(cfg.intervalSeconds*1000));
    const duplicate=rows("SELECT * FROM pilot_opportunities WHERE enrollment_id=? AND slot=?",[e.id,slot])[0];
    if(duplicate)return {...parse(duplicate),status:duplicate.status};
    const stratum=input.source==="candidate"?"triggered":"silent";
    const reasons=[...(input.blockers||[])];
    if(!points.includes(input.scope))reasons.push("outside_curriculum");
    if(existing)reasons.push("probe_pending");
    const sampled=all.filter(o=>o.sampled),last=sampled.at(-1);
    if(sampled.length>=cfg.maxProbes)reasons.push("total_budget");
    if(sampled.filter(o=>o.stratum===stratum).length>=cfg.maxPerStratum)reasons.push("stratum_budget");
    if(last&&clock()-Date.parse(last.at)<cfg.minGapSeconds*1000)reasons.push("probe_cooldown");
    const probability=reasons.length?0:cfg[stratum==="triggered"?"triggeredProbability":"silentProbability"];
    const draw=probability>0?random():null,selected=draw!==null&&draw<probability;
    const o={id:crypto.randomUUID(),enrollmentId:e.id,versionId:v.id,protocolHash:v.hash,scope:input.scope,slot,
      at:now(),stratum,frameVersion:"candidate-or-periodic-window-v1",eligible:reasons.length===0,blockers:reasons,
      probability,draw,drawMethod:"crypto-uniform-32bit",sampled:selected,expiresAt:new Date(clock()+cfg.expiresSeconds*1000).toISOString(),
      runtime:input.runtime,runtimeHash:hash(input.runtime),evidence:input.evidence,decision:input.decision||null,
      teacherFacts:input.teacherFacts||{},priorSupport:input.priorSupport||null,
      labelBoundary:"silent means no current offered help; absent policy score remains missing, not zero"};
    sql().run("INSERT INTO pilot_opportunities VALUES(?,?,?,?,?)",[o.id,e.id,slot,selected?"pending":"not_sampled",JSON.stringify(o)]);
    if(selected)event(e.id,"probe_selected",{opportunityId:o.id,probability,stratum});db.saveNow();return {...o,status:selected?"pending":"not_sampled"};
  }
  function activeProbe(user,generation) {const e=enrolled(user,generation);return e?pending(e):null;}
  function respond(user,generation,input) {
    const e=enrolled(user,generation);if(!e)fail("没有进行中的预试",409);
    const o=opportunities(e).find(o=>o.id===input.id);if(!o)fail("记录不存在",404);
    const prior=parse(rows("SELECT * FROM pilot_answers WHERE opportunity_id=?",[o.id])[0]);if(prior)return state(user,generation);
    if(pending(e)?.id!==o.id)fail("此时点已结束；不会把迟到的回答当作即时反馈",409);
    const skipped=input.action==="skip",response={at:now(),instrumentVersion:VERSION,skipped};
    if(!skipped) {
      if(!["yes","no","uncertain","decline"].includes(input.need))fail("请选择需要、不需要、不确定或不愿回答");
      for(const k of ["timing","disruption"])if(input[k]!==null&&(!Number.isInteger(input[k])||input[k]<1||input[k]>5))fail("时机与打扰须为1–5或无法判断");
      if(!["","none","bad_time","try_myself","mismatch","decline","other"].includes(input.reason||""))fail("原因选项无效");
      Object.assign(response,{need:input.need,timing:input.timing,disruption:input.disruption,reason:input.reason||"",note:text(input.note),selfReportNotGroundTruth:true});
    }
    sql().run("INSERT INTO pilot_answers VALUES(?,?)",[o.id,JSON.stringify(response)]);
    sql().run("UPDATE pilot_opportunities SET status=? WHERE id=?",[skipped?"skipped":"answered",o.id]);
    event(e.id,skipped?"probe_skipped":"probe_answered",{opportunityId:o.id});db.saveNow();return state(user,generation);
  }
  function action(user,generation,input) {
    if(["answer","skip"].includes(input.action))return respond(user,generation,input);
    const e=input.action==="withdraw"?enrollment(user):enrolled(user,generation);if(!e||(e.status!=="active"&&!(input.action==='withdraw'&&e.status==='finished'&&e.followupEndsAt)))fail("没有进行中的预试",409);
    if(input.action==='baseline'){
      if(e.studyDesign!==LEARNER_DESIGN)fail('当前版本没有学习前问卷');
      if(e.stage!=='baseline')return state(user,generation);
      e.baselineSurvey=validateSurvey(input.survey,'baseline',e);
      if(e.learningFlowVersion==='pretest-first-v2'){e.stage='pretest';saveEnrollment(e);event(e.id,'baseline_saved',{survey:e.baselineSurvey,afterReusedPretest:Boolean(e.reusedPretest)});if(e.reusedPretest)recordPretest(user,generation,e.reusedPretest.resultIds);db.saveNow();return state(user,generation);}
      const plan=JSON.parse(rows('SELECT document FROM pilot_allocations WHERE version_id=?',[e.versionId])[0].document);
      e.arm=assignedArm(e,plan);e.allocatedAt=now();e.stage=e.arm==='control'?'ready':'configuration';
      saveEnrollment(e);event(e.id,'baseline_and_allocation',{survey:e.baselineSurvey,arm:e.arm,allocationIndex:e.allocationIndex});db.saveNow();return state(user,generation);
    }
    if(input.action==="shown") {
      const p=pending(e);if(!p||p.id!==input.id)fail("时点已结束",409);
      const exists=rows("SELECT document FROM pilot_events WHERE enrollment_id=?",[e.id]).map(parse).some(x=>x.type==="probe_shown"&&x.opportunityId===p.id);
      if(!exists)event(e.id,"probe_shown",{opportunityId:p.id,source:"client_visible_receipt",notAttentionProof:true});
    } else if(input.action==="context_changed")closePending(e,"context_changed");
    else if(["withdraw","finish"].includes(input.action)) {
      const survey={};
      if(input.action==="finish") {
        if(e.studyDesign===LEARNER_DESIGN){if(e.stage!=='ready')fail('请先完成学习前准备');Object.assign(survey,validateSurvey(input.survey,'final',e));if(e.arm==='configurable')survey.configuration=validateSurvey(input.configuration,'configuration',e);survey.instrumentStatus=version(e.versionId).configurationContract?.instrument?.status||'study_specific_pilot_items_not_validated_scale';if(e.learningFlowVersion==='pretest-first-v2')survey.subscales=preferenceContract.scoreSurvey(survey);}
        else for(const k of ["burden","control","usefulness","appropriateness"]) {const x=input[k];if(x!==null&&(!Number.isInteger(x)||x<1||x>5))fail("结束问卷须为1–5或不愿回答");survey[k]=x;}
        survey.note=text(input.note);survey.instrumentVersion=e.studyDesign===LEARNER_DESIGN?version(e.versionId).questionnaireVersion:VERSION;
      }
      closePending(e,input.action==="withdraw"?"withdrawn":"session_finished");e.status=input.action==="withdraw"?"withdrawn":"finished";e.endedAt=now();e.finalSurvey=survey;e.dataRequest=text(input.dataRequest,500);
      if(e.status==='finished'&&version(e.versionId).followup)e.followupEndsAt=new Date(Date.parse(e.endedAt)+version(e.versionId).followup.exportWindowAfterFinishHours*3600000).toISOString();
      sql().run("UPDATE pilot_enrollments SET status=?,document=? WHERE id=?",[e.status,JSON.stringify(e),e.id]);
      event(e.id,e.status,{dataRequest:e.dataRequest,survey,requiresResearcherDataHandling:e.status==="withdrawn"});
    } else fail("预试操作无效");
    db.saveNow();return state(user,generation);
  }
  function validateSurvey(input,kind,e){if(!input||typeof input!=='object'||Array.isArray(input))fail('请逐项作答或选择不愿回答');const contract=e?version(e.versionId).configurationContract:preferenceContract;return Object.fromEntries((contract||preferenceContract).surveys[kind].map(([k])=>{const value=input[k];if(value!==null&&(!Number.isInteger(value)||value<1||value>5))fail('问卷回答须为1–5或明确选择不愿回答');return [k,value];}));}
  function recordPretest(user,generation,resultIds){
    const e=enrolled(user,generation);if(!e||e.learningFlowVersion!=='pretest-first-v2'||e.stage!=='pretest')return;
    if(!Array.isArray(resultIds)||!resultIds.length)fail('缺少服务端前测记录');
    const plan=JSON.parse(rows('SELECT document FROM pilot_allocations WHERE version_id=?',[e.versionId])[0].document);
    e.pretest={completedAt:e.reusedPretest?.completedAt||now(),resultIds,reused:Boolean(e.reusedPretest)};e.arm=assignedArm(e,plan);e.allocatedAt=now();e.stage=e.arm==='control'?'ready':'configuration';
    if(e.stage==='configuration'&&e.rehearsalResume?.configuration){e.configuration=e.rehearsalResume.configuration;e.stage='ready';}
    if(e.stage==='ready')e.learningReadyAt=now();saveEnrollment(e);event(e.id,'pretest_completed_and_allocated',{pretest:e.pretest,arm:e.arm,allocationIndex:e.allocationIndex});db.saveNow();
  }
  function saveEnrollment(e){sql().run('UPDATE pilot_enrollments SET status=?,document=? WHERE id=?',[e.status,JSON.stringify(e),e.id]);}
  function attachPretest(user,generation,prior){const e=enrolled(user,generation);if(!e||e.stage!=='baseline'||!version(e.versionId).allowPretestReuse)fail('当前版本不能接续前测');e.reusedPretest={resultIds:prior.resultIds,completedAt:prior.completedAt,explicitConsentAt:now(),baselineTiming:'after_pretest'};saveEnrollment(e);event(e.id,'existing_pretest_consented',e.reusedPretest);db.saveNow();return state(user,generation);}
  function attachRehearsal(user,generation,prior,record){
    const e=enrolled(user,generation);if(!e||e.stage!=='baseline'||version(e.versionId).useMode!=='internal_rehearsal')fail('当前版本不能接续演练');
    const reusable=record&&(record.generation==null||record.generation===generation)&&record.answers?.D5?.value!=='request';
    e.rehearsalResume={priorResultCount:prior.priorResultCount,priorLearning:prior.priorLearning,baselineTiming:prior.priorLearning?'after_learning_exposure':'after_pretest_exposure',explicitConsentAt:now(),configuration:reusable?record:null};
    if(prior.pretestComplete)e.reusedPretest={resultIds:prior.resultIds,completedAt:prior.completedAt,explicitConsentAt:now(),baselineTiming:e.rehearsalResume.baselineTiming};
    saveEnrollment(e);event(e.id,'rehearsal_progress_resumed',e.rehearsalResume);db.saveNow();return state(user,generation);
  }
  function configure(user,generation,record){const e=enrolled(user,generation);if(!e||e.studyDesign!==LEARNER_DESIGN)return;
    if(e.arm!=='configurable'||!['configuration','ready'].includes(e.stage))fail('当前条件不允许修改六维偏好',403);
    e.configuration=record;e.stage='ready';saveEnrollment(e);closePending(e,'configuration_changed');event(e.id,'learner_configuration_saved',{configuration:record,initial:!e.learningReadyAt});e.learningReadyAt=e.learningReadyAt||now();saveEnrollment(e);db.saveNow();}
  function recordConfiguration(user,generation,runtime,reason) {
    const e=enrolled(user,generation);if(!e)return;
    closePending(e,"configuration_changed");event(e.id,"effective_parameters_changed",{runtime,hash:hash(runtime),reason:text(reason)||"学生在六维观察台修改设置"});db.saveNow();
  }
  function createRater(project,name,role="independent") {
    if(!rows("SELECT id FROM pilot_versions WHERE project=?",[project]).length||!text(name,80)||!["independent","adjudicator"].includes(role))fail("请选择已有项目、填写标注员编号及角色");
    if(rows("SELECT document FROM pilot_raters WHERE project=?",[project]).map(parse).some(r=>r.name===text(name,80)))fail("同一项目的标注员编号不能重复，也不能兼任独立标注与裁决",409);
    const token=crypto.randomBytes(24).toString("hex"),r={id:crypto.randomUUID(),project,name:text(name,80),role,createdAt:now()};
    sql().run("INSERT INTO pilot_raters VALUES(?,?,?,?)",[r.id,project,tokenHash(token),JSON.stringify(r)]);db.saveNow();return {rater:r,token};
  }
  function rater(token) {const r=parse(rows("SELECT * FROM pilot_raters WHERE token_hash=?",[tokenHash(token)])[0]);if(!r)fail("标注凭证无效",403);return r;}
  function latestAnnotations(id) {
    const all=rows("SELECT * FROM pilot_annotations WHERE opportunity_id=? ORDER BY rowid",[id]).map(parse),m=new Map();for(const a of all)m.set(a.raterId,a);return [...m.values()];
  }
  function cases(token) {
    const r=rater(token),enrollments=rows("SELECT * FROM pilot_enrollments").map(parse).filter(e=>e.project===r.project&&e.status!=="withdrawn");
    return {rater:r,cases:enrollments.flatMap(e=>opportunities(e).filter(o=>o.sampled).map(o=>{
      const anns=latestAnnotations(o.id),own=anns.find(a=>a.raterId===r.id),paired=anns.filter(a=>a.role==="independent");
      return {id:o.id,caseHash:hash(o.teacherFacts),scope:o.scope,facts:o.teacherFacts,
        own:own||null,...(r.role==="adjudicator"&&paired.length>=2?{independentRatings:paired}: {})};
    })).filter(c=>r.role!=="adjudicator"||c.independentRatings)};
  }
  function annotate(token,input) {
    const r=rater(token),c=cases(token).cases.find(c=>c.id===input.id);if(!c)fail("案例不存在或尚未完成双标",404);
    if(input.caseHash!==c.caseHash||input.revision!==(c.own?.revision||0))fail("材料或标注版本已变化，请刷新",409);
    if(!["yes","no","unknown"].includes(input.cognitiveDifficulty)||!["yes","no","unknown"].includes(input.sufficientEvidence))fail("请选择困难证据，无法判断时选未知");
    if(!["cognitive","metacognitive","motivational","emotional","behavioral","unknown","not_applicable"].includes(input.primaryGoal))fail("支持目标无效");
    if(!text(input.note))fail("请填写判断依据及信息不足之处");
    const a={id:crypto.randomUUID(),opportunityId:c.id,caseHash:c.caseHash,raterId:r.id,raterName:r.name,role:r.role,
      revision:(c.own?.revision||0)+1,at:now(),codebookVersion:"teacher-case-v1",source:r.role==="adjudicator"?"human_adjudication":"human_independent",cognitiveDifficulty:input.cognitiveDifficulty,
      sufficientEvidence:input.sufficientEvidence,primaryGoal:input.primaryGoal,note:text(input.note,2000)};
    sql().run("INSERT INTO pilot_annotations VALUES(?,?,?,?,?)",[a.id,c.id,r.id,a.revision,JSON.stringify(a)]);db.saveNow();return a;
  }
  function exportData(project) {
    const versions=rows("SELECT * FROM pilot_versions WHERE project=? ORDER BY seq",[project]).map(parse);
    const es=rows("SELECT * FROM pilot_enrollments").map(parse).filter(e=>e.project===project).map(experience),ids=new Set(es.map(e=>e.id));
    const ops=es.flatMap(opportunities),opids=new Set(ops.map(o=>o.id));
    return {schemaVersion:VERSION,generatedAt:now(),versions,enrollments:es,opportunities:ops,
      answers:rows("SELECT * FROM pilot_answers").filter(r=>opids.has(r.opportunity_id)).map(r=>({opportunityId:r.opportunity_id,...parse(r)})),
      annotations:rows("SELECT * FROM pilot_annotations ORDER BY rowid").map(parse).filter(a=>opids.has(a.opportunityId)),
      events:rows("SELECT * FROM pilot_events ORDER BY rowid").map(parse).filter(e=>ids.has(e.enrollmentId)||e.versionId&&versions.some(v=>v.id===e.versionId)),
      exclusions:"internal_rehearsal is engineering data, not randomized human-study evidence; originalAssignment preserves prior allocation; withdrawn and missing are not negative labels; frames and repeated students must be analysed separately"};
  }
  return {createVersion,preview,start,state,observe,activeProbe,action,recordConfiguration,createRater,cases,annotate,exportData,configure,recordPretest,attachPretest,attachRehearsal,
    latest:enrollment,
    members:project=>rows('SELECT user_id,generation,document FROM pilot_enrollments').map(r=>({userId:r.user_id,...experience(parse(r))})).filter(e=>e.project===project),
    versions:()=>rows("SELECT * FROM pilot_versions ORDER BY rowid DESC").map(parse),enrolled};
}
module.exports={createStore,VERSION,defaults,consentDefaults,LEARNER_DESIGN};
