(function(global){
  "use strict";
  if(!global.StudyEntry)return;
  let run=null,dialog=null,snapshot=null,lastOwner='',loading=false,lastPoll=0,judgmentActive=false,pendingUnit=null;
  const surveyDrafts={},seenReviews=new Set();
  const attempted=new Set();
  let probePanel=null;
  const labels={A:'固定配置',B:'自主配置与关联反馈',C:'自主配置'};
  const sceneNames={simulation:'动手实验',game:'误解挑战',mindMap:'关系图',visualization3d:'空间视角',slide:'讲解页',quiz:'检测结果页',unknown:'未记录场景'};
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  function button(text,fn){const b=el('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){let p=dialog?.querySelector('[role=status]');if(!p){p=el('p');p.setAttribute('role','status');dialog?.append(p);}if(p)p.textContent=e.message;}finally{b.disabled=false;}};return b;}
  async function request(path,body,options={}){
    const token=state.authToken,payload=body?JSON.stringify(body):null;
    // These writes are keyed records on the server. Repeating an identical
    // save after a lost response cannot add a second survey or review.
    const retrySafe=!body||['survey','review','enroll'].includes(path)||(path==='judgment'&&body.action==='draft'&&Boolean(body.requestId));
    const attempts=options.attempts||3;
    for(let attempt=0;attempt<attempts;attempt++){
      if(token!==state.authToken)throw new Error('账号已变化，请重新打开');
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
      try{
        const r=await fetch('api/study/'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:payload}:{}),signal:options.signal?AbortSignal.any([controller.signal,options.signal]):controller.signal});
        const raw=await r.text();let p;try{p=JSON.parse(raw);}catch{throw Object.assign(new Error('连接暂时中断，页面中的填写内容仍保留。请重试。'),{status:r.status,retryable:true});}
        if(token!==state.authToken)throw new Error('账号已变化，请重新打开');
        if(!r.ok||p?.ok!==true)throw Object.assign(new Error(p?.message||'请求未完成，请重试。'),{status:r.status,retryable:[408,429,502,503,504].includes(r.status)});
        return p.data;
      }catch(error){
        if(options.signal?.aborted)throw error;
        if(token!==state.authToken)throw new Error('账号已变化，请重新打开');
        const transient=error.retryable||['TypeError','AbortError'].includes(error.name);
        if(!transient)throw error;
        if(!retrySafe||attempt===attempts-1)throw Object.assign(new Error('连接暂时中断，页面中的填写内容仍保留。请重试。'),{status:error.status||0});
      }finally{clearTimeout(timeout);}
      await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
    }
  }
  function modal(title){if(!dialog){dialog=el('dialog');dialog.id='three-arm-dialog';document.body.append(dialog);}dialog.oncancel=null;dialog.onclose=null;dialog.replaceChildren(el('h2',title));dialog.setAttribute('aria-label',title);return dialog;}
  async function show(){const host=document.fullscreenElement||document.body;if(dialog.parentElement!==host)host.append(dialog);if(!dialog.open)dialog.showModal();dialog.scrollTop=0;}
  function syncReview(){const b=document.getElementById('three-arm-review');if(!b)return;const w=global.StudyStages.reviewWindow(run,state.submittedQuizzes,typeof currentUnitId==='string'?currentUnitId:''),checking=Boolean(snapshot?.check||snapshot?.supportCycle?.status==='awaiting_check');b.disabled=!w.allowed||checking;b.title=checking?'独立检查结束或跳过后可查看回顾。':w.message;}
  function setRun(value){run=value;judgmentActive=Boolean(value?.activeJudgment);const label=document.getElementById('three-arm-entry-label');if(label&&run){const text=run.mode==='preview'?`${run.arm}组 · 体验`:'本次学习';label.title=labels[run.arm];if(label.textContent!==text)label.textContent=text;}syncReview();}
  function install(){
    const host=document.querySelector('.player-top .player-actions'),account=document.getElementById('account-pilot-status');if(!host||!account||document.getElementById('three-arm-review'))return;
    const label=el('span');label.id='three-arm-entry-label';label.className='three-arm-entry-label';
    const review=button('学习回顾',()=>{if(typeof setUserMenuOpen==='function')setUserMenuOpen(false);return openReview();});review.id='three-arm-review';review.className='user-menu-item';account.before(review);host.prepend(label);setRun(run);
  }
  async function openReview(){
    const window=global.StudyStages.reviewWindow(run,state.submittedQuizzes,typeof currentUnitId==='string'?currentUnitId:'');
    if(!window.allowed||snapshot?.check||snapshot?.supportCycle?.status==='awaiting_check'){syncReview();return;}
    const controller=new AbortController();
    const loading=modal('学习回顾'),status=el('p','正在读取本阶段的学习记录…');status.setAttribute('role','status');
    loading.append(status,button('返回学习',()=>loading.close()));loading.onclose=()=>controller.abort();await show();
    let data;
    try{data=await request('review',null,{attempts:1,signal:controller.signal});}
    catch(error){if(controller.signal.aborted)return;status.textContent=error.message;loading.append(button('重新加载',openReview));return;}
    if(controller.signal.aborted||!loading.open)return;
    setRun(data.run);const d=modal(run.linkedFeedback?'学习回顾与配置关联':'学习回顾');
    d.append(button('返回学习',()=>d.close()));
    d.append(el('p',data.pendingStage?`“${data.pendingStage.title}”两个知识点已完成。回顾检测结果并决定下一段怎样接受帮助，设置会用于接下来的两个知识点。`:'这里汇总你已完成的独立检测。'));
    d.append(el('p',`已完成 ${data.ordinary.answered} 题，答对 ${data.ordinary.correct} 题${data.ordinary.scored<data.ordinary.answered?`，另有 ${data.ordinary.answered-data.ordinary.scored} 题等待评分`:''}。`));
    const results=el('div');results.className='study-review-results';
    for(const id of [...new Set(data.results.map(r=>r.unitId))]){const unit=typeof getUnit==='function'?getUnit(id):null,rows=data.results.filter(r=>r.unitId===id);const p=el('p',`${(unit?.label||'知识点检测').replace(/^检测[：:]/,'')}：${rows.filter(r=>r.correct===true).length} / ${rows.length} 题正确`);results.append(p);}
    if(!data.results.length)results.append(el('p','完成知识点检测后，这里会出现独立作答记录。'));d.append(results);
    if(data.linked){
      const linked=el('section');linked.dataset.linkedFeedback='';linked.append(el('h3','把设置、帮助经历和独立表现放在一起看'));
      for(const item of data.linked.filter((item,i)=>item.offered||item.visible||item.configurationResults?.length||item.independentResults.length||i===data.linked.length-1)){
        const card=el('article');card.className='study-linked-card';card.dataset.configurationRevision=item.revision;
        card.append(el('h4',`第 ${item.revision} 版配置`));
        const settings=el('details'),list=el('ul');settings.append(el('summary','查看当时的六项帮助设置'));for(const [id,value]of item.behavior)list.append(el('li',`${value}`));settings.append(list);card.append(settings);
        card.append(el('p',`主动帮助记录：${item.invitations||0} 次询问，其中 ${item.visibleInvitations||0} 次出现在屏幕上；提供 ${item.helpRounds} 轮提示正文，其中 ${item.visible} 轮出现在屏幕上；确认或接受 ${item.accepted} 次。正文出现不等于已经阅读或理解，普通聊天不计作补充帮助轮次。`));
        for(const experience of (item.experiences||[]).slice(-5)){const unit=typeof getUnit==='function'?getUnit(experience.scope):null;card.append(el('small',`${new Date(experience.at).toLocaleTimeString('zh-CN',{hour12:false})} · ${unit?.label||'本知识点'} / ${sceneNames[experience.sceneType]||'未记录场景'}：${experience.seen?'提示正文曾出现在屏幕上':'尚未记录到提示正文可见'}。`));}
        const during=(item.configurationResults||[]).filter(r=>r.correct!==null);
        card.append(el('p',during.length?`使用本版配置期间的全部独立检测：${during.length} 道已判定，${during.filter(r=>r.correct).length} 道正确。`:'使用本版配置期间尚无已判定的独立检测。'));
        const scored=item.independentResults.filter(r=>r.correct!==null);
        card.append(el('p',scored.length?`其中，提示正文出现后、下次修改设置前，同一知识点的独立检测：${scored.length} 道已判定，${scored.filter(r=>r.correct).length} 道正确。`:'其中尚无“提示正文出现后、同一知识点”的独立检测；先作答后看帮助的成绩不计入这一项。'));
        linked.append(card);
      }
      linked.append(el('p','下一步可以保持设置，也可以只改一项，并在下一次独立检测后再判断是否适合自己。'));d.append(linked);
    }
    const actions=el('footer');
    if(data.pendingStage){
      seenReviews.add(run.id+data.pendingStage.id);
      const answers={stage:data.pendingStage.id};
      d.append(el('h3','这次回顾对你有帮助吗？'),el('p','1＝完全不同意，2＝比较不同意，3＝一般，4＝比较同意，5＝完全同意。'));
      rating(d,'review_understanding','这次回顾帮助我看清了自己的学习情况。',answers);
      rating(d,'review_action','这次回顾帮助我决定接下来怎样学习。',answers);
      if(run.editable){
        const field=el('fieldset');field.append(el('legend','接下来准备怎样配置帮助？'));
        for(const [value,title]of [['keep','先保持当前设置'],['change','调整设置再学习']]){const label=el('label'),input=el('input');input.type='radio';input.name='review-decision';input.value=value;input.onchange=()=>answers.decision=value;label.append(input,document.createTextNode(title));field.append(label);}d.append(field);
        const reason=el('textarea');reason.rows=2;reason.maxLength=1000;reason.placeholder='例如：提示出现太早，我想减少打扰；下一部分看看能否更连贯地做题。（可不填）';reason.setAttribute('aria-label','保持或修改配置的依据');reason.oninput=()=>answers.reason=reason.value;d.append(reason);
      }
      actions.append(button('保存回顾并继续',async()=>{if(run.editable&&!answers.decision)throw new Error('请选择保持或调整');setRun(await request('review',answers));dialog.close();if(answers.decision==='change')await global.LearnerSetup.open();else if(pendingUnit){const target=pendingUnit;pendingUnit=null;selectUnit(target);}}));
    }else{
      actions.append(button('继续学习',()=>dialog.close()));
      if(run.editable)actions.append(button('查看帮助设置',()=>{dialog.close();global.LearnerSetup.open();}));
    }d.append(actions);show();
    if(typeof trackLearningEvent==='function')trackLearningEvent('study_review_opened',{studyId:run.studyId,runId:run.id,arm:run.arm,linkedFeedback:run.linkedFeedback,configurationRevisions:data.linked?.map(r=>r.revision)||[]},false).catch(()=>{});
  }
  function rating(parent,id,title,answers,choices=null){
    const field=el('fieldset');field.dataset.studyQuestion=id;field.append(el('legend',title));const row=el('div');row.className='study-rating';
    const options=choices||['1','2','3','4','5'];
    [...options,'不愿回答'].forEach((title,i)=>{const value=i===options.length?null:i+1;const label=el('label'),input=el('input');input.type='radio';input.name='study-'+id;input.value=value===null?'skip':String(value);input.checked=Object.hasOwn(answers,id)&&answers[id]===value;input.onchange=()=>answers[id]=value;label.append(input,document.createTextNode(title));row.append(label);});field.append(row);parent.append(field);
  }
  async function openSurvey(stage){
    const data=await request('survey?stage='+stage);if(data.saved){if(stage==='baseline')await global.LearnerSetup.resumePreparation();else await openTasks();return;}
    const key=(run?.id||snapshot?.ownerKey)+':'+stage,answers=surveyDrafts[key]||(surveyDrafts[key]={});
    const d=modal(stage==='baseline'?'开始前，先了解一下你':'回想这次学习体验');
    d.append(el('p',stage==='baseline'?'没有标准答案。填完后进入独立前测；不会的题可以选择“我不会”。':'请只考虑刚才这次学习。1＝完全不符合，5＝完全符合。可以选择不愿回答。'));
    if(stage==='baseline')d.append(el('p','前3题：1＝完全不符合，5＝完全符合。'));
    for(const q of data.items){const choices=q.id==='ai_experience'?['从未','偶尔','每周数次','几乎每天']:q.id==='topic_experience'?['未学过','接触过但不熟悉','已系统学过']:null;rating(d,q.id,q.text,answers,choices);}
    d.append(button('保存并继续',async()=>{await request('survey',{stage,answers});delete surveyDrafts[key];dialog.close();if(stage==='baseline')await global.LearnerSetup.resumePreparation();else await openTasks();}),button('稍后继续',()=>{dialog.close();if(stage==='baseline'&&typeof switchView==='function')switchView('home');}));show();
  }
  async function openTasks(){
    if(global.StudyEntry.arm==='assigned'&&!run){await openEnrollment();return;}
    const data=await request('state');setRun(data.run);const d=modal('问卷与后续任务');
    const p=data.preparation;
    d.append(el('p',p.stage==='ready'?'这里查看体验问卷的完成情况，以及三天后独立任务的开放时间。':'准备流程：学习前问卷 → 独立前测 → 准备帮助方式 → 开始学习。'));
    if(p.stage!=='ready')d.append(button('继续准备',async()=>{dialog.close();await global.LearnerSetup.resumePreparation();}));
    if(!run.finalSurveyAt&&data.posttestComplete)d.append(button('填写学习体验问卷',()=>openSurvey('final')));else if(run.finalSurveyAt)d.append(el('p','学习体验已保存。'));
    const j=data.judgment;
    d.append(el('h3','三天后的独立任务'),el('p',j.unlockAt?`开放时间：${new Date(j.unlockAt).toLocaleString('zh-CN')}。请先完成保持和迁移，再做六个配置判断情境。`:'完成后测72小时后，返回这里完成保持、迁移和配置判断。'));
    const outcomes=button('查看保持与迁移测验',async()=>{dialog.close();await global.KnowledgeAssistant.openOutcomeStage('retention');});outcomes.disabled=!j.unlockAt||Date.now()<Date.parse(j.unlockAt);outcomes.title=outcomes.disabled?'后测完成满72小时后开放':'';d.append(outcomes);
    if(j.status==='submitted')d.append(el('p','配置判断已提交，等待研究人员评分。'));
    else{const b=button(j.status==='active'?'继续配置判断':'开始配置判断',()=>openJudgment());b.disabled=j.status==='locked';d.append(b);}
    d.append(button('返回学习',()=>dialog.close()));show();
  }
  async function openJudgment(){
    let task=await request('judgment');if(task.status==='available')task=await request('judgment',{action:'start'});if(task.status!=='active')throw new Error(task.status==='submitted'?'配置判断已经提交':task.reason);
    attempted.add('judgment');judgmentActive=true;global.KnowledgeAssistant.refreshSupportSurface();const d=modal('配置判断：根据经历决定怎样帮助');
    d.append(el('p','请独立回答六个情境。没有要求你一定多用或少用AI：请说明保持还是调整、依据是什么、之后观察什么。不会可写“暂时无法判断”。草稿会自动保存，离开后可继续。'));
    const answers={...task.draft};let timer=0,saving=Promise.resolve(),closed=false,pendingWrite=null;
    const status=el('p');status.setAttribute('role','status');
    function persist(){saving=saving.catch(()=>{}).then(async()=>{
      status.textContent='正在保存草稿…';
      // Reuse an unacknowledged write before sending later edits with a new revision.
      if(pendingWrite){task=await request('judgment',pendingWrite);pendingWrite=null;}
      pendingWrite={action:'draft',answers:{...answers},outsidePractice:extra.value,revision:task.revision,requestId:crypto.randomUUID()};
      task=await request('judgment',pendingWrite);pendingWrite=null;status.textContent='草稿已保存';
    });return saving;}
    for(const q of task.items){const field=el('fieldset');field.append(el('legend',q.focus),el('p',q.prompt));const input=el('textarea');input.rows=4;input.maxLength=3000;input.dataset.judgment=q.id;input.setAttribute('aria-label',q.focus);input.value=answers[q.id]||'';input.oninput=()=>{answers[q.id]=input.value;clearTimeout(timer);timer=setTimeout(()=>{if(!closed)persist().catch(e=>status.textContent=e.message);},700);};field.append(input);d.append(field);}
    const extra=el('textarea');extra.rows=2;extra.maxLength=1000;extra.setAttribute('aria-label','课外练习情况');extra.placeholder='从上次学习到现在，是否另外练习过？大约多久、用了什么资源？没有可写“没有”。';extra.value=task.outsidePractice||'';extra.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!closed)persist().catch(e=>status.textContent=e.message);},700);};d.append(el('p','最后补充一下三天内的额外学习情况（可不填）：'),extra,status);
    const leave=async()=>{clearTimeout(timer);await persist();closed=true;dialog.close();};
    d.append(button('保存草稿，稍后继续',leave),button('提交六个情境回答',async()=>{clearTimeout(timer);await persist();const result=await request('judgment',{action:'submit',answers,revision:task.revision,outsidePractice:extra.value});judgmentActive=result.status==='active';closed=true;dialog.close();global.KnowledgeAssistant.refreshSupportSurface();await openTasks();}));
    d.oncancel=e=>{e.preventDefault();leave().catch(err=>status.textContent=err.message);};show();
  }
  async function openEnrollment(){const d=modal('参加本次学习研究');d.append(el('p','本次包括一次学习，以及三天后的独立任务。系统会分配一种帮助方式；将记录你的学习操作、设置、答题与问卷，用于研究学习与帮助之间的关系。你可以暂时离开，已有作答会保留；参与或数据问题请联系研究负责人。'));const label=el('label'),input=el('input');input.type='checkbox';label.append(input,document.createTextNode('我已了解研究安排，自愿参加'));d.append(label,button('确认参加并进入学习',async()=>{if(!input.checked)throw new Error('请先确认自愿参加');await request('enroll',{consent:true});location.reload();}),button('暂不参加',()=>dialog.close()));show();}
  async function showProbe(p){
    const identity=snapshot.ownerKey;
    const claim=await request('probe-claim',{id:p.id});if(!claim.claimed)return;
    if(snapshot.ownerKey!==identity)return;
    probePanel?.remove();const d=el('section'),answers={id:p.id,usefulness:null,timing:null,disruption:null,note:''};
    probePanel=d;d.id='study-experience-prompt';d.setAttribute('aria-label','帮助体验反馈');
    const status=el('p');status.setAttribute('role','status');
    const action=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};return b;};
    const close=async skipped=>{await request('probe',{...answers,skipped});d.remove();if(probePanel===d)probePanel=null;};
    const invitation=el('div'),form=el('form');invitation.className='study-experience-invitation';form.hidden=true;
    invitation.append(el('strong','刚才的帮助合适吗？'));
    invitation.append(action('反馈一下',()=>{invitation.hidden=true;form.hidden=false;d.dataset.expanded='true';form.querySelector('button')?.focus();}),action('暂不反馈',()=>close(true)));
    const heading=el('header');heading.append(el('strong','刚才的帮助体验'),action('关闭',()=>close(true)));form.append(heading);
    form.append(el('p',`${new Date(p.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})} · ${sceneNames[p.sceneType]||'当前知识点'}中的${p.kind}`));
    for(const [key,title,ends]of [['usefulness','这次询问或帮助对你有用吗？','1 完全没用—5 很有用'],['timing','它出现的时机合适吗？','1 很不合适—5 很合适'],['disruption','它打断了你的学习吗？','1 完全没有—5 非常明显']]){
      const field=el('fieldset');field.append(el('legend',title),el('small',ends));const row=el('div');row.className='study-rating';
      for(const value of [1,2,3,4,5]){const b=action(String(value),()=>{answers[key]=value;for(const x of row.children)x.setAttribute('aria-pressed',String(x===b));});b.setAttribute('aria-pressed','false');b.setAttribute('aria-label',`${title} ${value}`);row.append(b);}field.append(row);form.append(field);
    }
    const note=el('textarea');note.rows=2;note.maxLength=600;note.placeholder='想补充的经历（选填）';note.setAttribute('aria-label','补充帮助经历');note.oninput=()=>answers.note=note.value;form.append(note,action('保存反馈',()=>close(false)));
    form.onsubmit=e=>e.preventDefault();d.append(invitation,form,status);document.querySelector('.classroom-footer').prepend(d);
  }
  async function tick(){
    if(!snapshot?.signedIn||!state.authToken||loading||Date.now()-lastPoll<5000||document.hidden)return;
    loading=true;lastPoll=Date.now();const identity=snapshot.ownerKey;
    try{const data=await request('state');if(snapshot.ownerKey!==identity)return;setRun(data.run);install();
      if(snapshot.active&&!dialog?.open&&!document.querySelector('dialog[open]')&&data.judgment?.status==='active'&&!attempted.has('judgment')){await openJudgment();return;}
      if(data.probe&&snapshot.active&&!snapshot.locked&&!snapshot.check&&!snapshot.offer&&!snapshot.prompt&&!global.TaskSupport?.hasConversation(snapshot)&&!global.SupportCycleUI?.active(snapshot.supportCycle)&&!global.SupportCycleUI?.interactionBusy&&!dialog?.open&&!document.querySelector('dialog[open]')&&!attempted.has(data.probe.id)){
        attempted.add(data.probe.id);await showProbe(data.probe);
      }
    }catch(e){if(e.status===409&&global.StudyEntry.arm==='assigned'&&!run&&!dialog?.open&&!attempted.has('enroll')){attempted.add('enroll');openEnrollment();}}finally{loading=false;}
  }
  function allowsUnit(unit){if(!run||!unit?.id)return true;const stages=global.StudyStages,pending=stages.reviews.find(s=>s.id===run.pendingConfiguration?.stage);if(pending&&stages.crosses(pending,unit.id)){pendingUnit=unit.id;global.LearnerSetup.open();return false;}const required=stages.reviews.find(s=>s.points.every(id=>state.submittedQuizzes?.includes(id+'-formative'))&&!(run.reviewedStages||[]).includes(s.id)&&stages.crosses(s,unit.id));if(!required)return true;pendingUnit=unit.id;if(!dialog?.open)openReview().catch(()=>{});return false;}
  function resumeAfterConfiguration(){if(!pendingUnit||run?.pendingConfiguration)return;const target=pendingUnit;pendingUnit=null;selectUnit(target);}
  global.ThreeArmStudyUI=Object.freeze({setRun,openReview,openSurvey,openTasks,openJudgment,allowsUnit,resumeAfterConfiguration,request,get run(){return run;},get judgmentActive(){return judgmentActive;}});
  global.addEventListener('cq:proactive-state',e=>{snapshot=e.detail;if(probePanel)probePanel.hidden=!snapshot.active||snapshot.locked||Boolean(snapshot.check||snapshot.offer||snapshot.prompt||global.TaskSupport?.hasConversation(snapshot)||global.SupportCycleUI?.active(snapshot.supportCycle));if(snapshot.ownerKey!==lastOwner){const changed=Boolean(lastOwner);lastOwner=snapshot.ownerKey;if(changed){dialog?.close();probePanel?.remove();probePanel=null;attempted.clear();seenReviews.clear();for(const k of Object.keys(surveyDrafts))delete surveyDrafts[k];run=null;judgmentActive=false;pendingUnit=null;}}install();syncReview();tick();});
  setInterval(tick,5000);
})(window);
