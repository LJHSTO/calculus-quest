(function(global){
  'use strict';
  let model=null,dialog=null,body=null,status=null,clockNode=null,ownerToken='',ownerKey='',draft={},saveTimer=0,timer=0,observer=null,visibleTimer=0,queue=Promise.resolve(),pending=null,busy=false,offset=0,epoch=0;
  const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
  const token=()=>typeof state!=='undefined'?state.authToken:'';
  const id=()=>crypto.randomUUID();
  const context=()=>ownerToken&&ownerToken===token()&&model?{runId:model.runId,status:model.status}:null;
  function notify(){const current=context();global.dispatchEvent(new CustomEvent('cq:regulation-state',{detail:{runId:current?.runId||null,status:current?.status||null,opened:Boolean(current&&dialog?.open)}}));}
  function close(){clearTimeout(saveTimer);clearInterval(timer);clearTimeout(visibleTimer);observer?.disconnect();dialog?.close();notify();global.KnowledgeAssistant?.refreshSupportSurface?.();}
  function reset(){epoch++;close();model=null;draft={};pending=null;ownerToken='';queue=Promise.resolve();notify();}
  async function request(payload){
    const expectedToken=ownerToken,expectedEpoch=epoch;
    if(!expectedToken||token()!==expectedToken)throw new Error('账号已变化，请重新打开任务。');
    const headers={Authorization:'Bearer '+expectedToken,'Content-Type':'application/json'};if(global.StudyEntry?.arm)headers['X-Study-Arm']=global.StudyEntry.arm;
    let error;for(let attempt=0;attempt<2;attempt++){
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
      try{const r=await fetch('api/study/regulation',{method:payload?'POST':'GET',headers,signal:controller.signal,...(payload?{body:JSON.stringify(payload)}:{})});const data=await r.json();if(token()!==expectedToken||ownerToken!==expectedToken||epoch!==expectedEpoch)throw new Error('账号或任务已变化，请重新打开。');if(!r.ok||data.ok!==true)throw Object.assign(new Error(data.message||'保存未成功，请重试。'),{status:r.status});return data.data;}
      catch(e){error=e;if(e.status&&![408,429,502,503,504].includes(e.status))throw e;if(token()!==expectedToken||epoch!==expectedEpoch)throw e;}
      finally{clearTimeout(timeout);}
    }throw Object.assign(new Error('连接暂时中断，填写内容仍留在当前页面。请重试保存。'),{cause:error});
  }
  function accept(value){if(value.runId!==model?.runId&&model)throw new Error('学习轮次已变化，请重新打开。');model=value;offset=Date.parse(value.serverNow)-Date.now();const run=global.ThreeArmStudyUI?.run;if(ownerToken===token()&&run?.id===value.runId)global.ThreeArmStudyUI?.setRun?.({...run,regulationActive:value.status==='active'});notify();global.KnowledgeAssistant?.refreshSupportSurface?.();return value;}
  function post(action,answers,extra={}){
    const operation=async()=>{
      if(pending){const same=pending.action===action&&JSON.stringify(pending.answers||{})===JSON.stringify(answers||{})&&(!extra.receiptId||pending.receiptId===extra.receiptId);const replay=accept(await request(pending));pending=null;if(same)return replay;}
      const payload={action,runId:model.runId,revision:model.revision||0,requestId:id(),taskId:model.taskId??null,phase:model.phase,...(answers?{answers}:{}),...extra};
      // Only unacknowledged requests are replayed; reuse exactly the same body and key.
      pending=payload;try{const result=await request(payload);pending=null;return accept(result);}catch(e){if(e.status&&e.status<500&&e.status!==429)pending=null;throw e;}
    };
    queue=queue.catch(()=>{}).then(operation);return queue;
  }
  async function perform(fn){if(busy)return;busy=true;dialog?.setAttribute('aria-busy','true');try{await fn();}catch(e){if(status)status.textContent=e.message;}finally{busy=false;dialog?.removeAttribute('aria-busy');}}
  function button(text,fn,kind=''){const b=el('button',text,kind);b.type='button';b.onclick=()=>perform(fn);return b;}
  function fields(){if(!model?.taskId)return {};const keys=model.task?.kind==='scenario'?['choice','reason','verification']:{attempt:['initialAnswer','initialReason','confidence'],support:['helpChoice','actionChoice','actionNote'],check:['checkAnswer','checkReason'],reflect:['reflectionDecision','reflectionReason']}[model.phase]||[];return Object.fromEntries(keys.filter(k=>Object.hasOwn(draft,k)).map(k=>[k,draft[k]]));}
  async function persist(){clearTimeout(saveTimer);if(model?.status==='active'&&model.taskId){status.textContent='正在保存…';await post('draft',fields());status.textContent='草稿已保存';}}
  function changed(key,value){draft[key]=value;clearTimeout(saveTimer);status.textContent='尚有内容待保存';saveTimer=setTimeout(()=>{persist().catch(e=>{if(status)status.textContent=e.message;});},1200);}
  function choices(parent,label,key,options){const f=el('fieldset'),legend=el('legend',label);f.append(legend);for(const o of options){const row=el('label',undefined,'reg-choice'),input=el('input');input.type='radio';input.name='reg-'+key;input.value=o.value;input.checked=draft[key]===o.value;input.onchange=()=>changed(key,o.value);row.append(input,el('span',o.label));f.append(row);}parent.append(f);}
  function textarea(parent,label,key,placeholder){const l=el('label',undefined,'reg-text-label');l.append(el('span',label));const input=el('textarea');input.rows=2;input.maxLength=600;input.value=draft[key]||'';input.placeholder=placeholder||'一句话即可；暂时说不清也可以如实写下。';input.oninput=()=>changed(key,input.value);l.append(input);parent.append(l);}
  function figure(parent,q){if(!q?.figure)return;const f=q.figure;if(!/^assets\/assessment\/functions-limits-r11\/[a-z0-9-]+\.svg$/.test(f.src))return;const wrap=el('figure',undefined,'reg-figure'),img=el('img');img.src=f.src;img.alt=f.alt;img.width=f.width;img.height=f.height;const fallback=el('p',f.alt,'reg-figure-fallback');fallback.hidden=true;img.onerror=()=>{img.hidden=true;fallback.hidden=false;};wrap.append(img,fallback,el('figcaption',f.caption));parent.append(wrap);}
  function math(parent,q,key){const section=el('section',undefined,'reg-question');section.append(el('h3',q.prompt));figure(section,q);choices(section,'请选择你的回答',key,q.options.filter(o=>o.value!=='__skip__'));const skip=el('button','这道数学题暂不作答','reg-text-button');skip.type='button';skip.onclick=()=>{changed(key,'__skip__');for(const radio of section.querySelectorAll('input'))radio.checked=false;skip.textContent='已选择：这道数学题暂不作答';};if(draft[key]==='__skip__')skip.textContent='已选择：这道数学题暂不作答';section.append(skip);parent.append(section);}
  function previous(parent,q,key){const details=el('details',undefined,'reg-previous');details.open=true;details.append(el('summary','查看刚才的图和自己的回答'),el('p',q.prompt));figure(details,q);details.append(el('p','你的选择：'+(q.options.find(o=>o.value===draft[key])?.label||'尚未作答')));parent.append(details);}
  function visibility(target){clearTimeout(visibleTimer);observer?.disconnect();const receipt=model.receipt;if(!receipt||receipt.visible)return;const captured={run:model.runId,task:model.taskId,phase:model.phase,id:receipt.id};let inView=false;
    const arm=()=>{clearTimeout(visibleTimer);if(!inView||document.hidden)return;visibleTimer=setTimeout(async()=>{if(document.hidden||!dialog?.open||model?.runId!==captured.run||model.taskId!==captured.task||model.phase!==captured.phase)return;try{await post('visible',null,{receiptId:captured.id});}catch(e){if(status&&e.status!==409)status.textContent='可见状态暂未记录；你的作答仍可继续保存。';}},1200);};
    observer=new IntersectionObserver(entries=>{inView=entries.some(e=>e.intersectionRatio>=0.5);arm();},{threshold:[0,.5,1]});observer.observe(target);dialog._visibility=arm;
  }
  function updateClock(){if(!clockNode||!model?.deadlineAt)return;const n=Math.max(0,Math.ceil((Date.parse(model.deadlineAt)-(Date.now()+offset))/1000));clockNode.textContent=`剩余 ${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;if(n<=0&&model.status==='active'){clearInterval(timer);request().then(accept).then(render).catch(e=>status.textContent=e.message);}}
  function render(){
    clearTimeout(saveTimer);clearTimeout(visibleTimer);observer?.disconnect();clearInterval(timer);draft={...(model.draft||{})};
    if(!dialog){dialog=el('dialog');dialog.id='regulation-transfer-dialog';dialog.className='reg-transfer-window';document.body.append(dialog);dialog.oncancel=e=>{e.preventDefault();perform(async()=>{await persist();close();});};}
    const head=el('header',undefined,'reg-header'),title=el('div');title.append(el('p','新情境任务','reg-eyebrow'),el('h2',model.task?.title||'在新任务中作出决定'));clockNode=el('span',undefined,'reg-clock');head.append(title,clockNode);body=el('main',undefined,'reg-body');status=el('p','', 'reg-status');status.setAttribute('role','status');const footer=el('footer',undefined,'reg-footer');dialog.replaceChildren(head,body,status,footer);
    if(model.status==='available'){body.append(el('p',model.instrument.introduction),el('p','共14分钟，从点击开始后计时。关闭页面或刷新不会重新计时，已有作答会保存。'));footer.append(button('开始14分钟任务',async()=>{await post('start');render();},'reg-primary'),button('稍后开始',close));}
    else if(model.status==='locked'||model.status==='legacy'){body.append(el('p',model.reason));footer.append(button('返回',close));}
    else if(model.status!=='active'){body.append(el('h3',model.status==='expired'?'本次时间已到':'已完成'),el('p',model.message));footer.append(button('返回后续任务',async()=>{close();await global.ThreeArmStudyUI?.openTasks?.();},'reg-primary'));}
    else{
      if(model.phase==='orientation'){body.append(el('p',model.instrument.introduction));const list=el('ol');['先试一道新题，说明自己的依据。','根据需要自己核对或使用线索。','移开线索，完成一张新图的小检查。','根据新例决定是否继续或调整帮助。'].forEach(t=>list.append(el('li',t)));body.append(list,el('p','之后还有两个简短情境。回答不必写长篇文字。'));footer.append(button('我了解了，进入第一个任务',async()=>{await post('begin');render();},'reg-primary'));}
      else if(model.phase==='summary'){body.append(el('h3','四个任务的记录已保存'),el('p','点击完成结束本次任务。'));footer.append(button('完成本次任务',async()=>{await post('finish');render();},'reg-primary'));}
      else{
        const t=model.task;body.append(el('p',`任务 ${model.taskIndex+1} / 4`,'reg-progress'),el('p',t.context));
        if(t.kind==='scenario'){body.append(el('h3',t.prompt));choices(body,'选择一个你认为有依据的做法','choice',t.options);textarea(body,'你的依据','reason');textarea(body,'怎样核验，或什么情况会使你改变决定','verification');}
        else if(model.phase==='attempt'){math(body,t.question,'initialAnswer');textarea(body,'你这样判断的依据','initialReason');choices(body,'现在的把握','confidence',t.confidenceOptions);}
        else if(model.phase==='support'){
          previous(body,t.reviewQuestion,'initialAnswer');const card=el('section',undefined,'reg-help');card.append(el('h3',t.invitation));choices(card,'这一步准备怎样做','helpChoice',t.choices);if(t.help)card.append(el('p',t.help.text,'reg-hint'));
          if((t.help?.level||0)<2)card.append(button(t.help?'查看更具体的线索':'打开一条线索',async()=>{clearTimeout(saveTimer);await post('help',fields());render();},'reg-secondary'));
          body.append(card);choices(body,'现在实际采取哪一步','actionChoice',t.actions);textarea(body,'你核对了什么，或怎样使用线索','actionNote');requestAnimationFrame(()=>visibility(t.help?card.querySelector('.reg-hint'):card));
        }else if(model.phase==='check'){body.append(el('p',t.notice,'reg-notice'));math(body,t.question,'checkAnswer');textarea(body,'这张新图的判断依据','checkReason');}
        else if(model.phase==='reflect'){previous(body,t.reviewQuestion,'checkAnswer');body.append(el('h3',t.prompt));choices(body,'接下来怎样处理帮助','reflectionDecision',t.decisions);textarea(body,'请指出新例中的一条具体依据','reflectionReason');}
        footer.append(button(model.phase==='reflect'||t.kind==='scenario'?'保存，进入下一任务':'保存，继续下一步',async()=>{clearTimeout(saveTimer);await post('next',fields());render();},'reg-primary'));
        footer.append(button('本任务暂不作答',async()=>{clearTimeout(saveTimer);await persist();await post('skip');render();},'reg-text-button'));
      }
      footer.append(button('保存并关闭',async()=>{await persist();close();}));body.append(el('p','关闭后计时继续；在剩余时间内可从“后续任务”回来。','reg-footnote'));updateClock();timer=setInterval(updateClock,1000);
    }
    footer.append(button('重新读取已保存记录',async()=>{await queue.catch(()=>{});pending=null;accept(await request());render();},'reg-text-button'));
    const host=document.fullscreenElement||document.body;if(dialog.parentElement!==host)host.append(dialog);if(!dialog.open)dialog.showModal();body.scrollTop=0;body.querySelector('h3')?.setAttribute('tabindex','-1');notify();
  }
  async function open(){epoch++;ownerToken=token();ownerKey=global.ThreeArmStudyUI?.run?.id||'';model=null;pending=null;queue=Promise.resolve();accept(await request());render();}
  global.RegulationTransferUI=Object.freeze({open,close,get context(){return context();},get active(){return Boolean(context()&&model.status==='active'&&Date.parse(model.deadlineAt)>Date.now()+offset);},get opened(){return Boolean(context()&&dialog?.open);}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(visibleTimer);else dialog?._visibility?.();});
  global.addEventListener('cq:proactive-state',()=>{if(ownerToken&&token()!==ownerToken)reset();const current=global.ThreeArmStudyUI?.run?.id;if(ownerKey&&current&&ownerKey!==current)reset();});
})(window);
