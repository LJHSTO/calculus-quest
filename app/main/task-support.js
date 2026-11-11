(function (global) {
  "use strict";
  let snapshot, owner = "", frame = null, channel = "", source = null, key = "", panel = null;
  let controls = new Map(), visibility = null, exposureTimer = null, exposed = new Set(), unavailable = false, revision = 0, serializedKey = "", replyContext = "";
  const drafts = new Map();
  const draftStorageKey=()=>`calculus-task-drafts-r12:${encodeURIComponent(owner)}`;
  function persistDrafts(){try{if(owner)localStorage.setItem(draftStorageKey(),JSON.stringify({drafts:[...drafts].slice(-60),replyContext,selectedQuestion}));}catch{}}
  let selectedQuestion = "";
  const contextKey=next=>`${next.unitId}:${next.sceneType||'slide'}`;
  const hasConversation=next=>replyContext===contextKey(next);
  const controlIds = new WeakMap();let nextControlId=0;
  let lastQuizSupport="";
  let workspaceHost=null, focusHelp=false, workspaceHelpKey="";
  const miniObserver=new ResizeObserver(()=>fitMini());
  function fitMini(){if(!workspaceHost?.isConnected)return;const stage=workspaceHost.querySelector('[data-knowledge-scene-stage],[data-resource-fullscreen-target]');if(!stage)return;const scale=Math.min(1,stage.clientWidth/1280);const value=String(scale);if(workspaceHost.style.getPropertyValue('--course-mini-scale')!==value)workspaceHost.style.setProperty('--course-mini-scale',value);}
  global.addEventListener('resize',()=>requestAnimationFrame(fitMini));
  const el = (tag, text, cls) => {const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const replyBody=text=>{const n=el('div',null,'assistant-content');if(global.AssistantContent)global.AssistantContent.renderInto(n,text);else n.textContent=text;return n;};
  function message(type, extra={}){frame?.contentWindow?.postMessage({type,channel,...extra},"*");}
  let frameBusy=false,locateRequested=false,frameMounted=false;
  function clear(){message("cq:task-clear");frameBusy=false;locateRequested=false;frameMounted=false;frame=null;channel="";source=null;key="";visibility=null;controls.clear();clearTimeout(exposureTimer);exposureTimer=null;panel?.remove();panel=null;unavailable=false;miniObserver.disconnect();workspaceHost?.querySelectorAll('iframe[inert]').forEach(n=>n.inert=false);workspaceHost?.querySelector('.course-mini-restore')?.remove();workspaceHost?.classList.remove('task-support-workspace','support-focus-help');workspaceHost=null;workspaceHelpKey="";}
  function setFocusHelp(value){
    focusHelp=value;workspaceHost?.classList.toggle('support-focus-help',value);
    const stage=workspaceHost?.querySelector('[data-knowledge-scene-stage],[data-resource-fullscreen-target]');
    if(!stage)return;
    stage.querySelectorAll('iframe').forEach(n=>n.inert=value);
    let restore=stage.querySelector('.course-mini-restore');
    if(!restore){restore=el('button','放大课件','course-mini-restore');restore.type='button';restore.title='返回课件，继续刚才的操作';restore.onclick=()=>setFocusHelp(false);stage.append(restore);}
    restore.hidden=!value;
    const toggle=panel?.querySelector('[data-support-focus-toggle]');if(toggle){toggle.textContent=value?'放大课件':'课件小窗';toggle.setAttribute('aria-pressed',String(value));}
    requestAnimationFrame(fitMini);global.dispatchEvent(new Event('resize'));
  }
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
    input.rows=2;input.maxLength=2000;input.placeholder="有疑问或想核对理解时再写，不必每次填写。";input.value=drafts.get(draftKey)||"";input.setAttribute("aria-label",prompt);
    input.dataset.taskDraftKey=draftKey;
    input.addEventListener("input",()=>{drafts.set(draftKey,input.value);persistDrafts();});label.append(input);
    const submit=el("button","发送我的想法"), status=el("p",null,"task-response-status");submit.type="submit";submit.disabled=snapshot.busy;
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    if(snapshot.busy)status.textContent='知点正在回应…';
    else if(snapshot.taskError)status.textContent=snapshot.taskError+' 你的草稿仍保留。';
    form.append(label);
    const checkQuestionId=snapshot.policyState?.checkContext?.questionId||snapshot.prompt?.questionId||snapshot.offer?.questionId||'';
    if(snapshot.policyState?.lifecycle?.phase==='accepted_pending_response'&&!global.SupportCycleUI?.active(snapshot.supportCycle)&&(snapshot.unitType!=='quiz'||checkQuestionId===(questionId||selectedQuestion||snapshot.replyQuestionId||snapshot.prompt?.questionId||snapshot.offer?.questionId))){
      const check=el('button','用一题检查');check.type='button';check.className='task-check-action';check.disabled=snapshot.busy;
      check.onclick=async()=>{check.disabled=true;try{await global.KnowledgeAssistant.startTaskCheck();}catch(error){status.textContent=error.message;check.disabled=false;}};form.append(check);
    }
    form.append(submit,status);form.addEventListener("submit",async event=>{
      event.preventDefault();if(snapshot.busy)return;if(!input.value.trim()){status.textContent='请先写下想核对的想法或疑问。';input.focus();return;}const submittedText=input.value;drafts.set(draftKey,submittedText);submit.disabled=true;status.textContent='知点正在回应…';
      const submittedContext=contextKey(snapshot);
      replyContext=submittedContext;persistDrafts();
      const ok=await global.KnowledgeAssistant.askInTask(input.value,questionId||selectedQuestion||(snapshot.unitType==='quiz'?snapshot.replyQuestionId:''));
      submit.disabled=false;
      if(ok){
        if(contextKey(snapshot)===submittedContext)selectedQuestion=global.KnowledgeAssistant.designSpaceSnapshot().replyQuestionId||selectedQuestion;
        if(drafts.get(draftKey)===submittedText){drafts.delete(draftKey);persistDrafts();if(input.value===submittedText)input.value="";
          for(const field of document.querySelectorAll('textarea[data-task-draft-key]'))if(field.dataset.taskDraftKey===draftKey && field.value===submittedText)field.value="";
        }status.textContent="";
      }else{status.textContent="暂未发送成功，你的草稿仍保留。";}deliver();global.KnowledgeAssistant.refreshSupportSurface();
      if(ok&&!questionId)requestAnimationFrame(()=>{for(const field of document.querySelectorAll('textarea[data-task-draft-key]'))if(field.dataset.taskDraftKey===draftKey){const history=field.closest('.has-task-conversation')?.querySelector('.task-conversation-scroll');if(history)history.scrollTop=history.scrollHeight;}});
    });parent.append(form);
  }
  function appendConversation(parent,next){
    if(next.locked||next.check||['awaiting_confirmation','queued','postponed','awaiting_check'].includes(next.supportCycle?.status))return;
    const context=`${next.unitId}:${next.sceneType||'slide'}`;
    if(replyContext===`closed:${context}`)return;
    if(!next.prompt&&replyContext!==context&&!['offered','engaged'].includes(next.supportCycle?.status)&&!global.SupportCycleUI?.manualOpen(next))return;
    // The existing server-backed conversation is shared by both teacher surfaces and survives refresh.
    const turns=[];
    for(const item of next.taskMessages||[]){
      if(item.role==='user')turns.push({question:item.content,pending:next.busy});
      else if(item.role==='assistant'&&turns.length){const turn=turns.at(-1);turn.message=item;turn.reply=item.error?'暂未发送成功，请重试。':item.content;turn.pending=item.streaming;}
    }
    const history=el('div',null,'task-conversation-scroll');
    for(const turn of turns.slice(-8)){const response=el('div',null,'task-conversation-reply');response.append(el('p',turn.question,'task-student-message'));if(turn.reply)response.append(global.KnowledgeAssistant.createTaskMessage?.(turn.message,{actionable:turn===turns.at(-1)})||replyBody(turn.reply));else if(turn.pending)response.append(el('p','知点正在回应…','task-response-status'));history.append(response);}
    parent.classList.add('has-task-conversation');parent.append(history);
    if(next.unitType==='quiz'&&next.quizSubmitted&&!turns.at(-1)?.message?.guidance?.quizReviewProgress&&!turns.at(-1)?.message?.quizReviewFollowUp)appendReviewNavigation(parent,next);
    if(!next.prompt&&next.unitType==='quiz'&&next.quizResourceUnitId){
      const back=el('button','回到本知识点课件','task-course-return');back.type='button';back.dataset.quizResourceLink=next.quizResourceUnitId;back.dataset.quizResourceScene='simulation';parent.append(back);
    }
    const questionId=next.unitType==='quiz'?(selectedQuestion||next.replyQuestionId||''):'';
    draftForm(parent,'继续交流（选填）',`${next.scopeKey}:${next.sceneType||'slide'}:conversation:${questionId}`,questionId);
  }
  function reviewState(next,questionId){
    if((next.checkHistory||[]).some(r=>r.questionId===questionId&&['correct','incorrect'].includes(r.status)))return '已提交独立检查';
    if((next.taskMessages||[]).some(m=>m.role==='assistant'&&!m.error&&(m.contextRef?.questionId||m.guidance?.focusQuestionId)===questionId))return '已有讲解';
    return '待回看';
  }
  function appendReviewNavigation(parent,next){
    const records=typeof quizRecordsForUnit==='function'?quizRecordsForUnit(next.unitId):[];
    const wrong=[...document.querySelectorAll('.question-card[data-question]')].filter(card=>records.filter(r=>r.questionId===card.dataset.question).at(-1)?.isCorrect===false);
    if(!wrong.length)return;
    const currentId=selectedQuestion||next.replyQuestionId||next.prompt?.questionId||next.offer?.questionId;
    const current=wrong.findIndex(card=>card.dataset.question===currentId);
    const box=el('section',null,'task-review-navigation'),label=el('strong',current>=0?`正在讨论第 ${[...document.querySelectorAll('.question-card[data-question]')].indexOf(wrong[current])+1} 题 · ${current+1}/${wrong.length} 道错题`:'本次检测的错题');
    box.append(label);
    const states=el('p',wrong.map((card,index)=>`第 ${index+1} 道错题：${reviewState(next,card.dataset.question)}`).join('；'));box.append(states);
    const actions=el('div');
    const ask=el('button','继续问本题');ask.type='button';ask.onclick=()=>parent.querySelector('.task-response-form textarea')?.focus({preventScroll:true});actions.append(ask);
    const nextCard=wrong.slice(current+1).find(card=>reviewState(next,card.dataset.question)==='待回看')||wrong.find(card=>card.dataset.question!==currentId&&reviewState(next,card.dataset.question)==='待回看');
    if(nextCard){const nextButton=el('button','下一道待回看');nextButton.type='button';nextButton.disabled=next.busy;nextButton.onclick=()=>global.KnowledgeAssistant.askInTask('请接着带我看这道题，复用我的原始作答，先给一个关键线索，不要让我重新填写原题。',nextCard.dataset.question);actions.append(nextButton);}
    const stop=el('button','结束本次讨论');stop.type='button';stop.onclick=()=>{replyContext=`closed:${contextKey(next)}`;key='';revision++;persistDrafts();global.KnowledgeAssistant.refreshSupportSurface();document.querySelector(`.question-card[data-question="${CSS.escape(currentId||'')}"]`)?.scrollIntoView({block:'start',behavior:'instant'});};actions.append(stop);box.append(actions);parent.append(box);
  }
  function leaveConversation(){replyContext='';persistDrafts();}
  function quizReview(next){
    for(const card of document.querySelectorAll(".question-card[data-question]")){
      const existing=card.querySelector(".question-task-review");
      if(next.locked || next.check || !next.quizSubmitted || /^fl-r(?:7|10|11|12|13)-(pre|post)-/.test(card.dataset.question)){existing?.remove();card.querySelector('.task-assessment-note')?.remove();continue;}
      card.querySelector(".task-assessment-note")?.remove();if(existing){const status=existing.querySelector('[data-question-review-state]');if(status)status.textContent=reviewState(next,card.dataset.question);continue;}
      const questionId=card.dataset.question, details=el("div",null,"question-task-review");
      const records=typeof quizRecordsForUnit==='function'?quizRecordsForUnit(next.unitId):[];
      const incorrect=records.filter(r=>r.questionId===questionId).at(-1)?.isCorrect===false;
      const button=el('button',incorrect?'请知点讲这道题':'和知点讨论这道题');button.type='button';
      button.onclick=async()=>{selectedQuestion=questionId;replyContext=contextKey(next);persistDrafts();key='';revision++;global.KnowledgeAssistant.refreshSupportSurface();if(next.view.placement==='sidebar')global.dispatchEvent(new CustomEvent('cq:knowledge-assistant-visibility',{detail:{open:true}}));requestAnimationFrame(()=>{if(!locate())document.querySelector('.learning-support-surface')?.scrollIntoView({block:'nearest',behavior:'instant'});document.querySelector('.task-response-form textarea,.support-chat-form textarea')?.focus({preventScroll:true});});
        if(incorrect){button.disabled=true;try{await global.KnowledgeAssistant.askInTask('请带我检查这道题的关键关系，先给一个简短线索。',questionId);}finally{button.disabled=false;}}
      };
      const status=el('span',reviewState(next,questionId),'question-review-state');status.dataset.questionReviewState=questionId;details.append(status,button);card.append(details);
    }
  }
  function showPanel(){
    if(!source)return;
    const questionId=snapshot.check?snapshot.policyState?.checkContext?.questionId:
      selectedQuestion||snapshot.prompt?.questionId||snapshot.offer?.questionId||snapshot.feedback?.questionId||snapshot.replyQuestionId;
    const cards=snapshot.unitType==='quiz'?[...document.querySelectorAll('.question-card[data-question]')]:[];
    const questionCard=questionId?cards.find(n=>n.dataset.question===questionId):null;
    const pane=snapshot.unitType==="quiz" ? questionCard||document.querySelector('[data-quiz-support-host]') : document.querySelector('.multi-scene-scene-panel:not([hidden])')||document.querySelector('.multi-scene-slide-panel:not([hidden])');
    if(!pane)return;
    const host=pane.querySelector('.multi-scene-selected-resource.has-resource')||pane;
    if(workspaceHost!==host){workspaceHost?.classList.remove('task-support-workspace','support-focus-help');miniObserver.disconnect();workspaceHost=host;const stage=host.querySelector('[data-knowledge-scene-stage],[data-resource-fullscreen-target]');if(stage)miniObserver.observe(stage);}
    if(!panel?.isConnected){panel=el("section",null,"task-support-panel");panel.setAttribute("aria-label",snapshot.check?"独立检查作答":"工作区中的知点帮助");host.append(panel);}
    if(panel.parentElement!==host)host.append(panel);
    if(source.parentElement!==panel){
      const bar=el('header',null,'task-support-heading');bar.append(el('strong',snapshot.check?'独立检查':snapshot.unitType==='quiz'&&!questionCard?'知点 · 本次检测的整体帮助':'知点'));
      if(snapshot.unitType==='quiz'&&questionCard&&!snapshot.check){const target=el('button','查看第 '+(cards.indexOf(questionCard)+1)+' 题');target.type='button';target.onclick=()=>questionCard.scrollIntoView({block:'start',behavior:'instant'});bar.append(target);}
      if(snapshot.unitType==='knowledge'&&!snapshot.check){
        const toggle=el('button',focusHelp?'放大课件':'课件小窗');toggle.type='button';toggle.dataset.supportFocusToggle='';toggle.title='在完整课件和缩放小窗之间切换';
        toggle.setAttribute('aria-pressed',String(focusHelp));toggle.onclick=()=>setFocusHelp(!focusHelp);bar.append(toggle);
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
    const nextOwner=next.ownerKey?`${next.ownerKey}:${next.learningGeneration??next.generation??0}:${next.runId||''}`:'';
    const ownerChanged=nextOwner!==owner;
    if(ownerChanged){clear();owner=nextOwner;drafts.clear();exposed.clear();replyContext="";selectedQuestion='';
      try{const saved=JSON.parse(localStorage.getItem(draftStorageKey())||'{}'),entries=Array.isArray(saved)?saved:saved.drafts;if(Array.isArray(entries))for(const [key,value] of entries.slice(-60))if(typeof key==='string'&&typeof value==='string')drafts.set(key,value.slice(0,2000));if(typeof saved.replyContext==='string')replyContext=saved.replyContext;if(replyContext===contextKey(next)&&typeof saved.selectedQuestion==='string')selectedQuestion=saved.selectedQuestion;}catch{}
    }
    if(!ownerChanged&&snapshot&&snapshot.unitId!==next.unitId)selectedQuestion='';
    snapshot=next;
    if(next.unitType==="quiz")quizReview(next);
    const handles=next.signedIn&&next.active&&next.taskReady!==false&&(next.unitType==="knowledge"||(next.unitType==="quiz"&&next.quizSubmitted&&Boolean(next.offer||next.prompt||next.check||next.feedback||next.muted||hasConversation(next)||replyContext===contextKey(next))))&&!next.locked&&next.view.placement==="inline"&&next.view.modality==="tip";
    if(!handles){clear();lastQuizSupport="";return false;}
    const hasHelp=next.offer||next.prompt||next.check||next.feedback||next.muted||global.SupportCycleUI?.active(next.supportCycle)||global.SupportCycleUI?.manualOpen(next)||hasConversation(next);
    if(next.unitType==='knowledge'&&!hasHelp){clear();return true;}
    let locateQuiz=false;
    if(next.unitType==='quiz'){
      const helpKey=`${next.unitId}:${next.offer?.decisionId||next.check?.id||''}`;
      if((helpKey!==lastQuizSupport||!panel?.isConnected) && (next.offer||next.check||next.prompt?.restored&&next.taskMessages?.some(m=>m.role==='user'))){lastQuizSupport=helpKey;locateQuiz=true;global.LearningWorkspace?.showTask?.();}
    }
    // Keep the actual courseware iframe in place. Moving or cloning it reloads
    // games and loses in-progress interactions. CSS supplies the small window.
    const helpKey=next.supportCycle?.id||next.offer?.id||next.prompt?.id||next.scopeKey;
    if(helpKey!==workspaceHelpKey){workspaceHelpKey=helpKey;focusHelp=false;}
    const nextFrame=null;
    const nextKey=JSON.stringify([owner,next.scopeKey,next.sceneType,next.view,next.offer,next.prompt,next.check,next.checkSelection,next.feedback,next.checkHistory,next.muted,next.busy,next.reply,next.taskMessages,next.taskError,next.supportCycle,next.policyState?.lifecycle,next.supportBusy,next.pilotRevision,global.SupportCycleUI?.deferInquiry(next.supportCycle),global.SupportCycleUI?.manualOpen(next)]);
    if(nextFrame!==frame){message("cq:task-clear");frameBusy=false;locateRequested=false;frameMounted=false;frame=nextFrame;channel=crypto.randomUUID();key="";unavailable=false;visibility=null;clearTimeout(exposureTimer);exposureTimer=null;}
    if(nextKey!==key){
      const previousHistory=source?.querySelector('.task-conversation-scroll');
      const historyTop=previousHistory?.scrollTop||0,replyId=next.reply?.id||'',followEnd=!previousHistory||previousHistory.dataset.followEnd==='true'||previousHistory.dataset.replyId!==replyId||previousHistory.scrollHeight-historyTop-previousHistory.clientHeight<80;
      const focused=source?.contains(document.activeElement)?document.activeElement:null;
      const selection=focused?.dataset.taskDraftKey?{key:focused.dataset.taskDraftKey,start:focused.selectionStart,end:focused.selectionEnd}:null;
      clearTimeout(exposureTimer);exposureTimer=null;
      key=nextKey;source=el("div",null,"task-support-content");source.append(global.KnowledgeAssistant.createSupportContent());
      if(next.check){message("cq:task-clear");source.prepend(el("p","独立检查中，提示和对话帮助已暂停。","task-assessment-note"));}
      else {
        appendConversation(source,next);
      }
      const history=source.querySelector('.task-conversation-scroll');if(history){history.dataset.replyId=replyId;history.dataset.followEnd=String(followEnd);requestAnimationFrame(()=>{if(history.isConnected){history.scrollTop=followEnd?history.scrollHeight:historyTop;delete history.dataset.followEnd;}});}
      if(selection)requestAnimationFrame(()=>{const field=[...source.querySelectorAll('[data-task-draft-key]')].find(n=>n.dataset.taskDraftKey===selection.key);if(field?.isConnected){field.focus({preventScroll:true});field.setSelectionRange(selection.start,selection.end);}});
    }
    if(frame&&!next.check&&!unavailable){panel?.remove();panel=null;deliver();}else showPanel();
    if(locateQuiz)requestAnimationFrame(()=>{if(snapshot.unitId===next.unitId)locate();});
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
    if(panel?.isConnected){panel.tabIndex=-1;panel.scrollIntoView({block:'start',behavior:'instant'});panel.focus({preventScroll:true});return true;}
    return false;
  }
  function returnToTask(){
    if(workspaceHost?.isConnected)setFocusHelp(false);
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
  global.TaskSupport=Object.freeze({sync,clear,locate,returnToTask,visibleProbeId,appendConversation,hasConversation,
    openConversation(questionId=''){if(!snapshot||snapshot.locked||snapshot.check)return;selectedQuestion=questionId;replyContext=contextKey(snapshot);persistDrafts();key='';global.KnowledgeAssistant.refreshSupportSurface();},
    leaveConversation,get selectedQuestion(){return selectedQuestion;},get conversationRevision(){return revision+(snapshot?.taskMessages?.length||0);},get interactionBusy(){return Boolean(frame?.isConnected&&frameBusy);}});
})(window);
