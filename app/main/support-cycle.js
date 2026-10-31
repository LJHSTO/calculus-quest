(function (global) {
  "use strict";
  const goalNames = { cognitive:"认知与知识建构",metacognitive:"元认知与学习调节",motivational:"动机支持",emotional:"情绪调节支持",behavioral:"学习行为与资源管理" };
  const strategyNames = {concept_hint:"概念线索",counterexample:"反例辨析",self_check:"把握与自检",plan_monitor:"计划与监控",value_connection:"个人价值联系",progress_feedback:"基于证据的信心支持",cost_reduction:"降低感知负担",acknowledge_reframe:"承认困难与重新理解失败",calm_choice:"继续或暂停的选择",study_plan:"短时学习计划",resource_navigation:"资源与求助路径"};
  const needs = {concept:"概念或步骤没弄懂",monitoring:"不知道自己是否理解",clarify_concept:"想解释其中一个概念",reflection:"想整理刚才的探索发现",value:"不清楚学这个有什么用",confidence:"担心自己学不会",cost:"现在觉得投入太多",frustration:"有些挫败或紧张",planning:"不知道接下来怎么安排",uncertain:"暂时说不清",none:"暂时不需要帮助"};
  const statuses = {queued:"等待合适时机",offered:"已提供支持",engaged:"由你继续尝试",awaiting_check:"独立检查中",postponed:"稍后再说",closed:"本轮已结束",expired:"需要已过期，请重新确认"};
  let owner="", snapshot=null, busy=false, error="", lastPoll=0, exposureMonitor=null, manualScope="";
  const drafts=new Map(), sentExposure=new Set(), opened=new Map(), presentedInquiries=new Set();
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  statuses.awaiting_confirmation="系统已主动询问，等待学生确认";
  let pointerBusy=false;
  const interactionBusy=()=>pointerBusy||global.TaskSupport?.interactionBusy||Boolean(document.activeElement?.matches('textarea,input:not([type=button]):not([type=checkbox]):not([type=range]),[contenteditable=true]'));
  const deferInquiry=c=>Boolean(c?.status==='awaiting_confirmation'&&!presentedInquiries.has(c.id)&&interactionBusy());
  const active=c=>c&&["awaiting_confirmation","queued","offered","engaged","awaiting_check","postponed"].includes(c.status);
  function draft(key){if(!drafts.has(key))drafts.set(key,{need:"",note:"",ratings:{},result:"",perceivedGoal:null,requestMore:false});return drafts.get(key);}
  function sync(next){
    const identity=`${next.ownerKey}:${next.generation}`;
    if(identity!==owner){owner=identity;drafts.clear();sentExposure.clear();opened.clear();presentedInquiries.clear();busy=false;error="";lastPoll=0;exposureMonitor?.clear({forget:true});}
    if(snapshot?.scopeKey!==next.scopeKey||snapshot?.ownerKey!==next.ownerKey||next.locked||next.check)manualScope="";
    snapshot=next;
  }
  async function request(command){
    if(busy)return;
    busy=true;error="";global.KnowledgeAssistant.refreshSupportSurface();
    const startOwner=owner;
    try {await global.KnowledgeAssistant.supportCycleRequest(command);}
    catch(e){if(startOwner===owner)error=e.message;}
    finally{if(startOwner===owner){busy=false;global.KnowledgeAssistant.refreshSupportSurface();}}
  }
  function button(label,fn){const b=el("button",label);b.type="button";b.disabled=busy;b.onclick=fn;return b;}
  function choices(container, options, selected, choose) {
    for(const [value,label] of Object.entries(options)){
      const b=button(label,()=>{choose(value);for(const n of container.querySelectorAll("button"))n.setAttribute("aria-pressed",String(n===b));});
      b.setAttribute("aria-pressed",String(selected===value));container.append(b);
    }
  }
  function selfRatings(form,d){
    const details=el("details");details.append(el("summary","补充此刻的感受（可不填）"));
    for(const [key,label] of Object.entries({value:"觉得值得学",confidence:"有信心完成",cost:"觉得负担大",tension:"感到紧张或挫败"})){
      const row=el("label",`${label}：0（完全没有）–4（非常强）`), input=el("input");
      input.type="number";input.min="0";input.max="4";input.step="1";input.value=d.ratings[key]??"";input.setAttribute("aria-label",label);
      input.oninput=()=>d.ratings[key]=input.value===""?null:Number(input.value);row.append(input);details.append(row);
    }form.append(details);
  }
  function note(form,d,label){const row=el("label",label),input=el("textarea");input.rows=2;input.maxLength=600;input.value=d.note;input.setAttribute("aria-label",label);input.oninput=()=>{d.note=input.value;};row.append(input);form.append(row);}
  function checkin(next,open=false,inquiryId=null){
    const reflection=next.supportCycle?.inquiry?.basis==='exploration_comparison';
    const d=draft(`${owner}:${next.scopeKey}:need`),details=el("details");details.open=open;
    details.className="support-need-entry";details.append(el("summary","这一步需要什么帮助？"));
    const form=el("form"),list=el("div"),other=el('select');list.className='support-primary-needs';
    const primary=reflection?{clarify_concept:'解释其中一个概念',reflection:'整理刚才的发现'}:{concept:needs.concept,monitoring:needs.monitoring};
    choices(list,primary,d.need,v=>{d.need=v;other.value='';});form.append(list);
    const label=el('label','其他方面');other.setAttribute('aria-label','其他需要');
    const blank=el('option','选择其他需要（可选）');blank.value='';other.append(blank);
    for(const [value,text]of Object.entries(needs).filter(([k])=>!['concept','monitoring','clarify_concept','reflection','none'].includes(k))){const option=el('option',text);option.value=value;other.append(option);}
    other.value=Object.hasOwn(primary,d.need)?'':d.need;other.onchange=()=>{d.need=other.value;for(const b of list.querySelectorAll('button'))b.setAttribute('aria-pressed','false');};label.append(other);form.append(label);
    const extra=el('details');extra.append(el('summary','补充一句（选填）'));note(extra,d,"想补充的目标或困难");form.append(extra);
    const submit=el("button","开始帮助");submit.type="submit";submit.className='support-primary-action';submit.disabled=busy;form.append(submit);
    form.onsubmit=e=>{e.preventDefault();if(!d.need){error="请先选择当前需要。";global.KnowledgeAssistant.refreshSupportSurface();return;}request({action:"report",confirmed:true,need:d.need,note:d.note,ratings:d.ratings,...(inquiryId?{inquiryId}: {})});};
    details.append(form);return details;
  }
  function feedback(next,c){
    const d=draft(`${owner}:${c.id}:feedback`),details=el("details");details.append(el("summary","反馈与下一步"));
    const form=el("form"),result=el("div");
    choices(result,{helped:"有帮助",not_helped:"暂时没帮助",mismatch:"没有对上我的需要",prefer_stop:"我想停止本轮帮助"},d.result,v=>d.result=v);form.append(result);
    const perceived=el("details");perceived.append(el("summary","你感受到的主要帮助（可不选）"));const options=el("div");choices(options,goalNames,d.perceivedGoal,v=>d.perceivedGoal=v);perceived.append(options);form.append(perceived);
    const extra=el('details');extra.append(el('summary','补充说明（选填）'));note(extra,d,"具体哪里有用或不合适（可不填）");selfRatings(extra,d);form.append(extra);
    if(c.rounds<=Number(c.profile?.supportFollowups||0)){
      const follow=button(d.requestMore?'已选择：我还需要一次补充帮助':'我还需要帮助，请稍后再补充一次',()=>{d.requestMore=!d.requestMore;follow.textContent=d.requestMore?'已选择：我还需要一次补充帮助':'我还需要帮助，请稍后再补充一次';follow.setAttribute('aria-pressed',String(d.requestMore));});follow.setAttribute('aria-pressed',String(d.requestMore));form.append(follow,el('p','保存反馈后才会安排补充；仍会等待所选间隔和合适的任务边界。'));
    }else{d.requestMore=false;form.append(el('p','本轮不再追加帮助。你可以继续自己尝试，之后仍可重新求助。'));}
    const submit=el("button","保存反馈");submit.type="submit";submit.disabled=busy;form.append(submit);
    form.onsubmit=e=>{e.preventDefault();if(!d.result){error="请选择反馈。";global.KnowledgeAssistant.refreshSupportSurface();return;}request({action:"feedback",id:c.id,...d});};details.append(form);return details;
  }
  function content(next,c){
    const section=el("section");section.className="support-goal-message";section.dataset.supportCycleId=c.id;
    const header=el("header");header.append(el("strong","先试这一步"));section.append(header);
    const body=el("div");body.dataset.supportBody=c.id;body.append(el("p",c.content.message),el("p",c.content.nextStep));
    // This content exists only after the learner has confirmed a need. A1 has
    // already been satisfied; D4 alone controls whether this body is folded.
    if(next.view.format==="disclosure") {const details=el("details");details.append(el("summary","查看这条帮助"),body);section.append(details);}
    else if(next.view.format==="steps") {const parts=c.content.message.split(/(?<=[。！？])\s*/).filter(Boolean);let index=0;const p=el("p",parts[0]||c.content.message);p.dataset.supportBody=c.id;const more=button("继续阅读",()=>{index++;p.textContent=parts.slice(0,index+1).join("");if(index>=parts.length-1){more.hidden=true;section.append(el("p",c.content.nextStep));}});section.append(p,more);}
    else{if(next.view.format==="bubble")body.setAttribute("role","note");section.append(body);}
    section.append(el("small",c.content.audit.fallback?"课程提示":"知点 · 智能体老师"));
    const actions=el("footer");if(c.status==="offered")actions.append(button("我先试一试",()=>request({action:"accept",id:c.id})));
    actions.append(button("结束这轮帮助",()=>request({action:"close",id:c.id})));
    const nextSteps=feedback(next,c);nextSteps.append(button("做一次独立检查",()=>request({action:"start_check",id:c.id})));
    const provenance=el('details');provenance.className='support-inquiry-evidence';provenance.append(el('summary','讲解信息'),el('p',`这次主要帮助你${({cognitive:'理解概念与步骤',metacognitive:'检查理解、调整方法',motivational:'找到学习的价值与信心',emotional:'缓解学习中的紧张',behavioral:'安排接下来的学习'})[c.plan.primaryGoal]}。${c.content.audit.fallback?'当前使用课程内的讲解。':'由智能体老师根据当前任务生成。'}`));
    section.append(actions,nextSteps,provenance);return section;
  }
  function render(next){
    sync(next);const root=el("section");root.className="support-cycle";
    if(!next.researchControls?.enabled||next.unitType!=="knowledge"||next.locked||next.check||next.taskReady===false)return root;
    const c=next.supportCycle;
    if(c?.status==="awaiting_confirmation"){
      if(deferInquiry(c))return root;
      presentedInquiries.add(c.id);
      const card=el("section");card.className="support-goal-message support-inquiry";
      const reflection=c.inquiry.basis==='exploration_comparison';
      const body=el("div");body.dataset.supportBody=c.id;
      const focuses={'GH-01-K01':'输入与输出的对应关系','GH-01-K02':'横坐标和纵坐标的位置','GH-01-K03':'从左到右的上升、下降方向','GH-02-K01':'输入靠近时输出的趋势','GH-02-K02':'左边和右边分别趋向哪里','GH-02-K03':'函数值与极限是否相等'};
      const focus=focuses[next.scopeKey]||'这一步的解法';
      body.append(el('p',reflection?`你已经比较了几个不同状态。我可以带你整理${focus}。`:c.inquiry.basis==='repeated_task_failures'?`刚才连续两次尝试还没成功。我可以带你检查${focus}。`:`前面的检测里还有需要巩固的地方。我可以带你看懂${focus}。`));
      const actions=el('footer'),start=button(reflection?'请老师带我整理':'请老师讲一下',()=>request({action:'report',confirmed:true,need:reflection?'reflection':'concept',inquiryId:c.id}));start.className='support-primary-action';
      actions.append(start,button('我先自己试',()=>request({action:'decline',id:c.id})));
      const more=checkin(next,false,c.id);more.querySelector('summary').textContent='我需要其他帮助';
      more.append(button('两分钟后再提醒',()=>request({action:'postpone',id:c.id})));
      card.append(body,actions,more);root.append(card);
    }else if(c?.status==="awaiting_check"){
      root.append(el("h4","独立检查"),el("p","提示和对话已暂停。也可以跳过，不会把跳过记成答错。"),el("p",c.check.prompt));
      const d=draft(`${owner}:${c.id}:check`),list=el("div");choices(list,Object.fromEntries(c.check.options.map(o=>[o.value,o.label])),d.response,v=>d.response=v);root.append(list);
      root.append(button("提交独立检查",()=>request({action:"submit_check",id:c.id,checkId:c.check.id,response:d.response})),button("跳过检查",()=>request({action:"skip_check",id:c.id,checkId:c.check.id})));
    } else {
      if(c?.content&&["offered","engaged"].includes(c.status))root.append(content(next,c));
      else if(c&&["queued","postponed"].includes(c.status)){
        const reason = c.lastGate === "waiting_for_boundary" ? "完成手上的操作后，老师会接着讲。" : c.lastGate === "waiting_for_due_time" ? "稍后继续这次讲解。" : "老师正在准备这一步的讲解…";
        root.append(el("p",reason),button("结束这轮帮助",()=>request({action:"close",id:c.id})));
      }else if(c?.checkResult)root.append(el("p",c.checkResult.correct===null?"本次独立检查已跳过。":c.checkResult.correct?"这次独立检查回答正确。本轮帮助已结束。":"这次独立检查尚未答对。本轮已结束，你可以重新选择需要的帮助。"));
      else if(c?.status === "expired") root.append(el("p",c.lastGate === "context_changed" ? "学习位置已变化，这次未交付的帮助已取消。需要时可在当前任务重新求助。" : "这次帮助未在有效时限内交付，或设置已变化；没有记为已收到。需要时可重新选择帮助。"));
      else if(c?.closeReason==="need_unresolved")root.append(el("p","暂时不确定也没关系。可以补充一句你卡住的地方，或先继续探索。"));
      if(manualScope===next.scopeKey)root.append(checkin(next,true),button('收起求助入口',()=>{manualScope="";global.KnowledgeAssistant.refreshSupportSurface();}));
    }
    const status=el("p",busy?"老师正在准备，请稍候…":error);status.setAttribute("role","status");if(!busy&&!error)status.hidden=true;root.append(status);
    for(const details of root.querySelectorAll('details')){
      const key=`${owner}:${next.scopeKey}:${c?.id||'need'}:${details.querySelector('summary')?.textContent}`;
      if(opened.has(key))details.open=opened.get(key);
      details.addEventListener('toggle',()=>opened.set(key,details.open));
    }
    return root;
  }
  function expose(c,receipt={visibleDurationMs:1000,fraction:.5}){
    const key=c&&`${c.id}:${c.rounds}`;
    const inquiry=c?.status==="awaiting_confirmation";
    if(!c || (inquiry?c.inquiry?.exposure:c.exposure) || sentExposure.has(key)||busy||!snapshot?.active||snapshot.locked)return;
    sentExposure.add(key);
    global.KnowledgeAssistant.supportCycleRequest({action:inquiry?"inquiry_exposed":"exposed",id:c.id,round:c.rounds,visibleMs:Math.floor(receipt.visibleDurationMs),visibleFraction:Math.min(1,receipt.fraction)}).catch(()=>{sentExposure.delete(key);exposureMonitor?.forget(key);});
  }
  function observe(){
    if(!exposureMonitor)exposureMonitor=global.ProactiveExposure?.createMonitor({onQualified:receipt=>{const c=snapshot?.supportCycle;if(c&&receipt.key===`${c.id}:${c.rounds}`)expose(c,receipt);}});
    if(!exposureMonitor)return;
    const stop=()=>exposureMonitor.clear();
    const c=snapshot?.supportCycle,inquiry=c?.status==="awaiting_confirmation";if(!c||(!inquiry&&!c.content)||(inquiry?c.inquiry.exposure:c.exposure)||!['awaiting_confirmation','offered','engaged'].includes(c.status)||document.hidden){stop();return;}
    const n=[...document.querySelectorAll('[data-support-body]')].find(n=>n.dataset.supportBody===c.id&&!n.closest("details:not([open])")&&n.getClientRects().length);
    if(!n){stop();return;}
    exposureMonitor.watch(n,{key:`${c.id}:${c.rounds}`,valid:()=>!busy&&snapshot?.active&&!snapshot.locked&&!snapshot.check&&snapshot.supportCycle?.id===c.id&&snapshot.supportCycle.rounds===c.rounds&&!n.closest('details:not([open])')});
  }
  global.SupportCycleUI=Object.freeze({render,sync,active,deferInquiry,goalNames,strategyNames,needs,statuses,expose,
    manualOpen:next=>manualScope===next.scopeKey,
    openManual(){if(!snapshot||snapshot.locked||snapshot.check||global.LearnerSetup?.enrollment?.experiencePolicy)return;manualScope=snapshot.scopeKey;global.KnowledgeAssistant.refreshSupportSurface();global.TaskSupport?.locate?.();},
    get busy(){return busy;},get interactionBusy(){return interactionBusy();}});
  document.addEventListener('pointerdown',()=>{pointerBusy=true;},true);
  const releaseInteraction=()=>{pointerBusy=false;if(snapshot?.supportCycle?.status==='awaiting_confirmation')setTimeout(()=>global.KnowledgeAssistant.refreshSupportSurface(),0);};
  document.addEventListener('pointerup',releaseInteraction,true);document.addEventListener('pointercancel',releaseInteraction,true);
  global.addEventListener('message',e=>{if(e.data?.type!=='cq:interaction-busy')return;const frame=[...document.querySelectorAll('iframe[data-courseware-frame]')].find(f=>f.contentWindow===e.source&&f.getClientRects().length);if(!frame)return;if(e.data.busy===true)pointerBusy=true;else releaseInteraction();});
  global.addEventListener('blur',releaseInteraction);
  global.addEventListener('cq:lesson-rendered',releaseInteraction);
  document.addEventListener('focusout',()=>{if(snapshot?.supportCycle?.status==='awaiting_confirmation')setTimeout(()=>global.KnowledgeAssistant.refreshSupportSurface(),0);},true);
  global.addEventListener("cq:proactive-state",e=>{sync(e.detail);requestAnimationFrame(observe);});
  global.addEventListener("scroll",observe,true);global.addEventListener("resize",observe);document.addEventListener("visibilitychange",observe);
  document.addEventListener("toggle",observe,true);
  setInterval(()=>{
    const s=snapshot,c=s?.supportCycle;
    if(busy||interactionBusy()||!s?.active||!s.signedIn||s.locked||s.check||document.hidden||Date.now()-lastPoll<10000||!c||!["awaiting_confirmation","queued","postponed"].includes(c.status))return;
    lastPoll=Date.now();request({action:"advance"});
  },5000);
})(window);
