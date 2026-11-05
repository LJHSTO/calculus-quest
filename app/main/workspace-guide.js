(function(global){
  'use strict';
  const VERSION='workspace-tour-v4',FIRST='GH-01-K01',seen=new Set();
  let panel=null,finish=null,owner='',step=0,ready=false,requiredTour=false,returnUnit='',highlight=null,description=null,observer=null,positionFrame=0;
  let noteFrame=null,noteRect=null;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const identity=()=>{const s=global.KnowledgeAssistant?.designSpaceSnapshot?.();return s?.signedIn?s.ownerKey+':'+s.generation:'';};
  const read=key=>{try{return localStorage.getItem(VERSION+':'+key)==='done';}catch{return false;}};
  const mark=key=>{seen.add(key);try{localStorage.setItem(VERSION+':'+key,'done');}catch{}};
  function log(action,data={}){if(typeof trackLearningEvent==='function')trackLearningEvent('operation_guide_'+action,{guideVersion:VERSION,...data},false).catch(()=>{});}
  const preparing=()=>global.LearnerSetup?.preparation?.stage==='configuration'||global.LearnerSetup?.enrollment?.stage==='configuration';
  function canPreview(unit){return unit?.id===FIRST&&preparing()&&owner===identity()&&Boolean(panel?.isConnected||seen.has(owner)||read(owner));}
  const steps=[
    ['path','你已经进入第一个知识点','这就是正式学习页面。左侧显示课件、检测与后续任务；点亮的节点可以进入，锁定的节点按流程开放。现在收起、再展开左侧路径，试试按钮。','#lesson-rail-toggle'],
    ['lecture','听一段讲解','点击亮起的播放按钮，试听当前课件的讲解。播放后可再次点击暂停；正式学习时，还可以使用重播、倍速和全屏按钮。','[data-classroom-action="play"]'],
    ['scenes','选择真实的互动课件','点击一个互动方式，下方会真正加载这个活动。四种方式服务于同一个知识点，先选一种即可；“系统推荐”不是必选项。','[data-knowledge-scene]'],
    ['assistant','认识知点：本站的 AI 学习助手','点击右上角“知点”，打开真实提问区。它可以解释概念、给出线索和回应问题；还可以划选课件文字后点“问知点”。完成帮助设置后即可在课件中提问。','#workspace-tools-toggle'],
    ['notes','把课件里的文字记下来','按住鼠标，从亮起的文字上拖过，划选一小段；松开后点“记一笔”。选中的原文会自动带入笔记，再写下自己的想法、选颜色并保存。','[data-classroom-action="note"]'],
    ['assessment','先学习，再独立检测','完成知识点后，底部按钮会带你进入检测；不会可以选“我不会”。前后测、保持与迁移任务不自动提供教学帮助。形成测提交后，知点可能邀请你复盘具体错题。','#learning-action-dock'],
    ['settings','接下来，确认六项帮助设置','六项设置决定知点怎样判断、何时出现、先帮到哪一步、在哪里显示、是否先询问，以及仍有困难时怎样继续。没有一套设置对所有人都最好；你仍可拒绝或结束单次帮助。','#workspace-tools-toggle']
  ];
  function clearHighlight(){if(highlight){highlight.classList.remove('operation-guide-target');if(description===null)highlight.removeAttribute('aria-describedby');else highlight.setAttribute('aria-describedby',description);}highlight=null;description=null;}
  const visible=selector=>[...document.querySelectorAll(selector)].find(n=>n.getClientRects().length&&!n.closest('[hidden]'));
  function place(rect){
    const width=global.innerWidth,height=global.innerHeight,pad=6;
    const left=Math.max(4,rect.left-pad),top=Math.max(4,rect.top-pad),right=Math.max(left,Math.min(width-4,rect.right+pad)),bottom=Math.max(top,Math.min(height-4,rect.bottom+pad));
    const box=(node,x,y,w,h)=>Object.assign(node.style,{left:x+'px',top:y+'px',width:Math.max(0,w)+'px',height:Math.max(0,h)+'px'});
    box(panel.querySelector('[data-guide-ring]'),left,top,right-left,bottom-top);
    const masks=panel.querySelectorAll('[data-guide-shade]');box(masks[0],0,0,width,top);box(masks[1],0,bottom,width,height-bottom);box(masks[2],0,top,left,bottom-top);box(masks[3],right,top,width-right,bottom-top);
    const card=panel.querySelector('[data-guide-card]'),w=card.offsetWidth,h=card.offsetHeight,gap=16;
    const clamp=(n,max)=>Math.max(12,Math.min(n,max-12));
    const options=[['right',right+gap,top],['left',left-w-gap,top],['bottom',left,bottom+gap],['top',left,top-h-gap]].map(([side,x,y])=>{
      x=clamp(x,width-w);y=clamp(y,height-h);const overlap=Math.max(0,Math.min(x+w,right)-Math.max(x,left))*Math.max(0,Math.min(y+h,bottom)-Math.max(y,top));return {side,x,y,overlap};
    });
    const best=options.sort((a,b)=>a.overlap-b.overlap)[0];card.dataset.side=best.side;card.style.left=best.x+'px';card.style.top=best.y+'px';
  }
  function schedule(){if(panel&&!positionFrame)positionFrame=requestAnimationFrame(()=>{positionFrame=0;target();});}
  function target(){
    clearHighlight();if(!panel?.isConnected)return;
    highlight=visible(steps[step][3])||null;let rect=null;
    if(step===2&&highlight)highlight=highlight.parentElement;
    if(step===4){
      const editor=visible('[data-knowledge-note-editor]'),action=visible('[data-knowledge-selection-note]');
      panel.dataset.notePhase=editor?'edit':action?'action':ready?'done':'select';
      if(editor){highlight=editor;panel.querySelector('[data-guide-copy]').textContent='原文已经带入笔记。可以补充自己的想法，换一种窗口颜色，再点“保存笔记”；也可以取消。保存的笔记会保留在你的记录里。';}
      else if(action){highlight=action;panel.querySelector('[data-guide-copy]').textContent='你已经选中了真实课件文字。点亮起的“记一笔”，把这段原文带入笔记。';}
      else if(!ready){
        panel.querySelector('[data-guide-copy]').textContent=steps[step][2];
        const frame=visible('.multi-scene-slide-panel iframe');
        if(frame){
          if(frame!==noteFrame){noteFrame=frame;noteRect=null;}
          if(!noteRect||noteRect.viewportWidth!==frame.clientWidth||noteRect.viewportHeight!==frame.clientHeight)frame.contentWindow.postMessage({type:'cq:guide-text-target'},'*');
          if(noteRect){const r=noteRect.rect,f=frame.getBoundingClientRect(),sx=f.width/frame.offsetWidth,sy=f.height/frame.offsetHeight;highlight=frame;rect={left:f.left+(frame.clientLeft+r.left)*sx,top:f.top+(frame.clientTop+r.top)*sy,right:f.left+(frame.clientLeft+r.right)*sx,bottom:f.top+(frame.clientTop+r.bottom)*sy};}
        }
      }
      panel.querySelector('[data-guide-note-blank]').hidden=Boolean(editor||action||ready);
    }
    if(highlight){description=highlight.getAttribute('aria-describedby');highlight.classList.add('operation-guide-target');highlight.setAttribute('aria-describedby','operation-guide-copy');rect||=highlight.getBoundingClientRect();place(rect);}
  }
  function acknowledge(action){if(!panel?.isConnected)return;ready=true;panel.querySelector('[data-guide-next]').disabled=false;panel.querySelector('[data-guide-feedback]').textContent=({path:'路径显示已切换。',lecture:'播放操作已执行，可在播放栏查看状态。',scenes:'当前选择已应用到下方课件。',assistant:'知点入口已打开。',notes:'笔记操作已结束。'})[steps[step][0]]||'';log('action',{step:steps[step][0],action});}
  function close(completed=false){
    if(!panel)return;const same=owner===identity();if(completed&&same)mark(owner);
    if(same)log(completed?'completed':'paused',{step:steps[step][0]});clearHighlight();observer?.disconnect();observer=null;cancelAnimationFrame(positionFrame);positionFrame=0;noteFrame=null;noteRect=null;panel.remove();panel=null;
    const dock=document.querySelector('#learning-action-dock');if(dock)dock.inert=false;
    document.body.classList.remove('operation-guide-active');global.removeEventListener('click',onAction);global.removeEventListener('keydown',onKey);document.removeEventListener('scroll',schedule,true);
    if(typeof pauseNarrationQueue==='function')pauseNarrationQueue();
    if(same&&(!completed||!requiredTour)&&returnUnit&&returnUnit!==currentUnitId)selectUnit(returnUnit);
    if(typeof renderBottomNextButton==='function')renderBottomNextButton();const resolve=finish;finish=null;resolve?.(completed&&same);
  }
  function onKey(event){
    if(event.key==='Escape'&&!visible('[data-knowledge-note-editor]')){event.preventDefault();close(false);}
    if(event.key==='Tab'&&panel){const selector='button:not(:disabled),a[href],input,textarea,select,[tabindex="0"]';const controls=[...(highlight?.matches(selector)?[highlight]:[]),...(highlight?.querySelectorAll(selector)||[]),...panel.querySelectorAll(selector)].filter(n=>n.getClientRects().length&&!n.closest('[hidden],[inert]'));
      if(controls.length){const index=controls.indexOf(document.activeElement),next=(index+(event.shiftKey?-1:1)+controls.length)%controls.length;event.preventDefault();controls[next].focus();}
    }
  }
  function onAction(event){
    if(!panel||event.target.closest('#workspace-operation-tour'))return;const key=steps[step][0];
    if(key==='path'&&event.target.closest('#lesson-rail-toggle'))acknowledge('toggle_path');
    if(key==='lecture'&&event.target.closest('[data-classroom-action="play"]'))acknowledge('play_lecture');
    if(key==='scenes'&&event.target.closest('[data-knowledge-scene]'))acknowledge('choose_scene');
    if(key==='assistant'&&event.target.closest('#workspace-tools-toggle'))acknowledge('open_assistant');
    if(key==='notes'&&event.target.closest('[data-knowledge-note-cancel],[data-knowledge-note-cancel-footer],[data-knowledge-note-save]'))requestAnimationFrame(()=>{if(!document.querySelector('[data-knowledge-note-editor]:not([hidden])'))acknowledge('finish_note');});
    schedule();
  }
  function draw(){
    if(!panel)return;const [key,title,text]=steps[step];ready=step>=5;
    panel.dataset.step=key;panel.querySelector('[data-guide-title]').textContent=title;panel.querySelector('[data-guide-copy]').textContent=text;
    panel.querySelector('[data-guide-progress]').textContent='操作指引 '+(step+1)+' / '+steps.length;panel.querySelector('[data-guide-feedback]').textContent='';
    panel.querySelector('[data-guide-next]').disabled=!ready;panel.querySelector('[data-guide-back]').disabled=step===0;
    panel.querySelector('[data-guide-next]').textContent=step===steps.length-1?(!requiredTour?'完成指引':global.ThreeArmStudyUI?.run?.arm==='A'?'确认统一设置，开始学习':'进入六维配置'):'下一步';
    const settings=panel.querySelector('[data-guide-settings]');settings.hidden=step!==6;settings.replaceChildren();
    panel.querySelector('[data-guide-note-blank]').hidden=step!==4;
    if(step===6)for(const d of global.LearnerPreferences.dimensions)settings.append(el('li',d.short+'：'+d.options.find(o=>o[0]===d.default)[1]));
    if(step===6)panel.querySelector('[data-guide-copy]').textContent+=!requiredTour?' 下面是初始默认值示例；重看指引不会覆盖你已保存的设置。':global.ThreeArmStudyUI?.run?.arm==='A'?' 本组使用下面统一的六项设置；它们不是对你能力的判断。':' 下面是初始默认值，下一步可以逐项查看、选择并说明理由，也可以保留默认。';
    if(step===0&&typeof setLessonRailCollapsed==='function')setLessonRailCollapsed(false,{persist:false,focusCurrent:false});
    if(step===1)document.querySelector('[data-workspace-canvas="slide"]')?.click();
    if(step===2)global.LearningWorkspace?.showInteractive();
    if(step===4){global.KnowledgeAssistant?.close?.();document.querySelector('[data-workspace-canvas="slide"]')?.click();}
    if(step!==1&&typeof pauseNarrationQueue==='function')pauseNarrationQueue();
    requestAnimationFrame(()=>{target();panel.querySelector('[data-guide-title]')?.focus({preventScroll:true});});log('step_viewed',{step:key});
  }
  async function open({required=false}={}){
    if(panel)return false;owner=identity();if(!owner)return false;
    if(required&&(seen.has(owner)||read(owner)))return true;
    const s=global.KnowledgeAssistant?.designSpaceSnapshot?.();if(s?.locked||s?.check||(!preparing()&&global.LearnerSetup?.preparation?.required&&global.LearnerSetup.preparation.stage!=='ready'))return false;
    await ensureChapterLoaded('V14-C1',{showLoading:false});if(owner!==identity())return false;
    requiredTour=required;returnUnit=typeof currentUnitId==='string'?currentUnitId:'';step=0;clearScene();
    panel=el('section');panel.id='workspace-operation-tour';panel.className='operation-guide-overlay';panel.setAttribute('aria-labelledby','operation-guide-title');
    panel.innerHTML='<div data-guide-shade></div><div data-guide-shade></div><div data-guide-shade></div><div data-guide-shade></div><div data-guide-ring aria-hidden="true"></div><div data-guide-card><header><strong data-guide-progress></strong><button type="button" data-guide-pause>稍后继续</button></header><h2 id="operation-guide-title" data-guide-title tabindex="-1"></h2><p id="operation-guide-copy" data-guide-copy></p><button type="button" data-guide-note-blank hidden>也可以直接打开笔记</button><ul data-guide-settings hidden></ul><footer><span data-guide-feedback role="status"></span><button type="button" data-guide-back>上一步</button><button type="button" data-guide-next>下一步</button></footer></div>';
    (document.fullscreenElement||document.body).append(panel);document.body.classList.add('operation-guide-active');
    const dock=document.querySelector('#learning-action-dock');if(dock)dock.inert=true;
    if(typeof switchView==='function')switchView('learn');
    if(selectUnit(FIRST)===false){close(false);return false;}
    panel.querySelector('[data-guide-next]').onclick=()=>{if(!ready)return;if(step===steps.length-1)close(true);else{step++;draw();}};
    panel.querySelector('[data-guide-back]').onclick=()=>{if(step){step--;draw();}};panel.querySelector('[data-guide-pause]').onclick=()=>close(false);
    panel.querySelector('[data-guide-note-blank]').onclick=()=>document.querySelector('[data-classroom-action="note"]')?.click();
    observer=new MutationObserver(schedule);observer.observe(document.querySelector('#knowledge-assistant-root'),{subtree:true,attributes:true,attributeFilter:['hidden','style']});
    global.addEventListener('click',onAction);global.addEventListener('keydown',onKey);document.addEventListener('scroll',schedule,true);draw();log('started',{required,unitId:FIRST});
    return new Promise(resolve=>finish=resolve);
  }
  let sceneTip=null;
  function clearScene(){document.querySelectorAll('.scene-tour-highlight').forEach(n=>n.classList.remove('scene-tour-highlight'));sceneTip?.remove();sceneTip=null;}
  function sceneGuide(){
    const s=global.KnowledgeAssistant?.designSpaceSnapshot?.(),key=identity()+':scene-choice';
    if(panel||!s?.active||s.unitType!=='knowledge'||s.taskReady!==false||document.querySelector('dialog[open]')||seen.has(key)||read(key)){clearScene();return;}
    const choices=[...document.querySelectorAll('[data-knowledge-scene]')].find(n=>n.getClientRects().length)?.parentElement;
    if(!choices||sceneTip?.isConnected)return;choices.classList.add('scene-tour-highlight');sceneTip=el('aside');sceneTip.className='scene-tour-tip';sceneTip.setAttribute('role','status');sceneTip.append(el('strong','从这里开始：点一个互动方式'),el('p','任选一个上方按钮。选择后会加载活动；想换一种时仍在这里切换。'));
    const done=el('button','知道了');done.type='button';done.onclick=()=>{mark(key);clearScene();log('scene_hint_dismissed');};sceneTip.append(done);choices.after(sceneTip);log('scene_hint_shown');
  }
  global.addEventListener('cq:proactive-state',()=>{if(panel&&owner!==identity())close(false);sceneGuide();});
  global.addEventListener('cq:learning-signal',e=>{if(e.detail?.eventType==='knowledge_scene_selected'){mark(identity()+':scene-choice');clearScene();log('scene_choice_completed');}});
  global.addEventListener('cq:lesson-rendered',()=>requestAnimationFrame(()=>{target();sceneGuide();}));
  global.addEventListener('cq:classroom-surface-change',()=>requestAnimationFrame(()=>{target();sceneGuide();}));
  global.addEventListener('resize',schedule);
  global.addEventListener('message',event=>{
    if(!panel||step!==4||event.source!==noteFrame?.contentWindow)return;
    if(event.data?.type==='cq:guide-text-target'){
      const r=event.data.rect,w=event.data.viewportWidth,h=event.data.viewportHeight;
      if(!r||![r.left,r.top,r.right,r.bottom,w,h].every(Number.isFinite)||r.left<0||r.top<0||r.right>w||r.bottom>h||r.right<=r.left||r.bottom<=r.top)return;
      noteRect={rect:r,viewportWidth:w,viewportHeight:h};schedule();
    }else if(event.data?.type==='cq:openmaic-rendered'){noteRect=null;schedule();}
  });
  global.addEventListener('fullscreenchange',()=>{if(panel){(document.fullscreenElement||document.body).append(panel);schedule();}});
  global.addEventListener('cq:view-changed',e=>{if(panel&&e.detail.view!=='learn')close(false);});
  global.OperationGuide=Object.freeze({open,sceneGuide,canPreview,get active(){return Boolean(panel?.isConnected);},get context(){return panel?{version:VERSION,step:steps[step][0]}:null;}});
})(window);
