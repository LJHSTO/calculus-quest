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
  function modal(title){if(!dialog){dialog=el('dialog');dialog.id='three-arm-dialog';document.body.append(dialog);}dialog.oncancel=null;dialog.onclose=null;dialog.replaceChildren(el('h2',title));dialog.setAttribute('aria-label',title);return dialog;}
  async function show(){const host=document.fullscreenElement||document.body;if(dialog.parentElement!==host)host.append(dialog);if(!dialog.open)dialog.showModal();dialog.scrollTop=0;}
  function syncReview(){const b=document.getElementById('three-arm-review');if(!b)return;const w=global.StudyStages.reviewWindow(run,state.submittedQuizzes,typeof currentUnitId==='string'?currentUnitId:''),checking=global.KnowledgeAssistant?.pendingIndependentCheck?.();b.disabled=!w.allowed&&!checking;b.title=checking?'有一道检查尚未完成，点击返回检查或暂不检查。':w.message;}
  function setRun(value){run=value;global.FirstSessionBudget?.update(value);judgmentActive=Boolean(value?.activeJudgment);const label=document.getElementById('three-arm-entry-label');if(label&&run){const text=run.mode==='preview'?`${run.arm}组 · 体验`:'本次学习';label.title=labels[run.arm];if(label.textContent!==text)label.textContent=text;}syncReview();}
  function install(){
    const host=document.querySelector('.player-top .player-actions'),account=document.getElementById('account-pilot-status');if(!host||!account||document.getElementById('three-arm-review'))return;
    const label=el('span');label.id='three-arm-entry-label';label.className='three-arm-entry-label';
    const review=button('学习回顾',()=>{if(typeof setUserMenuOpen==='function')setUserMenuOpen(false);return openReview();});review.id='three-arm-review';review.className='user-menu-item';account.before(review);host.prepend(label);setRun(run);
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
    setRun(data.run);const d=modal(run.linkedFeedback?'学习回顾与配置关联':'学习回顾');
    d.append(button('返回学习',()=>d.close()));
    d.append(el('p',data.pendingStage?`“${data.pendingStage.title}”三个知识点已完成。回顾这段经历，再决定接下来三个知识点怎样接受帮助。`:'这里汇总你已完成的独立检测。'));
    d.append(el('p',`已完成 ${data.ordinary.answered} 题，答对 ${data.ordinary.correct} 题${data.ordinary.scored<data.ordinary.answered?`，另有 ${data.ordinary.answered-data.ordinary.scored} 题等待评分`:''}。`));
    const results=el('div');results.className='study-review-results';
    for(const id of [...new Set(data.results.map(r=>r.unitId))]){const unit=typeof getUnit==='function'?getUnit(id):null,rows=data.results.filter(r=>r.unitId===id);const p=el('p',`${(unit?.label||'知识点检测').replace(/^检测[：:]/,'')}：${rows.filter(r=>r.correct===true).length} / ${rows.length} 题正确`);results.append(p);}
    if(!data.results.length)results.append(el('p','完成知识点检测后，这里会出现独立作答记录。'));
    if(data.linked)d.append(linkedReview(data),el('h3','全部独立检测记录'));
    d.append(results);
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
  function linkedReview(data){
    const root=el('section');root.dataset.linkedFeedback='';root.className='study-linked-review';
    root.append(el('h3','我的设置，怎样用在了学习中？'),el('p','沿着下面三步阅读：先认清当时的设置，再核对实际发生的帮助，最后看自己独立作答的结果。'));
    const legend=el('ol');legend.className='study-link-steps';for(const label of ['我选择的帮助','实际出现的帮助','我的独立检测'])legend.append(el('li',label));root.append(legend);
    const grid=el('div');grid.className='study-phase-grid';
    for(const [index,phase]of (data.phases||[]).entries()){
      const card=el('article');card.className='study-linked-card';card.dataset.studyPhase=phase.id;
      card.append(el('h4',`第 ${index+1} 阶段 · ${phase.title}`));
      if(!phase.started){card.append(el('p','尚未开始。完成这次回顾后，再开始后面三个知识点。'));grid.append(card);continue;}
      const config=phase.configuration;card.dataset.configurationRevision=config?.revision||'';
      card.append(el('h5','1 · 我选择的帮助'),el('p',config?`第 ${config.displayVersion} 版配置${index&&phase.decision==='keep'?' · 沿用第一阶段设置':''}`:'尚未保存配置'));
      if(config){const settings=el('dl');settings.className='study-setting-list';for(const dim of global.LearnerPreferences.dimensions){const a=config.answers[dim.id];settings.append(el('dt',dim.short),el('dd',dim.options.find(o=>o[0]===a.value)?.[1]||a.value));}card.append(settings);}
      const rounds=phase.experiences||[],visible=rounds.filter(e=>e.seen);
      card.append(el('h5','2 · 实际发生的帮助'));
      const help=el('div');help.className='study-metric';help.append(el('strong',String(visible.length)),el('span','轮帮助正文曾显示在屏幕上'));card.append(help);
      card.append(el('p',rounds.length?`共准备 ${rounds.length} 轮正文，${rounds.length-visible.length} 轮尚无可见记录。出现过不等于你已经阅读或理解。`:'本阶段尚未记录到主动帮助正文。没有帮助记录，也是一种可能的正常经历。'));
      if(visible.length){const details=el('details');details.append(el('summary','回想是哪些帮助'));const list=el('ul');for(const e of visible){const u=typeof getUnit==='function'?getUnit(e.scope):null;list.append(el('li',`${u?.label||'本知识点'} · ${sceneNames[e.sceneType]||'当前活动'} · ${new Date(e.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}`));}details.append(list);card.append(details);}
      card.append(el('h5','3 · 我的独立检测'));
      const judged=phase.results.filter(r=>r.correct!==null),correct=judged.filter(r=>r.correct).length;
      const result=el('div');result.className='study-metric';result.append(el('strong',`${correct} / ${judged.length}`),el('span','道已判定题目答对'));card.append(result);
      const meter=el('meter');meter.min=0;meter.max=Math.max(1,judged.length);meter.value=correct;meter.setAttribute('aria-label',`${judged.length}道已评分题中答对${correct}道`);card.append(meter);
      const list=el('ul');for(const point of phase.points){const rows=phase.results.filter(r=>r.unitId===point+'-formative'),scored=rows.filter(r=>r.correct!==null);const u=typeof getUnit==='function'?getUnit(point):null;list.append(el('li',`${u?.label||'知识点'}：${rows.length?`${scored.filter(r=>r.correct).length} / ${scored.length} 道已判定题正确${scored.length<rows.length?'；另有题目待评分':''}`:'尚未检测'}`));}card.append(list);
      const after=phase.results.filter(r=>visible.some(e=>r.unitId===e.scope+'-formative'&&Date.parse(r.at)>=Date.parse(e.at)));
      card.append(el('p',after.length?`其中 ${after.length} 道在同一知识点的帮助正文出现后完成。其他题目不能当成“看帮助后”的结果。`:'还没有“看到帮助之后，再独立完成同一知识点检测”的记录。先检测、后复盘的成绩不能算作帮助后的表现。'));
      grid.append(card);
    }
    root.append(grid);
    const guidance=el('aside');guidance.className='study-review-reading';guidance.append(el('h4',data.pendingStage?'怎样据此做决定？':'怎样理解这次学习？'),el('p','先回想：帮助出现时你是否需要？形式是否方便？独立答题时能否自己说清理由？'+(data.pendingStage?'有依据时只调整一两项，也可以保持设置，再观察下一段。':'结合具体经历，想一想以后需要怎样的帮助。')),el('p','两阶段学习的知识点和题目不同。正确数的变化只能描述这次经历，不能直接说明哪版设置更有效；提示更多也不一定学得更好。'));root.append(guidance);
    const post=data.results.filter(r=>r.phase==='post');if(post.length)root.append(el('p',`整章后测：${post.filter(r=>r.correct===true).length} / ${post.filter(r=>r.correct!==null).length} 道已判定题正确。这份后测覆盖整段学习，不归到某一版配置。`));
    return root;
  }

  function rating(parent,id,title,answers,choices=null,notApplicable=null){
    const field=el('fieldset');field.dataset.studyQuestion=id;field.append(el('legend',title));const row=el('div');row.className='study-rating';
    const options=choices||['1','2','3','4','5'];
    [...options,'不愿回答'].forEach((title,i)=>{const value=i===options.length?null:i+1;const label=el('label'),input=el('input');input.type='radio';input.name='study-'+id;input.value=value===null?'skip':String(value);input.checked=Object.hasOwn(answers,id)&&answers[id]===value;input.onchange=()=>answers[id]=value;label.append(input,document.createTextNode(title));row.append(label);});if(notApplicable){const label=el('label'),input=el('input');input.type='radio';input.name='study-'+id;input.value='na';input.checked=answers[id]==='na';input.onchange=()=>answers[id]='na';label.append(input,document.createTextNode(notApplicable));row.append(label);}field.append(row);parent.append(field);
  }
  async function openSurvey(stage){
    const data=await request('survey?stage='+stage);if(data.saved){if(stage==='baseline')await global.LearnerSetup.resumePreparation();else await openTasks();return;}
    const key=(run?.id||snapshot?.ownerKey)+':'+stage,answers=surveyDrafts[key]||(surveyDrafts[key]={});
    const d=modal(stage==='baseline'?'开始前，先了解一下你':'回想这次学习体验');
    if(stage==='baseline'&&run?.previousPreviewVersion)d.append(el('p','学习体验已更新。这次将开始新版体验；此前版本的答题、笔记与配置仍保留在原轮次记录中。'));
    d.append(el('p',stage==='baseline'?'没有标准答案。填完后进入独立前测；不会的题可以选择“我不会”。':'请只考虑刚才这次学习。1＝完全不符合，5＝完全符合。可以选择不愿回答。'));
    if(stage==='baseline')d.append(el('p','本站的 AI 学习助手叫“知点”，入口在学习页面右上角。它可以解释概念、提供线索并回应问题；前测请先独立完成。你还没有用过它也没关系，下面按自己目前的情况回答。'));
    if(stage==='baseline')d.append(el('p','请按每题标出的尺度回答；可以选择不愿回答。'));
    for(const q of data.items){const choices=q.id==='ai_experience'?['从未','偶尔','每周数次','几乎每天']:q.id==='topic_experience'?['未学过','接触过但不熟悉','已系统学过']:null;rating(d,q.id,q.text+(choices?"":"（"+q.scale+"）"),answers,choices,q.allowNotApplicable?q.notApplicableLabel:null);}
    d.append(button('保存并继续',async()=>{await request('survey',{stage,answers});delete surveyDrafts[key];dialog.close();if(stage==='baseline')await global.LearnerSetup.resumePreparation();else await openTasks();}),button('稍后继续',()=>{dialog.close();if(stage==='baseline'&&typeof switchView==='function')switchView('home');}));show();
  }
  async function openTasks(){
    if(global.StudyEntry.arm==='assigned'&&!run){
      try{setRun((await request('state')).run);}
      catch(error){if(error.code!=='study_enrollment_required')throw error;await openEnrollment();return;}
    }
    const data=await request('state');setRun(data.run);const d=modal('问卷与后续任务');
    if(run.mode==='preview'&&!run.regulationVersion){
      d.append(el('p','你正在继续原版本体验。新版加入带图前后测、每个知识点两道检测及独立调节任务；首次现场按80分钟加10分钟缓冲设计，体验计时只提示。'),
        button('开始新版体验（保留旧记录）',async()=>{
          const previous=run.id,confirm=modal('开始新版体验');confirm.append(el('p','将开始一轮新的体验。原来的答题、笔记和配置都保留；可以从新轮次的后续任务查看上一轮记录。'),
            button('确认开始新版体验',async()=>{await request('preview/new',{previousRunId:previous});location.reload();}),button('继续原轮次',openTasks));await show();
        }));
    }
    if(run.previousRunId)d.append(button('查看上一轮记录',async()=>{
      const previous=await request('previous'),view=modal('上一轮体验记录');
      view.append(el('p',`本页只读。上一轮共保存 ${previous.results.length} 道题的作答；原笔记和配置仍保存在该轮次中。`));
      for(const phase of ['pre','formative','post']){const rows=previous.results.filter(r=>r.phase===phase);if(rows.length)view.append(el('p',`${{pre:'前测',formative:'知识点检测',post:'后测'}[phase]}：已保存 ${rows.length} 题。`));}
      view.append(button('返回本轮任务',openTasks));await show();
    }));
    const p=data.preparation;
    d.append(el('p',p.stage==='ready'?'这里查看体验问卷的完成情况，以及三天后独立任务的开放时间。':'准备流程：学习前问卷 → 独立前测 → 操作指引 → 准备帮助方式 → 开始学习。'));
    if(p.stage!=='ready')d.append(button('继续准备',async()=>{dialog.close();await global.LearnerSetup.resumePreparation();}));
    if(!run.finalSurveyAt&&data.posttestComplete)d.append(button('填写学习体验问卷',()=>openSurvey('final')));else if(run.finalSurveyAt)d.append(el('p','学习体验已保存。'));
    if(data.posttestComplete)d.append(button(run.linkedFeedback?'比较两阶段的配置与学习经历':'回顾两阶段学习结果',openReview));
    const newer=Boolean(data.regulation),j=data.regulation||data.judgment;
    const order=newer?'先完成保持与数学迁移，再进入14分钟调节任务。':'先完成保持和迁移，再做六个配置判断情境。';
    d.append(el('h3','三天后的独立任务'),el('p',j.unlockAt?`开放时间：${new Date(j.unlockAt).toLocaleString('zh-CN')}。${order}`:`完成后测72小时后开放。${order}`));
    if(newer&&j.status==='locked')d.append(el('p',j.reason));
    const outcomes=button('查看保持与迁移测验',async()=>{dialog.close();await global.KnowledgeAssistant.openOutcomeStage('retention');});outcomes.disabled=!j.unlockAt||Date.now()<Date.parse(j.unlockAt);outcomes.title=outcomes.disabled?'后测完成满72小时后开放':'';d.append(outcomes);
    if(newer){const b=button(j.status==='active'?'继续14分钟调节任务':'开始14分钟调节任务',async()=>{dialog.close();await openJudgment();});b.disabled=!['available','active'].includes(j.status);d.append(b);if(['submitted','expired'].includes(j.status))d.append(el('p','调节任务记录已保存。'));}
    else if(j.status==='submitted')d.append(el('p','配置判断已提交，等待研究人员评分。'));
    else{const b=button(j.status==='active'?'继续配置判断':'开始配置判断',()=>openJudgment());b.disabled=j.status==='locked';d.append(b);}
    d.append(button('返回学习',()=>dialog.close()));show();
  }
  async function openJudgment(){
    if(run?.regulationVersion){attempted.add('judgment');dialog?.close();return global.RegulationTransferUI.open();}
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
