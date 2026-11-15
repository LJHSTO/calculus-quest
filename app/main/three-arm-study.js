(function(global){
  "use strict";
  if(!global.StudyEntry)return;
  let run=null,dialog=null,snapshot=null,lastOwner='',loading=false,lastPoll=0,judgmentActive=false,pendingUnit=null;
  const surveyDrafts={},seenReviews=new Set();
  function draftKey(slot){return `study-form-draft-v2:${run?.id||snapshot?.ownerKey||''}:${run?.instrumentVersion||''}:${slot}`;}
  function formDraft(slot,initial={}){
    const key=draftKey(slot);if(surveyDrafts[key])return surveyDrafts[key];
    let value={...initial};try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&typeof saved==='object'&&!Array.isArray(saved))value={...value,...saved};}catch{}
    surveyDrafts[key]=new Proxy(value,{set(target,name,v){target[name]=v;try{localStorage.setItem(key,JSON.stringify(target));}catch{}return true;}});
    return surveyDrafts[key];
  }
  function clearDraft(slot){const key=draftKey(slot);delete surveyDrafts[key];try{localStorage.removeItem(key);}catch{}}
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
    const retrySafe=!body||['survey','review','enroll','consent'].includes(path)||(path==='judgment'&&body.action==='draft'&&Boolean(body.requestId));
    const attempts=options.attempts||3;
    for(let attempt=0;attempt<attempts;attempt++){
      if(token!==state.authToken)throw new Error('账号已变化，请重新打开');
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
      try{
        const r=await fetch('api/study/'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:payload}:{}),signal:options.signal?AbortSignal.any([controller.signal,options.signal]):controller.signal});
        const raw=await r.text();let p;try{p=JSON.parse(raw);}catch{throw Object.assign(new Error('连接暂时中断，页面中的填写内容仍保留。请重试。'),{status:r.status,retryable:true});}
        if(token!==state.authToken)throw new Error('账号已变化，请重新打开');
        if(!r.ok||p?.ok!==true)throw Object.assign(new Error(p?.message||'请求未完成，请重试。'),{status:r.status,code:p?.code,retryable:[408,429,502,503,504].includes(r.status)});
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
  function modal(title){if(!dialog){dialog=el('dialog');dialog.id='three-arm-dialog';document.body.append(dialog);}dialog.oncancel=null;dialog.onclose=null;dialog.classList.remove('study-review-dialog');delete dialog.dataset.consentForm;dialog.replaceChildren(el('h2',title));dialog.setAttribute('aria-label',title);return dialog;}
  async function show(){const host=document.fullscreenElement||document.body;if(dialog.parentElement!==host)host.append(dialog);if(!dialog.open)dialog.showModal();dialog.scrollTop=0;}
  function syncReview(){const b=document.getElementById('three-arm-review');if(!b)return;const w=global.StudyStages.reviewWindow(run,state.submittedQuizzes,typeof currentUnitId==='string'?currentUnitId:''),checking=global.KnowledgeAssistant?.pendingIndependentCheck?.();b.disabled=!w.allowed&&!checking;b.title=checking?'有一道检查尚未完成，点击返回检查或暂不检查。':w.message;}
  function setRun(value){run=value;global.dispatchEvent(new CustomEvent('cq:three-arm-state',{detail:{runId:value?.id||''}}));global.FirstSessionBudget?.update(value);judgmentActive=Boolean(value?.activeJudgment);document.getElementById('three-arm-entry-label')?.remove();syncReview();}
  function install(){
    const host=document.querySelector('.player-top .player-actions'),account=document.getElementById('account-pilot-status');if(!host||!account||document.getElementById('three-arm-review'))return;
    const review=button('学习回顾',()=>{if(typeof setUserMenuOpen==='function')setUserMenuOpen(false);return openReview();});review.id='three-arm-review';review.className='user-menu-item';account.before(review);setRun(run);
  }
  async function openReview(){
    const window=global.StudyStages.reviewWindow(run,state.submittedQuizzes,typeof currentUnitId==='string'?currentUnitId:'');
    if(global.KnowledgeAssistant?.pendingIndependentCheck?.()){
      const d=modal('先处理尚未完成的检查');d.append(el('p','这道独立检查还没有提交。可以返回继续，也可以明确选择暂不检查。'),
        button('返回独立检查',async()=>{d.close();await global.KnowledgeAssistant.resumeIndependentCheck();}),
        button('暂不检查，查看学习回顾',async()=>{await global.KnowledgeAssistant.skipPendingIndependentCheck();d.close();await openReview();}),
        button('返回学习',()=>d.close()));await show();return;
    }
    if(!window.allowed){syncReview();const d=modal('继续完成本阶段');d.append(el('p',window.message),button('返回学习',()=>d.close()));await show();return;}
    const controller=new AbortController();
    const loading=modal('学习回顾'),status=el('p','正在读取本阶段的学习记录…');status.setAttribute('role','status');
    loading.append(status,button('返回学习',()=>loading.close()));loading.onclose=()=>controller.abort();await show();
    let data;
    try{data=await request('review',null,{attempts:1,signal:controller.signal});}
    catch(error){if(controller.signal.aborted)return;status.textContent=error.message;loading.append(button('重新加载',async()=>{await global.KnowledgeAssistant.reloadLearnerPolicy();return openReview();}));return;}
    if(controller.signal.aborted||!loading.open)return;
    setRun(data.run);const d=modal(run.linkedFeedback?'学习回顾与设置关联':'学习回顾');
    d.classList.add('study-review-dialog');
    let countdown=null,stopReviewTiming=()=>{};const stopCountdown=()=>{clearInterval(countdown);countdown=null;stopReviewTiming();};
    d.append(button('返回学习',()=>d.close()));
    d.append(el('p',data.pendingStage?`“${data.pendingStage.title}”三个知识点已完成。回顾这段经历，再想想接下来怎样学。`:'这里汇总知识点检测记录；前测和后测按研究安排另行反馈。'));
    const summary=el('section');summary.className='study-review-summary';
    summary.append(el('h3','检测结果'),el('p',`已完成 ${data.ordinary.answered} 道知识点检测题，答对 ${data.ordinary.correct} 题${data.ordinary.scored<data.ordinary.answered?`，另有 ${data.ordinary.answered-data.ordinary.scored} 题等待评分`:''}。`));
    const results=el('div');results.className='study-review-results';
    for(const id of [...new Set(data.results.map(r=>r.unitId))]){const unit=typeof getUnit==='function'?getUnit(id):null,rows=data.results.filter(r=>r.unitId===id);results.append(resultRow((unit?.label||'知识点检测').replace(/^(知识点)?检测[：:]/,''),rows));}
    if(!data.results.length)results.append(el('p','完成知识点检测后，这里会出现独立作答记录。'));
    summary.append(results);
    if(data.linked)d.append(linkedReview(data));else d.append(summary);
    const actions=el('footer');actions.className='study-review-actions';
    if(data.pendingStage){
      seenReviews.add(run.id+data.pendingStage.id);
      const draftSlot='review:'+data.pendingStage.id,answers=formDraft(draftSlot,{stage:data.pendingStage.id});
      if(run.editable){
        const field=el('fieldset');field.className='study-review-decision';field.append(el('legend','接下来的帮助方式'));
        for(const [value,title]of [['keep','先保持当前设置'],['change','调整设置再学习']]){const label=el('label'),input=el('input');input.type='radio';input.name='review-decision';input.value=value;input.checked=answers.decision===value;input.onchange=()=>answers.decision=value;label.append(input,document.createTextNode(title));field.append(label);}d.append(field);
        const reasonLabel=el('label','有什么想保留或调整的？（选填）'),reason=el('textarea');reason.rows=2;reason.maxLength=1000;reason.value=answers.reason||'';reason.placeholder='可以写下刚才一次具体的使用经历。';reason.setAttribute('aria-label','保持或修改配置的依据');reason.oninput=()=>answers.reason=reason.value;reasonLabel.append(reason);d.append(reasonLabel);
      }
      const save=button('保存回顾并继续',async()=>{
        if(run.editable&&!answers.decision)throw new Error('请选择保持或调整');
        setRun(await request('review',answers));clearDraft(draftSlot);stopCountdown();dialog.close();if(answers.decision==='change')await global.LearnerSetup.open();else if(pendingUnit){const target=pendingUnit;pendingUnit=null;selectUnit(target);}});
      const timer=el('p');timer.className='study-review-timer';timer.setAttribute('aria-live','polite');
      let remaining=data.reviewWindow?.remainingSeconds||0,receivedAt=Date.now(),timingQueue=Promise.resolve();
      const minimumSeconds=data.reviewWindow?.minimumSeconds??0,sessionId=crypto.randomUUID(),timingOwner=state.authToken;
      const tick=()=>{const left=remaining?Math.max(1,remaining-(document.hidden?0:Math.floor((Date.now()-receivedAt)/1000))):0;save.disabled=remaining>0;timer.textContent=left>0?`请先查看本阶段回顾（累计阅读至少 ${minimumSeconds} 秒，还需 ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}）。关闭回顾或切到后台时暂停。`:'已完成回顾阅读，可以保存并继续。';};
      const pulse=visible=>{timingQueue=timingQueue.then(async()=>{if(timingOwner!==state.authToken)return;try{const w=await request('review-pulse',{stage:data.pendingStage.id,sessionId,visible},{attempts:1});remaining=w.remainingSeconds;receivedAt=Date.now();tick();}catch(e){if(d.open)timer.textContent='计时尚未同步，请保持网络连接；填写内容会保留。';}});return timingQueue;};
      const visibility=()=>{receivedAt=Date.now();pulse(!document.hidden&&d.open);};
      document.addEventListener('visibilitychange',visibility);
      let beats=0;tick();countdown=setInterval(()=>{if(!d.open){stopCountdown();return;}tick();if(++beats%5===0&&!document.hidden)pulse(true);},1000);
      stopReviewTiming=()=>{document.removeEventListener('visibilitychange',visibility);pulse(false);stopReviewTiming=()=>{};};
      queueMicrotask(()=>pulse(!document.hidden&&d.open));
      actions.append(timer,save);
    }else if(data.finalReview&&!run.finalSurveyAt){
      actions.append(button('已回顾，进入学习体验问卷',async()=>{
        setRun(await request('review',{stage:'final'}));d.close();await openSurvey('final');
      }));
    }else{
      actions.append(button('继续学习',()=>dialog.close()));
      if(run.editable)actions.append(button('查看帮助设置',()=>{dialog.close();global.LearnerSetup.open();}));
    }d.append(actions);d.onclose=stopCountdown;show();
    if(typeof trackLearningEvent==='function')trackLearningEvent('study_review_opened',{studyId:run.studyId,runId:run.id,arm:run.arm,linkedFeedback:run.linkedFeedback,configurationRevisions:data.linked?.map(r=>r.revision)||[],reviewOpenedAt:data.reviewWindow?.openedAt||null,helpRounds:(data.phases||[]).reduce((n,p)=>n+(p.rounds?.length||0),0)},false).catch(()=>{});
  }
  function resultRow(label,rows,afterHelp=new Set()){
    const row=el('div');row.className='study-result-row';row.append(el('span',label));
    const marks=el('span');marks.className='study-result-marks';
    for(const r of rows){const m=el('span',r.correct===true?'✓':r.correct===false?'✗':'…');m.className='study-result-mark';m.dataset.result=r.correct===true?'correct':r.correct===false?'incorrect':'pending';m.title=(r.correct===true?'答对':r.correct===false?'答错':'待评分')+(afterHelp.has(r.id)?'（在帮助之后完成）':'');if(afterHelp.has(r.id))m.dataset.afterHelp='';marks.append(m);}
    const judged=rows.filter(r=>r.correct!==null);row.append(marks,el('small',rows.length?`${judged.filter(r=>r.correct).length} / ${judged.length}`:'尚未检测'));return row;
  }
  const roundText={
    initiator:{agent_ask:'知点先询问',agent_cue:'知点直接提示',agent_quiz_review:'知点邀请看错题',learner:'我自己提问'},
    response:{accepted:'我接受',declined:'我拒绝',postponed:'我选择稍后',no_response:'没有回应',pending:'还在等待回应'},
    depth:{L1:'理清思路',L2:'一个线索',L3:'几个小步骤',L4:'带着做下一步',L5:'一个局部例子'},
    check:{correct:'帮助后独立检查：答对',incorrect:'帮助后独立检查：答错',skipped:'选择暂不检查',none:'没有出现独立检查'}
  };
  function roundNarrative(rounds){
    if(!rounds.length)return '这一段还没有知点的帮助记录。';
    const count=f=>rounds.filter(f).length,agent=count(r=>r.initiator!=='learner'),mine=rounds.length-agent;
    const parts=[['accepted','接受了'],['declined','拒绝了'],['postponed','选择稍后'],['no_response','没有回应']].map(([k,t])=>[t,count(r=>['agent_ask','agent_quiz_review'].includes(r.initiator)&&r.response===k)]).filter(([,n])=>n).map(([t,n])=>`${t} ${n} 轮`);
    const checks=rounds.filter(r=>['correct','incorrect'].includes(r.check)),ok=checks.filter(r=>r.check==='correct').length;
    return `这一段你一共遇到 ${rounds.length} 轮帮助（知点发起 ${agent} 轮${mine?`、你自己提问 ${mine} 轮`:''}），${parts.join('、')}。${checks.length?`帮助后做了 ${checks.length} 次独立检查，答对 ${ok} 次。`:'帮助后还没有做过独立检查。'}`;
  }
  function roundTimeline(rounds){
    const root=el('section');root.className='study-round-explorer';
    const rail=el('div');rail.className='study-round-rail';rail.setAttribute('role','group');rail.setAttribute('aria-label','选择一轮帮助查看过程');
    const detail=el('div');detail.className='study-round-detail';detail.setAttribute('aria-live','polite');
    const choose=index=>{
      for(const [i,b] of [...rail.children].entries())b.setAttribute('aria-pressed',String(i===index));
      const r=rounds[index],unit=typeof getUnit==='function'?getUnit(r.scope):null;
      detail.replaceChildren(el('strong',`第 ${index+1} 轮 · ${unit?.label||'本知识点'} · ${r.source==='formative'?'检测后':sceneNames[r.sceneType]||'学习中'}`));
      const flow=el('ol');flow.className='study-round-flow';
      const items=[roundText.initiator[r.initiator]||'帮助'];
      if(['agent_ask','agent_quiz_review'].includes(r.initiator))items.push(roundText.response[r.response]||'未回应');
      items.push(r.helpSeenAt?'知点的帮助已显示':r.response==='accepted'?'已接受，尚无帮助显示记录':'未进入讲解');
      if(r.depth&&r.helpSeenAt)items[items.length-1]+=' · '+(roundText.depth[r.depth]||'');
      if(r.followups)items.push(`继续交流 ${r.followups} 次`);
      items.push(roundText.check[r.check]||roundText.check.none);
      for(const text of items)flow.append(el('li',text));detail.append(flow);
    };
    rounds.forEach((r,i)=>{const b=button(String(i+1),()=>choose(i));b.dataset.response=r.response;b.dataset.check=r.check;b.setAttribute('aria-label',`查看第 ${i+1} 轮帮助`);rail.append(b);});
    root.append(el('p','点击圆点，回看一次帮助'),rail,detail);choose(Math.max(0,rounds.findIndex(r=>['agent_ask','agent_quiz_review','agent_cue'].includes(r.initiator))));return root;
  }
  function linkedReview(data){
    const root=el('section');root.dataset.linkedFeedback='';root.className='study-linked-review';
    root.append(el('h3','我的帮助使用轨迹'),el('p','先看设置，再看实际发生了什么。点击编号可展开一轮帮助。'));
    const grid=el('div');grid.className='study-phase-grid';
    const shortChoices={standard:'明确线索',cautious:'多类线索',boundary:'完成小步',quiet:'少来打扰',hint:'一个线索',guided:'几个小步',example:'相关例子',inline:'任务旁',sidebar:'对话侧栏',ask:'先询问',cue:'直接提示',stop:'先自己试',followup:'按需再帮一次'};
    for(const [index,phase]of (data.phases||[]).entries()){
      const card=el('article');card.className='study-linked-card';card.dataset.studyPhase=phase.id;
      card.append(el('h4',`第 ${index+1} 阶段`),el('p',phase.title));
      if(!phase.started){card.append(el('p','下一阶段将在这次回顾后开始。'));grid.append(card);continue;}
      const config=phase.configuration,prior=data.phases[index-1]?.configuration;card.dataset.configurationRevision=config?.revision||'';
      const settings=el('div');settings.className='study-setting-tiles';
      if(config)for(const [i,dim]of global.LearnerPreferences.dimensions.entries()){
        const a=config.answers[dim.id],changed=Boolean(prior&&prior.answers[dim.id]?.value!==a.value);
        const tile=el('div');tile.className='study-setting-tile';tile.dataset.changed=String(changed);
        tile.append(el('small',`${i+1} · ${dim.short}${changed?' · 已调整':''}`),el('strong',shortChoices[a.value]||dim.options.find(o=>o[0]===a.value)?.[1]||a.value));settings.append(tile);
      }
      card.append(el('h5','当时的六项设置'),settings);
      const settingStatus=el('small',prior?(phase.decision==='keep'?'沿用第一阶段的设置':'带着调整后的设置继续学习'):'开始学习时的设置');settingStatus.className='study-setting-status';card.append(settingStatus);
      const rounds=phase.rounds||[],seen=rounds.filter(r=>r.helpSeenAt),checks=rounds.filter(r=>['correct','incorrect'].includes(r.check));
      const metrics=el('div');metrics.className='study-journey-metrics';
      for(const [n,label]of [[rounds.filter(r=>r.initiator!=='learner').length,'主动提醒'],[seen.length,'显示帮助'],[rounds.reduce((n,r)=>n+r.followups,0),'继续交流'],[checks.length,'独立检查']]){const m=el('div');m.append(el('strong',String(n)),el('span',label));metrics.append(m);}
      card.append(el('h5','实际使用'),metrics);
      if(rounds.length){
        const prompted=rounds.filter(r=>['agent_ask','agent_quiz_review'].includes(r.initiator));
        const responses=[['accepted','接受'],['declined','拒绝'],['postponed','稍后'],['no_response','未回应'],['pending','待选择']];
        const bar=el('div');bar.className='study-response-bar';bar.setAttribute('role','img');
        bar.setAttribute('aria-label','对知点邀请的回应：'+responses.map(([id,label])=>`${label} ${prompted.filter(r=>r.response===id).length} 次`).join('，'));
        for(const [id,label]of responses){const n=prompted.filter(r=>r.response===id).length;if(n){const part=el('span',`${label} ${n}`);part.dataset.response=id;part.style.flex=String(n);bar.append(part);}}
        if(prompted.length)card.append(el('small','我怎样回应知点的邀请'),bar);
        card.append(roundTimeline(rounds));
      }else card.append(el('p','这一阶段没有帮助记录。'));
      card.append(el('h5','自己完成的检测'));
      const afterHelp=new Set(phase.results.filter(r=>seen.some(h=>r.unitId===h.scope+'-formative'&&Date.parse(r.at)>=Date.parse(h.helpSeenAt))).map(r=>r.id));
      const overview=el('div');overview.className='study-review-results';
      for(const point of phase.points){const u=typeof getUnit==='function'?getUnit(point):null;overview.append(resultRow(u?.label||'知识点',phase.results.filter(r=>r.unitId===point+'-formative'),afterHelp));}
      card.append(overview,el('small','✓ 答对　✗ 待巩固　○ 帮助显示后的作答'));
      grid.append(card);
    }
    root.append(grid);
    const guidance=el('aside');guidance.className='study-review-reading';guidance.append(el('strong',data.finalReview?'回想哪次帮助最符合你的需要':'下一阶段，想保留还是调整？'),el('p','可以留意提醒的时机、讲法和阅读位置，再结合自己的独立作答判断。'));root.append(guidance);
    return root;
  }

  function rating(parent,id,title,answers,choices=null,notApplicable=null){
    const field=el('fieldset');field.dataset.studyQuestion=id;field.append(el('legend',title));const row=el('div');row.className='study-rating';
    const options=choices||['1','2','3','4','5'];
    options.forEach((title,i)=>{const value=i+1;const label=el('label'),input=el('input');input.type='radio';input.required=true;input.name='study-'+id;input.value=String(value);input.checked=Object.hasOwn(answers,id)&&answers[id]===value;input.onchange=()=>answers[id]=value;label.append(input,document.createTextNode(title));row.append(label);});if(notApplicable){const label=el('label'),input=el('input');input.type='radio';input.name='study-'+id;input.value='na';input.checked=answers[id]==='na';input.onchange=()=>answers[id]='na';label.append(input,document.createTextNode(notApplicable));row.append(label);}field.append(row);parent.append(field);
  }
  function textQuestion(parent,q,answers){
    const field=el('fieldset');field.dataset.studyQuestion=q.id;field.className='study-text-question';
    const scenarioTitle={scenario_timing:'情境一：什么时候出现帮助',scenario_initiative:'情境二：看过例子以后'}[q.id];
    if(scenarioTitle){
      field.classList.add('study-scenario-question');field.append(el('legend',scenarioTitle));
      const marker=q.id==='scenario_timing'?'下一阶段你建议':'你建议',split=q.text.indexOf(marker);
      const story=el('div');story.className='study-scenario-story';
      const evidence=split>=0?q.text.slice(0,split):q.text;
      // Preserve the instrument wording; only separate the observed events.
      for(const sentence of evidence.match(/[^。；]+[。；]?/g)||[])story.append(el('p',sentence));
      field.append(story);if(split>=0)field.append(el('p',q.text.slice(split)));
    }else field.append(el('legend',q.text));
    const input=el('textarea');input.rows=q.optional?2:4;input.maxLength=1500;input.setAttribute('aria-label',q.text);input.placeholder=q.placeholder||(q.optional?'可不填':'写下你的建议和理由');
    if(typeof answers[q.id]==='string')input.value=answers[q.id];
    field.append(input);
    input.required=!q.optional;
    input.oninput=()=>{answers[q.id]=input.value;};
    parent.append(field);
  }
  async function openSurvey(stage){
    const data=await request('survey?stage='+stage);
    // Bind the draft to the response's owner/version even when the background
    // study-state request has not finished immediately after login or reload.
    if(data.run)setRun(data.run);
    if(stage==='baseline'&&run&&!run.consentReceiptHash){await openEnrollment();return;}
    if(data.saved){if(stage==='baseline')await global.LearnerSetup.resumePreparation();else await openTasks();return;}
    if(stage==='final'&&!run.finalReviewAt){await openReview();return;}
    const answers=formDraft('survey:'+stage);
    const consent=stage==='baseline'?await request('consent'):null;
    const d=modal(stage==='baseline'?'参与确认与学习前问卷':'回想这次学习体验');
    if(consent?.receipt){const signed=el('details');signed.append(el('summary','1. 知情同意（已签署，可查看或保存副本）'));renderConsent(signed,consent.receipt.document,consent.receipt);d.append(signed,el('h3','2. 学习前问卷'));}
    if(stage==='baseline'&&run?.previousRunId)d.append(el('p','这是新开始的一轮学习。此前的答题、笔记与设置仍保留在上一轮记录中。'));
    d.append(el('p',stage==='baseline'?'问卷没有标准答案，请按真实情况填写。之后是独立前测，遇到没学过的概念可以选择“我不会”，无需猜测。':'请只考虑刚才这次学习。1＝完全不符合，5＝完全符合。'));
    if(stage==='baseline')d.append(el('p','本站的 AI 学习伙伴叫“知点”，入口在学习页面右上角。它可以解释概念、提供线索并回应问题；前测请先独立完成。你还没有用过它也没关系，下面按自己目前的情况回答。'));
    d.append(el('p','请完成必答题；标注选填的内容可留空。填写会自动保存在当前浏览器，稍后可继续。'));
    let section=null;
    for(const q of data.items){
      if(q.section&&q.section!==section){section=q.section;d.append(el('h3',section));if(q.type==='text'&&!q.optional)d.append(el('p','没有标准答案，写出你的建议和理由即可，两三句话就够。'));}
      if(q.type==='text'){textQuestion(d,q,answers);continue;}
      const choices=q.type==='choice'?q.options:null;
      rating(d,q.id,q.text+(choices?'':'（'+q.scale+'）'),answers,choices,q.allowNotApplicable?q.notApplicableLabel:null);
    }
    d.append(button('保存并继续',async()=>{await request('survey',{stage,answers});clearDraft('survey:'+stage);dialog.close();if(stage==='baseline')await global.LearnerSetup.resumePreparation();else await openTasks();}),button('稍后继续',()=>{dialog.close();if(stage==='baseline'&&typeof switchView==='function')switchView('home');}));show();
  }
  async function openTasks(){
    if(global.StudyEntry.arm==='assigned'&&!run){
      try{setRun((await request('state')).run);}
      catch(error){if(error.code!=='study_enrollment_required')throw error;await openEnrollment();return;}
    }
    const data=await request('state');setRun(data.run);const d=modal('问卷与后续任务');
    if(run.previousRunId)d.append(button('查看上一轮记录',async()=>{
      const previous=await request('previous'),view=modal('上一轮体验记录');
      view.append(el('p',`本页只读。上一轮共保存 ${previous.results.length} 道题的作答；原笔记和配置仍保存在该轮次中。`));
      for(const phase of ['pre','formative','post']){const rows=previous.results.filter(r=>r.phase===phase);if(rows.length)view.append(el('p',`${{pre:'前测',formative:'知识点检测',post:'后测'}[phase]}：已保存 ${rows.length} 题。`));}
      view.append(button('返回本轮任务',openTasks));await show();
    }));
    const p=data.preparation;
    if(run.consentReceiptHash)d.append(button('查看已签署的知情同意书',()=>openEnrollment()));
    d.append(el('p',p.stage==='ready'?'这里查看体验问卷的完成情况，以及三天后独立任务的开放时间。':'准备流程：学习前问卷 → 独立前测 → 操作指引 → 准备帮助方式 → 开始学习。'));
    if(p.stage!=='ready')d.append(button('继续准备',async()=>{dialog.close();await global.LearnerSetup.resumePreparation();}));
    if(!run.finalSurveyAt&&data.posttestComplete)d.append(button(run.finalReviewAt?'填写学习体验问卷':'先回顾两阶段，再填写问卷',()=>run.finalReviewAt?openSurvey('final'):openReview()));else if(run.finalSurveyAt)d.append(el('p','学习体验已保存。'));
    if(data.posttestComplete)d.append(button(run.linkedFeedback?'比较两阶段的配置与学习经历':'回顾两阶段学习结果',openReview));
    const newer=Boolean(data.regulation),j=data.regulation||data.judgment;
    const order=newer?'先完成保持与数学迁移，再进入14分钟调节任务。':'先完成保持与数学迁移，再独立回答学习帮助情境。';
    d.append(el('h3','三天后的独立任务'),el('p',j.unlockAt?`开放时间：${new Date(j.unlockAt).toLocaleString('zh-CN')}。${order}`:`完成后测72小时后开放。${order}`));
    if(newer&&j.status==='locked')d.append(el('p',j.reason));
    const outcomes=button('查看保持与迁移测验',async()=>{dialog.close();await global.KnowledgeAssistant.openOutcomeStage('retention');});outcomes.disabled=!j.unlockAt||Date.now()<Date.parse(j.unlockAt);outcomes.title=outcomes.disabled?'后测完成满72小时后开放':'';d.append(outcomes);
    if(newer){const b=button(j.status==='active'?'继续14分钟调节任务':'开始14分钟调节任务',async()=>{dialog.close();await openJudgment();});b.disabled=!['available','active'].includes(j.status);d.append(b);if(['submitted','expired'].includes(j.status))d.append(el('p','调节任务记录已保存。'));}
    else if(j.status==='submitted')d.append(el('p','学习帮助情境已提交，等待研究人员评分。'));
    else{const b=button(j.status==='active'?'继续学习帮助情境':'开始学习帮助情境',()=>openJudgment());b.disabled=j.status==='locked';d.append(b);}
    if(data.finalFeedback?.available)d.append(button('查看独立测量反馈',openFinalFeedback));
    else if(data.finalFeedback?.reason)d.append(el('p',data.finalFeedback.reason));
    if(run.mode==='preview'){
      const optional=el('details');optional.append(el('summary','需要重新开始时'),el('p','可从头开始另一轮学习。本轮记录会保留；继续当前任务无需重新开始。'),
        button('重新开始一次学习（当前记录保留）',async()=>{
          const previous=run.id,confirm=modal('重新开始一次学习');confirm.append(el('p','确认后将从学习前问卷和独立前测重新开始。本轮的答题、笔记和设置会保留，可在后续任务中查看上一轮记录。'),
            button('确认从头开始',async()=>{await request('preview/new',{previousRunId:previous});location.reload();}),button('返回本轮任务',openTasks));await show();
        }));d.append(optional);
    }
    d.append(button('返回学习',()=>dialog.close()));show();
  }
  async function openFinalFeedback(){
    const feedback=await request('final-feedback'),d=modal('独立测量教学反馈');
    d.append(el('p','以下内容对应本轮保存的作答。未作答题目不会显示答案。'));
    for(const phase of feedback.phases){
      d.append(el('h3',phase.label));
      for(const item of phase.items){
        const section=el('section');section.append(el('h4',item.submitted?item.prompt:'本题未作答'));
        if(item.submitted){
          if(item.figure&&typeof renderAssessmentFigure==='function'){const figure=el('div');figure.innerHTML=renderAssessmentFigure(item.figure);section.append(figure);}
          section.append(el('p','你的作答：'+(item.response||'未作答')),el('p','参考答案：'+(item.correctAnswer||'等待人工评分')));
          if(item.explanation)section.append(el('p','解析：'+item.explanation));
        }
        d.append(section);
      }
    }
    for(const stage of feedback.delayed){
      d.append(el('h3',stage.label));
      for(const item of stage.review?.items||[]){const section=el('section');section.append(el('h4',item.prompt),el('p','你的作答：'+item.responseLabel),el('p','参考答案：'+(item.correctOptionLabel||'未提供')));if(item.figure&&typeof renderAssessmentFigure==='function'){const figure=el('div');figure.innerHTML=renderAssessmentFigure(item.figure);section.append(figure);}d.append(section);}
    }
    d.append(button('返回后续任务',openTasks));await show();
  }
  async function openJudgment(){
    if(run?.regulationVersion){attempted.add('judgment');dialog?.close();return global.RegulationTransferUI.open();}
    let task=await request('judgment');if(task.status==='available')task=await request('judgment',{action:'start'});if(task.status!=='active')throw new Error(task.status==='submitted'?'配置判断已经提交':task.reason);
    attempted.add('judgment');judgmentActive=true;global.KnowledgeAssistant.refreshSupportSurface();const d=modal('学习帮助情境：怎样选择帮助');
    d.append(el('p','请独立回答下列情境。没有要求你一定多用或少用AI：请说明保持还是调整、依据是什么、之后观察什么。不会可写“暂时无法判断”。草稿会自动保存，离开后可继续。'));
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
    d.append(button('保存草稿，稍后继续',leave),button('提交情境回答',async()=>{clearTimeout(timer);await persist();const result=await request('judgment',{action:'submit',answers,revision:task.revision,outsidePractice:extra.value});judgmentActive=result.status==='active';closed=true;dialog.close();global.KnowledgeAssistant.refreshSupportSurface();await openTasks();}));
    d.oncancel=e=>{e.preventDefault();leave().catch(err=>status.textContent=err.message);};show();
  }
  function renderConsent(parent,doc,receipt){
    for(const [heading,text] of doc.sections){const section=el('section');section.append(el('h3',heading),el('p',text));parent.append(section);}
    parent.append(el('small','同意书版本：'+doc.version));
    if(receipt){
      parent.append(el('p','参与者姓名：'+receipt.participantName),el('p','电子签名：'+receipt.signature),el('p','签署时间：'+new Date(receipt.signedAt).toLocaleString('zh-CN')));
      parent.append(button('保存签署副本',()=>{const text=[doc.title,...doc.sections.flat(),`姓名：${receipt.participantName}`,`电子签名：${receipt.signature}`,`签署时间：${receipt.signedAt}`,`同意书版本：${doc.version}`,`记录校验：${receipt.receiptHash}`].join('\n\n');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=el('a');a.href=url;a.download='知情同意签署副本.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
    }
  }
  async function openEnrollment(){
    const existing=Boolean(run),data=await request(existing?'consent':'enrollment-document'),receipt=data.receipt,doc=receipt?.document||data.document;
    const d=modal(receipt?'已签署的知情同意书':'参与确认与学习前问卷');d.dataset.consentForm='';
    if(run?.mode==='preview')d.append(el('p','当前是体验入口，可用测试姓名检查签署流程；不会作为正式入组。'));
    if(!receipt)d.append(el('p','请先阅读并签署知情同意书，随后在本页填写学习前问卷。签署前不会填写或保存问卷答案。'),el('h3','1. 阅读并签署知情同意书'));
    renderConsent(d,doc,receipt);
    if(receipt){d.append(button('返回学习',()=>d.close()));await show();return;}
    const form=el('form');form.className='study-consent-signature';
    const nameLabel=el('label','参与者完整姓名'),name=el('input');name.name='participant-name';name.autocomplete='name';name.required=true;name.minLength=2;name.maxLength=80;nameLabel.append(name);
    const signLabel=el('label','电子签名（再次输入完整姓名）'),signature=el('input');signature.name='participant-signature';signature.required=true;signature.maxLength=80;signLabel.append(signature);
    const ageLabel=el('label'),adult=el('input');adult.type='checkbox';adult.required=true;ageLabel.append(adult,document.createTextNode('我已年满18周岁'));
    const consentLabel=el('label'),agreed=el('input');agreed.type='checkbox';agreed.required=true;consentLabel.append(agreed,document.createTextNode('我已阅读并理解以上说明，疑问已得到解答，自愿参加，并确认上述姓名作为我的电子签名'));
    const submit=button('签署并填写学习前问卷',async()=>{
      if(!form.reportValidity())return;
      const payload={participantName:name.value,signature:signature.value,adult:adult.checked,consent:agreed.checked,consentVersion:doc.version,consentHash:doc.hash};
      const result=await request(existing?'consent':'enroll',payload);setRun(existing?result.run:result);
      if(!existing){
        // Enrollment binds a new learning owner and may assign the other test form.
        multiSceneLearningRoute=null;courseIndex=null;await loadMultiSceneLearningRoute();buildCurriculum();
        await hydrateLearningState({replace:true});renderAll();
      }
      await openSurvey('baseline');
    });
    form.append(nameLabel,signLabel,ageLabel,consentLabel,submit);form.onsubmit=e=>{e.preventDefault();submit.click();};d.append(form,button('暂不参加',()=>{d.close();if(typeof switchView==='function')switchView('home');}));await show();
  }
  function probeIcon(){
    const ns='http://www.w3.org/2000/svg',icon=document.createElementNS(ns,'svg');
    icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.classList.add('study-experience-icon');
    for(const [tag,attrs]of [['path',{d:'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z',fill:'currentColor'}],['path',{d:'M12 6.3l1.1 2.3 2.5.3-1.9 1.7.5 2.5L12 11.9l-2.2 1.2.5-2.5-1.9-1.7 2.5-.3z',fill:'#fff'}]]){const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);icon.append(n);}
    return icon;
  }
  async function showProbe(p){
    const identity=snapshot.ownerKey;
    const claim=await request('probe-claim',{id:p.id});if(!claim.claimed)return;
    if(snapshot.ownerKey!==identity)return;
    probePanel?.remove();const d=el('section'),draftSlot='probe:'+p.id,answers=formDraft(draftSlot,{id:p.id,usefulness:null,timing:null,disruption:null,note:''});
    probePanel=d;d.id='study-experience-prompt';d.setAttribute('aria-label','帮助体验反馈');
    const status=el('p');status.setAttribute('role','status');
    const action=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};return b;};
    const close=async skipped=>{await request('probe',{...answers,skipped});clearDraft(draftSlot);d.remove();if(probePanel===d)probePanel=null;};
    const invitation=el('div'),form=el('form');invitation.className='study-experience-invitation';form.hidden=true;
    invitation.append(probeIcon(),el('strong','刚才的帮助合适吗？'));
    invitation.append(action('反馈一下',()=>{invitation.hidden=true;form.hidden=false;d.dataset.expanded='true';form.querySelector('button')?.focus();}),action('暂不反馈',()=>close(true)));
    const heading=el('header'),title=el('div');title.className='study-experience-title';title.append(probeIcon(),el('strong','刚才的帮助体验'));heading.append(title,action('关闭',()=>close(true)));form.append(heading);
    form.append(el('p',`${new Date(p.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})} · ${sceneNames[p.sceneType]||'当前知识点'}中的${p.kind}`));
    for(const [key,title,ends]of [['usefulness','这次询问或帮助对你有用吗？','1 完全没用—5 很有用'],['timing','它出现的时机合适吗？','1 很不合适—5 很合适'],['disruption','它打断了你的学习吗？','1 完全没有—5 非常明显']]){
      const field=el('fieldset');field.append(el('legend',title),el('small',ends));const row=el('div');row.className='study-rating';
      for(const value of [1,2,3,4,5]){const b=action(String(value),()=>{answers[key]=value;for(const x of row.children)x.setAttribute('aria-pressed',String(x===b));});b.setAttribute('aria-pressed',String(answers[key]===value));b.setAttribute('aria-label',`${title} ${value}`);row.append(b);}field.append(row);form.append(field);
    }
    const note=el('textarea');note.rows=2;note.maxLength=600;note.value=answers.note||'';note.placeholder='想补充的经历（选填）';note.setAttribute('aria-label','补充帮助经历');note.oninput=()=>answers.note=note.value;form.append(note,action('保存反馈',()=>close(false)));
    form.onsubmit=e=>e.preventDefault();d.append(invitation,form,status);document.querySelector('.classroom-footer').prepend(d);
  }
  async function tick(){
    if(!snapshot?.signedIn||!state.authToken||loading||Date.now()-lastPoll<5000||document.hidden)return;
    loading=true;lastPoll=Date.now();const identity=snapshot.ownerKey;
    try{const data=await request('state');if(snapshot.ownerKey!==identity)return;setRun(data.run);install();
      if(snapshot.active&&!dialog?.open&&!document.querySelector('dialog[open]')&&(data.judgment?.status==='active'||data.regulation?.status==='active')&&!attempted.has('judgment')){await openJudgment();return;}
      if(data.probe&&snapshot.active&&!snapshot.locked&&!snapshot.check&&!snapshot.offer&&!snapshot.prompt&&!global.TaskSupport?.hasConversation(snapshot)&&!global.SupportCycleUI?.active(snapshot.supportCycle)&&!global.SupportCycleUI?.interactionBusy&&!dialog?.open&&!document.querySelector('dialog[open]')&&!attempted.has(data.probe.id)){
        attempted.add(data.probe.id);await showProbe(data.probe);
      }
    }catch(e){if(e.code==='study_enrollment_required'&&global.StudyEntry.arm==='assigned'&&!run&&!dialog?.open&&!attempted.has('enroll')){attempted.add('enroll');openEnrollment();}}finally{loading=false;}
  }
  function allowsUnit(unit){if(!run||!unit?.id)return true;const stages=global.StudyStages,pending=stages.reviews.find(s=>s.id===run.pendingConfiguration?.stage);if(pending&&stages.crosses(pending,unit.id)){pendingUnit=unit.id;global.LearnerSetup.open();return false;}const required=stages.reviews.find(s=>s.points.every(id=>state.submittedQuizzes?.includes(id+'-formative'))&&!(run.reviewedStages||[]).includes(s.id)&&stages.crosses(s,unit.id));if(!required)return true;pendingUnit=unit.id;if(!dialog?.open)openReview().catch(()=>{});return false;}
  function resumeAfterConfiguration(){if(!pendingUnit||run?.pendingConfiguration)return;const target=pendingUnit;pendingUnit=null;selectUnit(target);}
  global.ThreeArmStudyUI=Object.freeze({setRun,openReview,openSurvey,openTasks,openJudgment,allowsUnit,resumeAfterConfiguration,request,get run(){return run;},get judgmentActive(){return judgmentActive||Boolean(global.RegulationTransferUI?.active||run?.regulationActive);}});
  global.addEventListener('cq:proactive-state',e=>{snapshot=e.detail;if(probePanel)probePanel.hidden=!snapshot.active||snapshot.locked||Boolean(snapshot.check||snapshot.offer||snapshot.prompt||global.TaskSupport?.hasConversation(snapshot)||global.SupportCycleUI?.active(snapshot.supportCycle));if(snapshot.ownerKey!==lastOwner){const changed=Boolean(lastOwner);lastOwner=snapshot.ownerKey;if(changed){dialog?.close();probePanel?.remove();probePanel=null;attempted.clear();seenReviews.clear();for(const k of Object.keys(surveyDrafts))delete surveyDrafts[k];run=null;global.FirstSessionBudget?.update(null);judgmentActive=false;pendingUnit=null;}}install();syncReview();tick();});
  setInterval(tick,5000);
})(window);
