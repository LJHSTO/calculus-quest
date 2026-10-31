(function(global){
  "use strict";
  if(!global.StudyEntry)return;
  let run=null,dialog=null,snapshot=null,lastOwner='',loading=false,lastPoll=0,judgmentActive=false,pendingUnit=null;
  const surveyDrafts={},seenReviews=new Set();
  const attempted=new Set();
  const labels={A:'固定配置',B:'自主配置与关联反馈',C:'自主配置'};
  const sceneNames={simulation:'动手实验',game:'误解挑战',mindMap:'关系图',visualization3d:'空间视角',slide:'讲解页'};
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  function button(text,fn){const b=el('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){let p=dialog?.querySelector('[role=status]');if(!p){p=el('p');p.setAttribute('role','status');dialog?.append(p);}if(p)p.textContent=e.message;}finally{b.disabled=false;}};return b;}
  async function request(path,body){const token=state.authToken;const r=await fetch('api/study/'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(token!==state.authToken)throw new Error('账号已变化，请重新打开');if(!r.ok)throw Object.assign(new Error(p.message||'请求未完成'),{status:r.status});return p.data;}
  function modal(title){if(!dialog){dialog=el('dialog');dialog.id='three-arm-dialog';document.body.append(dialog);}dialog.oncancel=null;dialog.onclose=null;dialog.replaceChildren(el('h2',title));dialog.setAttribute('aria-label',title);return dialog;}
  async function show(){const host=document.fullscreenElement||document.body;if(dialog.parentElement!==host)host.append(dialog);if(!dialog.open)dialog.showModal();dialog.scrollTop=0;}
  function setRun(value){run=value;judgmentActive=Boolean(value?.activeJudgment);const label=document.getElementById('three-arm-entry-label');if(label&&run){const text=run.mode==='preview'?`${run.arm}组 · ${labels[run.arm]} · 体验`:'本次学习';if(label.textContent!==text)label.textContent=text;}}
  function install(){
    const host=document.querySelector('.player-top .player-actions');if(!host||document.getElementById('three-arm-review'))return;
    const label=el('span');label.id='three-arm-entry-label';label.className='three-arm-entry-label';
    const review=button('学习回顾',()=>openReview());review.id='three-arm-review';host.prepend(label,review);setRun(run);
  }
  async function openReview(){
    modal('学习回顾').append(el('p','正在汇总本次学习…'));await show();
    const data=await request('review');setRun(data.run);const d=modal(run.linkedFeedback?'学习回顾与配置关联':'学习回顾');
    d.append(el('p',data.pendingModule==='GH-01'?'函数部分已完成。先看看三个知识点的检测结果，再继续学习极限与连续。':data.pendingModule==='GH-02'?'六个知识点已学完。回顾这部分的检测结果，然后进入后测。':'这里汇总你已完成的独立检测。'));
    d.append(el('p',`已完成 ${data.ordinary.answered} 题，答对 ${data.ordinary.correct} 题${data.ordinary.scored<data.ordinary.answered?`，另有 ${data.ordinary.answered-data.ordinary.scored} 题等待评分`:''}。`));
    const results=el('div');results.className='study-review-results';
    for(const id of [...new Set(data.results.map(r=>r.unitId))]){const unit=typeof getUnit==='function'?getUnit(id):null,rows=data.results.filter(r=>r.unitId===id);const p=el('p',`${(unit?.label||'知识点检测').replace(/^检测[：:]/,'')}：${rows.filter(r=>r.correct===true).length} / ${rows.length} 题正确`);results.append(p);}
    if(!data.results.length)results.append(el('p','完成知识点检测后，这里会出现独立作答记录。'));d.append(results);
    if(data.linked){
      const linked=el('section');linked.dataset.linkedFeedback='';linked.append(el('h3','把设置、帮助经历和独立表现放在一起看'));
      for(const item of data.linked.filter((item,i)=>item.offered||item.visible||item.independentResults.length||i===data.linked.length-1)){
        const card=el('article');card.className='study-linked-card';card.dataset.configurationRevision=item.revision;
        card.append(el('h4',`第 ${item.revision} 版配置`));
        const settings=el('details'),list=el('ul');settings.append(el('summary','查看当时的六项帮助设置'));for(const [id,value]of item.behavior)list.append(el('li',`${value}`));settings.append(list);card.append(settings);
        card.append(el('p',`帮助经历：系统发起 ${item.offered} 轮询问或帮助，实际可见的帮助 ${item.visible} 轮，确认或接受 ${item.accepted} 轮。`));
        for(const experience of (item.experiences||[]).slice(-5)){const unit=typeof getUnit==='function'?getUnit(experience.scope):null;card.append(el('small',`${new Date(experience.at).toLocaleTimeString('zh-CN',{hour12:false})} · ${unit?.label||'本知识点'} / ${sceneNames[experience.sceneType]||'讲解页'}：${experience.seen?'已看到帮助内容':'询问或提示未展开为可见帮助内容'}。`));}
        const scored=item.independentResults.filter(r=>r.correct!==null);
        card.append(el('p',scored.length?`这些帮助之后、下次修改设置之前的独立检测：${scored.length} 道已判定，${scored.filter(r=>r.correct).length} 道正确。`:'还没有可以对应的独立检测结果。'));
        linked.append(card);
      }
      linked.append(el('p','下一步可以保持设置，也可以只改一项，并在下一次独立检测后再判断是否适合自己。'));d.append(linked);
    }
    const actions=el('footer');
    if(data.pendingModule){
      seenReviews.add(run.id+data.pendingModule);
      const answers={module:data.pendingModule};
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
    const data=await request('state');setRun(data.run);const d=modal('本次学习与后续任务');
    const p=data.preparation;
    d.append(el('p',p.stage==='ready'?'学习中：每个知识点有三道独立检测，学完两个部分后分别回顾，最后完成后测与体验问卷。':'准备流程：学习前问卷 → 独立前测 → 确认六维帮助方式 → 开始学习。'));
    if(p.stage!=='ready')d.append(button('继续准备',async()=>{dialog.close();await global.LearnerSetup.resumePreparation();}));
    else d.append(button('查看学习回顾',openReview));
    if(!run.finalSurveyAt&&data.posttestComplete)d.append(button('填写学习体验问卷',()=>openSurvey('final')));else if(run.finalSurveyAt)d.append(el('p','学习体验已保存。'));
    const j=data.judgment;
    d.append(el('h3','三天后的独立任务'),el('p',j.unlockAt?`开放时间：${new Date(j.unlockAt).toLocaleString('zh-CN')}。请先完成保持和迁移，再做六个配置判断情境。`:'完成后测72小时后，返回这里完成保持、迁移和配置判断。'));
    d.append(button('查看保持与迁移测验',async()=>{dialog.close();await global.KnowledgeAssistant.openOutcomeStage('retention');}));
    if(j.status==='submitted')d.append(el('p','配置判断已提交，等待研究人员评分。'));
    else{const b=button(j.status==='active'?'继续配置判断':'开始配置判断',()=>openJudgment());b.disabled=j.status==='locked';d.append(b);}
    d.append(button('返回学习',()=>dialog.close()));show();
  }
  async function openJudgment(){
    let task=await request('judgment');if(task.status==='available')task=await request('judgment',{action:'start'});if(task.status!=='active')throw new Error(task.status==='submitted'?'配置判断已经提交':task.reason);
    attempted.add('judgment');judgmentActive=true;global.KnowledgeAssistant.refreshSupportSurface();const d=modal('配置判断：根据经历决定怎样帮助');
    d.append(el('p','请独立回答六个情境。没有要求你一定多用或少用AI：请说明保持还是调整、依据是什么、之后观察什么。不会可写“暂时无法判断”。草稿会自动保存，离开后可继续。'));
    const answers={...task.draft};let timer=0,saving=Promise.resolve(),closed=false;
    const status=el('p');status.setAttribute('role','status');
    function persist(){saving=saving.catch(()=>{}).then(async()=>{const copy={...answers};status.textContent='正在保存草稿…';task=await request('judgment',{action:'draft',answers:copy,revision:task.revision});status.textContent='草稿已保存';});return saving;}
    for(const q of task.items){const field=el('fieldset');field.append(el('legend',q.focus),el('p',q.prompt));const input=el('textarea');input.rows=4;input.maxLength=3000;input.dataset.judgment=q.id;input.setAttribute('aria-label',q.focus);input.value=answers[q.id]||'';input.oninput=()=>{answers[q.id]=input.value;clearTimeout(timer);timer=setTimeout(()=>{if(!closed)persist().catch(e=>status.textContent=e.message);},700);};field.append(input);d.append(field);}
    const extra=el('textarea');extra.rows=2;extra.maxLength=1000;extra.setAttribute('aria-label','课外练习情况');extra.placeholder='从上次学习到现在，是否另外练习过？大约多久、用了什么资源？没有可写“没有”。';d.append(el('p','最后补充一下三天内的额外学习情况（可不填）：'),extra,status);
    const leave=async()=>{clearTimeout(timer);await persist();closed=true;dialog.close();};
    d.append(button('保存草稿，稍后继续',leave),button('提交六个情境回答',async()=>{clearTimeout(timer);await saving;const result=await request('judgment',{action:'submit',answers,revision:task.revision,outsidePractice:extra.value});judgmentActive=result.status==='active';closed=true;dialog.close();global.KnowledgeAssistant.refreshSupportSurface();await openTasks();}));
    d.oncancel=e=>{e.preventDefault();leave().catch(err=>status.textContent=err.message);};show();
  }
  async function openEnrollment(){const d=modal('参加本次学习研究');d.append(el('p','本次包括一次学习，以及三天后的独立任务。系统会分配一种帮助方式；将记录你的学习操作、设置、答题与问卷，用于研究学习与帮助之间的关系。你可以暂时离开，已有作答会保留；参与或数据问题请联系研究负责人。'));const label=el('label'),input=el('input');input.type='checkbox';label.append(input,document.createTextNode('我已了解研究安排，自愿参加'));d.append(label,button('确认参加并进入学习',async()=>{if(!input.checked)throw new Error('请先确认自愿参加');await request('enroll',{consent:true});location.reload();}),button('暂不参加',()=>dialog.close()));show();}
  async function showProbe(p){
    const claim=await request('probe-claim',{id:p.id});if(!claim.claimed)return;
    const d=modal('只问这一次：刚才的知点帮助体验'),answers={id:p.id,usefulness:null,timing:null,disruption:null,note:''};
    d.append(el('p',`请回想 ${new Date(p.at).toLocaleTimeString('zh-CN',{hour12:false})}，在${sceneNames[p.sceneType]||'当前知识点'}出现的那次${p.kind}。这是体验反馈，可以直接跳过；本轮不会再自动弹出。`));
    for(const [key,title,ends]of [['usefulness','这次询问或帮助对你有用吗？','1 完全没用—5 很有用'],['timing','它出现的时机合适吗？','1 很不合适—5 很合适'],['disruption','它打断了你的学习吗？','1 完全没有—5 非常明显']]){
      const field=el('fieldset');field.append(el('legend',title),el('small',ends));const row=el('div');row.className='study-rating';
      for(const value of [1,2,3,4,5]){const b=button(String(value),()=>{answers[key]=value;for(const x of row.children)x.setAttribute('aria-pressed',String(x===b));});b.setAttribute('aria-pressed','false');row.append(b);}field.append(row);d.append(field);
    }
    const note=el('textarea');note.rows=2;note.maxLength=600;note.placeholder='想补充的具体经历（可不填）';note.setAttribute('aria-label','补充帮助经历');note.oninput=()=>answers.note=note.value;d.append(note);
    const submit=async skipped=>{await request('probe',{...answers,skipped});dialog.close();};
    d.append(button('保存并继续学习',()=>submit(false)),button('跳过，继续学习',()=>submit(true)));
    d.oncancel=e=>{e.preventDefault();submit(true).catch(()=>d.close());};show();
  }
  async function tick(){
    if(!snapshot?.signedIn||!state.authToken||loading||Date.now()-lastPoll<5000||document.hidden)return;
    loading=true;lastPoll=Date.now();const identity=snapshot.ownerKey;
    try{const data=await request('state');if(snapshot.ownerKey!==identity)return;setRun(data.run);install();
      if(snapshot.active&&!dialog?.open&&!document.querySelector('dialog[open]')&&data.judgment?.status==='active'&&!attempted.has('judgment')){await openJudgment();return;}
      if(data.probe&&snapshot.active&&!snapshot.locked&&!snapshot.check&&!global.SupportCycleUI?.interactionBusy&&!dialog?.open&&!document.querySelector('dialog[open]')&&!attempted.has(data.probe.id)){
        attempted.add(data.probe.id);await showProbe(data.probe);
      }
    }catch(e){if(e.status===409&&global.StudyEntry.arm==='assigned'&&!run&&!dialog?.open&&!attempted.has('enroll')){attempted.add('enroll');openEnrollment();}}finally{loading=false;}
  }
  function allowsUnit(unit){if(!run||!unit?.id)return true;const crosses=m=>(m==='GH-01'&&unit.id.startsWith('GH-02'))||unit.assessmentPhase==='post';if(run.pendingConfiguration&&crosses(run.pendingConfiguration.module)){pendingUnit=unit.id;global.LearnerSetup.open();return false;}const required=['GH-01','GH-02'].find(m=>state.submittedQuizzes?.includes(m+'-K03-formative')&&!(run.reviewedModules||[]).includes(m)&&crosses(m));if(!required)return true;pendingUnit=unit.id;if(!dialog?.open)openReview().catch(()=>{});return false;}
  function resumeAfterConfiguration(){if(!pendingUnit||run?.pendingConfiguration)return;const target=pendingUnit;pendingUnit=null;selectUnit(target);}
  global.ThreeArmStudyUI=Object.freeze({setRun,openReview,openSurvey,openTasks,openJudgment,allowsUnit,resumeAfterConfiguration,request,get run(){return run;},get judgmentActive(){return judgmentActive;}});
  global.addEventListener('cq:proactive-state',e=>{snapshot=e.detail;if(snapshot.ownerKey!==lastOwner){const changed=Boolean(lastOwner);lastOwner=snapshot.ownerKey;if(changed){dialog?.close();attempted.clear();seenReviews.clear();for(const k of Object.keys(surveyDrafts))delete surveyDrafts[k];run=null;judgmentActive=false;pendingUnit=null;}}install();tick();});
  setInterval(tick,5000);
})(window);
