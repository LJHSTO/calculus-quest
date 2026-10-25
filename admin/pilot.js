(function(){
  "use strict";
  let token="",role="",versions=[],raterData=null,selected=null;
  const root=document.getElementById("pilot-workspace"),status=document.getElementById("pilot-status");
  const el=(tag,value)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;return n;};
  const button=(label,fn)=>{const b=el("button",label);b.type="button";b.onclick=async()=>{b.disabled=true;status.textContent="";try{await fn();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};return b;};
  function field(parent,key,label,value="",type="text"){const l=el("label",label),n=el(type==="textarea"?"textarea":"input");if(type!=="textarea")n.type=type;n.name=key;n.value=value;l.append(n);parent.append(l);return n;}
  function select(parent,key,label,options,value){const l=el("label",label),n=el("select");n.name=key;for(const [v,t] of options){const o=el("option",t);o.value=v;n.append(o);}if(value!==undefined)n.value=value;l.append(n);parent.append(l);return n;}
  const values=form=>Object.fromEntries([...form.querySelectorAll("[name]")].map(n=>[n.name,n.value]));
  function factsView(facts){const box=el("section"),k=facts.courseFacts||{};box.append(el("h4",k.label||facts.scope||"学习材料"));
    for(const [key,label] of [["fact","知识依据"],["task","学习任务"]])if(k[key])box.append(el("p",label+"："+k[key]));
    box.append(el("h4","抽样前的操作与作答"));const events=facts.events||[];
    if(!events.length)box.append(el("p","没有可用的近期操作或作答记录；请保留未知，不推断心理状态。"));
    for(const e of events){const line=el("p");line.append(document.createTextNode(`${e.at||"时间未记录"} · ${e.type||"学习事件"}`));
      if(e.parameter)line.append(el("span",`；操作对象：${e.parameter}`));
      if(e.value!==null&&e.value!==undefined)line.append(el("span",`；操作值：${typeof e.value==="object"?JSON.stringify(e.value):e.value}`));
      if(e.correct!==null&&e.correct!==undefined)line.append(el("span",`；作答判断：${e.correct?"正确":"错误"}`));
      if(e.response)line.append(el("span",`；当时回答：${e.response}`));box.append(line);}
    box.append(el("p",facts.evidenceLimit||"材料没有覆盖的信息保持未知。"));return box;}
  async function request(path,body){const response=await fetch("api/"+path,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});const p=await response.json();if(!response.ok||!p.ok)throw new Error(p.message||"操作未保存");return p.data;}
  function download(name,content,type="application/json"){const a=el("a");a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function csv(rows){if(!rows.length)return "\ufeff没有记录\r\n";const cols=Object.keys(rows[0]);const cell=x=>{let s=typeof x==="object"?JSON.stringify(x):String(x??"");if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return "\ufeff"+[cols,...rows.map(r=>cols.map(k=>r[k]))].map(r=>r.map(cell).join(",")).join("\r\n");}
  async function load(){if(role==="admin"){versions=(await request("admin/pilot")).versions;admin();}else{raterData=await request("pilot-rater/cases");teacher();}}
  function admin(){root.replaceChildren();window.PilotResearchDashboard?.mount(root,{request,download,csv,versions});const list=el("section");list.append(el("h2","预试版本"));
    for(const v of versions){const row=el("p");row.append(document.createTextNode(`${v.title} · ${v.project} · 第${v.sequence}版 `),button("以此建立修订版",()=>{selected=v;admin();}),button("下载抽样与标注记录",async()=>{const data=await request("admin/pilot/export?project="+encodeURIComponent(v.project));download(v.project+"-预试完整记录.json",JSON.stringify(data,null,2));download(v.project+"-抽样机会.csv",csv(data.opportunities.map(o=>({机会编号:o.id,参与记录:o.enrollmentId,知识点:o.scope,时刻:o.at,抽样框:o.stratum,是否合格:o.eligible,阻止原因:o.blockers,抽样概率:o.probability,是否抽中:o.sampled,状态:o.status,版本:o.versionId,参数摘要:o.runtimeHash}))),"text/csv;charset=utf-8");}));list.append(row);}if(!versions.length)list.append(el("p","尚未建立预试。普通学习不会自动成为研究数据。"));root.append(list);
    const form=el("section");form.append(el("h2",selected?"建立修订版":"建立首轮预试"),el("p","填写实际负责人、审核依据与数据处理安排。新版本只用于新加入的学生，旧记录保留。"));
    for(const [key,label,initial,type] of [["project","项目编号（字母、数字、下划线）",selected?.project||"limits-pilot","text"],["title","预试名称",selected?.title||"函数与极限主动帮助预试","text"],["reason","建立或修改原因","","textarea"],["responsible","研究负责人",selected?.responsible||"","text"],["contact","参与者联系渠道",selected?.contact||"","text"],["reviewReference","适用的研究审核依据",selected?.reviewReference||"","text"],["retention","保存期限、访问范围与存储位置",selected?.retention||"","textarea"],["withdrawal","退出后的数据保留、删除及联系办法",selected?.withdrawal||"","textarea"],["consentText","补充或替换知情同意正文（留空使用基本说明）",selected?.consentText||"","textarea"]])field(form,key,label,initial,type);
    select(form,'design','预试方式',[['learner-configurable-20-v1','20人随机预试：10人无主动帮助 / 10人自主配置六维'],['','原有的帮助时机标注预试（不随机分组）']],selected?selected.studyType==='learner-configurable-20-v1'?'learner-configurable-20-v1':'':'learner-configurable-20-v1');
    select(form,'useMode','用途',[['rehearsal','内部演练（不招募学生）'],['human','真人预试（负责人需确认研究材料）']],selected?.useMode==='human_pilot'?'human':'rehearsal');
    const cfg=selected?.sampling||{intervalSeconds:60,silentProbability:.35,triggeredProbability:1,minGapSeconds:90,maxProbes:8,maxPerStratum:4,expiresSeconds:90};
    const settings=el("details");settings.append(el("summary","抽样设置（工程起始值，不代表最优参数）"));
    const labels={intervalSeconds:"静默时段检查间隔（秒）",silentProbability:"静默时段抽样概率",triggeredProbability:"主动候选抽样概率",minGapSeconds:"测量最小间隔（秒）",maxProbes:"每人总上限",maxPerStratum:"每类抽样框上限",expiresSeconds:"问题有效期（秒）"};for(const [k,v] of Object.entries(cfg)){const n=field(settings,k,labels[k],v,"number");n.step=k.endsWith("Probability")?"0.05":"1";}form.append(settings);
    form.append(button("保存为不可覆盖的新版本",async()=>{const all=values(form),sampling={};for(const k of Object.keys(cfg)){sampling[k]=Number(all[k]);delete all[k];}const result=await request("admin/pilot/version",{...all,sampling,previousVersionId:selected?.id||null});selected=null;await load();const box=el("section");box.append(el("h2","版本已建立"),el("p",result.version.useMode==="internal_rehearsal"?"此码仅供研究团队内部演练，不用于学生招募。加入码仅在此处显示，请单独保存。":"将加入码交给本版本的参与学生。加入码仅在此处显示，请妥善保存。"),el("pre",result.joinCode));root.prepend(box);}));if(selected)form.append(button("取消修订，建立新项目",()=>{selected=null;admin();}));root.append(form);
    const staff=el("section");staff.append(el("h2","建立独立标注入口"),el("p","每位教师使用自己的凭证。独立标注看不到系统分数、学生反馈或其他人的判断；裁决员在双标后查看分歧。"));
    const projects=[...new Set(versions.map(v=>v.project))];select(staff,"project","项目",projects.map(p=>[p,p]));field(staff,"name","标注员编号（不要填学生信息）");select(staff,"role","角色",[["independent","独立标注"],["adjudicator","第三位裁决员"]]);staff.append(button("生成该标注员的凭证",async()=>{const data=await request("admin/pilot/rater",values(staff));staff.append(el("p",`交给${data.rater.name}使用，凭证仅显示本次：`),el("pre",data.token));}));root.append(staff);
  }
  function teacher(){root.replaceChildren(el("h2",`${raterData.rater.name} · ${raterData.rater.role==="adjudicator"?"分歧裁决":"独立标注"}`));
    root.append(el("p","依据材料判断可观察的认知困难；没有证据就选未知。不要凭操作少、停留久或答错判断学生不想学。"),button("刷新案例",load),button("导出我的标注",()=>download("教师个人标注.csv",csv(raterData.cases.map(c=>({案例编号:c.id,材料摘要:c.caseHash,知识点:c.scope,标注版本:c.own?.revision||0,认知困难:c.own?.cognitiveDifficulty||"",证据充分:c.own?.sufficientEvidence||"",主要目标:c.own?.primaryGoal||"",依据:c.own?.note||""}))),"text/csv;charset=utf-8")));
    if(!raterData.cases.length)root.append(el("p","暂时没有待标注案例。裁决案例须先有两位教师完成独立标注。"));
    for(const c of raterData.cases){const panel=el("article");panel.append(el("h3",`${c.scope} · ${c.own?"已标注，可修订":"待标注"}`),el("small",c.id),factsView(c.facts));
      if(c.independentRatings){panel.append(el("h3","独立判断（裁决员可见）"));for(const a of c.independentRatings){const labels={yes:"是",no:"否",unknown:"未知",not_applicable:"不适用",cognitive:"认知",metacognitive:"元认知",motivational:"动机",emotional:"情绪",behavioral:"行为与资源"};panel.append(el("p",`${a.raterName}：认知困难${labels[a.cognitiveDifficulty]}；证据充分${labels[a.sufficientEvidence]}；主要目标${labels[a.primaryGoal]}。依据：${a.note}`));}}
      const yn=[["unknown","未知／材料不足"],["yes","是"],["no","否"]];select(panel,"cognitiveDifficulty","有可观察的认知困难吗？",yn,c.own?.cognitiveDifficulty);select(panel,"sufficientEvidence","材料足以判断上述问题吗？",yn,c.own?.sufficientEvidence);
      select(panel,"primaryGoal","材料支持的首要帮助目标",[["unknown","无法判断"],["not_applicable","无需支持／不适用"],["cognitive","认知与知识建构"],["metacognitive","元认知与学习调节"],["motivational","动机支持（须有直接表达依据）"],["emotional","情绪支持（须有直接表达依据）"],["behavioral","行为与资源管理"]],c.own?.primaryGoal);
      field(panel,"note","依据、反例或信息不足之处",c.own?.note||"","textarea");panel.append(button("保存标注版本",async()=>{await request("pilot-rater/annotation",{...values(panel),id:c.id,caseHash:c.caseHash,revision:c.own?.revision||0});await load();}));root.append(panel);}
  }
  document.getElementById("pilot-login-button").onclick=async()=>{token=document.getElementById("pilot-token").value;role=document.getElementById("pilot-role").value;try{await load();document.getElementById("pilot-login").hidden=true;status.textContent="";}catch(e){status.textContent=e.message;}};
})();
