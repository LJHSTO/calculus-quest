(function initProactiveHUD(global) {
  "use strict";
  // Explicit engineering view only. This flag controls presentation, not access
  // to private study data; authenticated server endpoints retain that boundary.
  const explicitlyRequested = new URLSearchParams(global.location.search).get("research") === "1";
  const names = { inline: "任务内", sidebar: "助教栏", tip: "提示", example: "例子", interactive: "动手试", chat: "对话",
    simulation: "模拟探索", game: "闯关游戏", mindMap: "概念图", visualization3d: "三维视图",
    silent: "保持沉默", wait: "等待自然边界", boundary: "自然边界介入", immediate: "当前窗口介入",
    cancel: "取消过时建议", delayed: "暂缓投递",
    idle: "独立探索", support_offered: "等待学生确认", accepted_pending_response: "等待学生回应",
    awaiting_independent_attempt: "独立检查中", faded: "已渐退", maximum_support_reached: "达到支持上限",
    exited: "检查通过，已渐退", closed: "本轮已关闭", deferred: "学生选择稍后",
    withdrawn: "已退出", declined: "学生跳过", stopped: "已停止", standard: "标准提醒", reduced: "少提醒", off: "已关闭",
    ui_click: "界面点击", interactive_click: "课件点击", interactive_drag_end: "拖动完成",
    parameter_change: "参数调整", parameter_commit: "参数确认", knowledge_scene_selected: "选择互动课件",
    challenge_result: "挑战结果", task_progress: "任务进展", semantic_task_progress: "语义任务进展",
    lesson_started: "进入学习单元", lesson_completed: "完成学习单元", knowledge_scene_completed: "完成互动课件" };
  const reasons = { quiet_dwell_waiting_for_boundary: "存在困难线索，等待操作边界", protected_assessment_stage: "测量阶段保护",
    help_need_below_threshold: "当前帮助需求未达到阈值", interruptibility_below_threshold: "正在连贯操作，暂不打扰",
    uncertainty_above_threshold: "证据不确定性较高", evidence_families_insufficient: "支持判断的证据不足",
    scope_preference_off: "学生关闭了本知识点提醒", student_preference_off: "学生关闭了主动提醒",
    cooldown_active: "处于冷却期", policy_thresholds_met: "证据和时机达到策略条件",
    control_condition_suppressed: "当前研究条件不展示主动建议", shadow_mode_suppressed: "仅记录策略，不展示建议" };
  let snapshot = null, panel, toggle, opened = false, lastKey = "", eventCount = 0;
  const priorInert = new Map();
  const events = [], decisions = [];
  let controlData=null, controlOwner="", controlBusy=false;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const label = value => names[value] || value || "尚无记录";
  const score = value => value === null || value === undefined ? "未估计" : Number(value).toFixed(2);
  const row = (name, value, liveCooldown = false) => `<div class="observatory-row"><span>${esc(name)}</span><strong${liveCooldown ? " data-cooldown-remaining" : ""}>${esc(value)}</strong></div>`;
  const card = (id, title, body) => `<section class="observatory-dimension" data-dimension="${id}"><h3><span>${id}</span>${title}</h3>${body}</section>`;
  function drawControls(){
    const host=panel.querySelector('[data-research-controls]');
    const wasOpen=host.querySelector('details')?.open;
    if(!controlData){host.innerHTML='<p>登录后可读取当前分组和六维控制范围。</p>';return;}
    const d=controlData,p=d.profile,disabled=d.enabled?'':'disabled';
    const num=(key,title,min,max,step)=>`<label>${title}<input name="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${p[key]}" ${disabled}></label>`;
    const select=(key,title,opts)=>`<label>${title}<select name="${key}" ${disabled}>${opts.map(([v,t])=>`<option value="${v}" ${p[key]===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
    const check=(key,title)=>`<label class="research-control-check"><input name="${key}" type="checkbox" ${p[key]?'checked':''} ${disabled}>${title}</label>`;
    host.innerHTML=`<details ${wasOpen?'open':''}><summary>六维控制 · ${d.enabled?'可调整':'当前只读'}</summary>
      <p>配置分组：${esc((d.arms||[]).join(' / ')||'读取中')}；当前分配：${esc(d.assignment?.condition||'完成前测后分配')}。调节不会更改分组。</p>
      <form data-controls-form><fieldset ${disabled}><legend>D1 · 判断证据的阈值</legend>${num('helpNeed','帮助需求下限',0,1,.05)}${num('uncertainty','不确定性上限',0,1,.05)}${num('minimumEvidenceFamilies','至少需要的证据类别数',1,4,1)}<small>事实、行为特征与规则估计分别记录；评分尚未由真人标注校准。</small></fieldset>
      <fieldset ${disabled}><legend>D2 · 时机与有效期</legend>${num('interruptibility','可打断性下限',0,1,.05)}${num('ttlSeconds','候选有效期（秒）',60,3600,60)}${check('boundaryOnly','只在已有证据确认的任务边界投递')}${select('timingMode','新一轮建议的投递方式',[['adaptive','满足条件即投递'],['delayed','保存后延迟复核']])}${num('delaySeconds','延迟（秒）',1,900,1)}<small>延迟任务写入数据库；到期后须在当前学习上下文重新通过判断。检查后的升级不额外延迟。</small></fieldset>
      <fieldset ${disabled}><legend>D3 · 支架深度</legend>${select('initialSupportLevel','起始支持',[['auto','按触发规则'],...[1,2,3,4,5].map(n=>['L'+n,'L'+n])])}${select('maxSupportLevel','本轮支持上限',[1,2,3,4,5].map(n=>['L'+n,'L'+n]))}${check('representationSwitch','允许建议切换表征')}<small>使用课程模板与服务器判分的独立检查；内容仍需教师审校。</small></fieldset>
      <fieldset ${disabled}><legend>D4 · 同内容呈现</legend>${select('placement','提示位置',[['inline','课件／题目任务区'],['sidebar','完整对话侧栏']])}${select('presentationFormat','提示形式',[['plain','文字卡片'],['disclosure','点击展开'],['steps','逐句展开'],['bubble','对话气泡']])}<small>四种形式使用同一条支架正文。补充例子和练习另计。</small></fieldset>
      <fieldset ${disabled}><legend>D5 · 主动程度与控制权</legend>${select('proactivity','主动策略',[['assigned','沿用已分配策略'],['fixed','固定建议式'],['adaptive','规则分数自适应'],['reactive','仅回应主动求助']])}${select('authorityLevel','允许的呈现行为',[['A1','A1 · 学生展开线索'],['A2','A2 · 直接展示低风险线索'],['A3','A3 · 确认后切换表征'],['A4','A4 · 授权后自动展开，可撤销']])}<small>A4 还需学生在“学习记忆与提醒”中明确授权；这里不能替学生同意。A5 不自动执行。</small></fieldset>
      <fieldset ${disabled}><legend>D6 · 升级、退出与复习</legend>${num('cooldownSeconds','接受帮助后的基础冷却（秒）',60,3600,60)}${num('maxEscalations','最多升级次数',0,4,1)}${num('reviewAfterHours','独立检查后复习间隔（小时）',1,168,1)}<small>通过则渐退，达到上限则停止。复习需学生授权；服务器持续运行时可离线准备，登录后查看。</small></fieldset>
      <p>当前版本 ${d.revision}。${esc(d.reason)}。这些记录不能混入正式实验。</p><button type="submit" ${disabled}>保存并应用于后续决策</button><button type="button" data-controls-reload>重新读取</button><button type="button" data-controls-export>导出六维配置</button></form></details><p role="status" data-controls-status></p>`;
  }
  async function loadControls(){
    if(!snapshot?.signedIn||controlBusy)return;
    controlBusy=true;const owner=snapshot.ownerKey;
    try{const data=await global.KnowledgeAssistant.researchControlRequest();if(owner!==snapshot?.ownerKey)return;controlData=data;controlOwner=owner;drawControls();}
    catch(e){panel.querySelector('[data-controls-status]')?.replaceChildren(document.createTextNode(e.message));}
    finally{controlBusy=false;}
  }
  function render() {
    if (!panel || !opened) return;
    const s = snapshot || {}, o = s.observation, facts = o?.d1?.facts, estimate = o?.d1?.estimates;
    const phase = s.policyState?.lifecycle?.phase || "idle";
    const until = Date.parse(s.policyState?.cooldownUntil || "");
    const seconds = Number.isFinite(until) ? Math.max(0, Math.ceil((until-Date.now())/1000)) : 0;
    const action = s.locked || s.muted ? "silent" : o?.d2?.action;
    const reason = s.locked ? "测验与独立测量期间暂停帮助" : s.muted ? "学生已关闭本知识点提醒"
      : o?.d2?.reasons?.map(r=>reasons[r] || r).join("；") || "尚无服务端决策；操作事件本身不代表需要帮助。";
    const support = s.offer?.supportLevel || (["accepted_pending_response", "awaiting_independent_attempt"].includes(phase) ? s.policyState?.currentLevel : "L0") || "L0";
    const latest = events.filter(e=>e.unitId===s.unitId).at(-1);
    const key = JSON.stringify([s, eventCount, latest]);
    if(key===lastKey){
      const timer=panel.querySelector("[data-cooldown-remaining]");
      if(timer)timer.textContent=seconds ? `${seconds} 秒` : "无有效冷却";
      return;
    }
    lastKey=key;
    panel.querySelector("[data-observatory-context]").textContent = `${s.unitLabel || "尚未进入学习"} · ${eventCount} 条本次操作记录`;
    panel.querySelector("[data-observatory-body]").innerHTML = [
      card("D1", "学习状态证据", row("最近操作", latest ? label(latest.type) : "尚无操作") + row("当前课件", label(s.sceneType))
        + row("服务端证据来源", facts?.families?.join("、") || "尚未形成决策证据")
        + row("已确认错误 / 正确", facts ? `${facts.confirmedIncorrect ?? "未记录"} / ${facts.confirmedCorrect ?? "未记录"}` : "未记录")
        + `<div class="observatory-estimates">${row("帮助需求估计", score(estimate?.helpNeed))}${row("可打断性估计", score(estimate?.interruptibility))}${row("不确定性估计", score(estimate?.uncertainty))}<small>工程评分，不是经校准的心理状态概率。</small></div>`),
      card("D2", "教学时机与沉默", row("当前决策", action ? label(action) : "尚未判断")
        + row("自然边界证据", facts ? facts.naturalBoundary ? "已记录" : "未记录" : "尚无判断")
        + `<p>${esc(reason)}</p>`),
      card("D3", "教学支持深度", row("实际支持", support === "L0" ? "L0 · 独立探索" : support)
        + row("本次动作", s.offer?.action || o?.d3?.action || "无")
        + `<p>${esc(s.offer?.title || "尚未呈现新的教学支架。")}</p><small>检查由服务端判分。未执行的防泄题审计不显示通过。</small>`),
      card("D4", "同内容的呈现位置", row("位置", label(s.view?.placement)) + row("形式", ({plain:"文字卡片",disclosure:"点击展开",steps:"逐句展开",bubble:"对话气泡"})[s.view?.format] || label(s.view?.modality))
        + `<p>位置与正文形式分别设置；独立测验期间关闭。额外例子与练习改变教学内容，另行记录。</p>`),
      card("D5", "学习者控制权", row("提醒偏好", label(s.preference)) + row("本知识点", s.muted ? "提醒已关闭" : "允许按策略建议")
        + row("进一步行动", "等待学生确认") + `<small>稍后、换一种帮助、关闭和恢复均使用真实服务端流程。</small>`),
      card("D6", "支架生命周期", row("当前阶段", label(phase)) + row("服务端冷却", seconds ? `${seconds} 秒` : "无有效冷却", true)
        + row("独立检查", s.check?.id ? "已签发，等待独立作答" : "当前无检查")
        + `<ol class="observatory-lifecycle">${["提出建议","学生确认","独立检查","渐退或停止"].map(x=>`<li>${x}</li>`).join("")}</ol><small>检查通过只结束本轮帮助；学习效果另看后测、迁移和保持。</small>`)
    ].join("");
    panel.querySelector("[data-observatory-history]").innerHTML = events.slice(-8).reverse().map(e=>`<li><time>${esc(e.time)}</time><span title="${esc(e.type)}">${esc(label(e.type))}</span></li>`).join("") || "<li>进入课件后显示真实操作事件。</li>";
  }
  function setOpen(value) {
    if(!panel)return;
    opened = value; panel.hidden = !value; toggle.hidden = value; toggle.setAttribute("aria-expanded",String(value));
    document.body.classList.toggle("research-observatory-open", value);
    document.querySelectorAll(".core-learning-workspace > .lesson-rail, .learning-workspace-tools")
      .forEach(node => {
        if (value) {
          if (!priorInert.has(node)) priorInert.set(node, node.inert);
          node.inert = true;
        } else if (priorInert.has(node)) {
          node.inert = priorInert.get(node);
          priorInert.delete(node);
        }
      });
    global.dispatchEvent(new CustomEvent("cq:learning-layout-change"));
    if(value){render();loadControls();panel.querySelector("[data-observatory-close]").focus();}else toggle.focus();
  }
  function mount() {
    toggle=document.createElement("button"); toggle.type="button";toggle.className="proactive-hud-toggle-btn";
    toggle.textContent="六维观察台";toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-controls","proactive-observatory");
    panel=document.createElement("aside");panel.id="proactive-observatory";panel.className="proactive-hud-panel";panel.hidden=true;
    panel.setAttribute("aria-label","六维策略观察台");
    panel.innerHTML=`<header class="proactive-hud-header"><div><strong>六维策略观察台</strong><small data-observatory-context></small></div><button type="button" data-observatory-close aria-label="收起观察台">×</button></header>
      <p class="observatory-provenance">当前学习记录 · 服务端策略结果与浏览器操作分别标注</p><div class="observatory-scroll"><section class="research-controls" data-research-controls></section><div class="proactive-hud-body" data-observatory-body></div></div>
      <details class="observatory-history"><summary>最近操作记录</summary><ol data-observatory-history></ol></details>
      <footer><button type="button" data-observatory-export>导出本次观察记录</button><span>用于工程核验，不代表真人学习效果</span></footer>`;
    (document.querySelector(".core-learning-workspace .player-actions") || document.body).append(toggle);
    document.body.append(panel);
    drawControls();
    panel.addEventListener('submit',async event=>{
      if(!event.target.matches('[data-controls-form]'))return;event.preventDefault();if(controlBusy||!controlData?.enabled)return;
      const form=event.target,profile={...controlData.profile},owner=snapshot.ownerKey;
      for(const el of form.elements){if(!el.name)continue;profile[el.name]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;}
      controlBusy=true;const button=form.querySelector('[type=submit]');button.disabled=true;
      try{const next=await global.KnowledgeAssistant.researchControlRequest(profile,controlData.revision);if(owner!==snapshot?.ownerKey)return;controlData={...controlData,...next};drawControls();panel.querySelector('[data-controls-status]').textContent='已保存；对后续新决策生效，分组与独立测验保护保持锁定。';}
      catch(e){panel.querySelector('[data-controls-status]').textContent=e.message;button.disabled=false;}
      finally{controlBusy=false;}
    });
    panel.addEventListener('click',event=>{
      if(event.target.closest('[data-controls-reload]'))loadControls();
      if(event.target.closest('[data-controls-export]')&&controlData){const url=URL.createObjectURL(new Blob([JSON.stringify(controlData,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='六维工程配置.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    });
    toggle.addEventListener("click",()=>setOpen(true));panel.querySelector("[data-observatory-close]").addEventListener("click",()=>setOpen(false));
    panel.addEventListener("keydown",e=>{if(e.key==="Escape")setOpen(false);});
    panel.querySelector("[data-observatory-export]").addEventListener("click",()=>{
      const exported={version:1,generatedAt:new Date().toISOString(),kind:"engineering-observation",events,decisions,current:snapshot};
      const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)],{type:"application/json"}));
      const a=document.createElement("a");a.href=url;a.download="六维学习观察记录.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    if(global.KnowledgeAssistant)snapshot=global.KnowledgeAssistant.designSpaceSnapshot();
    setInterval(()=>{if(opened)render();},1000);
  }
  global.addEventListener("cq:proactive-state",event=>{
    const next=event.detail;if(!next)return;
    if(snapshot?.ownerKey !== next.ownerKey){events.length=0;decisions.length=0;eventCount=0;controlData=null;controlOwner='';if(panel)drawControls();}
    snapshot=next;
    if(next.observation?.decisionId && !decisions.some(d=>d.decisionId===next.observation.decisionId)){
      decisions.push(next.observation);if(decisions.length>100)decisions.shift();
    }
    render();
  });
  global.addEventListener("cq:learning-signal",event=>{
    const e=event.detail?.event;if(!e || !snapshot?.signedIn)return;
    if(String(e.eventType).startsWith("proactive_surface_"))return;
    eventCount++;
    events.push({time:new Date().toLocaleTimeString("zh-CN",{hour12:false}),type:e.eventType,unitId:e.unitId,sceneType:e.sceneType,eventId:e.eventId});
    if(events.length>100)events.shift();render();
  });
  global.CalculusQuest6DHUD=Object.freeze({get state(){return snapshot;},open:()=>setOpen(true),close:()=>setOpen(false)});
  async function boot(){
    if(explicitlyRequested){mount();return;}
    try{
      const response=await fetch(new URL("api/health",document.baseURI),{cache:"no-store"});
      if(response.ok && (await response.json()).sixDimensionDemo===true)mount();
    }catch{}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})(window);
