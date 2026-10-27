(function(global){
  'use strict';
  const C=global.LearnerPreferences;
  let dialog=null,pilot=null,record=null,answers=C.defaults(),step=0,busy=false,started=0,owner='',message='',mode='preferences',enabled=false,lastFocus=null;
  const drafts={};
  let configurationWindow=null,selectionSource='reviewed_choices',lastStep='';
  let preparation=null,refreshing=null,routing=false,currentGeneration=null;
  const hasSavedPreferences=()=>Boolean(record&&(record.generation==null||record.generation===currentGeneration));
  function applyData(d){currentGeneration=d.generation;record=d.record;enabled=d.enabled;pilot=d.pilot;configurationWindow=d.configurationWindow;preparation=d.preparation;}
  async function refreshPreparation(){if(refreshing)return refreshing;const token=state.authToken;if(!token)return;refreshing=request().then(d=>{if(token===state.authToken){applyData(d);renderGuide();if(typeof renderBottomNextButton==='function')renderBottomNextButton();}return d;}).finally(()=>refreshing=null);return refreshing;}
  const ordinaryRequired=unit=>preparation?.required&&unit?.chapterId===preparation.chapterId;
  function afterPretest(unit){return unit?.assessmentPhase==='pre'&&(ordinaryRequired(unit)||(pilot?.enrollment?.studyDesign==='learner-configurable-20-v1'&&pilot.enrollment.status==='active'));}
  const isReady=()=>pilot?.enrollment?.status==='active'?pilot.enrollment.stage==='ready':preparation?.stage==='ready';
  const pretestActionLabel=()=>isReady()?'继续学习':pilot?.enrollment?.stage==='baseline'?'下一步：学习前问卷':'下一步：设置学习方式';
  const pretestStatusLabel=()=>pilot?.enrollment?.arm==='control'?'学习准备已完成':'学习方式已设置';
  async function resumePreparation(){if(routing)return;routing=true;try{await refreshPreparation();if(pilot?.enrollment?.status==='active'){await openPilot(pilot);return;}if(preparation?.required&&preparation.stage!=='ready'){if(preparation.stage==='entry'){await global.PilotStudyUI.open();}else if(preparation.stage==='pretest'){await goPretest();}else await open();}}catch(e){message=e.message;mode='entry-error';show();}finally{routing=false;}}
  function allowsUnit(unit){
    const resultPage=unit.assessmentPhase==='pre'&&pilot?.enrollment?.stage==='configuration';
    const allowed=preparation?.stage!=='entry'&&(!isPreparing(pilot?.enrollment)||resultPage)&&(pilot?.enrollment?.stage!=='pretest'||unit.id==='V14-C1-pre')&&!(ordinaryRequired(unit)&&preparation.stage!=='ready'&&unit.id!==preparation.chapterId+'-pre');
    if(!allowed)resumePreparation();return allowed;
  }
  function logJourney(type,data={}){if(typeof trackLearningEvent==='function')trackLearningEvent(type,{...data,preferenceContract:C.version},false).catch(()=>{});}
  const experimental=()=>pilot?.enrollment?.arm==='configurable'&&pilot.enrollment.status==='active';
  const surveyContract=()=>pilot?.version?.configurationContract||C;
  const isPreparing=e=>e?.studyDesign==='learner-configurable-20-v1'&&e.status==='active'&&!['ready','pretest'].includes(e.stage);
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  function button(text,fn,primary=false){const b=el('button',text);b.type='button';b.className=primary?'learner-primary':'learner-secondary';b.onclick=async()=>{if(busy)return;message='';b.disabled=true;try{await fn();}catch(e){message=e.message;draw();}finally{b.disabled=false;}};return b;}
  async function request(body){const token=state.authToken;if(!token)throw new Error('请先登录');const r=await fetch('api/learning/learner-preferences',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(token!==state.authToken)throw new Error('登录账号已变化，请重新打开');if(!r.ok||!p.ok)throw new Error(p.message||'暂未保存，请重试');return p.data;}
  function setPilot(p){pilot=p;if(p.enrollment)preparation=null;global.dispatchEvent(new CustomEvent('cq:pilot-enrollment',{detail:p}));
    renderGuide();
    // Preparing is resumed by explicit journey buttons; result pages never auto-close.
  }
  function show(){if(!dialog){dialog=el('dialog');dialog.id='learner-setup';dialog.setAttribute('aria-labelledby','learner-setup-title');document.body.append(dialog);dialog.addEventListener('cancel',e=>{e.preventDefault();leave();});}
    lastFocus=document.activeElement;draw();if(!dialog.open)dialog.showModal();dialog.querySelector('h2')?.focus();}
  function leave(){dialog.close();if((preparation?.required&&preparation.stage!=='ready'||pilot?.enrollment?.status==='active'&&pilot.enrollment.stage!=='ready')&&typeof switchView==='function')switchView('home');lastFocus?.focus?.();}
  async function open(){message='';const d=await request();applyData(d);
    if(preparation?.required&&preparation.stage==='entry'){await global.PilotStudyUI.open();return;}
    if(preparation?.required&&preparation.stage==='pretest'){mode='pretest';show();return;}
    if(pilot?.enrollment?.studyDesign==='learner-configurable-20-v1'&&pilot.enrollment.status==='active'&&pilot.enrollment.stage==='baseline'){openPilot(pilot);return;}
    mode='preferences';answers=hasSavedPreferences()?structuredClone(record.answers):C.defaults();if(experimental()&&answers.D5.value==='request'){answers.D5={value:'ask',reason:'',note:''};}step=hasSavedPreferences()?6:0;selectionSource='reviewed_choices';lastStep='';started=Date.now();show();}
  async function openPilot(p){pilot=p;message='';const e=p.enrollment;
    if(e.stage==='baseline'){mode='baseline';show();return;}
    if(e.stage==='configuration'){await open();return;}
    if(e.stage==='pretest'){mode='pretest';show();return;}
    mode='study';show();}
  async function goPretest(){dialog?.close();await ensureChapterLoaded('V14-C1');switchView('learn');selectUnit('V14-C1-pre');renderGuide();}
  async function continueAfterPretest(){logJourney('pilot_pretest_continue');await global.PilotStudyUI?.reload?.();await refreshPreparation();if(isReady()){await beginLearning();return;}if(pilot?.enrollment?.studyDesign==='learner-configurable-20-v1'&&pilot.enrollment.status==='active')await openPilot(pilot);else await open();}
  async function beginLearning(){dialog?.close();switchView('learn');await ensureChapterLoaded('V14-C1',{showLoading:false});
    if(typeof currentUnitId==='string'&&currentUnitId==='V14-C1-pre'){
      const path=typeof ensureAgenticPath==='function'?ensureAgenticPath():null;
      if(path?.pendingPlan?.phase==='pre_knowledge_selection'){
        if(pilot?.enrollment?.status==='active'||preparation?.required){const action=path.pendingPlan.actions.find(a=>a.type==='select_knowledge');for(const c of action?.knowledgeChoices||[])c.checked=true;await agenticApplyDecision('select_knowledge');await syncLearningSnapshot('pilot_learning_started');return;}
        global.LearningWorkspace?.showCoach();return;}
      if(typeof agenticOpenUnit==='function'){const chapter=getChapter('V14-C1'),target=chapter?.units?.find(u=>u.id!=='V14-C1-pre'&&!['retention','transfer'].includes(u.assessmentPhase)&&!(state.completed||[]).includes(u.id));if(target){agenticUnlockUnit(target.id,'pilot_ready');await agenticOpenUnit(target.id,{source:'pilot_ready'});}}
    }await syncLearningSnapshot('pilot_learning_started');renderGuide();}
  function syncEntrances(){const unit=typeof getUnit==='function'&&typeof currentUnitId==='string'?getUnit(currentUnitId):null;
    const pre=unit?.assessmentPhase==='pre',joined=Boolean(pilot?.enrollment);
    for(const selector of ['#pilot-entry-button','#home-pilot-entry']){const node=document.querySelector(selector);if(node)node.hidden=joined||(pre&&selector==='#pilot-entry-button');}
    for(const selector of ['#learner-preferences-button','.proactive-hud-toggle-btn']){const node=document.querySelector(selector);if(node)node.hidden=pre;}
    const prefs=document.getElementById('learner-preferences-button');if(prefs){prefs.textContent=hasSavedPreferences()?'学习偏好 · 已设置':'学习偏好';prefs.dataset.configured=String(hasSavedPreferences());}
    const status=document.getElementById('account-pilot-status');if(status){status.hidden=!joined;status.textContent=pilot?.version?.useMode==='internal_rehearsal'?'本次演练与问卷':'本次预试与问卷';}
  }
  function renderGuide(){
    syncEntrances();
    let guide=document.getElementById('pilot-learning-guide');const host=document.querySelector('.player-top');if(!host)return;
    if(!guide){guide=el('section');guide.id='pilot-learning-guide';guide.className='pilot-learning-guide';guide.setAttribute('aria-label','本次学习步骤');host.after(guide);}
    const e=pilot?.enrollment,unit=typeof getUnit==='function'?getUnit():null;
    guide.hidden=unit?.type==='knowledge'||unit?.assessmentPhase==='pre'||((!e||e.studyDesign!=='learner-configurable-20-v1')&&!preparation?.required);
    if(guide.hidden){guide.replaceChildren();return;}
    if(preparation?.required){guide.replaceChildren();const done=(state.submittedQuizzes||[]).includes(preparation.chapterId+'-pre');const current=preparation.stage==='ready'?2:done?1:0;
      const steps=el('ol');steps.className='pilot-progress-steps';['知识前测','六维学习方式','开始学习'].forEach((text,i)=>{const li=el('li',text);li.dataset.state=i<current?'done':i===current?'current':'pending';if(i===current)li.setAttribute('aria-current','step');steps.append(li);});guide.append(steps);
      const row=el('div');row.className='pilot-guide-next';row.append(el('span',current===0?'先独立完成前测；提交后查看结果，再点击下一步。':current===1?'前测已完成。接下来确认六项帮助偏好，再进入课件。':'助手会根据学习过程判断是否需要询问；不用先点击求助。'));
      if(current===1)row.append(button('下一步：设置学习方式',continueAfterPretest,true));guide.append(row);return;
    }
    guide.replaceChildren();const post=(state.submittedQuizzes||[]).includes('V14-C1-post');
    const preResult=typeof currentUnitId==='string'&&currentUnitId==='V14-C1-pre'&&(state.submittedQuizzes||[]).includes(currentUnitId);
    const current=e.status!=='active'?5:e.stage==='baseline'?0:e.stage==='pretest'?1:e.stage==='configuration'||preResult?2:post?4:3;
    const labels=['学习前问卷','知识前测','学习方式准备','六个知识点与后测','学习体验问卷','本轮完成'];
    const steps=el('ol');steps.className='pilot-progress-steps';labels.forEach((name,i)=>{const item=el('li',name);item.dataset.state=i<current?'done':i===current?'current':'pending';if(i===current)item.setAttribute('aria-current','step');steps.append(item);});guide.append(steps);
    const row=el('div');row.className='pilot-guide-next';row.append(el('span',current===1?'先独立完成前测；不会因答错失去参与资格。':current===3?'先看讲解，再选一种互动探索；完成当前知识点检测后继续下一节。':current===4?'后测已完成，接下来填写本次学习体验。':current===5?'本轮记录已保存。延迟任务请按研究人员安排返回。':'按顺序准备，每一步都会保存。'));
    if(current!==3&&current!==5)row.append(button(current===1?'进入知识前测':'继续当前步骤',()=>current===1?goPretest():openPilot(pilot),true));
    if(current===3&&e.arm==='configurable'&&typeof currentUnitId==='string'&&currentUnitId.endsWith('-formative')&&(state.submittedQuizzes||[]).includes(currentUnitId))row.append(button('调整下一节的帮助方式',async()=>{await syncLearningSnapshot('configuration_boundary');await open();}));
    guide.append(row);
  }
  function radioGroup(parent,name,choices,value,onChange){const f=el('fieldset');f.className='learner-options';f.dataset.group=name;f.setAttribute('aria-label',name==='D4-placement'?'显示位置':name==='D4-format'?'帮助正文':C.dimensions.find(d=>d.id===name)?.title||name);for(const [v,title,detail] of choices){const label=el('label'),i=el('input');i.type='radio';i.name=name;i.value=v;i.checked=value===v;i.onchange=()=>{onChange(v);for(const row of f.children)row.classList.toggle('selected',row.contains(i));};label.className=i.checked?'selected':'';const text=el('span');text.append(el('strong',title));if(detail)text.append(el('small',detail));label.append(i,text);f.append(label);}parent.append(f);return f;}
  function survey(parent,kind){const data=drafts[kind]||{};drafts[kind]=data;const p=el('p',kind==='final'&&surveyContract().instrument?surveyContract().instrument.instructions:'1＝完全不同意，5＝完全同意；也可以选择不愿回答。');parent.append(p);
    for(const [key,title] of surveyContract().surveys[kind]){const f=el('fieldset');f.className='learner-survey-row';f.append(el('legend',title));radioGroup(f,kind+'-'+key,[...Array.from({length:5},(_,n)=>[String(n+1),String(n+1)]),['skip','不愿回答']],data[key]===null?'skip':String(data[key]||''),v=>data[key]=v==='skip'?null:Number(v));parent.append(f);}return data;}
  function validSurvey(kind){return surveyContract().surveys[kind].every(([k])=>Object.hasOwn(drafts[kind]||{},k));}
  function header(title,kicker){const h=el('header');h.className='learner-setup-header';const t=el('div');t.append(el('span',kicker));const titleNode=el('h2',title);titleNode.id='learner-setup-title';titleNode.tabIndex=-1;t.append(titleNode);h.append(t,button('稍后继续',leave));dialog.append(h);}
  function draw(){if(!dialog)return;dialog.dataset.mode=mode;dialog.replaceChildren();
    if(mode==='entry-error'){header('暂时无法读取学习步骤','学习准备');dialog.append(el('p','请检查网络后重试，已保存的作答不会丢失。'),button('重试',resumePreparation,true));
    }else if(mode==='baseline'){
      header('学习前，先了解一下你','学习预试 · 开始前');const body=el('div');body.className='learner-setup-body';body.append(el('p','没有正确或错误的答案。接下来先完成知识前测，再准备本次学习方式。'));survey(body,'baseline');dialog.append(body);
      dialog.append(button('保存并继续',async()=>{if(!validSurvey('baseline'))throw new Error('请逐项作答或选择不愿回答');const p=await KnowledgeAssistant.pilotRequest('/action',{action:'baseline',survey:drafts.baseline});pilot=p;await global.PilotStudyUI?.reload?.();await KnowledgeAssistant.reloadLearnerPolicy();if(p.enrollment.stage==='pretest')await goPretest();else await openPilot(p);},true));
    }else if(mode==='pretest'){
      header('先完成知识前测',preparation?.required?'学习准备 · 第1步':'学习预试 · 第2步');dialog.append(el('p',preparation?.required?'请独立作答，不会的题可以选择“我不会”。提交后先查看结果，再点击“下一步：设置学习方式”。无需预试码也可以设置六项帮助偏好。':pilot?.version?.useMode==='internal_rehearsal'?'请独立作答，不会的题可以选择“我不会”。提交后查看结果，再点击下一步，设置六项帮助偏好。':'请独立作答，不会的题可以选择“我不会”。提交后查看结果，再点击下一步：实验组设置六项帮助偏好，对照组确认学习说明。'),button('进入知识前测',goPretest,true));
    }else if(mode==='study'){
      const e=pilot.enrollment;header(e.status==='active'?'本次学习已准备好':'本次预试记录','学习预试');const body=el('div');body.className='learner-setup-body';
      body.append(el('p',`参与编号 ${e.participantCode}`),el('p',e.arm==='control'?'本次学习中，助手不会主动出现。课件、练习和知点提问入口照常使用。':'你的六项学习偏好已保存。助手会按设置判断是否介入，你可以拒绝或暂停。'));
      if(e.status==='active'){
        body.append(button('开始学习',beginLearning,true));
        if(e.arm==='configurable')body.append(button('查看或修改学习偏好',open));
        const details=el('details');details.append(el('summary','完成学习后：填写体验问卷'));survey(details,'final');if(e.arm==='configurable'){details.append(el('h3','关于学习偏好设置'));survey(details,'configuration');}
        const note=el('textarea');note.rows=3;note.maxLength=1200;note.setAttribute('aria-label','本次学习建议');note.placeholder='哪次帮助或设置最让你意外？还有什么需要改进？（选填）';details.append(note);
        details.append(button('保存问卷并结束本轮预试',async()=>{if(!validSurvey('final')||(e.arm==='configurable'&&!validSurvey('configuration')))throw new Error('请逐项作答或选择不愿回答');pilot=await KnowledgeAssistant.pilotRequest('/action',{action:'finish',survey:drafts.final,configuration:drafts.configuration,note:note.value});await global.PilotStudyUI?.reload?.();await KnowledgeAssistant.reloadLearnerPolicy();draw();},true));body.append(details);
        const withdraw=el('details');withdraw.append(el('summary','退出预试与数据处理'));withdraw.append(el('p',pilot.version.withdrawal));const reason=el('textarea');reason.rows=2;reason.maxLength=500;reason.setAttribute('aria-label','数据处理请求');withdraw.append(reason,button('确认退出预试',async()=>{pilot=await KnowledgeAssistant.pilotRequest('/action',{action:'withdraw',dataRequest:reason.value});await global.PilotStudyUI?.reload?.();await KnowledgeAssistant.reloadLearnerPolicy();draw();}));body.append(withdraw);
      }else {body.append(el('p',e.status==='withdrawn'?'你已退出；研究回放默认不再导出你的记录。数据处理请求由研究负责人按同意书处理。':'问卷已经保存，谢谢参与。'));if(e.status==='finished'&&e.followupEndsAt)body.append(el('p','若研究人员安排了延迟测量，请在后测至少72小时后返回“学习 → 本章路径 → 研究测量”。以页面开放时间为准；请在主流程结束后7天内完成。已有作答和进度会持续保留。'));body.append(button('返回平台',leave));}dialog.append(body);
    }else{
      header('让帮助适合你的学习方式',hasSavedPreferences()?'学习偏好 · 已设置':experimental()?'学习偏好 · 完成每个知识点检测后可调整':'学习偏好');
      if(!enabled){dialog.append(el('p',pilot?.enrollment?.arm==='control'?'本次预试使用无主动介入的学习方式，六维偏好保持锁定。':configurationWindow?.message||'当前研究条件尚未开放偏好修改。'));if(record)for(const d of C.dimensions)dialog.append(el('p',d.short+'：'+(d.options.find(o=>o[0]===record.answers[d.id].value)?.[1]||'')));dialog.append(button('返回学习',()=>dialog.close()));return;}
      const nav=el('nav');nav.setAttribute('aria-label','六项学习偏好');nav.className='learner-steps';C.dimensions.forEach((d,i)=>{const b=button(d.short,()=>{step=i;draw();});b.setAttribute('aria-current',step===i?'step':'false');if(answers[d.id].reason)b.dataset.complete='true';nav.append(b);});dialog.append(nav);
      const body=el('div');body.className='learner-setup-body';
      if(step<6){const d=C.dimensions[step],a=answers[d.id];if(lastStep!==d.id){lastStep=d.id;logJourney('configuration_step_viewed',{dimension:d.id,elapsedMs:Date.now()-started});}body.append(el('span',`${step+1} / 6`),el('h3',d.title),el('p',d.description));const change=(v,name=d.id,focusValue=v)=>{logJourney('configuration_choice_changed',{dimension:d.id,from:a.value,to:v});a.value=v;a.reason='';selectionSource='reviewed_choices';draw();dialog.querySelector('input[name='+name+'][value='+focusValue+']')?.focus({preventScroll:true});};
        if(d.id==='D4'){const parts=C.displayParts(a.value);body.append(el('h4','显示位置'));radioGroup(body,'D4-placement',[
          ['inline','当前任务旁','在课件或题目的独立帮助区阅读，不覆盖操作控件。'],['sidebar','对话侧栏','通过可见提醒打开侧栏；窄屏切换面板，避免压缩课件。']],parts.placement,v=>change(C.displayValue(v,parts.format),'D4-placement',v));
          body.append(el('h4','帮助正文'));radioGroup(body,'D4-format',[
          ['plain','提供帮助后展开正文','是否需要先确认，由下一项“主动权”决定。'],['disclosure','先折叠正文，点击后阅读','只折叠帮助正文，接受、拒绝和稍后按钮始终可见。']],parts.format,v=>change(C.displayValue(parts.placement,v),'D4-format',v));
        }else radioGroup(body,d.id,C.optionsFor(d.id,experimental()),a.value,change);
        const preview=el('aside');preview.className='learner-preview';preview.append(el('strong','会发生什么'),el('p',C.previewFor(d.id,a.value)));body.append(preview);
        const label=el('label','为什么这样选？'),select=el('select');select.name='preference-reason';select.setAttribute('aria-label','为什么这样选');const blank=el('option','请选择最接近的理由');blank.value='';select.append(blank);for(const [v,t]of C.reasonsFor(d.id)){const o=el('option',t);o.value=v;select.append(o);}select.value=a.reason;select.onchange=()=>a.reason=select.value;label.append(select);body.append(label);
        const note=el('textarea');note.rows=2;note.maxLength=500;note.value=a.note;note.setAttribute('aria-label','补充说明');note.placeholder='补充说明（选填；选择“其他原因”时填写）';note.oninput=()=>a.note=note.value;body.append(note);
      }else{body.append(el('h3','核对你的选择'),el('p','这些设置只影响之后的帮助，不替你作答，也不改变测验评分。'));for(const d of C.dimensions){const row=el('div');row.className='learner-review-row';const a=answers[d.id];row.append(el('strong',d.short),el('span',d.options.find(o=>o[0]===a.value)?.[1]),el('small',C.reasonsFor(d.id).find(o=>o[0]===a.reason)?.[1]||'尚未选择理由'),button('修改'+d.short,()=>{step=C.dimensions.indexOf(d);draw();}));body.append(row);}}
      dialog.append(body);const footer=el('footer');footer.className='learner-setup-footer';
      body.append(el('p','默认设置：先确认是否需要帮助，从少量线索开始，等当前小步完成再出现。它是便于开始的选择，不代表最适合每个人；你可以逐项调整。'));
      footer.append(button('先使用全部默认设置',()=>{logJourney('configuration_defaults_chosen');answers=C.defaults();for(const a of Object.values(answers))a.reason='default';selectionSource='defaults_button';step=6;draw();}));
      if(step>0)footer.append(button('上一步',()=>{step--;draw();}));
      footer.append(button(step<5?'下一项':step===5?'核对选择':'保存并开始学习',async()=>{if(step<6){const d=C.dimensions[step],a=answers[d.id];if(!a.reason||(a.reason==='other'&&!a.note.trim()))throw new Error('请选择理由；其他原因需要补充说明');step++;draw();return;}
        C.validate(answers,{experimental:experimental()});busy=true;try{const result=await request({answers,expectedRevision:record?.revision||0,elapsedMs:Date.now()-started,selectionSource});applyData(result);dialog.close();await global.PilotStudyUI?.reload?.();await KnowledgeAssistant.reloadLearnerPolicy();KnowledgeAssistant.refreshSupportSurface();await beginLearning();}finally{busy=false;}},true));dialog.append(footer);
    }
    if(mode==='study'&&pilot?.enrollment?.status==='finished'&&pilot.enrollment.followupEndsAt)dialog.append(button('退出后续测量并排除本次研究回放',async()=>{pilot=await KnowledgeAssistant.pilotRequest('/action',{action:'withdraw',dataRequest:'主流程后退出后续测量'});await global.PilotStudyUI?.reload?.();draw();}));
    const status=el('p',message);status.className='learner-error';status.setAttribute('role','alert');dialog.append(status);
    dialog.scrollTop=0;if(message)status.scrollIntoView({block:'nearest'});
  }
  global.LearnerSetup={open,openPilot,setPilot,renderGuide,continueAfterPretest,allowsUnit,afterPretest,pretestActionLabel,pretestStatusLabel,resumePreparation,get preparation(){return preparation;},get enrollment(){return pilot?.enrollment;}};
  global.addEventListener('cq:lesson-rendered',()=>{syncEntrances();renderGuide();if(typeof currentView==='string'&&currentView==='learn'&&typeof getUnit==='function'&&!routing&&!dialog?.open)allowsUnit(getUnit()||{});});
  document.getElementById('learner-preferences-button')?.addEventListener('click',()=>open().catch(e=>{message=e.message;enabled=false;mode='preferences';show();}));
  global.addEventListener('cq:proactive-state',event=>{const s=event.detail;const key=s.signedIn?s.ownerKey+':'+s.generation:'';if(key!==owner){owner=key;record=null;pilot=null;preparation=null;dialog?.close();for(const k of Object.keys(drafts))delete drafts[k];if(key)refreshPreparation().then(()=>{if(typeof currentView==='string'&&currentView==='learn')allowsUnit(getUnit()||{});}).catch(()=>{});}
    renderGuide();
  });
})(window);
