(function (global) {
  "use strict";
  const goalNames = { cognitive:"弄清概念和步骤",metacognitive:"检查理解、安排下一步",motivational:"找到继续学习的理由",emotional:"缓一缓再继续",behavioral:"安排学习、选择资料" };
  const strategyNames = {concept_hint:"给一个线索",counterexample:"看一个不符合条件的例子",self_check:"核对自己的理解",plan_monitor:"定一个小目标并检查进展",value_connection:"联系你在意的用途",progress_feedback:"回看已经完成的小进步",cost_reduction:"先做更小的一步",acknowledge_reframe:"一起看看这次困难",calm_choice:"选择继续或休息",study_plan:"安排接下来几分钟",resource_navigation:"找到合适的课件或提问入口"};
  const needs = {concept:"概念或步骤没弄懂",monitoring:"不知道自己是否理解",clarify_concept:"想解释其中一个概念",reflection:"想整理刚才的探索发现",value:"不清楚学这个有什么用",confidence:"担心自己学不会",cost:"现在觉得投入太多",frustration:"有些挫败或紧张",planning:"不知道接下来怎么安排",uncertain:"暂时说不清",none:"暂时不需要帮助"};
  const statuses = {queued:"等待合适时机",offered:"已提供支持",engaged:"由你继续尝试",awaiting_check:"独立检查中",postponed:"稍后再说",closed:"本轮已结束",expired:"需要已过期，请重新确认"};
  let owner="", snapshot=null, busy=false, error="", lastPoll=0, exposureMonitor=null, manualScope="";
  let requestSequence=0, pendingAction="";
  const drafts=new Map(), sentExposure=new Set(), opened=new Map(), presentedInquiries=new Set();
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  statuses.awaiting_confirmation="知点在等你选择";
  let pointerBusy=false;
  const interactionBusy=()=>pointerBusy||global.TaskSupport?.interactionBusy||Boolean(document.activeElement?.matches('textarea,input:not([type=button]):not([type=checkbox]):not([type=range]),[contenteditable=true]'));
  const deferInquiry=c=>Boolean(c?.status==='awaiting_confirmation'&&!presentedInquiries.has(c.id)&&interactionBusy());
  const active=c=>c&&["awaiting_confirmation","queued","offered","engaged","awaiting_check","postponed"].includes(c.status);
  const draftStorageKey=()=>`calculus-support-drafts-r12:${encodeURIComponent(owner)}`;
  function persistDrafts(){try{if(owner)localStorage.setItem(draftStorageKey(),JSON.stringify([...drafts].slice(-60)));}catch{}}
  function draft(key){if(!drafts.has(key))drafts.set(key,{need:"",note:"",ratings:{},result:"",perceivedGoal:null,requestMore:false});return drafts.get(key);}
  function sync(next){
    const identity=next.ownerKey?`${next.ownerKey}:${next.learningGeneration??next.generation}:${next.runId||''}`:'';
    if(identity!==owner){owner=identity;requestSequence++;drafts.clear();sentExposure.clear();opened.clear();presentedInquiries.clear();busy=false;error="";lastPoll=0;exposureMonitor?.clear({forget:true});
      try{const saved=JSON.parse(localStorage.getItem(draftStorageKey())||'[]');if(Array.isArray(saved))for(const [key,value] of saved.slice(-60))if(typeof key==='string'&&key.startsWith(owner+':')&&value&&typeof value==='object')drafts.set(key,value);}catch{}
    }
    if(next.supportCycle?.checkResult){drafts.delete(`${owner}:${next.supportCycle.id}:check:${next.supportCycle.checkResult.checkId}`);persistDrafts();}
    if(snapshot?.scopeKey!==next.scopeKey||snapshot?.sceneType!==next.sceneType||snapshot?.ownerKey!==next.ownerKey||next.locked||next.check)manualScope="";
    snapshot=next;
  }
  async function request(command){
    if(busy&&command.action!=='close')return false;
    const sequence=++requestSequence;
    busy=true;pendingAction=command.action==='feedback'&&command.requestMore?'followup':command.action;error="";global.KnowledgeAssistant.refreshSupportSurface();
    const startOwner=owner;
    try {await global.KnowledgeAssistant.supportCycleRequest(command);if(startOwner===owner){
      if(command.action==='report')drafts.delete(`${owner}:${snapshot.scopeKey}:need`);
      if(command.action==='feedback')drafts.delete(`${owner}:${command.id}:feedback`);
      if(['submit_check','skip_check'].includes(command.action))drafts.delete(`${owner}:${command.id}:check:${command.checkId}`);
      persistDrafts();if(command.action==='close'){manualScope='';global.TaskSupport?.leaveConversation();global.KnowledgeAssistant.finishTaskDiscussion();}
    }return startOwner===owner&&sequence===requestSequence;}
    catch(e){if(startOwner===owner&&sequence===requestSequence)error=e.message;return false;}
    finally{if(startOwner===owner&&sequence===requestSequence){busy=false;pendingAction="";global.KnowledgeAssistant.refreshSupportSurface();}}
  }
  function button(label,fn){const b=el("button",label);b.type="button";b.disabled=busy;b.onclick=fn;return b;}
  // Records when the learner opens the agent's reasoning and for how long it
  // stays open. Re-renders replace the element without counting a new view.
  const reasoningViews=new Map();
  function logReasoning(type,data){if(typeof trackLearningEvent==='function')trackLearningEvent(type,data,false).catch(()=>{});}
  function closeReasoning(key,endedBy){
    const v=reasoningViews.get(key);if(!v)return;reasoningViews.delete(key);
    const now=Date.now(),hidden=v.hiddenMs+(v.hiddenAt?now-v.hiddenAt:0);
    logReasoning('proactive_reasoning_closed',{...v.context,openMs:now-v.openedAt,visibleOpenMs:Math.max(0,now-v.openedAt-hidden),endedBy});
  }
  document.addEventListener('visibilitychange',()=>{const now=Date.now();for(const v of reasoningViews.values()){if(document.hidden)v.hiddenAt=now;else if(v.hiddenAt){v.hiddenMs+=now-v.hiddenAt;v.hiddenAt=0;}}});
  global.addEventListener('pagehide',()=>{for(const key of [...reasoningViews.keys()])closeReasoning(key,'page_hidden');});
  setInterval(()=>{if(!reasoningViews.size)return;const open=new Set([...document.querySelectorAll('details.support-reasoning[open]')].map(n=>n.dataset.reasoningKey));for(const key of [...reasoningViews.keys()])if(!open.has(key))closeReasoning(key,'panel_closed');},2000);
  function reasoningDetails({key,summary='知点为什么现在出现？',lines,context}){
    const box=el('details');box.className='support-reasoning';box.dataset.reasoningKey=key;box.dataset.supportReasoning=context.surface;
    box.append(el('summary',summary));const list=el('ul');for(const line of lines.filter(Boolean))list.append(el('li',line));box.append(list);
    if(reasoningViews.has(key))box.open=true;
    box.addEventListener('toggle',()=>{
      if(box.open&&!reasoningViews.has(key)){reasoningViews.set(key,{openedAt:Date.now(),hiddenMs:0,hiddenAt:0,context});logReasoning('proactive_reasoning_opened',context);}
      else if(!box.open&&box.isConnected)closeReasoning(key,'learner_closed');
    });
    return box;
  }
  function cycleReasoning(next,c,surface){
    const inquiry=c.inquiry,agent=c.initiation==='agent_initiated_confirmation';
    const evidence=agent&&inquiry?.text?`依据：${inquiry.text}${inquiry.sources?.length?`（参考了 ${inquiry.sources.length} 条学习记录）`:''}`:c.need?.need?`依据：你选择了“${needs[c.need.need]||c.need.need}”。`:null;
    const lines=[evidence,agent&&inquiry?.boundary?'时机：等你完成当前这一步（提交或切换）后才出现，没有打断正在进行的操作。':null];
    if(surface==='support_inquiry')lines.push('接下来：是否需要帮助由你决定；不回答不会被当作同意。选“我先自己试”后，知点会暂停询问这个知识点一段时间。');
    else{
      if(c.plan)lines.push(`这次帮助：${goalNames[c.plan.primaryGoal]||'学习支持'}${strategyNames[c.plan.strategy]?'，采用“'+strategyNames[c.plan.strategy]+'”':''}。`);
      lines.push(c.content?.audit?.fallback?'内容来源：课程内预先写好的讲解。':'内容来源：知点根据当前任务即时生成，可能出错，请结合课件自己核对。');
    }
    return reasoningDetails({key:`${owner}:${c.id}:${surface}`,summary:surface==='support_inquiry'?'知点为什么现在出现？':'这次帮助是怎样决定的？',lines,
      context:{surface,cycleId:c.id,round:c.rounds||0,scope:next.scopeKey,sceneType:next.sceneType||'',basis:inquiry?.basis||null,initiation:c.initiation||null}});
  }
  function choices(container, options, selected, choose) {
    for(const [value,label] of Object.entries(options)){
      const b=button(label,()=>{choose(value);persistDrafts();for(const n of container.querySelectorAll("button"))n.setAttribute("aria-pressed",String(n===b));});
      b.setAttribute("aria-pressed",String(selected===value));container.append(b);
    }
  }
  function selfRatings(form,d){
    const details=el("details");details.append(el("summary","补充此刻的感受（可不填）"));
    for(const [key,label] of Object.entries({value:"觉得值得学",confidence:"有信心完成",cost:"觉得负担大",tension:"感到紧张或挫败"})){
      const row=el("label",`${label}：0（完全没有）–4（非常强）`), input=el("input");
      input.type="number";input.min="0";input.max="4";input.step="1";input.value=d.ratings[key]??"";input.setAttribute("aria-label",label);
      input.oninput=()=>{d.ratings[key]=input.value===""?null:Number(input.value);persistDrafts();};row.append(input);details.append(row);
    }form.append(details);
  }
  function note(form,d,label){const row=el("label",label),input=el("textarea");input.rows=2;input.maxLength=600;input.value=d.note;input.setAttribute("aria-label",label);input.oninput=()=>{d.note=input.value;persistDrafts();};row.append(input);form.append(row);}
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
    other.value=Object.hasOwn(primary,d.need)?'':d.need;other.onchange=()=>{d.need=other.value;persistDrafts();for(const b of list.querySelectorAll('button'))b.setAttribute('aria-pressed','false');};label.append(other);form.append(label);
    const extra=el('details');extra.append(el('summary','补充一句（选填）'));note(extra,d,"想补充的目标或困难");form.append(extra);
    const submit=el("button","开始帮助");submit.type="submit";submit.className='support-primary-action';submit.disabled=busy;form.append(submit);
    form.onsubmit=e=>{e.preventDefault();if(!d.need){error="请先选择当前需要。";global.KnowledgeAssistant.refreshSupportSurface();return;}request({action:"report",confirmed:true,need:d.need,note:d.note,ratings:d.ratings,...(inquiryId?{inquiryId}: {})});};
    details.append(form);return details;
  }
  function feedback(next,c){
    const d=draft(`${owner}:${c.id}:feedback`),section=el('section');section.className='support-next-step';
    section.append(el('h5','看过之后，接下来怎么做？'));
    const actions=el('div');actions.className='support-message-actions';
    actions.append(button('有帮助，我先自己试',()=>request({action:'feedback',id:c.id,result:'helped',requestMore:false,note:d.note})));
    if(c.rounds<=Number(c.profile?.supportFollowups||0))actions.append(button('还没弄懂，再讲一步',()=>request({action:'feedback',id:c.id,result:'not_helped',requestMore:true,note:d.note})));
    actions.append(button('结束这次帮助',()=>request({action:'close',id:c.id})));
    const extra=el('details');extra.append(el('summary','补充一句（选填）'));note(extra,d,'哪里有用，或哪里还没弄懂');section.append(actions,extra);return section;
  }
  function activity(c,onCommand){
    const a=c.content.activity;if(!a||a.version!=="support-activity-r10-v1")return null;
    const state=c.activityState?.activityId===a.id?c.activityState:{viewed:[],checked:[],selected:null,delta:null,skipped:false};
    const box=el('section');box.className='support-activity';box.dataset.supportActivity=a.kind;box.setAttribute('aria-label',a.title);
    const heading=el('h5',a.title);box.append(heading,el('p',a.intro));
    const send=command=>onCommand?onCommand({activityId:a.id,...command}):request({action:'activity',id:c.id,round:c.rounds,activityId:a.id,...command});
    if(state.skipped){box.append(el('p','已保留文字说明，你可以回到课件继续。'));return box;}
    if(a.kind==='range'){
      const label=el('label','本例输入范围半径δ'),slider=el('input'),read=el('output');slider.type='range';slider.min=a.range.min;slider.max=a.range.max;slider.step=a.range.step;slider.value=state.delta??a.range.initial;slider.setAttribute('aria-label','帮助例子的输入范围半径');
      const show=()=>{read.textContent=`δ=${Number(slider.value)}，范围内输出误差小于${Number((Number(slider.value)*a.range.multiplier).toFixed(4))}。目标是小于${a.range.epsilon}。`;};
      slider.oninput=show;slider.onchange=()=>send({operation:'range',value:Number(slider.value)});label.append(slider,read);box.append(label);show();
      if(state.feedback){const p=el('p',state.feedback);p.setAttribute('role','status');box.append(p);}
    }else{
      const controls=el('div');controls.className='support-activity-options';
      for(const item of a.items){const selected=a.kind==='checklist'?state.checked.includes(item.id):state.selected===item.id;
        const b=button(item.label,()=>send({operation:a.kind==='checklist'?'toggle':'select',itemId:item.id}));b.setAttribute('aria-pressed',String(selected));controls.append(b);
      }box.append(controls);
      const item=a.items.find(item=>item.id===state.selected);if(item){const p=el('p',item.body);p.className='support-activity-detail';p.setAttribute('role','status');box.append(p);}
      if(a.kind==='checklist'&&state.checked.length)box.append(el('p',`你已检查 ${state.checked.length} 项，可以回到题目继续尝试。`));
    }
    box.append(button('暂不操作，保留文字说明',()=>send({operation:'skip'})));return box;
  }
  function content(next,c){
    const section=el("section");section.className="support-goal-message";section.dataset.supportCycleId=c.id;
    const header=el("header");header.className='support-message-heading';header.append(el("strong","知点 · 先试这一步"));if(c.rounds>1)header.append(el('small',`第 ${c.rounds} 轮`));section.append(header);
    const body=el("div");body.dataset.supportBody=c.id;body.append(el("p",c.content.message),el("p",c.content.nextStep));const interactive=activity(c);if(interactive)body.append(interactive);
    // This content exists only after the learner has confirmed a need. A1 has
    // already been satisfied; D4 alone controls whether this body is folded.
    if(next.view.format==="disclosure") {const details=el("details");details.append(el("summary",c.status==="engaged"?"再看这条帮助":"查看这条帮助"),body);section.append(details);}
    else if(next.view.format==="steps") {const parts=c.content.message.split(/(?<=[。！？])\s*/).filter(Boolean),reading=draft(`${owner}:${c.id}:${c.rounds}:reading`);let index=Math.min(reading.index||0,Math.max(0,parts.length-1));const p=el("p",parts.slice(0,index+1).join("")||c.content.message);p.dataset.supportBody=c.id;const reveal=()=>{section.append(el("p",c.content.nextStep));if(interactive)section.append(interactive);};const more=button("继续阅读",()=>{index++;reading.index=index;p.textContent=parts.slice(0,index+1).join("");if(index>=parts.length-1){more.hidden=true;reveal();}});section.append(p,more);if(index>=parts.length-1){more.hidden=true;reveal();}}
    else{if(next.view.format==="bubble")body.setAttribute("role","note");section.append(body);}
    const actions=el("footer");actions.className='support-message-actions';
    const check=button("做一次独立检查",()=>request({action:"start_check",id:c.id}));check.title='一道同知识点的新小题；作答时帮助先收起，只记录一次，不计成绩。';
    if(c.status==="offered"){const accept=button("我先试一试",()=>request({action:"accept",id:c.id}));accept.className='support-primary-action';actions.append(accept,check);}
    else{check.className='support-primary-action';actions.append(check);}
    const close=button("结束这轮帮助",()=>request({action:"close",id:c.id}));close.className='support-quiet-action';actions.append(close);
    const hint=el('small','独立检查：一道同知识点的新小题，帮助先收起；只记录首次结果，不计成绩。');hint.className='support-action-hint';
    section.append(actions,hint,cycleReasoning(next,c,'support_content'),feedback(next,c));return section;
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
      const heading=el('header');heading.className='support-message-heading';heading.append(el('strong','知点 · 要不要一起看看？'));
      const body=el("div");body.dataset.supportBody=c.id;
      const focuses={'GH-01-K01':'输入与输出的对应关系','GH-01-K02':'横坐标和纵坐标的位置','GH-01-K03':'从左到右的上升、下降方向','GH-02-K01':'输入靠近时输出的趋势','GH-02-K02':'左边和右边分别趋向哪里','GH-02-K03':'函数值与极限是否相等'};
      const focus=focuses[next.scopeKey]||'这一步的解法';
      body.append(el('p',reflection?`你已经比较了几个不同状态。我可以带你整理${focus}。`:c.inquiry.basis==='repeated_task_failures'?`刚才连续两次尝试还没成功。我可以带你检查${focus}。`:`前面的检测里还有需要巩固的地方。我可以带你看懂${focus}。`));
      const actions=el('footer'),start=button(reflection?'请知点带我整理':'请知点讲一下',()=>request({action:'report',confirmed:true,need:reflection?'reflection':'concept',inquiryId:c.id}));start.className='support-primary-action';
      actions.append(start,button('我先自己试',()=>request({action:'decline',id:c.id})));
      const more=checkin(next,false,c.id);more.querySelector('summary').textContent='我需要其他帮助';
      more.append(button('两分钟后再提醒',()=>request({action:'postpone',id:c.id})));
      card.append(heading,body,actions,cycleReasoning(next,c,'support_inquiry'),more);root.append(card);
    }else if(c?.status==="awaiting_check"){
      root.dataset.independentCheck='true';
      root.append(el("h4","独立检查"),el("p","提示和对话已暂停。也可以跳过，不会把跳过记成答错。"),el("p",c.check.prompt));
      if(c.check.figure&&typeof renderAssessmentFigure==='function'){const figure=el('div');figure.innerHTML=renderAssessmentFigure(c.check.figure);if(figure.childNodes.length)root.append(figure);}
      const d=draft(`${owner}:${c.id}:check:${c.check.id}`),list=el("div");choices(list,Object.fromEntries(c.check.options.map(o=>[o.value,o.label])),d.response,v=>d.response=v);root.append(list);
      root.append(el('p','这是独立练习，提交后保留首次结果；不会要求答对才能继续学习。'));
      root.append(button("提交独立检查",()=>{if(!d.response){error='请先选择一个回答。';global.KnowledgeAssistant.refreshSupportSurface();return;}request({action:"submit_check",id:c.id,checkId:c.check.id,response:d.response});}),button("跳过检查",()=>request({action:"skip_check",id:c.id,checkId:c.check.id})));
    } else {
      if(c?.content&&["offered","engaged"].includes(c.status))root.append(content(next,c));
      else if(c&&["queued","postponed"].includes(c.status)){
        const reason = c.lastGate === "waiting_for_boundary" ? "完成手上的操作后，知点会接着讲。" : c.lastGate === "waiting_for_due_time" ? "稍后继续这次讲解。" : "知点正在准备这一步的讲解…";
        const seconds=Math.max(0,Math.ceil((Date.parse(c.dueAt||'')-Date.now())/1000));
        root.append(el('strong',c.rounds?'已安排补充帮助':'正在准备帮助'),el('p',seconds>0?`按照你的提醒间隔，约 ${seconds} 秒后，在你完成当前操作时继续。`:reason));
        root.append(button('现在直接问知点',async()=>{if(!await request({action:'close',id:c.id}))return;global.TaskSupport?.openConversation();global.KnowledgeAssistant.askInTask('我想现在接着讨论刚才没弄懂的地方。请用一个具体步骤解释。');}),button('取消这次安排',()=>request({action:'close',id:c.id})));

      }else if(c?.checkResult){ /* Saved results are rendered by the shared feedback/history view. */ }
      else if(c?.status === "expired") root.append(el("p",c.lastGate === "context_changed" ? "学习位置已变化，这次未交付的帮助已取消。需要时可在当前任务重新求助。" : "这次帮助未在有效时限内交付，或设置已变化；没有记为已收到。需要时可重新选择帮助。"));
      else if(c?.closeReason==="need_unresolved")root.append(el("p","暂时不确定也没关系。可以补充一句你卡住的地方，或先继续探索。"));
      if(manualScope===next.scopeKey)root.append(checkin(next,true),button('收起求助入口',()=>{manualScope="";global.KnowledgeAssistant.refreshSupportSurface();}));
    }
    const generating=busy&&['report','advance','followup'].includes(pendingAction);
    const status=el("p",busy?(generating?"知点正在准备，请稍候…":pendingAction==='close'?"正在结束这轮帮助…":"正在保存，请稍候…"):error);status.setAttribute("role","status");if(!busy&&!error)status.hidden=true;root.append(status);
    if(generating&&active(c)&&c.status!=='awaiting_check'){
      const cancel=button('取消讲解，继续学习',()=>request({action:'close',id:c.id}));cancel.disabled=false;root.append(cancel);
    }
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
  global.SupportCycleUI=Object.freeze({render,sync,active,deferInquiry,goalNames,strategyNames,needs,statuses,expose,reasoningDetails,
    startCheck:c=>request({action:'start_check',id:c.id}),
    renderActivity:(descriptor,state,send)=>activity({content:{activity:descriptor},activityState:state},send),
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
