(function(global){
  'use strict';
  const VERSION='workspace-tour-v2',seen=new Set();let dialog=null,finish=null,owner='',step=0,ready=false,previousFocus=null;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const identity=()=>{const s=global.KnowledgeAssistant?.designSpaceSnapshot?.();return s?.signedIn?s.ownerKey+':'+s.generation:'';};
  const read=key=>{try{return localStorage.getItem(VERSION+':'+key)==='done';}catch{return false;}};
  const mark=key=>{seen.add(key);try{localStorage.setItem(VERSION+':'+key,'done');}catch{}};
  function log(action,data={}){if(typeof trackLearningEvent==='function')trackLearningEvent('operation_guide_'+action,{guideVersion:VERSION,...data},false).catch(()=>{});}
  const steps=[
    ['path','沿着学习路径前进','左侧依次是知识点、检测和研究测量。点亮的节点可以进入；锁定的节点会在完成前一步后开放。点一下第一个知识点。'],
    ['lecture','先看讲解，再动手','这里使用第一个知识点的真实课件。正式学习时可播放、暂停讲解、翻页或全屏。现在点“下一页”试试。'],
    ['scenes','选择一种互动方式','四个按钮是同一知识点的不同活动。先任选一个，不需要把四个都做完；“系统推荐”也不是必选项。'],
    ['assistant','有问题就找知点','右上角“知点”打开提问区。也可划选课件文字后选择“问知点”。现在点“知点”，认识它的位置。'],
    ['notes','留下自己的理解','点击笔记入口，或划选课件文字后点“记一笔”。笔记可以换色，正式保存后可从记录中回看。现在试着打开笔记。'],
    ['assessment','检测时独立作答','每个知识点后有检测；不会可以选“我不会”。前测、后测、保持与迁移等测量不会自动提供教学帮助；形成测提交后，知点可能邀请你复盘具体错题。'],
    ['help','帮助由你决定','主动建议可接受、暂不查看或关闭；结束一轮后帮助会收起。自主配置组下一步选择六项帮助偏好，固定配置组使用统一设置。学习回顾会说明下一次调整机会。']
  ];
  function close(completed=false){if(!dialog?.open)return;if(completed)mark(owner);log(completed?'completed':'paused',{step:steps[step][0]});dialog.close();dialog.remove();dialog=null;previousFocus?.focus?.();const resolve=finish;finish=null;resolve?.(completed);}
  function draw(){
    const [target,title,text]=steps[step];ready=step>=5;
    dialog.querySelector('[data-guide-title]').textContent=title;
    dialog.querySelector('[data-guide-copy]').textContent=text;
    dialog.querySelector('[data-guide-progress]').textContent=`操作演练 ${step+1} / ${steps.length}`;
    dialog.querySelectorAll('[data-tour-target]').forEach(n=>{n.classList.toggle('is-tour-target',n.dataset.tourTarget===target);n.inert=n.dataset.tourTarget!==target;});
    dialog.querySelector('[data-guide-next]').disabled=!ready;
    dialog.querySelector('[data-guide-next]').textContent=step===steps.length-1?'完成指引，继续':'下一步';
    dialog.querySelector('[data-guide-back]').disabled=step===0;
    const sample=dialog.querySelector('[data-tour-target="'+target+'"]');sample?.scrollIntoView({block:'nearest'});
    dialog.querySelector('[data-guide-title]').focus({preventScroll:true});log('step_viewed',{step:target});
  }
  async function open({required=false}={}){
    if(dialog?.open)return false;
    owner=identity();if(!owner)return false;
    if(required&&(seen.has(owner)||read(owner)))return true;
    await ensureChapterLoaded('V14-C1',{showLoading:false});
    if(owner!==identity())return false;
    previousFocus=document.activeElement;step=0;
    dialog=el('dialog');dialog.id='workspace-operation-tour';dialog.className='workspace-guide-dialog operation-tour';dialog.setAttribute('aria-labelledby','operation-tour-title');
    dialog.innerHTML='<header><span data-guide-progress></span><button type="button" data-guide-pause>稍后继续</button></header><div class="tour-layout"><aside data-tour-target="path"><strong>本章路径</strong><p>✓ 知识前测</p><button type="button">输入、输出和函数规则</button><p>检测 → 下一知识点</p><p>后测 → 三天后的独立任务</p></aside><main><nav class="tour-tabs"><span>输入、输出和函数规则</span><div data-tour-target="assistant"><button type="button" data-tour-assistant>知点</button></div><div data-tour-target="notes"><button type="button" data-tour-notes>笔记</button></div></nav><section data-tour-target="lecture"><div class="tour-slide"></div><button type="button" data-tour-page>下一页</button></section><section data-tour-target="scenes"><strong>互动探索 · 请先选择</strong><div class="tour-scenes"></div><p data-scene-feedback>点击一个按钮即可进入该场景。</p></section><section data-tour-target="assessment"><strong>检测与研究测量</strong><p>独立作答 → 提交 → 查看结果；研究测量按安排开放。</p></section><section data-tour-target="help"><strong>知点的主动建议</strong><p>接受提示并继续交流　／　这次先不看</p><p>帮助结束后收起，需要时仍可主动提问。</p></section><aside class="tour-practice" hidden></aside></main></div><footer class="tour-coach"><div><h2 id="operation-tour-title" data-guide-title tabindex="-1"></h2><p data-guide-copy></p><small>这是操作演练，不计入成绩；正式学习中在相同位置使用这些功能。</small></div><div><button type="button" data-guide-back>上一步</button><button type="button" data-guide-next>下一步</button></div></footer>';
    const unit=getUnit('GH-01-K01'),kp=unit?.scene?.content?.knowledgePoint,slide=kp?.slide,pages=slide?.pages?.length?slide.pages:[slide?.canvas].filter(Boolean);let page=0;
    const canvas=dialog.querySelector('.tour-slide');
    function renderPage(){canvas.innerHTML=pages.length?renderSlideCanvas(pages[page],unit.chapterId,'',unit.scene.content.module?.source?.resourceRoot||''):'<p>输入 → 对应规则 → 输出</p>';requestAnimationFrame(()=>{const stage=canvas.querySelector('.slide-stage');if(stage)stage.style.transform=`scale(${canvas.clientWidth/Number(stage.dataset.slideWidth)})`;});}
    const resize=new ResizeObserver(renderPage);resize.observe(canvas);
    const acknowledge=action=>{ready=true;dialog.querySelector('[data-guide-next]').disabled=false;log('action',{step:steps[step][0],action});};
    dialog.querySelector('[data-tour-target="path"] button').onclick=()=>acknowledge('select_path');
    dialog.querySelector('[data-tour-page]').onclick=()=>{page=(page+1)%Math.max(1,pages.length);renderPage();acknowledge('turn_page');};
    for(const name of ['动手调一调','找错并改正','知识怎么连','换个角度看']){const b=el('button',name);b.type='button';b.onclick=()=>{dialog.querySelectorAll('.tour-scenes button').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));dialog.querySelector('[data-scene-feedback]').textContent=`已选择“${name}”。正式学习时，下方会加载这个互动课件，也可随时换一种。`;acknowledge('choose_scene');};dialog.querySelector('.tour-scenes').append(b);}
    const practice=dialog.querySelector('.tour-practice');
    dialog.querySelector('[data-tour-assistant]').onclick=()=>{practice.hidden=false;practice.replaceChildren(el('strong','知点'),el('p','正式学习中，在这里输入疑问，或带着划选的课件内容提问。'));const input=el('textarea');input.placeholder='演练：写下一个你想问的问题';input.setAttribute('aria-label','演练提问');practice.append(input);acknowledge('open_assistant');};
    dialog.querySelector('[data-tour-notes]').onclick=()=>{practice.hidden=false;practice.replaceChildren(el('strong','笔记演练'));const input=el('textarea');input.setAttribute('aria-label','演练笔记');input.placeholder='试着写一句自己的理解（演练内容不保存）';practice.append(input);for(const [label,color]of [['黄色','#fff7d6'],['蓝色','#eaf4ff'],['绿色','#edf8ee'],['粉色','#fff0f6']]){const b=el('button',label);b.type='button';b.onclick=()=>{practice.style.background=color;};practice.append(b);}acknowledge('open_notes');};
    dialog.querySelector('[data-guide-next]').onclick=()=>{if(!ready)return;if(step===steps.length-1){resize.disconnect();close(true);}else{practice.hidden=true;step++;draw();}};
    dialog.querySelector('[data-guide-back]').onclick=()=>{if(step>0){step--;draw();}};
    const pause=()=>{resize.disconnect();close(false);};dialog.querySelector('[data-guide-pause]').onclick=pause;dialog.oncancel=e=>{e.preventDefault();pause();};
    (document.fullscreenElement||document.body).append(dialog);dialog.showModal();renderPage();draw();log('started',{required});
    return new Promise(resolve=>finish=resolve);
  }
  let sceneTip=null;
  function clearScene(){document.querySelectorAll('.scene-tour-highlight').forEach(n=>n.classList.remove('scene-tour-highlight'));sceneTip?.remove();sceneTip=null;}
  function sceneGuide(){
    const s=global.KnowledgeAssistant?.designSpaceSnapshot?.(),key=identity()+':scene-choice';
    if(!s?.active||s.unitType!=='knowledge'||s.taskReady!==false||document.querySelector('dialog[open]')||seen.has(key)||read(key)){clearScene();return;}
    const choices=[...document.querySelectorAll('[data-knowledge-scene]')].find(n=>n.getClientRects().length)?.parentElement;
    if(!choices||sceneTip?.isConnected)return;
    choices.classList.add('scene-tour-highlight');sceneTip=el('aside');sceneTip.className='scene-tour-tip';sceneTip.setAttribute('role','status');sceneTip.append(el('strong','从这里开始：点一个互动方式'),el('p','任选一个上方按钮。选择后会加载活动；想换一种时仍在这里切换。'));
    const done=el('button','知道了');done.type='button';done.onclick=()=>{mark(key);clearScene();log('scene_hint_dismissed');};sceneTip.append(done);choices.after(sceneTip);log('scene_hint_shown');
  }
  global.addEventListener('cq:proactive-state',()=>{if(dialog?.open&&owner!==identity())close(false);sceneGuide();});
  global.addEventListener('cq:learning-signal',e=>{if(e.detail?.eventType==='knowledge_scene_selected'){mark(identity()+':scene-choice');clearScene();log('scene_choice_completed');}});
  global.addEventListener('cq:lesson-rendered',()=>requestAnimationFrame(sceneGuide));
  global.addEventListener('cq:classroom-surface-change',()=>requestAnimationFrame(sceneGuide));
  global.OperationGuide=Object.freeze({open,sceneGuide,get active(){return Boolean(dialog?.open);}});
})(window);
