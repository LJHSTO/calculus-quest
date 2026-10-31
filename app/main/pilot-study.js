(function(global){
  "use strict";
  let data={enrollment:null},snapshot=null,owner="",busy=false,revision=0,dialog=null,message="",preview=null,joinCode="",shown=new Set(),lastState="";
  const drafts=new Map(),presented=new Set(),noticed=new Set();
  let consentAccepted=false,reuseAccepted=false;
  let probeDialog=null,probeNotice=null,probeDialogId='';
  const el=(tag,value)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;return n;};
  const button=(label,run)=>{const n=el("button",label);n.type="button";n.className="button soft";n.onclick=run;return n;};
  function update(next){const serialized=JSON.stringify(next);data=next;if(next.enrollment){joinCode='';preview=null;}if(serialized!==lastState){lastState=serialized;revision++;global.KnowledgeAssistant?.refreshSupportSurface();global.LearnerSetup?.setPilot(next);}syncProbeNotice();}
  async function call(path,body){return global.KnowledgeAssistant.pilotRequest(path,body);}
  async function run(path,body){if(busy)return;const requestedOwner=owner;busy=true;message="";try{const next=await call(path,body);if(owner===requestedOwner)update(next);}catch(e){if(owner===requestedOwner)message=e.message;}finally{busy=false;revision++;global.KnowledgeAssistant?.refreshSupportSurface();if(dialog?.open&&owner===requestedOwner)showDialog();if(probeDialog?.open&&owner===requestedOwner){const status=probeDialog.querySelector('[role="status"]');if(status)status.textContent=message;}}}
  function active(s){return Boolean(data.enrollment?.status==="active"&&data.pending&&data.pending.scope===s.scopeKey&&s.signedIn&&s.active&&!s.locked&&!s.check&&s.unitType==="knowledge"&&s.supportCycle?.status!=="awaiting_check"&&(presented.has(data.pending.id)||!global.SupportCycleUI?.interactionBusy));}
  function choices(parent,label,options,d,key){const field=el("fieldset"),legend=el("legend",label);field.append(legend);const row=el("div");row.style.cssText="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0";
    for(const [value,name] of options){const b=button(name,()=>{d[key]=value;for(const child of row.children)child.setAttribute("aria-pressed",String(child===b));});b.setAttribute("aria-pressed",String(d[key]===value));row.append(b);}field.append(row);parent.append(field);}
  function rating(parent,label,d,key){choices(parent,label,[[null,"无法判断／不愿回答"],...[1,2,3,4,5].map(n=>[n,String(n)])],d,key);}
  function note(parent,d,label){const field=el("label",label),input=el("textarea");input.rows=2;input.maxLength=1200;input.value=d.note||"";input.setAttribute("aria-label",label);input.oninput=()=>d.note=input.value;field.append(input);parent.append(field);}
  function render(s){const p=data.pending,d=drafts.get(p.id)||{need:"",timing:null,disruption:null,reason:"",note:""};drafts.set(p.id,d);
    const root=el("section");root.className="support-cycle pilot-probe";root.dataset.pilotProbe=p.id;presented.add(p.id);
    root.append(el("small","对应学习时刻："+new Date(p.support?.at||p.at).toLocaleTimeString("zh-CN",{hour12:false})),el("strong",p.support?"只问这一次 · 知点帮助体验":"研究记录 · 这次学习体验"),el("p",p.support?`请回想上面时刻出现的那次${p.support.kind||'知点询问'}。这份体验反馈可以跳过；本轮不再自动弹出。`:"请回想标注时刻的学习情况。这是体验反馈，可以跳过；记不清可选“不确定”。"));
    choices(root,p.support?"那次询问出现前，你是否需要帮助？":"标注时刻你是否需要帮助？",[["yes","需要"],["no","不需要"],["uncertain","不确定"],["decline","不愿回答"]],d,"need");
    rating(root,"那次询问出现的时机合适吗？1很不合适—5很合适",d,"timing");
    const extra=el("details");extra.append(el("summary","补充困难、打扰程度或拒绝原因（可不填）"));
    note(extra,d,"刚才主要卡在哪里，或正在做什么？（可不填）");
    rating(extra,"这次询问打断了正在做的事吗？1完全没有—5非常明显",d,"disruption");
    choices(extra,"请选择最接近的原因",[["none","不需要"],["bad_time","时机不好"],["try_myself","想自己试"],["mismatch","内容不对"],["decline","不愿回答"],["other","其他"]],d,"reason");root.append(extra);
    const status=el("p",message);status.setAttribute("role","status");root.append(status);
    root.append(button(busy?"正在保存…":"保存这次记录",()=>{if(!d.need){status.textContent="请选择需要、不需要、不确定或不愿回答。";return;}run("/action",{action:"answer",id:p.id,...d});}),button("跳过，继续学习",()=>run("/action",{action:"skip",id:p.id})));
    return root;
  }
  function openProbe(){
    if(!snapshot||!active(snapshot))return;
    const host=document.fullscreenElement||document.body;
    if(!host||host.tagName==='IFRAME')return;
    if(!probeDialog){probeDialog=el('dialog');probeDialog.id='pilot-probe-dialog';probeDialog.setAttribute('aria-label','本次学习情况记录');}
    if(probeDialog.parentElement!==host)host.append(probeDialog);
    probeDialogId=data.pending.id;
    probeDialog.replaceChildren(render(snapshot));
    probeDialog.oncancel=e=>{e.preventDefault();run('/action',{action:'skip',id:probeDialogId});};
    if(!probeDialog.open)probeDialog.showModal();
    requestAnimationFrame(()=>{const node=probeDialog.querySelector('[data-pilot-probe]');if(probeDialog.open&&node&&probeVisible(node)&&!shown.has(probeDialogId)){const id=probeDialogId;shown.add(id);call('/action',{action:'shown',id}).catch(()=>shown.delete(id));}});
  }
  function syncProbeNotice(){
    const available=snapshot&&active(snapshot);
    if(probeDialog?.open&&(!available||data.pending?.id!==probeDialogId))probeDialog.close();
    if(!available){probeNotice?.remove();probeNotice=null;return;}
    if(data.enrollment?.experiencePolicy&&!data.pending.hasShown&&!shown.has(data.pending.id)&&!document.hidden&&!document.querySelector('dialog[open]')&&!global.SupportCycleUI?.interactionBusy){openProbe();}
    if(!probeNotice){probeNotice=el('div');probeNotice.className='pilot-probe-notice';probeNotice.setAttribute('aria-label','可跳过的学习情况记录');
      probeNotice.append(button('学习情况 · 回答或跳过',openProbe));}
    const host=document.fullscreenElement||document.querySelector('.core-learning-workspace .player-actions');
    if(host&&probeNotice.parentElement!==host)host.append(probeNotice);
    probeNotice.dataset.fullscreen=String(Boolean(document.fullscreenElement));probeNotice.dataset.opportunityId=data.pending.id;if(!noticed.has(data.pending.id)&&!document.hidden&&probeVisible(probeNotice)){noticed.add(data.pending.id);if(typeof trackLearningEvent==='function')trackLearningEvent('pilot_probe_notice_visible',{opportunityId:data.pending.id,windowAt:data.pending.at,source:'client_visible_notification',notQuestionnaireExposure:true},false).catch(()=>{});}
  }
  function showDialog(){
    if(data.enrollment?.studyDesign==='learner-configurable-20-v1'){dialog?.close();global.LearnerSetup?.openPilot(data);return;}
    if(!dialog){dialog=el("dialog");dialog.id="pilot-dialog";dialog.style.cssText="width:min(620px,calc(100vw - 32px));max-height:85vh;border:1px solid #dce0ed;border-radius:18px;padding:24px;color:#24324a;background:white;overflow:auto";document.body.append(dialog);}
    dialog.replaceChildren(el("h2",data.enrollment?.status==="active"?"预试记录":"开始前，请先了解这次学习"));
    dialog.append(button("稍后继续",()=>{dialog.close();if(global.LearnerSetup?.preparation?.stage==="entry")switchView("home");}));
    if(data.enrollment?.status==="active"){
      dialog.append(el("p",`参与编号：${data.enrollment.participantCode}；已抽取${data.completedProbes}次记录。`),el("p",`版本：${data.version.sequence}。${data.version.withdrawal}`));
      const details=el("details");details.append(el("summary","结束本次预试并填写问卷"));
      const d=drafts.get("final")||{burden:null,control:null,usefulness:null,appropriateness:null,note:""};drafts.set("final",d);
      for(const [key,label] of [["burden","记录和询问的负担：1很轻—5很重"],["control","能自主拒绝或结束帮助：1完全不能—5完全可以"],["usefulness","帮助对本次学习有用：1完全无用—5非常有用"],["appropriateness","整体出现时机合适：1很不合适—5很合适"]])rating(details,label,d,key);
      note(details,d,"最不合适的一次、遗漏的帮助或其他建议（可不填）");details.append(button("提交结束问卷",()=>run("/action",{action:"finish",...d})));dialog.append(details);
      const request=el("textarea");request.rows=2;request.maxLength=500;request.setAttribute("aria-label","退出后的数据处理请求");
      dialog.append(el("p","暂时离开会保留进度。如需正式处理参与或数据问题，可提交请求，由研究人员按参与说明处理；不会因关闭页面自动排除回放。"),el("label","参与或数据处理请求"),request,button("提交处理请求",()=>run("/action",{action:"data_request",dataRequest:request.value})));
    } else {
      if(data.enrollment)dialog.append(el("p",data.enrollment.status==="withdrawn"?"你已退出预试。":"本次预试已结束。"));
      dialog.append(el("p","有加入码：输入后阅读说明，确认加入，再完成问卷、前测和学习方式设置。没有加入码：可选择普通学习。"));
      const label=el("label","请输入工作人员提供的加入码"),input=el("input");input.value=joinCode;input.autocomplete="off";input.setAttribute("aria-label","预试加入码");input.oninput=()=>{joinCode=input.value;preview=null;consentAccepted=false;reuseAccepted=false;};label.append(input);dialog.append(label);
      dialog.append(button("阅读预试说明",async()=>{try{preview=await call("/preview",{joinCode});message="";consentAccepted=false;reuseAccepted=false;}catch(e){preview=null;message=e.message;}showDialog();dialog.scrollTop=0;}));
      if(!preview)dialog.append(button("没有加入码，进入普通学习",async()=>{const r=await fetch("api/learning/entry",{method:"POST",headers:{Authorization:`Bearer ${state.authToken}`,"Content-Type":"application/json"},body:JSON.stringify({mode:"ordinary"})});if(!r.ok){message="暂时未能保存，请重试。";showDialog();return;}dialog.close();await global.LearnerSetup.resumePreparation();}));
      if(preview){
        dialog.append(el('h3',preview.title));
        if(preview.useMode==='internal_rehearsal'){const notice=el('p','当前是流程演练版，只供团队检查使用，尚未开放正式学生预试。');notice.className='pilot-consent-notice';dialog.append(notice);}
        const sections=preview.studyType==='learner-configurable-20-v1'?[
          ['你会做什么','先回答3道学习感受题，再独立完成知识前测。不会的题可以选“我不会”。随后学习6个知识点，完成后测和学习体验问卷。每一步都有继续按钮，你可以按自己的速度操作。'],
          ['学习方式',preview.useMode==='internal_rehearsal'?'本次演练不分组。每个人都先设置6项帮助偏好，再体验完整主动支持功能。助手根据学习过程判断何时询问，你确认后再提供对应帮助；也可以拒绝或暂停。':'系统会随机安排两种学习方式，不能自行选择组别。一种方式中，助手只在你提问时回答；另一种方式中，你先设置6项帮助偏好，助手再按设置主动询问或提示。两组都能使用相同的课件、练习和知点提问入口。'],
          ['哪些内容会被记录','平台记录作答、学习操作、提问与回答、偏好及选择理由，以及帮助何时出现、你是否接受或拒绝。问卷可以选“不愿回答”。请不要在自由输入框填写姓名、电话等个人信息。'],
          ['你可以决定什么',preview.useMode==='internal_rehearsal'?'每次帮助都可以拒绝或暂停。学习中点击“学习偏好 · 已设置”即可修改六项偏好；独立测验或检查期间请先完成作答。保存只改变后续帮助，已有作答和历史设置会保留。点击右上角头像可查看记录与问卷。':'每次帮助都可以拒绝或暂停。完成一个知识点的检测后，可以调整下一节的帮助方式。点击右上角头像可查看记录与问卷。暂时离开会保留进度；正式退出或数据处理请求由研究人员按下方说明处理。'],
          ['完成后还要回来吗','如果工作人员安排了延迟测量，请在后测至少72小时后按页面提示返回，在主流程结束后7天内完成。没有参加不会被记为答错。']
        ]:[
          ['你会做什么','按页面指引完成课程学习。部分时刻会出现一份简短记录，请回想询问出现前是否需要帮助、当时是否方便被打断。它不是知识考试，可以跳过。'],
          ['哪些内容会被记录','平台记录学习操作、作答、提问与回答，以及你对需要、时机和打扰程度的反馈。请不要在自由输入框填写姓名、电话等个人信息。'],
          ['你可以决定什么','你可以对当次记录选择不愿回答，或稍后继续学习。正式退出或数据处理请求可在记录入口提交，由研究人员按下方说明处理。']
        ];
        for(const [title,content]of sections){const s=el('section');s.className='pilot-consent-section';s.append(el('h4',title),el('p',content));dialog.append(s);}
        const details=el('details');details.className='pilot-consent-details';details.append(el('summary','负责人、数据保存与完整参与说明'));for(const [title,value]of [['负责人',preview.responsible],['联系方式',preview.contact],['研究审核',preview.reviewReference],['数据保存',preview.retention],['退出及数据处理',preview.withdrawal],['本次参与说明',preview.useMode==='internal_rehearsal'?'本次为内部功能演练，不随机分组。所有加入者均可设置六项帮助偏好，体验主动询问、确认、拒绝和后续反馈。平台会记录学习过程，并通过已配置的模型接口生成支持；请只输入合成或非敏感内容。演练数据不作为正式真人实验结果。':preview.consentText]])details.append(el('h4',title),el('p',value));dialog.append(details);
        if(preview.admission?.kind==='new_round_required'){
          dialog.append(el('p','这个正式预试要求从学习前开始。你已有的作答和进度会保留，请联系研究人员确认参与安排。'));
        }else{
          if(['reuse_pretest','resume_rehearsal'].includes(preview.admission?.kind)){const reuse=el('label'),check=el('input');check.type='checkbox';check.checked=reuseAccepted;check.onchange=()=>reuseAccepted=check.checked;reuse.append(check,document.createTextNode(preview.admission.kind==='resume_rehearsal'?'同意接续已有进度参加演练。已答题目和已保存的偏好均保留；这次记录只用于流程检查，不作为正式实验结果。':'同意将刚完成的前测纳入本次预试，不用重答；之前的其他记录不纳入。'));dialog.append(reuse);}
          const footer=el('div');footer.className='pilot-consent-footer';const agree=el('label'),box=el('input');box.type='checkbox';box.checked=consentAccepted;box.onchange=()=>consentAccepted=box.checked;agree.append(box,document.createTextNode('我已阅读以上说明，自愿参加。'));const join=button('确认并加入',async()=>{if(!consentAccepted){message='请先勾选已阅读并自愿参加。';showDialog();return;}if(['reuse_pretest','resume_rehearsal'].includes(preview.admission?.kind)&&!reuseAccepted){message='请确认是否将刚完成的前测纳入本次预试。';showDialog();return;}join.disabled=true;join.textContent='正在保存，马上进入下一步…';await run('/start',{joinCode,consent:true,versionHash:preview.hash,reusePretest:reuseAccepted});});footer.append(agree,join);dialog.append(footer);
        }
      }
    }
    const status=el("p",message);status.setAttribute("role","alert");dialog.append(status);if(message)status.scrollIntoView({block:'nearest'});
  }
  async function open(){try{update(await call(""));}catch(e){message=e.message;}showDialog();if(data.enrollment?.studyDesign!=='learner-configurable-20-v1'&&!dialog.open)dialog.showModal();}
  function probeVisible(node){
    const r=node.getBoundingClientRect();if(!r.width||!r.height)return false;
    let left=Math.max(0,r.left),top=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
    for(let p=node.parentElement;p;p=p.parentElement){
      // Root overflow applies to the viewport; modal dialogs escape ancestor clipping.
      if(p===document.body||p===document.documentElement)break;
      const style=getComputedStyle(p),box=p.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,box.left);right=Math.min(right,box.right);}
      if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom);}
      if(p.matches('dialog:modal'))break;
    }
    return Math.max(0,right-left)*Math.max(0,bottom-top)/(r.width*r.height)>=.5&&node.contains(document.elementFromPoint((left+right)/2,(top+bottom)/2));
  }
  async function tick(){
    if(busy||!snapshot?.signedIn)return;
    const s=snapshot,requestedOwner=owner;
    try{
      if(data.enrollment?.status==="active"){
        const changed=data.pending&&(data.pending.scope!==s.scopeKey||s.locked||s.check||s.supportCycle?.status==="awaiting_check"||!s.active||document.hidden);
        if(changed){await run("/action",{action:"context_changed"});return;}
        const next=s.unitId&&s.unitType==="knowledge"?await call("/opportunity",{scope:s.scopeKey,unitId:s.unitId,sceneType:s.sceneType,
          foreground:!document.hidden,active:s.active,interactionBusy:global.SupportCycleUI?.interactionBusy===true||s.busy||s.supportBusy||dialog?.open===true||probeDialog?.open===true}):await call("");
        if(owner!==requestedOwner)return;update(next);
        global.KnowledgeAssistant?.refreshSupportSurface();
        const p=data.pending;
        if(p&&active(s)&&!shown.has(p.id)&&!document.hidden){
          const node=[...document.querySelectorAll('[data-pilot-probe]')].find(n=>n.dataset.pilotProbe===p.id&&probeVisible(n));
          if(node||global.TaskSupport?.visibleProbeId?.()===p.id){shown.add(p.id);call("/action",{action:"shown",id:p.id}).catch(()=>shown.delete(p.id));}
        }
      }
    }catch(e){if(owner===requestedOwner)message=e.message;}
  }
  global.PilotStudyUI=Object.freeze({active,render,open,reload:async()=>update(await call('')),get revision(){return revision+":"+Boolean(data.pending&&!presented.has(data.pending.id)&&global.SupportCycleUI?.interactionBusy);}});
  document.getElementById("pilot-entry-button")?.addEventListener("click",open);
  document.getElementById("home-pilot-entry")?.addEventListener("click",open);
  document.getElementById('account-pilot-status')?.addEventListener('click',()=>{if(global.StudyEntry)return;if(typeof setUserMenuOpen==='function')setUserMenuOpen(false);open();});
  global.addEventListener("cq:proactive-state",async e=>{snapshot=e.detail;const key=snapshot.signedIn?snapshot.ownerKey+":"+snapshot.generation:"";
    if(key!==owner){owner=key;data={enrollment:null};preview=null;joinCode="";drafts.clear();shown.clear();presented.clear();noticed.clear();lastState="";dialog?.close();if(key){try{const next=await call("");if(key===owner)update(next);}catch{}}}syncProbeNotice();
  });
  document.addEventListener('fullscreenchange',syncProbeNotice);
  setInterval(tick,5000);
})(window);
