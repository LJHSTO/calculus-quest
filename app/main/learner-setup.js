(function(global){
  'use strict';
  const C=global.LearnerPreferences;
  let dialog=null,pilot=null,record=null,answers=C.defaults(),step=0,busy=false,started=0,owner='',message='',mode='preferences',enabled=false,lastFocus=null;
  const drafts={};
  let configurationWindow=null,selectionSource='reviewed_choices',lastStep='';
  let preparation=null,refreshing=null,routing=false,currentGeneration=null,posttestComplete=false;
  let continuing=null;
  const hasSavedPreferences=()=>Boolean(record&&(record.generation==null||record.generation===currentGeneration));
  let study=null;
  function applyData(d){study=d.study||null;posttestComplete=d.posttestComplete===true;currentGeneration=d.generation;record=d.record;enabled=d.enabled;pilot=d.pilot;configurationWindow=d.configurationWindow;preparation=d.preparation;global.ThreeArmStudyUI?.setRun(study);}
  async function refreshPreparation(){if(refreshing)return refreshing;const token=state.authToken;if(!token)return;refreshing=request().then(d=>{if(token===state.authToken){applyData(d);renderGuide();if(typeof renderBottomNextButton==='function')renderBottomNextButton();}return d;}).finally(()=>refreshing=null);return refreshing;}
  const ordinaryRequired=unit=>preparation?.required&&unit?.chapterId===preparation.chapterId;
  function afterPretest(unit){return unit?.assessmentPhase==='pre'&&(ordinaryRequired(unit)||(pilot?.enrollment?.studyDesign==='learner-configurable-20-v1'&&pilot.enrollment.status==='active'));}
  function afterPosttest(unit){return unit?.assessmentPhase==='post'&&(Boolean(study)||pilot?.enrollment?.studyDesign==='learner-configurable-20-v1'&&['active','finished'].includes(pilot.enrollment.status));}
  const posttestActionLabel=()=>study?.finalSurveyAt?'查看后续任务':pilot?.enrollment?.status==='finished'?'本轮已完成 · 查看记录':'下一步：填写学习体验问卷';
  async function continueAfterPosttest(){await refreshPreparation();if(study){await global.ThreeArmStudyUI.openSurvey('final');return;}if(pilot?.enrollment)await openPilot(pilot);}
  const isReady=()=>pilot?.enrollment?.status==='active'?pilot.enrollment.stage==='ready':preparation?.stage==='ready';
  const pretestActionLabel=()=>continuing?'正在进入课程…':study?.arm==='A'?'开始学习':isReady()?'继续学习':pilot?.enrollment?.stage==='baseline'?'下一步：学习前问卷':'下一步：设置学习方式';
  const pretestStatusLabel=()=>pilot?.enrollment?.arm==='control'?'学习准备已完成':'学习方式已设置';
  async function resumePreparation(){if(routing)return;routing=true;try{await refreshPreparation();if(pilot?.enrollment?.status==='active'){await openPilot(pilot);return;}if(preparation?.required&&preparation.stage!=='ready'){if(preparation.stage==='entry'){await global.PilotStudyUI.open();}else if(preparation.stage==='pretest'){await goPretest();}else await open();}}catch(e){message=e.message;mode='entry-error';show();}finally{routing=false;}}
  function allowsUnit(unit){
    if(global.ThreeArmStudyUI?.allowsUnit(unit)===false)return false;
    const resultPage=unit.assessmentPhase==='pre'&&pilot?.enrollment?.stage==='configuration';
    const allowed=!['entry','baseline'].includes(preparation?.stage)&&(!isPreparing(pilot?.enrollment)||resultPage)&&(pilot?.enrollment?.stage!=='pretest'||unit.id==='V14-C1-pre')&&!(ordinaryRequired(unit)&&preparation.stage!=='ready'&&unit.id!==preparation.chapterId+'-pre');
    if(!allowed)resumePreparation();return allowed;
  }
  function logJourney(type,data={}){if(typeof trackLearningEvent==='function')trackLearningEvent(type,{...data,preferenceContract:C.version},false).catch(()=>{});}
  const experimental=()=>Boolean(study)||pilot?.enrollment?.arm==='configurable'&&pilot.enrollment.status==='active';
  const surveyContract=()=>pilot?.version?.configurationContract||C;
  const isPreparing=e=>e?.studyDesign==='learner-configurable-20-v1'&&e.status==='active'&&!['ready','pretest'].includes(e.stage);
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  function button(text,fn,primary=false){const b=el('button',text);b.type='button';b.className=primary?'learner-primary':'learner-secondary';b.onclick=async()=>{if(busy)return;message='';b.disabled=true;try{await fn();}catch(e){message=e.message;draw();}finally{b.disabled=false;}};return b;}
  async function request(body){const token=state.authToken;if(!token)throw new Error('请先登录');const r=await fetch('api/learning/learner-preferences',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(token!==state.authToken)throw new Error('登录账号已变化，请重新打开');if(!r.ok||!p.ok)throw new Error(p.message||'暂未保存，请重试');return p.data;}
  function setPilot(p){pilot=p;if(p.enrollment)preparation=null;global.dispatchEvent(new CustomEvent('cq:pilot-enrollment',{detail:p}));
    renderGuide();
    // Preparing is resumed by explicit journey buttons; result pages never auto-close.
  }
  async function show(){if(!dialog){dialog=el('dialog');dialog.id='learner-setup';dialog.setAttribute('aria-labelledby','learner-setup-title');dialog.addEventListener('cancel',e=>{e.preventDefault();leave();});}
    const host=document.fullscreenElement||document.body;if(dialog.parentElement!==host)host.append(dialog);
    lastFocus=document.activeElement;draw();if(!dialog.open)dialog.showModal();dialog.querySelector('h2')?.focus();}
  function leave(){dialog.close();if((preparation?.required&&preparation.stage!=='ready'||pilot?.enrollment?.status==='active'&&pilot.enrollment.stage!=='ready')&&typeof switchView==='function')switchView('home');lastFocus?.focus?.();}
  async function open(isCurrent=()=>true){message='';
    // Persist the unit currently on screen before asking the server for its edit
    // window; the previous quiz snapshot must not lock a newly opened lesson.
    if(typeof syncLearningSnapshot==='function'&&typeof currentView==='string'&&currentView==='learn')await syncLearningSnapshot('preferences_opened');
    if(!isCurrent())return;const d=await request();if(!isCurrent())return;applyData(d);
    if(preparation?.required&&preparation.stage==='entry'){await global.PilotStudyUI.open();return;}
    if(study&&preparation?.stage==='baseline'){dialog?.close();await global.ThreeArmStudyUI.openSurvey('baseline');return;}
    if(study?.arm==='A'&&preparation?.stage==='configuration'){
      const response=await fetch('api/study/confirm-defaults',{method:'POST',headers:{Authorization:`Bearer ${state.authToken}`}});
      const result=await response.json();if(!response.ok)throw new Error(result.message||'暂未进入课程，请重试');
      await refreshPreparation();await KnowledgeAssistant.reloadLearnerPolicy();await beginLearning(isCurrent);return;
    }
    if(preparation?.required&&preparation.stage==='pretest'){mode='pretest';show();return;}
    if(pilot?.enrollment?.studyDesign==='learner-configurable-20-v1'&&pilot.enrollment.status==='active'&&pilot.enrollment.stage==='baseline'){openPilot(pilot);return;}
    mode='preferences';answers=hasSavedPreferences()?structuredClone(record.answers):C.defaults();if(experimental()&&answers.D5.value==='request'){answers.D5={value:'ask',reason:'',note:''};}step=hasSavedPreferences()?6:0;selectionSource='reviewed_choices';lastStep='';started=Date.now();show();}
  async function openPilot(p,isCurrent=()=>true){if(!isCurrent())return;pilot=p;message='';const e=p.enrollment;
    if(e.stage==='baseline'){mode='baseline';show();return;}
    if(e.stage==='configuration'){await open(isCurrent);return;}
    if(e.stage==='pretest'){mode='pretest';show();return;}
    const next=await request();if(!isCurrent())return;applyData(next);mode='study';show();}
  async function goPretest(){dialog?.close();await ensureChapterLoaded('V14-C1');switchView('learn');selectUnit('V14-C1-pre');renderGuide();}
  async function continueAfterPretest(){
    if(continuing)return continuing;
    const origin={token:state.authToken,unit:currentUnitId,view:currentView,generation:currentGeneration};
    const isCurrent=()=>origin.token===state.authToken&&origin.unit===currentUnitId&&origin.view===currentView&&(origin.generation===null||origin.generation===currentGeneration);
    let status=document.getElementById('pretest-continue-status');
    if(!status){status=el('p');status.id='pretest-continue-status';status.setAttribute('role','status');document.querySelector('#lesson-player')?.prepend(status);}
    status.textContent='正在准备下一步，请稍候…';
    const buttons=[...document.querySelectorAll('[data-quiz-path-action="pilot-next"]')];
    for(const b of buttons){b.disabled=true;b.setAttribute('aria-busy','true');}
    logJourney('pilot_pretest_continue');
    continuing=(async()=>{try{
      await global.PilotStudyUI?.reload?.();if(!isCurrent())return;
      await refreshPreparation();if(!isCurrent())return;
      if(isReady())await beginLearning(isCurrent);
      else if(pilot?.enrollment?.studyDesign==='learner-configurable-20-v1'&&pilot.enrollment.status==='active')await openPilot(pilot,isCurrent);
      else await open(isCurrent);
      if(status.isConnected)status.textContent='';
    }catch(e){if(isCurrent()){status.textContent=`下一步暂未打开：${e.message||'请求失败'}。请再次点击下一步重试。`;status.setAttribute('role','alert');}}
    finally{continuing=null;for(const b of buttons){b.disabled=false;b.removeAttribute('aria-busy');}if(typeof renderBottomNextButton==='function')renderBottomNextButton();}})();
    return continuing;
  }
  async function beginLearning(isCurrent=()=>true){if(!isCurrent())return;dialog?.close();switchView('learn');await ensureChapterLoaded('V14-C1',{showLoading:false});if(!isCurrent())return;
    const preparedPath=typeof ensureAgenticPath==='function'?ensureAgenticPath():null;
    if(isReady()&&preparedPath?.pendingPlan?.unitId==='V14-C1-pre'){
      preparedPath.pendingPlan=null;preparedPath.pendingAt='';saveState();
    }
    if(typeof currentUnitId==='string'&&currentUnitId==='V14-C1-pre'){
      const path=typeof ensureAgenticPath==='function'?ensureAgenticPath():null;
      if(path?.pendingPlan?.phase==='pre_knowledge_selection'){
        if(pilot?.enrollment?.status==='active'||preparation?.required){const action=path.pendingPlan.actions.find(a=>a.type==='select_knowledge');for(const c of action?.knowledgeChoices||[])c.checked=true;await agenticApplyDecision('select_knowledge');await syncLearningSnapshot('pilot_learning_started');return;}
        global.LearningWorkspace?.showCoach();return;}
      if(typeof agenticOpenUnit==='function'){const chapter=getChapter('V14-C1'),target=chapter?.units?.find(u=>u.id!=='V14-C1-pre'&&!['retention','transfer'].includes(u.assessmentPhase)&&!(state.completed||[]).includes(u.id));if(target){agenticUnlockUnit(target.id,'pilot_ready');await agenticOpenUnit(target.id,{source:'pilot_ready'});}}
    }await syncLearningSnapshot('pilot_learning_started');renderGuide();}
  function syncEntrances(){const unit=typeof getUnit==='function'&&typeof currentUnitId==='string'?getUnit(currentUnitId):null;
    const pre=unit?.assessmentPhase==='pre',joined=Boolean(pilot?.enrollment||study||global.StudyEntry);
    for(const selector of ['#pilot-entry-button','#home-pilot-entry']){const node=document.querySelector(selector);if(node)node.hidden=joined||(pre&&selector==='#pilot-entry-button');}
    for(const selector of ['#learner-preferences-button','.proactive-hud-toggle-btn']){const node=document.querySelector(selector);if(node)node.hidden=pre||study?.arm==='A';}
    let accountPrefs=document.getElementById('account-learning-preferences');
    if(!accountPrefs){accountPrefs=el('button','智能体老师的帮助设置');accountPrefs.id='account-learning-preferences';accountPrefs.type='button';accountPrefs.className='user-menu-item';accountPrefs.onclick=()=>{if(typeof setUserMenuOpen==='function')setUserMenuOpen(false);open();};document.getElementById('account-pilot-status')?.before(accountPrefs);}
    accountPrefs.hidden=!state.authToken;accountPrefs.textContent=enabled?'调整老师的帮助设置':'查看老师的帮助设置';
    const prefs=document.getElementById('learner-preferences-button');if(prefs){prefs.textContent=hasSavedPreferences()?'学习偏好 · 已设置':'学习偏好';prefs.dataset.configured=String(hasSavedPreferences());}
    const status=document.getElementById('account-pilot-status');if(status){status.hidden=!joined;status.textContent=study?'本次学习与后续任务':pilot?.version?.useMode==='internal_rehearsal'?'本次演练与问卷':'本次预试与问卷';if(study)status.onclick=()=>{if(typeof setUserMenuOpen==='function')setUserMenuOpen(false);global.ThreeArmStudyUI.openTasks();};}
  }
  function renderGuide(){
    syncEntrances();
    let guide=document.getElementById('pilot-learning-guide');const host=document.querySelector('.player-top');if(!host)return;
    if(!guide){guide=el('section');guide.id='pilot-learning-guide';guide.className='pilot-learning-guide';guide.setAttribute('aria-label','本次学习步骤');host.after(guide);}
    const e=pilot?.enrollment,unit=typeof getUnit==='function'?getUnit():null;
    // The lesson already has a path, current title and one next-step action.
    // Keep the journey overview out of every courseware and assessment surface.
    guide.hidden=Boolean(unit)||((!e||e.studyDesign!=='learner-configurable-20-v1')&&!preparation?.required);
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
      const e=pilot.enrollment;header(e.status==='active'?(posttestComplete?'最后一步：填写学习体验':'本次学习已准备好'):'本次预试记录','学习预试');const body=el('div');body.className='learner-setup-body';
      body.append(el('p',`参与编号 ${e.participantCode}`),el('p',e.arm==='control'?'本次学习中，助手不会主动出现。课件、练习和知点提问入口照常使用。':'你的六项学习偏好已保存。助手会按设置判断是否介入，你可以拒绝或暂停。'));
      if(e.status==='active'){
        if(!posttestComplete){body.append(button('开始学习',beginLearning,true));
        if(e.arm==='configurable')body.append(button('查看或修改学习偏好',open));}
        if(posttestComplete){
        const details=el('details');details.open=true;details.append(el('summary','填写本次学习体验'));survey(details,'final');if(e.arm==='configurable'){details.append(el('h3','关于学习偏好设置'));survey(details,'configuration');}
        const note=el('textarea');note.rows=3;note.maxLength=1200;note.setAttribute('aria-label','本次学习建议');note.placeholder='哪次帮助或设置最让你意外？还有什么需要改进？（选填）';details.append(note);
        details.append(button('保存问卷并结束本轮预试',async()=>{if(!validSurvey('final')||(e.arm==='configurable'&&!validSurvey('configuration')))throw new Error('请逐项作答或选择不愿回答');pilot=await KnowledgeAssistant.pilotRequest('/action',{action:'finish',survey:drafts.final,configuration:drafts.configuration,note:note.value});await global.PilotStudyUI?.reload?.();await KnowledgeAssistant.reloadLearnerPolicy();draw();},true));body.append(details);
        }else body.append(el('p','完成本章后测后，这里会开放学习体验问卷。现在可以继续学习。'));
        body.append(el('p','可以关闭页面，之后从保存的位置继续。暂时离开不会删除作答，也不会排除研究回放。'));
      }else {body.append(el('p',e.status==='withdrawn'?'你已退出；研究回放默认不再导出你的记录。数据处理请求由研究负责人按同意书处理。':'问卷已经保存，谢谢参与。'));if(e.status==='finished'&&e.followupEndsAt)body.append(el('p','若研究人员安排了延迟测量，请在后测至少72小时后返回“学习 → 本章路径 → 研究测量”。'+global.FollowupWindow.describe({researchEndsAt:e.followupEndsAt})));body.append(button('返回平台',leave));}dialog.append(body);
    }else{
      header(enabled?'让帮助适合你的学习方式':'老师的帮助设置',study?.arm==='A'?'本组使用固定帮助设置':study?'开始学习前和每部分回顾后可配置':hasSavedPreferences()?'学习偏好 · 已设置':experimental()?'学习偏好 · 检测后可调整':'学习偏好');
      if(!enabled){dialog.append(el('p',pilot?.enrollment?.arm==='control'?'本次预试使用无主动介入的学习方式，六维偏好保持锁定。':configurationWindow?.message||'当前研究条件尚未开放偏好修改。'));if(record)for(const d of C.dimensions)dialog.append(el('p',d.short+'：'+(d.options.find(o=>o[0]===record.answers[d.id].value)?.[1]||'')));
        dialog.append(button('返回学习',()=>dialog.close()));return;}
      const nav=el('nav');nav.setAttribute('aria-label','六项学习偏好');nav.className='learner-steps';C.dimensions.forEach((d,i)=>{const b=button(d.short,()=>{step=i;draw();});b.setAttribute('aria-current',step===i?'step':'false');if(answers[d.id].reason)b.dataset.complete='true';nav.append(b);});dialog.append(nav);
      const body=el('div');body.className='learner-setup-body';
      if(step<6){const d=C.dimensions[step],a=answers[d.id];if(lastStep!==d.id){lastStep=d.id;logJourney('configuration_step_viewed',{dimension:d.id,elapsedMs:Date.now()-started});}body.append(el('span',`${step+1} / 6`),el('h3',d.title),el('p',d.description));const change=(v,name=d.id,focusValue=v)=>{logJourney('configuration_choice_changed',{dimension:d.id,from:a.value,to:v});a.value=v;a.reason='';selectionSource='reviewed_choices';draw();dialog.querySelector('input[name='+name+'][value='+focusValue+']')?.focus({preventScroll:true});};
        if(d.id==='D4'){const parts=C.displayParts(a.value);radioGroup(body,'D4-placement',[
          ['inline','当前任务旁','在课件或题目的独立帮助区阅读，不覆盖操作控件。'],['sidebar','对话侧栏','通过可见提醒打开侧栏；窄屏切换面板，避免压缩课件。']],parts.format==='disclosure'?'':parts.placement,v=>change(v,'D4-placement',v));
          if(parts.format==='disclosure')body.append(el('p','你之前保存的折叠正文设置仍然保留。重新选择上方位置并保存后，帮助正文将直接展开。'));
        }else radioGroup(body,d.id,C.optionsFor(d.id,experimental()),a.value,change);
        const preview=el('aside');preview.className='learner-preview';preview.setAttribute('aria-label','当前选择的行为预览');preview.append(el('strong','会发生什么'),el('p',C.previewFor(d.id,a.value)));logJourney('configuration_preview_rendered',{dimension:d.id,value:a.value,contractVersion:C.version});body.append(preview);
        const label=el('label','为什么这样选？选最接近的一项即可'),select=el('select');select.name='preference-reason';select.setAttribute('aria-label','为什么这样选');const blank=el('option','请选择最接近的理由');blank.value='';select.append(blank);for(const [v,t]of C.reasonsFor(d.id,a.reason)){const o=el('option',t);o.value=v;select.append(o);}select.value=a.reason;select.onchange=()=>{a.reason=select.value;logJourney('configuration_reason_selected',{dimension:d.id,reason:a.reason});};label.append(select);body.append(label);
        const note=el('textarea');note.rows=2;note.maxLength=500;note.value=a.note;note.setAttribute('aria-label','补充说明');note.placeholder='补充说明（选填；选择“其他原因”时填写）';note.oninput=()=>a.note=note.value;body.append(note);
      }else{body.append(el('h3',hasSavedPreferences()?'已保存的学习偏好':'核对你的选择'),el('p',hasSavedPreferences()?'点击下方“修改”调整任意一项，保存后用于之后的帮助。已有作答和历史设置会保留。':'这些设置只影响之后的帮助，不替你作答，也不改变测验评分。'));for(const d of C.dimensions){const row=el('div');row.className='learner-review-row';const a=answers[d.id];row.dataset.dimension=d.id;row.append(el('strong',d.short),el('span',d.options.find(o=>o[0]===a.value)?.[1]),el('small',C.reasonLabel(d.id,a.reason)||'尚未选择理由'),button('修改'+d.short,()=>{step=C.dimensions.indexOf(d);draw();}));const effect=el('p',C.behaviorSummary(answers).find(([id])=>id===d.id)[1]);effect.className='learner-review-effect';row.append(effect);body.append(row);}}
      dialog.append(body);const footer=el('footer');footer.className='learner-setup-footer';
      const defaultsInfo=el('details');defaultsInfo.className='learner-defaults-info';defaultsInfo.append(el('summary','默认设置是什么？'),el('p',C.configurationPolicy.defaultRationale));body.append(defaultsInfo);if(step===6){const limits=el('p','输入、拖动和独立测验时保持安静。设置只影响之后的帮助；间隔到期不会自动触发，未回应不算同意。');limits.className='learner-review-limits';body.append(limits);}
      footer.append(button('先使用全部默认设置',()=>{logJourney('configuration_defaults_chosen');answers=C.defaults();for(const a of Object.values(answers))a.reason='default';selectionSource='defaults_button';step=6;draw();}));
      if(step>0)footer.append(button('上一步',()=>{step--;draw();}));
      footer.append(button(step<5?'下一项':step===5?'核对选择':hasSavedPreferences()?'保存修改并返回学习':'保存并开始学习',async()=>{if(step<6){const d=C.dimensions[step],a=answers[d.id];if(!a.reason||(a.reason==='other'&&!a.note.trim()))throw new Error('请选择理由；其他原因需要补充说明');step++;draw();return;}
        C.validate(answers,{experimental:experimental()});busy=true;try{const result=await request({answers,expectedRevision:record?.revision||0,elapsedMs:Date.now()-started,selectionSource});applyData(result);dialog.close();await global.PilotStudyUI?.reload?.();await KnowledgeAssistant.reloadLearnerPolicy();KnowledgeAssistant.refreshSupportSurface();await beginLearning();global.ThreeArmStudyUI?.resumeAfterConfiguration();}finally{busy=false;}},true));dialog.append(footer);
    }
    if(mode==='study'&&['active','finished'].includes(pilot?.enrollment?.status)){
      const handling=el('details');handling.append(el('summary','联系研究人员处理参与或数据问题'),el('p','如需正式退出研究或处理已提交数据，请说明请求。普通暂停和暂时离开不会排除回放；研究人员按参与说明处理正式请求。'));
      const text=el('textarea');text.rows=2;text.maxLength=500;text.setAttribute('aria-label','数据处理请求');handling.append(text,button('提交处理请求',async()=>{await KnowledgeAssistant.pilotRequest('/action',{action:'data_request',dataRequest:text.value});message='请求已记录，等待研究人员处理。已有学习记录未被自动排除。';draw();}));dialog.append(handling);
    }
    const status=el('p',message);status.className='learner-error';status.setAttribute('role','alert');dialog.append(status);
    dialog.scrollTop=0;if(message)status.scrollIntoView({block:'nearest'});
  }
  global.LearnerSetup={open,openPilot,setPilot,renderGuide,continueAfterPretest,continueAfterPosttest,allowsUnit,afterPretest,afterPosttest,pretestActionLabel,posttestActionLabel,pretestStatusLabel,resumePreparation,get preparation(){return preparation;},get enrollment(){return pilot?.enrollment;}};
  global.addEventListener('cq:lesson-rendered',()=>{syncEntrances();renderGuide();if(typeof currentView==='string'&&currentView==='learn'&&typeof getUnit==='function'&&!routing&&!dialog?.open)allowsUnit(getUnit()||{});});
  document.getElementById('learner-preferences-button')?.addEventListener('click',()=>open().catch(e=>{message=e.message;enabled=false;mode='preferences';show();}));
  global.addEventListener('cq:proactive-state',event=>{const s=event.detail;const key=s.signedIn?s.ownerKey+':'+s.generation:'';if(key!==owner){owner=key;record=null;pilot=null;preparation=null;dialog?.close();for(const k of Object.keys(drafts))delete drafts[k];if(key)refreshPreparation().then(()=>{if(typeof currentView==='string'&&currentView==='learn')allowsUnit(getUnit()||{});}).catch(()=>{});}
    renderGuide();
  });
})(window);
