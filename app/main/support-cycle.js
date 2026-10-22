(function (global) {
  "use strict";
  const goalNames = { cognitive:"认知与知识建构",metacognitive:"元认知与学习调节",motivational:"动机支持",emotional:"情绪调节支持",behavioral:"学习行为与资源管理" };
  const strategyNames = {concept_hint:"概念线索",counterexample:"反例辨析",self_check:"把握与自检",plan_monitor:"计划与监控",value_connection:"个人价值联系",progress_feedback:"基于证据的信心支持",cost_reduction:"降低感知负担",acknowledge_reframe:"承认困难与重新理解失败",calm_choice:"继续或暂停的选择",study_plan:"短时学习计划",resource_navigation:"资源与求助路径"};
  const needs = {concept:"概念或步骤没弄懂",monitoring:"不知道自己是否理解",value:"不清楚学这个有什么用",confidence:"担心自己学不会",cost:"现在觉得投入太多",frustration:"有些挫败或紧张",planning:"不知道接下来怎么安排",uncertain:"暂时说不清",none:"暂时不需要帮助"};
  const statuses = {queued:"等待合适时机",offered:"已提供支持",engaged:"由你继续尝试",awaiting_check:"独立检查中",postponed:"稍后再说",closed:"本轮已结束",expired:"需要已过期，请重新确认"};
  let owner="", snapshot=null, busy=false, error="", lastPoll=0, exposureTimer=null, exposureKey="";
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
    if(identity!==owner){owner=identity;drafts.clear();sentExposure.clear();opened.clear();presentedInquiries.clear();busy=false;error="";lastPoll=0;clearTimeout(exposureTimer);exposureTimer=null;exposureKey="";}
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
    const d=draft(`${owner}:${next.scopeKey}:need`),details=el("details");details.open=open;
    details.className="support-need-entry";details.append(el("summary","这一步需要什么帮助？"));
    details.append(el("p","可以选择最接近的一项，也可以继续自己学。我们不会根据操作少就判断你不想学。"));
    const form=el("form"),list=el("div");choices(list,needs,d.need,v=>d.need=v);form.append(list);
    note(form,d,"补充一句你的目标或困难（可不填）");selfRatings(form,d);
    const submit=el("button","确认当前需要");submit.type="submit";submit.disabled=busy;form.append(submit);
    form.onsubmit=e=>{e.preventDefault();if(!d.need){error="请先选择当前需要。";global.KnowledgeAssistant.refreshSupportSurface();return;}request({action:"report",confirmed:true,need:d.need,note:d.note,ratings:d.ratings,...(inquiryId?{inquiryId}: {})});};
    details.append(form);return details;
  }
  function feedback(next,c){
    const d=draft(`${owner}:${c.id}:feedback`),details=el("details");details.append(el("summary","反馈这次帮助"));
    const form=el("form"),result=el("div");
    choices(result,{helped:"有帮助",not_helped:"暂时没帮助",mismatch:"没有对上我的需要",prefer_stop:"我想停止本轮帮助"},d.result,v=>d.result=v);form.append(result);
    const perceived=el("details");perceived.append(el("summary","你感受到的主要帮助（可不选）"));const options=el("div");choices(options,goalNames,d.perceivedGoal,v=>d.perceivedGoal=v);perceived.append(options);form.append(perceived);
    note(form,d,"具体哪里有用或不合适（可不填）");selfRatings(form,d);
    const follow=button(d.requestMore?"已选择：稍后再给一个建议":"需要时，稍后再给一个建议",()=>{d.requestMore=!d.requestMore;follow.textContent=d.requestMore?"已选择：稍后再给一个建议":"需要时，稍后再给一个建议";});follow.setAttribute("aria-pressed",String(d.requestMore));form.append(follow);
    const submit=el("button","保存反馈");submit.type="submit";submit.disabled=busy;form.append(submit);
    form.onsubmit=e=>{e.preventDefault();if(!d.result){error="请选择反馈。";global.KnowledgeAssistant.refreshSupportSurface();return;}request({action:"feedback",id:c.id,...d});};details.append(form);return details;
  }
  function content(next,c){
    const section=el("section");section.className="support-goal-message";section.dataset.supportCycleId=c.id;
    const header=el("header");header.append(el("strong",`知点 · ${goalNames[c.plan.primaryGoal]}`));section.append(header);
    const body=el("div");body.dataset.supportBody=c.id;body.append(el("p",c.content.message),el("p",c.content.nextStep));
    if(next.view.format==="disclosure" || c.profile.authorityLevel==="A1") {const details=el("details");details.append(el("summary","查看这条帮助"),body);section.append(details);}
    else if(next.view.format==="steps") {const parts=c.content.message.split(/(?<=[。！？])\s*/).filter(Boolean);let index=0;const p=el("p",parts[0]||c.content.message);p.dataset.supportBody=c.id;const more=button("继续阅读",()=>{index++;p.textContent=parts.slice(0,index+1).join("");if(index>=parts.length-1){more.hidden=true;section.append(el("p",c.content.nextStep));}});section.append(p,more);}
    else{if(next.view.format==="bubble")body.setAttribute("role","note");section.append(body);}
    section.append(el("small",c.content.audit.fallback?"当前为课程备用建议，未由实时模型生成。":"本次为 AI 生成建议，可纠正或拒绝；内容尚未经教师逐条审校。"));
    const actions=el("footer");if(c.status==="offered")actions.append(button("我先试一试",()=>request({action:"accept",id:c.id})));
    actions.append(button("稍后再说",()=>request({action:"postpone",id:c.id})),button("结束这轮帮助",()=>request({action:"close",id:c.id})),button("做一次独立检查",()=>request({action:"start_check",id:c.id})));
    section.append(actions,feedback(next,c));return section;
  }
  function render(next){
    sync(next);const root=el("section");root.className="support-cycle";
    if(!next.researchControls?.enabled||next.unitType!=="knowledge"||next.locked||next.check||next.taskReady===false)return root;
    const c=next.supportCycle;
    if(c?.status==="awaiting_confirmation"){
      if(deferInquiry(c))return root;
      presentedInquiries.add(c.id);
      const card=el("section");card.className="support-goal-message support-inquiry";
      const body=el("div");body.dataset.supportBody=c.id;body.append(el("strong","要不要一起看看刚才的问题？"),el("p",c.inquiry.text),el("p","这可能有不同原因。现在需要哪种帮助，由你来决定，也可以继续自己学。"));
      const actions=el("footer");actions.append(button("暂时不需要",()=>request({action:"decline",id:c.id})),button("稍后再问",()=>request({action:"postpone",id:c.id})));
      card.append(body,actions,checkin(next,false,c.id));root.append(card);
    }else if(c?.status==="awaiting_check"){
      root.append(el("h4","独立检查"),el("p","提示和对话已暂停。也可以跳过，不会把跳过记成答错。"),el("p",c.check.prompt));
      const d=draft(`${owner}:${c.id}:check`),list=el("div");choices(list,Object.fromEntries(c.check.options.map(o=>[o.value,o.label])),d.response,v=>d.response=v);root.append(list);
      root.append(button("提交独立检查",()=>request({action:"submit_check",id:c.id,checkId:c.check.id,response:d.response})),button("跳过检查",()=>request({action:"skip_check",id:c.id,checkId:c.check.id})));
    } else {
      if(c?.content&&["offered","engaged"].includes(c.status))root.append(content(next,c));
      else if(c&&["queued","postponed"].includes(c.status)){
        root.append(el("p",`${statuses[c.status]}。你可以继续学习；到时还会检查当前任务和提醒偏好。`),button("结束这轮帮助",()=>request({action:"close",id:c.id})));
      }else if(c?.checkResult)root.append(el("p",c.checkResult.correct===null?"本次独立检查已跳过。":c.checkResult.correct?"这次独立检查回答正确。本轮帮助已结束。":"这次独立检查尚未答对。本轮已结束，你可以重新选择需要的帮助。"));
      else if(c?.closeReason==="need_unresolved")root.append(el("p","暂时不确定也没关系。可以补充一句你卡住的地方，或先继续探索。"));
      root.append(checkin(next));
    }
    const status=el("p",busy?"正在处理，当前课件可以继续查看…":error);status.setAttribute("role","status");root.append(status);
    for(const details of root.querySelectorAll('details')){
      const key=`${owner}:${next.scopeKey}:${c?.id||'need'}:${details.querySelector('summary')?.textContent}`;
      if(opened.has(key))details.open=opened.get(key);
      details.addEventListener('toggle',()=>opened.set(key,details.open));
    }
    return root;
  }
  function expose(c){
    const key=c&&`${c.id}:${c.rounds}`;
    const inquiry=c?.status==="awaiting_confirmation";
    if(!c || (inquiry?c.inquiry?.exposure:c.exposure) || sentExposure.has(key)||busy||!snapshot?.active||snapshot.locked)return;
    sentExposure.add(key);
    global.KnowledgeAssistant.supportCycleRequest({action:inquiry?"inquiry_exposed":"exposed",id:c.id,round:c.rounds,visibleMs:1000,visibleFraction:.5}).catch(()=>sentExposure.delete(key));
  }
  function observe(){
    const stop=()=>{clearTimeout(exposureTimer);exposureTimer=null;exposureKey="";};
    const c=snapshot?.supportCycle,inquiry=c?.status==="awaiting_confirmation";if(!c||(!inquiry&&!c.content)||(inquiry?c.inquiry.exposure:c.exposure)||!['awaiting_confirmation','offered','engaged'].includes(c.status)||document.hidden){stop();return;}
    const n=[...document.querySelectorAll('[data-support-body]')].find(n=>n.dataset.supportBody===c.id&&!n.closest("details:not([open])")&&n.getClientRects().length);
    if(!n){stop();return;}
    const visible=()=>{const r=n.getBoundingClientRect();let left=Math.max(r.left,0),top=Math.max(r.top,0),right=Math.min(r.right,innerWidth),bottom=Math.min(r.bottom,innerHeight);for(let p=n.parentElement;p&&p!==document.body&&p!==document.documentElement;p=p.parentElement){const style=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right);}if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}}return n.isConnected&&!n.closest("details:not([open])")&&n.getClientRects().length&&r.width*r.height>0&&Math.max(0,right-left)*Math.max(0,bottom-top)/(r.width*r.height)>=.5;};
    if(!visible()){stop();return;}
    const key=`${c.id}:${c.rounds}`;if(exposureTimer&&exposureKey===key)return;
    stop();exposureKey=key;exposureTimer=setTimeout(()=>{exposureTimer=null;if(snapshot?.supportCycle?.id===c.id&&snapshot.supportCycle.rounds===c.rounds&&!document.hidden&&visible())expose(c);},1000);
  }
  global.SupportCycleUI=Object.freeze({render,sync,active,deferInquiry,goalNames,strategyNames,needs,statuses,expose,get busy(){return busy;},get interactionBusy(){return interactionBusy();}});
  document.addEventListener('pointerdown',()=>{pointerBusy=true;},true);
  const releaseInteraction=()=>{pointerBusy=false;if(snapshot?.supportCycle?.status==='awaiting_confirmation')setTimeout(()=>global.KnowledgeAssistant.refreshSupportSurface(),0);};
  document.addEventListener('pointerup',releaseInteraction,true);document.addEventListener('pointercancel',releaseInteraction,true);
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
