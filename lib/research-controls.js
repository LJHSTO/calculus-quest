"use strict";
// Participant-scoped engineering controls. Never enabled by a URL parameter,
// and never allowed to mutate a frozen human-study assignment or protections.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const supportGoals = require("./support-goals");
const defaults = Object.freeze({helpNeed:0.7, uncertainty:0.3, interruptibility:0.75,
  boundaryOnly:false, ttlSeconds:900, maxSupportLevel:"L5", representationSwitch:true,
  placement:"inline", proactivity:"assigned", cooldownSeconds:600,
  minimumEvidenceFamilies:1, timingMode:"adaptive", delaySeconds:30,
  initialSupportLevel:"auto", presentationFormat:"plain", authorityLevel:"A3",
  maxEscalations:4, reviewAfterHours:24,
  supportGoal:"auto", supportStrategy:"auto", supportDose:"brief", supportFollowups:1});
function validate(value) {
  if (!value || typeof value!=="object" || Array.isArray(value)) throw new Error("设置格式无效");
  if (Object.keys(value).some(k=>!Object.hasOwn(defaults,k))) throw new Error("包含不支持的六维设置");
  const p={...defaults,...value};
  for(const [key,min,max] of [["helpNeed",0,1],["uncertainty",0,1],["interruptibility",0,1],["ttlSeconds",60,3600],["cooldownSeconds",60,3600],
    ["minimumEvidenceFamilies",1,4],["delaySeconds",1,900],["maxEscalations",0,4],["reviewAfterHours",1,168]]) {
    if(typeof p[key]!=="number" || !Number.isFinite(p[key]) || p[key]<min || p[key]>max) throw new Error(`${key} 超出可调范围`);
  }
  if(!["L1","L2","L3","L4","L5"].includes(p.maxSupportLevel)
    || !["inline","sidebar"].includes(p.placement)
    || !["assigned","fixed","adaptive","reactive"].includes(p.proactivity)
    || !["adaptive","delayed"].includes(p.timingMode)
    || !["auto","L1","L2","L3","L4","L5"].includes(p.initialSupportLevel)
    || !["plain","disclosure","steps","bubble"].includes(p.presentationFormat)
    || !["A1","A2","A3","A4"].includes(p.authorityLevel)
    || !Number.isInteger(p.minimumEvidenceFamilies) || !Number.isInteger(p.maxEscalations)
    || typeof p.boundaryOnly!=="boolean" || typeof p.representationSwitch!=="boolean") throw new Error("六维选项无效");
  if(p.delaySeconds>=p.ttlSeconds)throw new Error("延迟须短于候选有效期");
  if(p.supportGoal!=="auto" && !Object.hasOwn(supportGoals.GOALS,p.supportGoal))throw new Error("支持目标无效");
  if(!["brief","guided"].includes(p.supportDose) || !Number.isInteger(p.supportFollowups) || p.supportFollowups<0 || p.supportFollowups>2)throw new Error("支持份量或后续轮数无效");
  if(p.supportStrategy!=="auto" && (p.supportGoal==="auto" || !supportGoals.GOALS[p.supportGoal].strategies.includes(p.supportStrategy)))throw new Error("请先选择支持目标，再选择对应策略");
  if(p.initialSupportLevel!=="auto" && Number(p.initialSupportLevel[1])>Number(p.maxSupportLevel[1]))throw new Error("起始支持不能超过支持上限");
  return p;
}
function createStore({env=process.env,root,config}) {
  const dbPath=path.resolve(env.DB_PATH||""), relative=path.relative(path.join(root,"output"),dbPath);
  const isolated=env.NODE_ENV==="test" && Boolean(relative)
    && !relative.startsWith("..") && !path.isAbsolute(relative);
  const demonstration=env.RESEARCH_CONTROLS_DEMO==="true";
  const enabled=env.RESEARCH_CONTROLS_ENABLED==="true" && config.participationMode==="implicit-pilot"
    && !env.MAIN_LEARNING_PROTOCOL_FILE && (isolated || demonstration);
  const canEdit=userId=>enabled && Boolean(userId);
  const directory=path.join(path.dirname(dbPath),"六维控制记录");
  const key=userId=>crypto.createHash("sha256").update(config.experimentId+":"+userId).digest("hex");
  const read=userId=>{if(!canEdit(userId))return null;const file=path.join(directory,key(userId)+".json");if(!fs.existsSync(file))return null;
    const record=JSON.parse(fs.readFileSync(file,"utf8")),profile={...defaults,...record.profile};
    return {...record,profile,profileVersion:"six-dimension-support-goals-v2",storedHash:record.hash,
      hash:crypto.createHash("sha256").update(JSON.stringify(profile)).digest("hex")};};
  return {enabled,read,canEdit,
    describe(userId){const r=read(userId),allowed=canEdit(userId);return {enabled:allowed,reason:allowed?"全量展示：设置只作用于当前账号的后续决策，不修改他人设置":"只读：工程展示未开启或研究条件已锁定",revision:r?.revision||0,profile:r?.profile||{...defaults,helpNeed:config.thresholds.helpNeed,uncertainty:config.thresholds.uncertainty,interruptibility:config.thresholds.interruptibility},hash:r?.hash||"",kind:"engineering-only",assignmentMutable:false};},
    save(userId,value,expectedRevision){
      if(!canEdit(userId))throw Object.assign(new Error("当前账号无工程控制权限或研究条件已锁定"),{status:403});
      const old=read(userId);if(expectedRevision!==(old?.revision||0))throw Object.assign(new Error("设置已被另一页面更新，请重新读取"),{status:409});
      const profile=validate(value),revision=(old?.revision||0)+1,at=new Date().toISOString();
      const record={revision,profile,at,hash:crypto.createHash("sha256").update(JSON.stringify(profile)).digest("hex"),kind:"engineering-only"};
      fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,key(userId)+".json"),temp=file+".tmp";
      fs.writeFileSync(temp,JSON.stringify(record,null,2),"utf8");fs.renameSync(temp,file);
      fs.appendFileSync(path.join(directory,key(userId)+"-变更.jsonl"),JSON.stringify(record)+"\n","utf8");return this.describe(userId);
    }};
}
function effectiveConfig(config,record) {
  if(!record)return config;const p=record.profile;
  return {...config,thresholds:{helpNeed:p.helpNeed,uncertainty:p.uncertainty,interruptibility:p.interruptibility},decisionTtlMs:p.ttlSeconds*1000,
    engineeringControls:record,
    armProfiles:Object.fromEntries(Object.entries(config.armProfiles).map(([arm,a])=>[arm,{...a,
      display:a.display && p.proactivity!=="reactive",
      maxSupportLevel:Number(a.maxSupportLevel.slice(1))<Number(p.maxSupportLevel.slice(1))?a.maxSupportLevel:p.maxSupportLevel,
      allowRepresentationSwitch:a.allowRepresentationSwitch && p.representationSwitch
        && ["A3","A4"].includes(p.authorityLevel || "A3")}]))};
}
module.exports={defaults,validate,createStore,effectiveConfig};
