(function(global){
  "use strict";
  let data=null,owner="",host=null,busy=false,lastRender="",request=0,exposure=null,exposureObserver=null,lastError="",exploreTimer=null;
  const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const token=()=>typeof state!=="undefined"?state.authToken||"":"";
  const unit=()=>typeof currentUnitId!=="undefined"?currentUnitId:"";
  const isPoint=id=>/^GH-0[12]-K0[123]$/.test(id);
  const humanActive=()=>Boolean(data?.protocol.status==='reviewed_human_protocol'&&data.session&&!['complete','withdrawn','between_units'].includes(data.session.stage));
  function fixedHumanResource(){
    if(!humanActive()||data.session.knowledgePointId!==unit()||!['explore','support'].includes(data.session.stage))return;
    global.LearningWorkspace?.showInteractive?.();
    const choice=document.querySelector('.workspace-canvas-toolbar [data-knowledge-scene="simulation"]');
    if(choice&&choice.getAttribute('aria-pressed')!=='true')choice.click();
  }
  const pilotActive=()=>global.LearnerSetup?.enrollment?.studyDesign==='learner-configurable-20-v1'&&global.LearnerSetup.enrollment.status==='active';
  function protects(){return !pilotActive()&&Boolean(busy || data?.session && (["t0","t1","outcome"].includes(data.session.stage)
    || data.protocol.status==="reviewed_human_protocol" && !["complete","withdrawn"].includes(data.session.stage)));}
  async function api(path="",body){
    const r=await fetch(`/api/learning/common-tasks${path}`,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${token()}`,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const payload=await r.json();if(!r.ok)throw new Error(payload.message||"学习任务暂时不可用，请重试。");return payload.data;
  }
  function changed(){
    const measuring=Boolean(data?.session && ["t0","t1","outcome"].includes(data.session.stage));
    document.querySelector('#lesson-player')?.classList.toggle('common-probe-active',measuring);
    if(measuring){global.LessonPlayback?.pause?.();if(typeof pauseNarration==='function')pauseNarration();global.KnowledgeAssistant?.close();}
    global.dispatchEvent(new CustomEvent('cq:common-learning-change'));render();
    if(humanActive())queueMicrotask(fixedHumanResource);
  }
  async function transact(path,body){
    if(busy)return;const activeOwner=owner;busy=true;lastError="";changed();
    try{const next=await api(path,body);if(owner===activeOwner){data=next;lastRender="";}}
    catch(e){if(owner===activeOwner){lastRender="";lastError=e.message;try{const recovered=await api();if(owner===activeOwner)data=recovered;}catch{}}}
    finally{if(owner===activeOwner){busy=false;changed();}}
  }
  const act=(action,extra={})=>transact('/action',{action,fingerprint:data.protocol.fingerprint,revision:data.session.revision,...extra});
  function button(label,fn){const b=node('button',label);b.type='button';b.disabled=busy;b.onclick=fn;return b;}
  function fieldset(parent,label,name,options){const f=node('fieldset');f.append(node('legend',label));for(const [value,text]of options){const l=node('label'),r=node('input');r.type='radio';r.name=name;r.value=value;l.append(r,node('span',text));f.append(l);}parent.append(f);return f;}
  function render(){
    const player=document.querySelector('#lesson-player');if(!player)return;
    const id=unit(),s=data?.session,active=s&&!['complete','withdrawn','between_units'].includes(s.stage);
    if(!token() || !data || data.disabledForPilot || pilotActive() || (!isPoint(id)&&!active)){host?.remove();host=null;lastRender="";clearTimeout(exposure);clearTimeout(exploreTimer);exposureObserver?.disconnect();document.querySelector('#common-learning-sidebar')?.remove();if(!token()||!data||data?.disabledForPilot||pilotActive())player.classList.remove('common-probe-active');return;}
    if(!host?.isConnected){host=node('section');host.id='common-learning-task';host.className='common-learning-task';host.setAttribute('aria-label','判断与验证');player.append(host);lastRender="";}
    const key=JSON.stringify([id,data.protocol.fingerprint,s?.revision,busy,lastError]);if(key===lastRender)return;lastRender=key;
    clearTimeout(exposure);exposure=null;exposureObserver?.disconnect();document.querySelector('#common-learning-sidebar')?.remove();host.replaceChildren(node('h3','判断与验证'));
    if(lastError){const err=node('p',lastError);err.setAttribute('role','alert');host.append(err);}
    if(data.protocol.kind==='placement' && active){const toggle=document.querySelector('#workspace-tools-toggle');if(toggle?.getAttribute('aria-expanded')==='false')toggle.click();}
    if(!s){
      host.append(node('p','先作出判断，再用课件检验，最后独立试一题。游戏得分和拖动次数不作为掌握证明。'));
      const consent=data.protocol.consent;
      if(consent){const d=node('details');d.append(node('summary','参与研究前，请阅读知情同意书'),node('p',consent.text),node('p',`研究联系人：${consent.contact}`),node('p',`数据保存：${consent.retentionPolicy}`),node('p',`退出与删除：${consent.withdrawalPolicy}`));host.append(d);const label=node('label'),check=node('input');check.type='checkbox';check.id='common-consent';label.append(check,node('span','我已阅读并自愿同意参与；可以拒绝或随时退出。'));host.append(label);}
      host.append(button(consent?'同意并开始研究学习':'开始判断与验证',()=>{if(consent&&!host.querySelector('#common-consent').checked)return;transact('/start',{acknowledged:true,consentVersion:consent?.version,knowledgePointId:id});}));return;
    }
    if(s.stage==='withdrawn'){host.append(node('p','本次流程已退出，研究帮助已停止。你仍可使用课程。'));return;}
    if(s.stage==='complete'||s.completedPoints.includes(id)){host.append(node('p','这一知识点的判断与验证已完成。请继续课程中的检测，或到下一个知识点。'));if(s.feedback&&s.knowledgePointId===id)host.append(node('p',s.feedback.text));return;}
    if(s.stage==='between_units'){
      host.append(node('p','上一个学习单元已完成。开始当前知识点的判断与验证。'),button('开始本知识点',()=>act('select_unit',{knowledgePointId:id})));return;
    }
    if(s.knowledgePointId!==id){host.append(node('p',`还有一段“${s.title}”的验证未完成。独立作答期间，学习提示保持关闭。`),button('回到当前验证',()=>{const card=document.querySelector(`.lesson-card[data-unit="${s.knowledgePointId}"]`);const details=card?.closest('details');if(details)details.open=true;card?.click();}),button('退出本次流程',()=>act('withdraw')));return;}
    if(s.probe){
      host.append(node('p',s.stage==='t0'?'先独立判断：当前不展示提示和得分。':s.stage==='t1'?'观察后换一道题，独立判断。':'提示已关闭，请独立检验能否迁移。'));
      const form=node('form');form.append(node('p',s.probe.prompt));
      fieldset(form,'你的判断','response',[...s.probe.options.map(o=>[o.value,o.label]),['unknown','我不会'],['skip','跳过']]);
      const label=node('label','用一句话说明理由（可留空）'),input=node('textarea');input.rows=2;input.maxLength=1200;input.name='explanation';label.append(input);form.append(label);
      const missingLabel=node('label','未写理由的原因（选填）'),missing=node('select');missing.name='explanationMissingReason';
      for(const [value,text]of [['','不选择'],['cannot_explain','暂时说不清'],['prefer_not_to_answer','不想填写']]){const option=node('option',text);option.value=value;missing.append(option);}
      missingLabel.append(missing);form.append(missingLabel);
      input.addEventListener('input',()=>{missing.disabled=Boolean(input.value.trim());if(missing.disabled)missing.value='';});
      fieldset(form,'你有多大把握？（可不选）','confidence',[['0','没把握'],['1','有一些把握'],['2','很有把握']]);
      const submit=node('button','提交判断');submit.type='submit';submit.disabled=busy;form.append(submit);
      form.onsubmit=e=>{e.preventDefault();const f=new FormData(form),response=f.get('response');if(!response)return;act('answer',{probeId:s.probe.id,response,explanation:f.get('explanation'),explanationMissingReason:f.get('explanationMissingReason')||null,confidence:f.has('confidence')?Number(f.get('confidence')):null});};host.append(form);
    }else if(s.stage==='explore'){
      host.append(node('p',s.practicePrompt),node('p','试着构造一个支持你判断的例子，再找一个可能推翻它的例子。动画、旋转和游戏只辅助观察。'));
      if(s.help)host.append(node('p',s.help.text),button('收起线索',()=>act('dismiss_manual_help')));
      const next=button('观察完成，独立再试',()=>act('continue')),remaining=Date.parse(s.exploreReadyAt)-Date.now();
      if(remaining>0){next.disabled=true;host.append(node('p','请先观察并尝试课件，稍后可以继续。'));clearTimeout(exploreTimer);exploreTimer=setTimeout(()=>{lastRender='';render();},remaining+50);}
      host.append(next,button('给我一个思考线索',()=>act('request_help')));
    }else if(s.stage==='support'){
      const help=node('aside');help.className='common-task-hint';help.append(node('strong','一个思考线索'),node('p',s.help?.text||''));
      const side=s.help?.placement==='sidebar'?document.querySelector('#workspace-tools-body'):null;
      if(side){help.id='common-learning-sidebar';side.prepend(help);const toggle=document.querySelector('#workspace-tools-toggle');if(toggle?.getAttribute('aria-expanded')==='false')toggle.click();host.append(node('p','思考线索已显示在学习侧栏。'));}else host.append(help);
      host.append(button('接受线索，独立试一题',()=>act('accept')),button('关闭并独立试一题',()=>act('close')));
      // The surface is recorded as visible, not assumed to have been read.
      if(!s.exposureRecorded){exposureObserver=new IntersectionObserver(entries=>{clearTimeout(exposure);if(entries[0]?.intersectionRatio>=.5&&!document.hidden)exposure=setTimeout(()=>{exposureObserver?.disconnect();if(data?.session?.stage==='support'&&!document.hidden)act('exposure',{fraction:.5,visibleDurationMs:1000});},1000);},{threshold:[.5]});exposureObserver.observe(help);}
    }else if(s.stage==='survey'){
      if(s.feedback)host.append(node('p',s.feedback.text),node('p','选择题由规则判分；文字解释留待复核，不把猜对等同于稳定掌握。'));
      const form=node('form');for(const [name,label] of [['interruption','刚才的帮助打断了我的思路'],['control','我能够决定接受或停止帮助'],['effort','理解刚才的内容需要较多脑力']])fieldset(form,label,name,[[1,'1 完全不同意'],[2,'2'],[3,'3'],[4,'4'],[5,'5'],[6,'6'],[7,'7 完全同意'],['skip','跳过 / 不适用']]);
      const b=node('button','保存并完成本知识点');b.type='submit';b.disabled=busy;form.append(b);form.onsubmit=e=>{e.preventDefault();const f=new FormData(form),answers={};for(const name of ['interruption','control','effort']){const v=f.get(name);if(v===null)return;answers[name]=v==='skip'?null:Number(v);}act('survey',{answers});};host.append(form);
      host.append(button('跳过问卷并完成',()=>act('survey',{answers:{interruption:null,control:null,effort:null}})));
    }
    host.append(button(data.protocol.consent?'退出研究':'退出本轮全部验证',()=>act('withdraw')));
  }
  async function sync(){
    const next=token();if(next!==owner){owner=next;data=null;busy=false;lastError="";lastRender="";request++;const serial=request;changed();
      if(next)try{const result=await api();if(serial===request){data=result;changed();}}catch{};
    }render();
  }
  function telemetryContext(){
    const s=data?.session;
    if(!s||!owner||owner!==token())return null;
    return {protocolId:data.protocol.id,protocolFingerprint:data.protocol.fingerprint,
      dataClass:data.protocol.status==="reviewed_human_protocol"?"human_protocol_requires_consent_filter":"ordinary_learning_not_research",
      opportunityId:s.opportunityId,knowledgePointId:s.knowledgePointId,stage:s.stage,revision:s.revision};
  }
  global.CommonLearning=Object.freeze({protects,sync,telemetryContext});
  // During a frozen human condition, exploration uses the same reviewed 2D
  // activity for everyone. This does not remove the learner's withdrawal UI.
  document.addEventListener('click',event=>{
    if(!humanActive())return;
    const control=event.target.closest('[data-knowledge-scene],[data-workspace-canvas],[data-unit]');if(!control)return;
    const invalid=control.dataset.knowledgeScene&&control.dataset.knowledgeScene!=='simulation'
      ||control.dataset.workspaceCanvas&&control.dataset.workspaceCanvas!=='interactive'
      ||control.dataset.unit&&control.dataset.unit!==data.session.knowledgePointId;
    if(invalid){event.preventDefault();event.stopImmediatePropagation();lastError='本段研究学习使用固定的二维课件。完成当前验证后继续，或随时退出研究。';lastRender='';render();}
  },true);
  global.addEventListener('cq:lesson-rendered',()=>{sync();changed();});
  global.addEventListener('cq:pilot-enrollment',()=>{owner='';sync();});
  global.addEventListener('cq:learning-layout-change',render);
  let processChain=Promise.resolve();
  global.addEventListener('cq:learning-signal',e=>{
    const event=e.detail?.event,s=data?.session;if(!event||!s||!["explore","support"].includes(s.stage)||s.knowledgePointId!==unit())return;
    const payload={fingerprint:data.protocol.fingerprint,knowledgePointId:unit(),opportunityId:s.opportunityId,observedStage:s.stage,
      event:{type:event.eventType,eventId:event.eventId,sessionId:event.sessionId,sequenceIndex:event.sequenceIndex,clientAt:event.timing?.clientAt,
        data:{...event.data,...event.value,sceneType:event.sceneType}}},activeOwner=owner;
    processChain=processChain.then(()=>activeOwner===owner?api('/process',payload):null).catch(()=>{});
  });
  document.addEventListener('visibilitychange',()=>{clearTimeout(exposure);if(!document.hidden&&data?.session?.stage==='support'){lastRender='';render();}});
  global.addEventListener('focus',()=>{const activeOwner=token(),serial=request;if(activeOwner&&activeOwner===owner)api().then(next=>{if(serial===request&&activeOwner===owner&&activeOwner===token()){data=next;changed();}}).catch(()=>{});});
  setInterval(sync,1200);
})(window);
