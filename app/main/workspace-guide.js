(function(global){
  'use strict';
  const VERSION='workspace-tour-v3',FIRST='GH-01-K01',seen=new Set();
  let panel=null,finish=null,owner='',step=0,ready=false,requiredTour=false,returnUnit='',highlight=null;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const identity=()=>{const s=global.KnowledgeAssistant?.designSpaceSnapshot?.();return s?.signedIn?s.ownerKey+':'+s.generation:'';};
  const read=key=>{try{return localStorage.getItem(VERSION+':'+key)==='done';}catch{return false;}};
  const mark=key=>{seen.add(key);try{localStorage.setItem(VERSION+':'+key,'done');}catch{}};
  function log(action,data={}){if(typeof trackLearningEvent==='function')trackLearningEvent('operation_guide_'+action,{guideVersion:VERSION,...data},false).catch(()=>{});}
  const preparing=()=>global.LearnerSetup?.preparation?.stage==='configuration'||global.LearnerSetup?.enrollment?.stage==='configuration';
  function canPreview(unit){return unit?.id===FIRST&&preparing()&&owner===identity()&&Boolean(panel?.isConnected||seen.has(owner)||read(owner));}
  const steps=[
    ['path','你已经进入第一个知识点','这就是正式学习页面。左侧显示课件、检测与后续任务；点亮的节点可以进入，锁定的节点按流程开放。现在收起、再展开左侧路径，试试按钮。','#lesson-rail-toggle'],
    ['lecture','听一段讲解','点击下方高亮的播放按钮，试听当前课件的讲解。播放后可再次点击暂停，也可以使用旁边的重播、倍速和全屏按钮。','[data-classroom-action="play"]'],
    ['scenes','选择真实的互动课件','点击一个互动方式，下方会真正加载这个活动。四种方式服务于同一个知识点，先选一种即可；“系统推荐”不是必选项。','[data-knowledge-scene]'],
    ['assistant','认识知点：本站的 AI 学习助手','点击右上角“知点”，打开真实提问区。它可以解释概念、给出线索和回应问题；还可以划选课件文字后点“问知点”。完成帮助设置后即可在课件中提问。','#workspace-tools-toggle'],
    ['notes','试用真实笔记','点击下方笔记按钮。可以输入一句话、切换窗口颜色并保存，也可以取消。这里保存的笔记会保留在你的记录中，不是演示副本。','[data-classroom-action="note"]'],
    ['assessment','先学习，再独立检测','完成知识点后，底部按钮会带你进入检测；不会可以选“我不会”。前后测、保持与迁移任务不自动提供教学帮助。形成测提交后，知点可能邀请你复盘具体错题。','#learning-action-dock'],
    ['settings','接下来，确认六项帮助设置','六项设置决定知点怎样判断、何时出现、先帮到哪一步、在哪里显示、是否先询问，以及仍有困难时怎样继续。没有一套设置对所有人都最好；你仍可拒绝或结束单次帮助。','#workspace-tools-toggle']
  ];
  function clearHighlight(){highlight?.classList.remove('operation-guide-target');highlight?.removeAttribute('aria-describedby');highlight=null;}
  function target(){
    clearHighlight();if(!panel?.isConnected)return;
    highlight=[...document.querySelectorAll(steps[step][3])].find(n=>n.getClientRects().length)||null;
    if(step===2&&highlight)highlight=highlight.parentElement;
    if(step===4&&document.querySelector('[data-knowledge-note-editor]:not([hidden])'))highlight=document.querySelector('[data-knowledge-note-editor]');
    highlight?.classList.add('operation-guide-target');highlight?.setAttribute('aria-describedby','operation-guide-copy');
  }
  function acknowledge(action){if(!panel?.isConnected)return;ready=true;panel.querySelector('[data-guide-next]').disabled=false;panel.querySelector('[data-guide-feedback]').textContent=({path:'路径显示已切换。',lecture:'播放操作已执行，可在播放栏查看状态。',scenes:'当前选择已应用到下方课件。',assistant:'知点入口已打开。',notes:'笔记操作已结束。'})[steps[step][0]]||'';log('action',{step:steps[step][0],action});}
  function close(completed=false){
    if(!panel)return;const same=owner===identity();if(completed&&same)mark(owner);
    if(same)log(completed?'completed':'paused',{step:steps[step][0]});clearHighlight();panel.remove();panel=null;
    const dock=document.querySelector('#learning-action-dock');if(dock)dock.inert=false;
    document.body.classList.remove('operation-guide-active');global.removeEventListener('click',onAction);global.removeEventListener('keydown',onKey);
    if(typeof pauseNarrationQueue==='function')pauseNarrationQueue();
    if(same&&(!completed||!requiredTour)&&returnUnit&&returnUnit!==currentUnitId)selectUnit(returnUnit);
    if(typeof renderBottomNextButton==='function')renderBottomNextButton();const resolve=finish;finish=null;resolve?.(completed&&same);
  }
  function onKey(event){if(event.key==='Escape'&&!document.querySelector('[data-knowledge-note-editor]:not([hidden])')){event.preventDefault();close(false);}}
  function onAction(event){
    if(!panel||event.target.closest('#workspace-operation-tour'))return;const key=steps[step][0];
    if(key==='path'&&event.target.closest('#lesson-rail-toggle'))acknowledge('toggle_path');
    if(key==='lecture'&&event.target.closest('[data-classroom-action="play"]'))acknowledge('play_lecture');
    if(key==='scenes'&&event.target.closest('[data-knowledge-scene]'))acknowledge('choose_scene');
    if(key==='assistant'&&event.target.closest('#workspace-tools-toggle'))acknowledge('open_assistant');
    if(key==='notes'&&event.target.closest('[data-knowledge-note-cancel],[data-knowledge-note-cancel-footer],[data-knowledge-note-save]'))requestAnimationFrame(()=>{if(!document.querySelector('[data-knowledge-note-editor]:not([hidden])'))acknowledge('finish_note');});
    requestAnimationFrame(target);
  }
  function draw(){
    if(!panel)return;const [key,title,text]=steps[step];ready=step>=5;
    panel.dataset.step=key;panel.querySelector('[data-guide-title]').textContent=title;panel.querySelector('[data-guide-copy]').textContent=text;
    panel.querySelector('[data-guide-progress]').textContent='操作指引 '+(step+1)+' / '+steps.length;panel.querySelector('[data-guide-feedback]').textContent='';
    panel.querySelector('[data-guide-next]').disabled=!ready;panel.querySelector('[data-guide-back]').disabled=step===0;
    panel.querySelector('[data-guide-next]').textContent=step===steps.length-1?(!requiredTour?'完成指引':global.ThreeArmStudyUI?.run?.arm==='A'?'确认统一设置，开始学习':'进入六维配置'):'下一步';
    const settings=panel.querySelector('[data-guide-settings]');settings.hidden=step!==6;settings.replaceChildren();
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
    panel=el('section');panel.id='workspace-operation-tour';panel.className='operation-guide-inline';panel.setAttribute('aria-labelledby','operation-guide-title');
    panel.innerHTML='<header><strong data-guide-progress></strong><button type="button" data-guide-pause>稍后继续</button></header><h2 id="operation-guide-title" data-guide-title tabindex="-1"></h2><p id="operation-guide-copy" data-guide-copy></p><ul data-guide-settings hidden></ul><footer><span data-guide-feedback role="status"></span><button type="button" data-guide-back>上一步</button><button type="button" data-guide-next>下一步</button></footer>';
    document.querySelector('#learn-view .player-top').after(panel);document.body.classList.add('operation-guide-active');
    const dock=document.querySelector('#learning-action-dock');if(dock)dock.inert=true;
    if(typeof switchView==='function')switchView('learn');
    if(selectUnit(FIRST)===false){close(false);return false;}
    panel.querySelector('[data-guide-next]').onclick=()=>{if(!ready)return;if(step===steps.length-1)close(true);else{step++;draw();}};
    panel.querySelector('[data-guide-back]').onclick=()=>{if(step){step--;draw();}};panel.querySelector('[data-guide-pause]').onclick=()=>close(false);
    global.addEventListener('click',onAction);global.addEventListener('keydown',onKey);draw();log('started',{required,unitId:FIRST});
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
  global.addEventListener('resize',()=>requestAnimationFrame(target));
  global.addEventListener('cq:view-changed',e=>{if(panel&&e.detail.view!=='learn')close(false);});
  global.OperationGuide=Object.freeze({open,sceneGuide,canPreview,get active(){return Boolean(panel?.isConnected);},get context(){return panel?{version:VERSION,step:steps[step][0]}:null;}});
})(window);
