(function (global) {
  "use strict";
  let snapshot, owner = "", frame = null, channel = "", source = null, key = "", panel = null;
  let controls = new Map(), visibility = null, exposureTimer = null, exposed = new Set(), unavailable = false, revision = 0, serializedKey = "", replyContext = "";
  const drafts = new Map();
  const controlIds = new WeakMap();let nextControlId=0;
  let lastQuizSupport="";
  let quizOwner="";
  let workspaceHost=null, focusHelp=false, workspaceHelpKey="";
  function fitMini(){if(!workspaceHost?.isConnected)return;const stage=workspaceHost.querySelector('[data-knowledge-scene-stage],[data-resource-fullscreen-target]');if(!stage)return;const scale=Math.min(1,stage.clientWidth/1280);const value=String(scale);if(workspaceHost.style.getPropertyValue('--course-mini-scale')!==value)workspaceHost.style.setProperty('--course-mini-scale',value);}
  global.addEventListener('resize',()=>requestAnimationFrame(fitMini));
  const quizOpen=new Map(), quizReplies=new Map();
  const el = (tag, text, cls) => {const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const replyBody=text=>{const n=el('div',null,'assistant-content');if(global.AssistantContent)global.AssistantContent.renderInto(n,text);else n.textContent=text;return n;};
  function message(type, extra={}){frame?.contentWindow?.postMessage({type,channel,...extra},"*");}
  let frameBusy=false,locateRequested=false,frameMounted=false;
  function clear(){message("cq:task-clear");frameBusy=false;locateRequested=false;frameMounted=false;frame=null;channel="";source=null;key="";visibility=null;controls.clear();clearTimeout(exposureTimer);exposureTimer=null;panel?.remove();panel=null;unavailable=false;workspaceHost?.classList.remove('task-support-workspace','support-focus-help');workspaceHost=null;workspaceHelpKey="";}
  function serialize(root){
    controls=new Map();
    function tree(n){
      if(n.nodeType===3)return{text:n.textContent};
      if(n.nodeType!==1)return{text:""};
      if(n.classList.contains("katex")){const math=n.querySelector('math');return math?tree(math):{text:n.querySelector(".katex-html")?.textContent||n.textContent};}
      if(n.tagName.toLowerCase()==='annotation')return{text:''};
      const tag=n.tagName.toLowerCase(), item={tag,supportBody:n.dataset.supportBody||null,pilotProbe:n.dataset.pilotProbe||null,hidden:n.hidden,open:n.open===true,disabled:n.disabled===true,attrs:{},children:[]};
      if(["button","input","textarea","select","form","details"].includes(tag)){if(!controlIds.has(n))controlIds.set(n,`c${++nextControlId}`);item.id=controlIds.get(n);controls.set(item.id,n);}
      for(const a of ["type","placeholder","aria-label","aria-pressed","role","aria-checked","min","max","step","rows","maxLength","display","mathvariant","stretchy","fence","separator","scriptlevel","columnalign"])if(n.hasAttribute(a))item.attrs[a]=n.getAttribute(a);
      if(["textarea","input","select","option"].includes(tag))item.value=n.value;
      item.children=[...n.childNodes].map(tree);return item;
    }
    return tree(root);
  }
  function deliver(){if(!frame?.isConnected||!source||snapshot?.locked||snapshot?.check)return;const tree=serialize(source),signature=JSON.stringify(tree);if(signature!==serializedKey){serializedKey=signature;revision++;}message("cq:task-show",{scope:snapshot.scopeKey,sceneType:snapshot.sceneType,revision,tree});}
  function draftForm(parent, prompt, draftKey, questionId=""){
    const form=el("form",null,"task-response-form"), label=el("label",prompt), input=el("textarea");
    input.rows=3;input.maxLength=2000;input.placeholder="写下你的判断过程，也可以继续自己尝试。";input.value=drafts.get(draftKey)||"";input.setAttribute("aria-label",prompt);
    input.dataset.taskDraftKey=draftKey;
    input.addEventListener("input",()=>drafts.set(draftKey,input.value));label.append(input);
    const submit=el("button","发送我的想法"), status=el("p",null,"task-response-status");submit.type="submit";submit.disabled=snapshot.busy;
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    if(snapshot.busy)status.textContent='正在核对你的想法，可能需要一些时间；请稍候。';
    form.append(label,submit,status);form.addEventListener("submit",async event=>{
      event.preventDefault();if(snapshot.busy)return;if(!input.value.trim()){status.textContent='请先写下想核对的想法或疑问。';input.focus();return;}const submittedText=input.value;drafts.set(draftKey,submittedText);submit.disabled=true;status.textContent='正在核对你的想法，可能需要一些时间；请稍候。';
      if(!questionId)replyContext=`${snapshot.unitId}:${snapshot.sceneType}`;
      const ok=await global.KnowledgeAssistant.askInTask(input.value,questionId);
      submit.disabled=false;
      if(ok){
        if(drafts.get(draftKey)===submittedText){drafts.delete(draftKey);if(input.value===submittedText)input.value="";
          for(const field of source?.querySelectorAll('textarea')||[])if(field.dataset.taskDraftKey===draftKey && field.value===submittedText)field.value="";
        }status.textContent="";
      }else{status.textContent="暂未发送成功，你的草稿仍保留。";}deliver();
    });parent.append(form);
  }
  function quizReview(next){
    const currentOwner=`${next.ownerKey}:${next.unitId}`;
    if(currentOwner!==quizOwner){quizOwner=currentOwner;quizOpen.clear();quizReplies.clear();}
    if(next.reply?.text&&next.replyQuestionId)quizReplies.set(next.replyQuestionId,next.reply);
    for(const card of document.querySelectorAll(".question-card[data-question]")){
      const existing=card.querySelector(".question-task-review");
      if(next.locked || next.check || !next.quizSubmitted){existing?.remove();if(!card.querySelector(".task-assessment-note"))card.append(el("p","独立作答中，学习提示已关闭。提交后可在题目旁复盘。","task-assessment-note"));continue;}
      card.querySelector(".task-assessment-note")?.remove();if(existing)continue;
      const questionId=card.dataset.question, details=el("details",null,"question-task-review");details.dataset.unitId=next.unitId;
      details.open=quizOpen.get(questionId)===true;
      details.addEventListener('toggle',()=>{if(details.isConnected&&quizOwner===currentOwner)quizOpen.set(questionId,details.open);});
      details.append(el("summary","在这道题旁复盘"),el("p","原提交与成绩保持不变；这里记录你重新理解的过程。","task-assessment-note"));
      draftForm(details,"写下你想核对的步骤或疑问",`${next.unitId}:${questionId}`,questionId);
      const reply=el("div",null,"task-review-reply");reply.setAttribute("aria-live","polite");details.append(reply);card.append(details);
      const saved=quizReplies.get(questionId);if(saved){reply.dataset.messageId=`${saved.id}:${saved.text.length}`;reply.append(el('strong','知点的回应'),replyBody(saved.text));}
    }
    if(next.reply?.text && next.replyQuestionId){
      const card=[...document.querySelectorAll(".question-card")].find(n=>n.dataset.question===next.replyQuestionId), slot=card?.querySelector(".task-review-reply");
      if(slot && slot.dataset.messageId!==`${next.reply.id}:${next.reply.text.length}`){slot.dataset.messageId=`${next.reply.id}:${next.reply.text.length}`;slot.replaceChildren(el("strong","知点的回应"),replyBody(next.reply.text));}
    }
  }
  function showPanel(){
    if(!source)return;
    const pane=snapshot.unitType==="quiz" ? [...document.querySelectorAll('.question-card[data-question]')].find(n=>n.dataset.question===(snapshot.offer?.questionId||snapshot.replyQuestionId))||document.querySelector('.question-card[data-question]')||document.querySelector('#lesson-player') : document.querySelector('.multi-scene-scene-panel:not([hidden])')||document.querySelector('.multi-scene-slide-panel:not([hidden])');
    if(!pane)return;
    const host=pane.querySelector('.multi-scene-selected-resource.has-resource')||pane;
    if(workspaceHost!==host){workspaceHost?.classList.remove('task-support-workspace','support-focus-help');workspaceHost=host;}
    if(!panel?.isConnected){panel=el("section",null,"task-support-panel");panel.setAttribute("aria-label",snapshot.check?"独立检查作答":"工作区中的知点帮助");host.append(panel);}
    if(panel.parentElement!==host)host.append(panel);
    if(source.parentElement!==panel){
      const bar=el('header',null,'task-support-heading');bar.append(el('strong',snapshot.check?'独立检查':'知点 · 智能体老师'));
      if(snapshot.unitType==='knowledge'&&!snapshot.check){
        const toggle=el('button',focusHelp?'放大课件':'课件小窗');toggle.type='button';toggle.dataset.supportFocusToggle='';toggle.title='在完整课件和缩放小窗之间切换';
        toggle.onclick=()=>{focusHelp=!focusHelp;host.classList.toggle('support-focus-help',focusHelp);toggle.textContent=focusHelp?'放大课件':'课件小窗';fitMini();global.dispatchEvent(new Event('resize'));};bar.append(toggle);
      }
      panel.replaceChildren(bar,source);
    }panel.hidden=false;
    host.classList.toggle('task-support-workspace',snapshot.unitType==='knowledge'&&!snapshot.check);
    host.classList.toggle('support-focus-help',snapshot.unitType==='knowledge'&&!snapshot.check&&focusHelp);
    requestAnimationFrame(fitMini);
    if(snapshot.offer)global.KnowledgeAssistant.observeSupportOffer(source.querySelector('.knowledge-proactive-inline-offer'),snapshot.offer);
  }
  function sync(next){
    next={...next,check:next.check||(next.supportCycle?.status==="awaiting_check"?{id:next.supportCycle.check.id}:null)};
    const nextOwner=`${next.ownerKey}:${next.generation||0}`;
    if(nextOwner!==owner){clear();owner=nextOwner;drafts.clear();exposed.clear();replyContext="";}
    snapshot=next;
    if(next.unitType==="quiz")quizReview(next);
    const handles=next.signedIn&&next.active&&next.taskReady!==false&&(next.unitType==="knowledge"||(next.unitType==="quiz"&&next.quizSubmitted&&Boolean(next.offer||next.prompt||next.check||next.feedback)))&&!next.locked&&next.view.placement==="inline"&&next.view.modality==="tip";
    if(!handles){clear();lastQuizSupport="";return false;}
    const hasHelp=next.offer||next.prompt||next.check||next.feedback||global.SupportCycleUI?.active(next.supportCycle)||global.SupportCycleUI?.manualOpen(next);
    if(next.unitType==='knowledge'&&!hasHelp){clear();return true;}
    if(next.unitType==='quiz'){
      const helpKey=`${next.unitId}:${next.offer?.decisionId||next.prompt?.interventionId||next.check?.id||''}`;
      if(helpKey!==lastQuizSupport && (next.offer||next.prompt||next.check)){lastQuizSupport=helpKey;global.LearningWorkspace?.showTask?.();}
    }
    // Keep the actual courseware iframe in place. Moving or cloning it reloads
    // games and loses in-progress interactions. CSS supplies the small window.
    const helpKey=next.supportCycle?.id||next.offer?.id||next.prompt?.id||next.scopeKey;
    if(helpKey!==workspaceHelpKey){workspaceHelpKey=helpKey;focusHelp=false;}
    const nextFrame=null;
    const nextKey=JSON.stringify([owner,next.scopeKey,next.sceneType,next.view,next.offer,next.prompt,next.check,next.checkSelection,next.feedback,next.busy,next.reply,next.supportCycle,next.supportBusy,next.pilotRevision,global.SupportCycleUI?.deferInquiry(next.supportCycle),global.SupportCycleUI?.manualOpen(next)]);
    if(nextFrame!==frame){message("cq:task-clear");frameBusy=false;locateRequested=false;frameMounted=false;frame=nextFrame;channel=crypto.randomUUID();key="";unavailable=false;visibility=null;clearTimeout(exposureTimer);exposureTimer=null;}
    if(nextKey!==key){
      clearTimeout(exposureTimer);exposureTimer=null;
      key=nextKey;source=el("div",null,"task-support-content");source.append(global.KnowledgeAssistant.createSupportContent());
      if(next.check){message("cq:task-clear");source.prepend(el("p","独立检查中，提示和对话帮助已暂停。","task-assessment-note"));}
      else {
        if(next.prompt){if(global.StudyEntry){const follow=el('details',null,'task-followup-question');follow.append(el('summary','还有不明白的？继续问老师'));draftForm(follow,'写下具体问题，例如“为什么同一个输入不能对应两个输出？”',`${next.scopeKey}:${next.prompt.id}`);source.append(follow);}else draftForm(source,'写下你对这一步的解释或疑问',`${next.scopeKey}:${next.prompt.id}`);}
        if(global.SupportCycleUI?.manualOpen(next)&&!next.offer&&!next.prompt&&!global.SupportCycleUI?.active(next.supportCycle)){
          const question=el("details",null,"task-manual-help");question.append(el("summary","需要一个思考线索"));
          draftForm(question,"告诉知点你卡在哪一步",`${next.scopeKey}:manual`);source.append(question);
          if(next.reply?.text && replyContext===`${next.unitId}:${next.sceneType}`){const response=el('details');response.open=true;response.append(el('summary','知点的回应'),replyBody(next.reply.text));source.prepend(response);}
          if(!next.feedback && !next.reply?.text)source.prepend(el("small","可以继续独立探索；需要时在当前步骤求助。"));
        }
        if(!global.SupportCycleUI?.active(next.supportCycle)){const open=el('button','继续问老师');open.type='button';open.addEventListener('click',()=>global.KnowledgeAssistant.open({preserveProactiveSuggestion:true}));source.append(open);}
      }
    }
    if(frame&&!next.check&&!unavailable){panel?.remove();panel=null;deliver();}else showPanel();
    return true;
  }
  function checkExposure(){
    const stop=()=>{clearTimeout(exposureTimer);exposureTimer=null;};
    const s=snapshot,v=visibility,cycle=s?.supportCycle,cycleOffer=cycle&&["awaiting_confirmation","offered","engaged"].includes(cycle.status);
    if((!s?.offer&&!cycleOffer)||s.locked||s.check||!frame?.isConnected||document.hidden||!v||v.fraction<.5||(cycleOffer&&v.supportBodyVisible!==true)){stop();return;}
    const f=frame.getBoundingClientRect(),r=v.rect,x=f.left+r.x,y=f.top+r.y;
    const area=Math.max(0,Math.min(x+r.width,f.right,innerWidth)-Math.max(x,f.left,0))*Math.max(0,Math.min(y+r.height,f.bottom,innerHeight)-Math.max(y,f.top,0));
    const id=`${owner}:${cycleOffer?cycle.id+':'+cycle.rounds:s.offer.decisionId||s.offer.id}`;if(r.width<=0||r.height<=0||area/(r.width*r.height)<.5||exposed.has(id)){stop();return;}
    if(exposureTimer)return;
    const activeChannel=channel;exposureTimer=setTimeout(()=>{exposureTimer=null;if(channel!==activeChannel||document.hidden||snapshot?.check)return;
      if(cycleOffer){if(snapshot.supportCycle?.id!==cycle.id)return;exposed.add(id);global.SupportCycleUI.expose(cycle);}
      else {if(snapshot?.offer?.id!==s.offer.id)return;exposed.add(id);global.KnowledgeAssistant.confirmTaskExposure(s.offer);}},1000);
  }
  window.addEventListener("message",event=>{
    if(!frame||event.source!==frame.contentWindow)return;const m=event.data;
    if(m?.type==="cq:task-ready"){deliver();return;}
    if(!m||m.channel!==channel||snapshot.locked||snapshot.check)return;
    if(m.type==="cq:task-busy"){
      const wasBusy=frameBusy;frameBusy=m.busy===true;
      if(wasBusy&&!frameBusy&&snapshot.supportCycle?.status==="awaiting_confirmation")setTimeout(()=>global.KnowledgeAssistant.refreshSupportSurface(),0);
    }else if(m.type==="cq:task-control"){
      // IDs belong to original DOM controls and are never reused. A stale
      // offer cannot invoke a new offer, while typing does not invalidate clicks.
      const target=controls.get(m.id);if(!target||target.disabled)return;
      if(m.kind==="toggle"&&target.tagName==="DETAILS"){target.open=m.open===true;return;}
      if(m.kind==="input"&&["INPUT","TEXTAREA"].includes(target.tagName)){target.value=String(m.value||"").slice(0,target.maxLength>0?target.maxLength:2000);target.dispatchEvent(new Event("input",{bubbles:true}));return;}
      if(m.kind==='change'&&target.tagName==='SELECT'&&[...target.options].some(o=>o.value===m.value)){target.value=m.value;target.dispatchEvent(new Event('change',{bubbles:true}));deliver();return;}
      if(m.kind==="click"&&target.tagName==="BUTTON"){
        if(target.type==="submit"&&target.closest("form"))target.closest("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));else target.click();
      }else if(m.kind==="submit"&&target.tagName==="FORM")target.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
      queueMicrotask(deliver);
    }else if(m.type==="cq:task-mounted"){
      frameMounted=true;
      unavailable=false;panel?.remove();panel=null;global.KnowledgeAssistant.trackSupportSurface("rendered",{location:"inside_courseware",anchor:String(m.anchor||"").slice(0,100)});
      if(locateRequested){locateRequested=false;message('cq:task-locate');}
    }else if(m.type==="cq:task-unavailable"){
      if(!unavailable){unavailable=true;showPanel();if(locateRequested){locateRequested=false;locate();}global.KnowledgeAssistant.trackSupportSurface("rendered",{location:"task_area",reason:"no_visible_reviewed_anchor"});}
    }else if(m.type==="cq:task-visibility"){
      const r=m.rect,v=m.viewport;if(r&&v&&[r.x,r.y,r.width,r.height,v.width,v.height,m.fraction].every(Number.isFinite)){visibility=m;checkExposure();}
    }
  });
  document.addEventListener("visibilitychange",checkExposure);window.addEventListener("scroll",checkExposure,true);window.addEventListener("resize",checkExposure);
  function locate(){
    if(frame?.isConnected&&!unavailable){locateRequested=!frameMounted;frame.scrollIntoView({block:'nearest'});message('cq:task-locate');return true;}
    if(panel?.isConnected){panel.tabIndex=-1;panel.scrollIntoView({block:'nearest'});panel.focus({preventScroll:true});return true;}
    return false;
  }
  function returnToTask(){
    if(workspaceHost?.isConnected){focusHelp=false;workspaceHost.classList.remove('support-focus-help');const b=panel?.querySelector('[data-support-focus-toggle]');if(b)b.textContent='课件小窗';global.dispatchEvent(new Event('resize'));}
    if(frame?.isConnected&&!unavailable){frame.scrollIntoView({block:'nearest'});message('cq:task-return');return;}
    const pane=panel?.parentElement;
    pane?.querySelector('[data-knowledge-scene-stage],[data-resource-fullscreen-target]')?.scrollIntoView({block:'start'});
  }
  function visibleProbeId(){
    if(document.hidden||!frame?.isConnected||!visibility?.pilotProbe||visibility.fraction<.5)return null;
    const f=frame.getBoundingClientRect(),r=visibility.rect;
    const x=f.left+r.x,y=f.top+r.y;
    const area=Math.max(0,Math.min(x+r.width,f.right,innerWidth)-Math.max(x,f.left,0))*Math.max(0,Math.min(y+r.height,f.bottom,innerHeight)-Math.max(y,f.top,0));
    // A child frame cannot determine whether its parent pane is hidden or covered.
    const cx=Math.max(f.left,Math.min(f.right-1,x+r.width/2)),cy=Math.max(f.top,Math.min(f.bottom-1,y+r.height/2));
    return r.width*r.height>0&&area/(r.width*r.height)>=.5&&document.elementFromPoint(cx,cy)===frame?visibility.pilotProbe:null;
  }
  global.TaskSupport=Object.freeze({sync,clear,locate,visibleProbeId,get interactionBusy(){return Boolean(frame?.isConnected&&frameBusy);}});
})(window);
