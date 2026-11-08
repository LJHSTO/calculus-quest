(function initLearningWorkspace(global) {
  "use strict";
  const shell = document.querySelector(".core-learning-workspace");
  if (!shell) return;
  // A tablet-sized browser cannot fit a course canvas and two useful sidebars.
  // Keep this breakpoint aligned with the workspace CSS and switch whole panes.
  const compactWorkspace = () => global.innerWidth <= 1180;
  const $ = (selector) => shell.querySelector(selector);
  let tab = "chat";
  let lastUnitId = "";
  let lastScene = "";
  let lastSurfaceOwner = "";
  let canvasMode = "slide";
  let playbackRate = 1;
  let toolsCollapsed = true;
  let lectureCollapsed = false;
  let compactLecturePrepared = false;
  let focusRestore = null;
  let coachKey = "";
  let coachVisible = false;
  let coachDismissedUnit = "";
  let fullscreenHintTimer = 0;
  let primaryActionKey = '';
  const readinessVersion = 'study90-readiness-v1';
  let regulationGuard = null;
  let regulationProtected = false;
  let regulationShellState = null;

  function regulationCourseProtected() {
    return Boolean(global.RegulationTransferUI?.active || global.ThreeArmStudyUI?.run?.regulationActive);
  }

  async function resumeRegulationTask() {
    const button = regulationGuard?.querySelector('button');
    const message = regulationGuard?.querySelector('[role="status"]');
    if (button) button.disabled = true;
    if (message) message.textContent = '正在打开已保存的任务…';
    try { await global.RegulationTransferUI?.open?.(); if (message) message.textContent = ''; }
    catch (error) { if (message) message.textContent = error.message || '暂时未能打开，请再试一次。'; }
    finally { if (button) button.disabled = false; syncRegulationProtection(); }
  }

  function syncRegulationProtection() {
    const active = regulationCourseProtected();
    if (!regulationGuard) {
      regulationGuard = document.createElement('section');
      regulationGuard.id = 'regulation-course-guard';
      regulationGuard.hidden = true;
      regulationGuard.setAttribute('aria-labelledby', 'regulation-course-title');
      regulationGuard.innerHTML = '<div><span class="regulation-course-mark" aria-hidden="true">✓</span><h2 id="regulation-course-title">调节任务已保存</h2><p>这段任务需要在新情境中独立作出决定。课程、原帮助设置和学习回顾暂时收起。</p><p>关闭任务后计时仍会继续。你可以接着完成当前任务，已保存的记录会保留。</p><button type="button">继续调节任务</button><p role="status"></p></div>';
      regulationGuard.querySelector('button').addEventListener('click', resumeRegulationTask);
      shell.before(regulationGuard);
    }
    if (active && !regulationProtected) {
      regulationShellState = { inert: shell.inert, ariaHidden: shell.getAttribute('aria-hidden') };
      shell.inert = true;
      shell.setAttribute('aria-hidden', 'true');
      if (typeof stopNarrationQueue === 'function') stopNarrationQueue();
      for (const frame of shell.querySelectorAll('iframe')) {
        try { frame.contentDocument?.querySelectorAll('audio,video').forEach(media => media.pause()); } catch {}
      }
      if (document.fullscreenElement && shell.contains(document.fullscreenElement)) document.exitFullscreen?.().then(syncRegulationProtection).catch(() => {});
    }
    if (!active && regulationProtected && regulationShellState) {
      shell.inert = regulationShellState.inert;
      if (regulationShellState.ariaHidden === null) shell.removeAttribute('aria-hidden');
      else shell.setAttribute('aria-hidden', regulationShellState.ariaHidden);
      regulationShellState = null;
    }
    regulationProtected = active;
    document.body.toggleAttribute('data-regulation-protected', active);
    regulationGuard.hidden = !active;
    if (active) {
      const taskDialog = document.getElementById('regulation-transfer-dialog');
      if (taskDialog && shell.contains(taskDialog)) {
        const opened = taskDialog.open;
        if (opened) taskDialog.close();
        document.body.append(taskDialog);
        if (opened) taskDialog.showModal();
      }
      const title = global.RegulationTransferUI?.opened ? '正在完成调节任务' : '调节任务已保存';
      if (regulationGuard.querySelector('h2').textContent !== title) regulationGuard.querySelector('h2').textContent = title;
      // A hidden top-layer dialog would leave the resume card inert. Close only
      // the old learning/configuration dialogs, never the current task or auth UI.
      document.querySelectorAll('#learner-setup[open],#three-arm-dialog[open]').forEach(dialog => dialog.close());
      if (!global.RegulationTransferUI?.opened && (document.activeElement === document.body || shell.contains(document.activeElement))) {
        regulationGuard.querySelector('button').focus({ preventScroll: true });
      }
    } else {
      const status = regulationGuard.querySelector('[role="status"]');
      if (status.textContent) status.textContent = '';
    }
  }

  const queueRegulationProtection = () => queueMicrotask(syncRegulationProtection);
  global.addEventListener('cq:regulation-state', queueRegulationProtection);
  global.addEventListener('cq:proactive-state', queueRegulationProtection);
  global.addEventListener('cq:authentication-changed', queueRegulationProtection);
  global.addEventListener('cq:lesson-rendered', queueRegulationProtection);
  document.addEventListener('fullscreenchange', queueRegulationProtection);
  new MutationObserver(queueRegulationProtection).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  document.addEventListener('click', event => {
    if (!regulationCourseProtected()) return;
    if (!event.target.closest('#learner-preferences-button,#three-arm-review,#workspace-open-guide,#account-pilot-status')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    resumeRegulationTask();
  }, true);
  const fullscreenHintsShown = new Set();
  const fullscreenButton = $('[data-classroom-action="fullscreen"]');
  const fullscreenHint = document.createElement("span");
  fullscreenHint.className = "classroom-fullscreen-hint";
  fullscreenHint.setAttribute("role", "status");
  fullscreenHint.hidden = true;
  const fullscreenHintText = document.createElement("span");
  fullscreenHintText.className = "classroom-fullscreen-hint-text";
  fullscreenHintText.textContent = "建议全屏学习 (5s)";
  const fullscreenHintHost = document.createElement("span");
  fullscreenHintHost.className = "classroom-fullscreen-hint-host";
  fullscreenButton.before(fullscreenHintHost);
  fullscreenHintHost.append(fullscreenButton, fullscreenHint);
  const fullscreenHintClose = document.createElement("button");
  fullscreenHintClose.type = "button";
  fullscreenHintClose.className = "classroom-fullscreen-hint-close";
  fullscreenHintClose.textContent = "\u00d7";
  fullscreenHintClose.setAttribute("aria-label", "今天不再显示全屏建议");
  fullscreenHintClose.title = "今天不再显示";
  fullscreenHint.append(fullscreenHintText, fullscreenHintClose);
  let fullscreenCountdown = 5;
  let fullscreenCountdownInterval = null;

  function updateFullscreenHintText() {
    fullscreenHintText.textContent = `建议全屏学习 (${fullscreenCountdown}s)`;
  }
  const dismissedFullscreenHints = new Map();
  function fullscreenHintIdentity() {
    const participantId = typeof state !== "undefined" ? state.participant?.participantId : "";
    return `cq:fullscreen-hint-dismissed:${participantId || "guest"}`;
  }
  function fullscreenHintDay() {
    const date = new Date();
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }
  fullscreenHintClose.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const key = fullscreenHintIdentity();
    const day = fullscreenHintDay();
    dismissedFullscreenHints.set(key, day);
    try { localStorage.setItem(key, day); } catch {}
    hideFullscreenHint();
  });

  function hideFullscreenHint() {
    clearTimeout(fullscreenHintTimer);
    if (fullscreenCountdownInterval) {
      clearInterval(fullscreenCountdownInterval);
      fullscreenCountdownInterval = null;
    }
    fullscreenHint.hidden = true;
  }

  function syncFullscreenHint() {
    const identity = fullscreenHintIdentity();
    let dismissedDay = dismissedFullscreenHints.get(identity);
    try { dismissedDay = localStorage.getItem(identity) || dismissedDay; } catch {}
    if (dismissedDay === fullscreenHintDay()) {
      hideFullscreenHint();
      return;
    }
    if (canvasMode !== "interactive" || document.fullscreenElement
      || shell.classList.contains("is-local-fullscreen-target")) {
      hideFullscreenHint();
      return;
    }
    const unit = typeof getUnit === "function" ? getUnit() : null;
    const scene = unit?.type === "knowledge" ? selectedKnowledgeSceneType(unit) : "";
    if (!scene) return;
    const key = `${identity}:${fullscreenHintDay()}:${unit.id}:${scene}`;
    if (fullscreenHintsShown.has(key)) return;
    fullscreenHintsShown.add(key);
    clearTimeout(fullscreenHintTimer);
    if (fullscreenCountdownInterval) {
      clearInterval(fullscreenCountdownInterval);
    }
    fullscreenCountdown = 5;
    updateFullscreenHintText();
    fullscreenHint.hidden = false;
    fullscreenCountdownInterval = setInterval(() => {
      fullscreenCountdown -= 1;
      if (fullscreenCountdown <= 0) {
        hideFullscreenHint();
      } else {
        updateFullscreenHintText();
      }
    }, 1000);
    fullscreenHintTimer = setTimeout(hideFullscreenHint, 5000);
  }
  try { toolsCollapsed = localStorage.getItem("classroomToolsCollapsed") !== "0"; } catch {}

  const openGuide=()=>global.OperationGuide?.open();
  const guideMenu=document.createElement('button');guideMenu.id='account-operation-guide';guideMenu.type='button';guideMenu.className='user-menu-item';guideMenu.textContent='重新查看操作指引';
  guideMenu.onclick=()=>{if(typeof setUserMenuOpen==='function')setUserMenuOpen(false);openGuide();};document.getElementById('account-pilot-status')?.before(guideMenu);
  function syncEntryGuide(){const s=global.KnowledgeAssistant?.designSpaceSnapshot?.();guideMenu.hidden=!s?.signedIn;guideMenu.disabled=Boolean(s?.locked||s?.check||s?.unitType==='quiz'&&!s?.quizSubmitted);}
  global.addEventListener('cq:proactive-state',syncEntryGuide);

  const pauseObserver=global.ProactiveLearningCore.createHelpEntryObserver();
  const pauseEntry=document.createElement('aside');pauseEntry.id='workspace-pause-entry';pauseEntry.className='workspace-entry-guide';pauseEntry.hidden=true;
  pauseEntry.innerHTML='<span role="status">需要找个切入点吗？可以继续思考，也可以打开知点聊一聊。</span><button type="button" data-pause-help>找知点</button><button type="button" data-pause-dismiss>继续思考</button>';
  $('.classroom-footer').prepend(pauseEntry);
  let pauseEvidence=null,pauseOwner='';
  function entryEvent(action){if(typeof trackLearningEvent==='function')trackLearningEvent('help_entry_reminder_'+action,{...pauseEvidence,reminderVersion:'help-entry-v1',kindBoundary:'navigation_reminder'},false).catch(()=>{});}
  pauseEntry.querySelector('[data-pause-help]').onclick=()=>{entryEvent('accepted');pauseEntry.hidden=true;global.KnowledgeAssistant?.open();};
  pauseEntry.querySelector('[data-pause-dismiss]').onclick=()=>{entryEvent('dismissed');pauseEntry.hidden=true;};
  function pauseActivity(kind){pauseObserver.activity(kind);if(kind!=='pointer')pauseEntry.hidden=true;}
  for(const type of ['pointerdown','keydown','input','wheel'])shell.addEventListener(type,event=>{if(!event.target.closest('#workspace-pause-entry'))pauseActivity('action');},{passive:true});
  shell.addEventListener('pointermove',()=>pauseActivity('pointer'),{passive:true});
  global.addEventListener('cq:learning-signal',event=>{const type=(event.detail?.event||event.detail)?.eventType||'';
    if(/^(unit_enter|repeat_unit_enter|knowledge_scene_select|interactive_(click|input|change|submit|drag_start|drag_end|scroll|wheel)|parameter_(change|commit)|short_answer_input|knowledge_question_asked|courseware_challenge_result)$/.test(type))pauseActivity('action');});
  const observedDocuments=new WeakSet();
  function observeFrameActivity(){for(const frame of shell.querySelectorAll('iframe')){try{
    const doc=frame.contentDocument;if(!doc||observedDocuments.has(doc))continue;observedDocuments.add(doc);
    doc.addEventListener('pointermove',()=>pauseActivity('pointer'),{passive:true});
    for(const type of ['pointerdown','keydown','input','wheel'])doc.addEventListener(type,()=>pauseActivity('action'),{passive:true});
  }catch{/* Cross-origin courseware keeps its existing semantic event bridge. */}}}
  function tickHelpEntry(){
    observeFrameActivity();
    const s=global.KnowledgeAssistant?.designSpaceSnapshot?.();if(!s)return;
    const owner=s.ownerKey+':'+s.generation;if(owner!==pauseOwner){pauseOwner=owner;pauseObserver.clear();pauseEntry.hidden=true;}
    const playing=global.LessonPlayback?.snapshot(activeSurface())?.status==='playing'
      ||(typeof activeNarration!=='undefined'&&activeNarration?.status==='playing');
    const textField='textarea,[contenteditable="true"],input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"])';
    let editing=document.activeElement?.matches(textField);
    if(document.activeElement?.tagName==='IFRAME')try{editing=document.activeElement.contentDocument?.activeElement?.matches(textField);}catch{}
    const eligible=s.signedIn&&s.active&&s.loaded&&s.taskReady!==false&&s.unitType!=='quiz'&&!s.locked&&!s.busy&&!s.assistantOpen
      &&!s.check&&!s.offer&&!s.supportBusy&&!['awaiting_confirmation','queued','offered','engaged','awaiting_check'].includes(s.supportCycle?.status)
      &&!s.muted&&s.preference!=='off'&&s.mode==='active'&&s.researchControls?.profile?.proactivity!=='reactive'
      &&!global.OperationGuide?.active&&!document.hidden&&document.hasFocus()&&!playing&&!document.querySelector('dialog[open],.knowledge-note-editor:not([hidden]),.knowledge-selection-toolbar:not([hidden])')
      &&!editing;
    if(!eligible)pauseEntry.hidden=true;
    const candidate=pauseObserver.tick({key:owner+':'+s.unitId+':'+s.sceneType,eligible,reading:!s.sceneType||s.sceneType==='slide'});
    if(candidate){pauseEvidence={...candidate,unitId:s.unitId,sceneType:s.sceneType};pauseEntry.hidden=false;entryEvent('rendered');}
  }
  setInterval(tickHelpEntry,5000);

  // This is a locator, not a help exposure receipt. Content stays beside the task.
  const supportNotice = document.createElement('button');
  supportNotice.id = 'workspace-support-notice';
  supportNotice.type = 'button';
  supportNotice.hidden = true;
  const noticeStatus = document.createElement('span');
  noticeStatus.className = 'workspace-support-status';
  noticeStatus.setAttribute('role','status');
  noticeStatus.setAttribute('aria-live','polite');
  $('.classroom-footer').append(noticeStatus,supportNotice);
  let pendingSnapshot = null;
  let announcedHelp="";
  let fullscreenSupportNotice=null;
  function updateSupportLocator() {
    const visible=[...document.querySelectorAll('.task-support-panel,.learning-support-surface,.support-inquiry,.knowledge-proactive-inline-offer,.knowledge-proactive-verification')].some(node=>{
      if(node.closest('[hidden],[inert],[aria-hidden="true"],details:not([open])'))return false;
      if(node.checkVisibility&&!node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return false;
      const full=document.fullscreenElement;
      if(full&&!full.contains(node))return false;
      const rect=node.getBoundingClientRect();
      if(rect.width<=0||rect.height<=0)return false;
      const width=Math.max(0,Math.min(innerWidth,rect.right)-Math.max(0,rect.left));
      const height=Math.max(0,Math.min(innerHeight,rect.bottom)-Math.max(0,rect.top));
      return width*height/(rect.width*rect.height)>=.5;
    });
    supportNotice.hidden=!supportNotice.textContent||visible;
    if(visible&&fullscreenSupportNotice)fullscreenSupportNotice.remove();
  }
  function syncSupportNotice(next=global.KnowledgeAssistant?.designSpaceSnapshot?.()) {
    pendingSnapshot=next;
    const eligible=next?.signedIn&&next.active&&!next.locked&&(next.unitType==='knowledge'||next.unitType==='quiz'&&next.quizSubmitted)&&next.taskReady!==false;
    const cycle=next?.supportCycle;
    // Research probes have their own compact entry and dialog.
    const checking=eligible&&(next.check||cycle?.status==='awaiting_check');
    const inquiry=eligible&&cycle?.status==='awaiting_confirmation'&&!global.SupportCycleUI?.deferInquiry(cycle);
    const support=eligible&&!checking&&(next.offer||next.prompt||['offered','engaged'].includes(cycle?.status));
    const label=checking?'继续独立检查':inquiry?'智能体老师想帮你':support?'查看老师的帮助':'';
    if(supportNotice.textContent!==label){supportNotice.textContent=label;noticeStatus.textContent=label;}
    const full=document.fullscreenElement||document.querySelector('.is-local-fullscreen-target');
    if(full&&full!==document.documentElement&&!full.contains(supportNotice)&&label){
      if(!fullscreenSupportNotice){fullscreenSupportNotice=document.createElement('button');fullscreenSupportNotice.type='button';fullscreenSupportNotice.className='fullscreen-support-notice';fullscreenSupportNotice.onclick=()=>supportNotice.click();}
      if(fullscreenSupportNotice.parentElement!==full)full.append(fullscreenSupportNotice);
      fullscreenSupportNotice.textContent=label;fullscreenSupportNotice.hidden=false;
    }else if(fullscreenSupportNotice){fullscreenSupportNotice.remove();}
    const helpId=label&&(cycle?.id||next.offer?.id||next.prompt?.id);
    if(helpId&&helpId!==announcedHelp&&!global.SupportCycleUI?.interactionBusy){
      announcedHelp=helpId;
      if(next.view.placement==='sidebar'&&!compactWorkspace()){setToolsCollapsed(false,false,false);selectTab('chat');}
    }
    // Do not briefly insert the footer notice before measuring the visible help.
    // That relayout can cover the pressed send button before pointerup.
    updateSupportLocator();
    updateToolsIndicator();
  }
  supportNotice.addEventListener('click',async()=>{
    const s=pendingSnapshot;if(!s||s.locked)return;
    setCoachVisible(false);
    if(s.view.placement==='inline'){
      if(compactWorkspace())setMobilePane('course');
      if(global.TaskSupport?.locate?.())return;
    }else{
      setToolsCollapsed(false);selectTab('chat');
      if(compactWorkspace())setMobilePane('assistant');
    }
    const target=[...document.querySelectorAll('.learning-support-surface,.knowledge-proactive-inline-offer,.support-cycle')].find(n=>n.getClientRects().length);
    if(target){target.tabIndex=-1;target.scrollIntoView({block:'nearest'});target.focus({preventScroll:true});}
  });
  document.addEventListener('fullscreenchange',()=>syncSupportNotice());
  global.addEventListener('scroll',()=>requestAnimationFrame(updateSupportLocator),true);

  function updateToolsIndicator() {
    const pending = !supportNotice.hidden || global.KnowledgeAssistant?.workspaceSnapshot?.()?.pendingSupport === true;
    const button = $("#workspace-tools-toggle");
    button.classList.toggle("has-pending-support", toolsCollapsed && pending);
    button.title = toolsCollapsed
      ? pending ? "展开知点，查看学习建议" : "展开知点"
      : "收起知点";
    button.setAttribute("aria-label", button.title);
  }

  function setToolsCollapsed(collapsed, focus = false, persist = true) {
    toolsCollapsed = Boolean(collapsed);
    shell.classList.toggle("tools-collapsed", toolsCollapsed);
    const button = $("#workspace-tools-toggle");
    button.setAttribute("aria-expanded", String(!toolsCollapsed));
    button.title = toolsCollapsed ? "展开学习助手" : "收起学习助手";
    button.setAttribute("aria-label", button.title);
    button.querySelector("img").src = `assets/classroom-icons/PanelRight${toolsCollapsed ? "Open" : "Close"}.svg`;
    updateToolsIndicator();
    if (persist) {
      try { localStorage.setItem("classroomToolsCollapsed", toolsCollapsed ? "1" : "0"); } catch {}
    }
    global.dispatchEvent(new CustomEvent("cq:learning-layout-change"));
    if (focus) button.focus({ preventScroll: true });
  }

  function setLectureCollapsed(collapsed) {
    lectureCollapsed = Boolean(collapsed);
    $("#classroom-lecture")?.classList.toggle("is-collapsed", lectureCollapsed);
    const button = $('[data-classroom-action="toggle-lecture"]');
    button.setAttribute("aria-label", lectureCollapsed ? "显示讲解" : "隐藏讲解");
    button.title = button.getAttribute("aria-label");
    button.querySelector("img").src = `assets/classroom-icons/${lectureCollapsed ? "PanelLeftOpen" : "ChevronDown"}.svg`;
    global.dispatchEvent(new CustomEvent("cq:learning-layout-change"));
  }

  function canvasIsFocused() {
    return toolsCollapsed && lectureCollapsed && shell.classList.contains("lesson-collapsed");
  }

  function enterCanvasFocus() {
    if (compactWorkspace()) return;
    if (!canvasIsFocused()) {
      focusRestore = {
        tools: toolsCollapsed, lecture: lectureCollapsed,
        path: shell.classList.contains("lesson-collapsed")
      };
    }
    setToolsCollapsed(true, false, false);
    if (typeof setLessonRailCollapsed === "function") setLessonRailCollapsed(true, { persist: false });
    setLectureCollapsed(true);
  }

  function restoreCanvasLayout() {
    const previous = focusRestore || { tools: false, lecture: false, path: false };
    focusRestore = null;
    setToolsCollapsed(previous.tools, false, false);
    if (typeof setLessonRailCollapsed === "function") setLessonRailCollapsed(previous.path, { persist: false });
    setLectureCollapsed(previous.lecture);
  }

  function syncFocusButton() {
    const focused = canvasIsFocused();
    const button = $('[data-classroom-action="focus-canvas"]');
    button.setAttribute("aria-pressed", String(focused));
    button.title = focused ? "恢复阅读布局" : "拓宽画布";
    button.setAttribute("aria-label", button.title);
    button.querySelector("img").src = `assets/classroom-icons/${focused ? "Minimize2" : "Maximize2"}.svg`;
  }

  function activeSurface() {
    return $(canvasMode === "slide" ? ".multi-scene-slide-panel" : ".multi-scene-scene-panel");
  }

  function independentCheckActive() {
    return typeof global.KnowledgeAssistant?.pendingIndependentCheck === 'function'
      ? Boolean(global.KnowledgeAssistant.pendingIndependentCheck())
      : Boolean(document.querySelector('[data-independent-check="true"]'));
  }

  function resumeIndependentCheck() {
    const request = global.KnowledgeAssistant?.resumeIndependentCheck?.();
    if (request?.catch) request.catch(() => {
      const text = $('#independent-navigation-note span');
      if (text) text.textContent = '检查暂未恢复，请再点一次“回到检查”。';
    });
    if (!request) global.TaskSupport?.locate?.();
  }

  function syncIndependentNavigationLock() {
    const rail = $('#lesson-rail');
    if (!rail) return;
    const checking = independentCheckActive();
    rail.toggleAttribute('data-independent-navigation-locked', checking);
    for (const link of rail.querySelectorAll('[data-unit],[data-jump-unit]')) {
      if (checking) {
        if (!link.hasAttribute('data-check-prior-disabled')) link.dataset.checkPriorDisabled = link.getAttribute('aria-disabled') || '';
        link.setAttribute('aria-disabled', 'true');
      } else if (link.hasAttribute('data-check-prior-disabled')) {
        const prior = link.dataset.checkPriorDisabled;
        prior ? link.setAttribute('aria-disabled', prior) : link.removeAttribute('aria-disabled');
        delete link.dataset.checkPriorDisabled;
      }
    }
    let note = $('#independent-navigation-note');
    if (!note) {
      note = document.createElement('div');
      note.id = 'independent-navigation-note';
      const text = document.createElement('span');
      text.setAttribute('role', 'status');
      text.textContent = '独立检查中，完成或选择“暂不检查”后可切换学习内容。';
      const back = document.createElement('button');
      back.type = 'button';
      back.dataset.resumeIndependent = 'true';
      back.textContent = '回到检查';
      back.addEventListener('click', resumeIndependentCheck);
      note.append(text, back);
      rail.querySelector('.rail-header')?.after(note);
    }
    note.hidden = !checking;
  }

  function readinessFor(unit, sceneType) {
    const readiness = state.analytics?.interactionEvidence?.[unit.id]?.coursewareReadiness;
    const generation = typeof learningSnapshotGeneration === 'number' ? learningSnapshotGeneration : 0;
    return readiness?.version === readinessVersion && readiness.generation === generation
      ? readiness.scenes?.[sceneType] : null;
  }

  function visibleInteractionFrame(unit, sceneType) {
    if (canvasMode !== 'interactive') return null;
    const pane = $('.multi-scene-scene-panel:not([hidden])');
    if (!pane) return null;
    return [...pane.querySelectorAll('iframe[data-courseware-frame],iframe.embed-frame')].find(frame => {
      const owner = frame.closest('[data-resource-unit]')?.dataset.resourceUnit || unit.id;
      return owner === unit.id && frame.dataset.contextSceneType === sceneType
        && frame.getClientRects().length > 0
        && (!frame.checkVisibility || frame.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
    }) || null;
  }

  function rememberKnowledgeInteraction(detail) {
    const event = detail?.event || detail;
    const unit = typeof getUnit === 'function' ? getUnit() : null;
    if (!global.StudyEntry || unit?.type !== 'knowledge' || unit.chapterId !== 'V14-C1'
      || global.OperationGuide?.active || independentCheckActive()) return;
    const data = event?.data || {};
    const unitId = data.unitId || event?.unitId;
    const sceneType = data.sceneType || data.scene_type || event?.sceneType;
    if (unitId !== unit.id || !sceneType || data.counts_as_student_evidence === false
      || data.source === 'authored_playback') return;
    const frame = visibleInteractionFrame(unit, sceneType);
    if (!frame) return;
    if (event.eventType === 'parameter_commit' && global.CoursewareSemantics?.parameterRelevant?.(
      unit.id, data.parameter || data.label || data.id) === false) return;
    const semantic = event.source === 'courseware_semantic';
    const entered = semantic && ['courseware_page_loaded', 'courseware_scene_visible'].includes(event.eventType);
    // The authored observation bridges verify a real learner control change.
    // These records indicate an attempt, never a correct answer or mastery.
    const observation = event.eventType === 'courseware_exploration_observed'
      && (data.evidence_scope === 'free_exploration_observation' && Boolean(data.parameters?.channel)
        || data.emission_source === 'student' && /^native_construction_r\d+$/.test(data.evidence_scope || '')
          && (Boolean(data.parameters?.state?.control) || data.parameters?.state?.records?.length > 0));
    const attempted = semantic && [
      'courseware_prediction_made', 'courseware_interaction_change', 'parameter_commit',
      'courseware_attempt_submitted', 'courseware_challenge_result',
      'courseware_observable_evidence_captured', 'courseware_short_explanation_submitted',
      'courseware_formative_check_submitted', 'courseware_independent_check_completed'
    ].includes(event.eventType) || semantic && observation || event.source === 'iframe' && Boolean(data.semanticId)
      && ['parameter_commit', 'interactive_change', 'interactive_submit', 'interactive_drag_end'].includes(event.eventType);
    if (!entered && !attempted) return;
    if (attempted && Object.hasOwn(data, 'previous_value') && Object.hasOwn(data, 'value')
      && JSON.stringify(data.previous_value) === JSON.stringify(data.value)) return;
    state.analytics ||= {};
    state.analytics.interactionEvidence ||= {};
    const bucket = state.analytics.interactionEvidence[unit.id] ||= { unitId: unit.id };
    const generation = typeof learningSnapshotGeneration === 'number' ? learningSnapshotGeneration : 0;
    if (bucket.coursewareReadiness?.version !== readinessVersion || bucket.coursewareReadiness.generation !== generation) {
      bucket.coursewareReadiness = { version: readinessVersion, generation, scenes: {} };
    }
    const record = bucket.coursewareReadiness.scenes[sceneType] ||= {};
    if (record.enteredAt && (!attempted || record.attemptedAt)) return;
    record.enteredAt ||= new Date().toISOString();
    if (attempted) Object.assign(record, { attemptedAt: new Date().toISOString(), eventType: event.eventType,
      eventId: event.eventId || data.event_id || '', resourceId: data.resource_id || frame.dataset.contextId || '' });
    if (typeof saveState === 'function') saveState();
    syncKnowledgePrimaryAction();
  }

  function nextLectureButton() {
    const pane = $('.multi-scene-slide-panel:not([hidden])');
    return pane?.querySelector('.openmaic-page-nav button:last-of-type,[data-slide-action="next"]') || null;
  }

  function knowledgePrimaryAction(unit = typeof getUnit === 'function' ? getUnit() : null) {
    if (!global.StudyEntry || unit?.chapterId !== 'V14-C1' || unit.type !== 'knowledge') return null;
    if (independentCheckActive()) return { kind: 'independent_check', label: '先完成独立检查', disabled: true };
    const pane = $('.multi-scene-slide-panel');
    if (canvasMode === 'slide' || !pane) {
      if (!pane || pane.querySelector('[data-openmaic-state="loading"]')) {
        return { kind: 'loading', label: '正在准备讲解…', disabled: true };
      }
      const next = nextLectureButton();
      return next && !next.disabled
        ? { kind: 'lecture_next', label: '下一讲解页', disabled: false }
        : { kind: 'enter_interaction', label: '进入互动探索', disabled: false };
    }
    const sceneType = typeof selectedKnowledgeSceneType === 'function' ? selectedKnowledgeSceneType(unit) : '';
    if (!sceneType) return { kind: 'choose_interaction', label: '选择一个互动场景', disabled: false };
    const finishedBefore = (state.completed || []).includes(unit.id)
      && (state.submittedQuizzes || []).includes(unit.id + '-formative');
    if (!finishedBefore && !readinessFor(unit, sceneType)?.attemptedAt) {
      return { kind: 'attempt_interaction', label: '请先完成一次互动操作', disabled: true };
    }
    return { kind: 'complete', label: finishedBefore ? '继续下一节' : '完成学习，进入检测', disabled: false };
  }

  function advanceKnowledge(unit) {
    const action = knowledgePrimaryAction(unit);
    if (!action || action.kind === 'complete') return false;
    if (action.kind === 'independent_check') resumeIndependentCheck();
    if (action.kind === 'lecture_next') nextLectureButton()?.click();
    if (['enter_interaction', 'choose_interaction'].includes(action.kind)) {
      setCanvasMode('interactive');
      const target = $('.multi-scene-scene-panel:not([hidden]) [data-knowledge-scene]')
        || $('.workspace-canvas-toolbar [data-knowledge-scene]');
      if (action.kind === 'choose_interaction') {
        target?.scrollIntoView({ block: 'nearest' });
        target?.focus({ preventScroll: true });
      }
    }
    syncKnowledgePrimaryAction();
    return true;
  }

  function syncKnowledgePrimaryAction() {
    const unit = typeof getUnit === 'function' ? getUnit() : null;
    const action = knowledgePrimaryAction(unit);
    const key = JSON.stringify([unit?.id, action]);
    if (key === primaryActionKey) return;
    primaryActionKey = key;
    if (typeof renderBottomNextButton === 'function') renderBottomNextButton();
  }

  function setCoachVisible(visible) {
    const changed=coachVisible!==Boolean(visible);
    coachVisible = Boolean(visible);
    shell.classList.toggle("is-coach-surface", coachVisible);
    const button = $("#workspace-coach-toggle");
    const unit = typeof getUnit === "function" ? getUnit() : null;
    button.textContent = coachVisible
      ? unit?.type === "quiz" ? "返回测试" : "返回课件"
      : "选择下一步";
    button.classList.toggle("primary", true);
    button.classList.remove("soft");
    button.setAttribute("aria-expanded", String(coachVisible));
    if(changed)global.dispatchEvent(new CustomEvent("cq:learning-layout-change"));
  }

  function syncCoachSurface() {
    if(global.StudyEntry){$('#workspace-coach-toggle').hidden=true;coachKey='';setCoachVisible(false);if(typeof renderBottomNextButton==='function')renderBottomNextButton();return;}
    const panel = $("#agentic-coach-panel");
    const card = panel.querySelector(".decision, .grading-pending");
    const pending = Boolean(card) && !panel.hidden;
    // Ignore busy labels and checkbox changes: neither should reopen a dismissed surface.
    const unitId = typeof currentUnitId === "string" ? currentUnitId : "";
    if (coachDismissedUnit && coachDismissedUnit !== unitId) coachDismissedUnit = "";
    const key = pending ? `${unitId}:${card.className}` : "";
    $("#workspace-coach-toggle").hidden = !pending;
    if (key !== coachKey) {
      coachKey = key;
      const help=global.KnowledgeAssistant?.designSpaceSnapshot?.();
      const answerHelp=help?.unitType==='quiz' && help?.view.placement==='inline' && (help.offer||help.prompt||help.check);
      // A completed pretest stays on its result page until the learner continues.
      const pretest=typeof getUnit==='function'&&getUnit(unitId)?.assessmentPhase==='pre';
      setCoachVisible(pending&&!answerHelp&&!pretest&&coachDismissedUnit!==unitId);
    }
    if (typeof renderBottomNextButton === "function") renderBottomNextButton();
  }

  function fitClassroomCanvas() {
    const interactive = $(".multi-scene-courseware-stage");
    if (compactWorkspace()) {
      if (interactive) { interactive.style.height = ""; interactive.style.maxWidth = ""; }
      return;
    }
    if (interactive?.clientHeight > 0) {
      const pane = interactive.closest(".multi-scene-scene-panel");
      if (pane?.clientHeight > 0) {
        const style = getComputedStyle(pane);
        const available = pane.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const height = `${Math.floor(Math.max(480, available))}px`;
        if (interactive.style.height !== height) interactive.style.height = height;
      }
      const width = `${Math.floor(interactive.clientHeight * 2.2)}px`;
      if (interactive.style.maxWidth !== width) interactive.style.maxWidth = width;
    }
    const host = $(".multi-scene-slide-fullscreen-stage");
    const slidePane = host?.closest(".multi-scene-slide-panel");
    if (slidePane?.clientHeight > 0) {
      const style = getComputedStyle(slidePane);
      const height = `${Math.floor(Math.max(480, slidePane.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)))}px`;
      if (host.style.height !== height) host.style.height = height;
    }
    const wrap = host?.querySelector("[data-slide-canvas]");
    const stage = wrap?.querySelector(".slide-stage");
    if (!host || !stage || !host.clientHeight) return;
    const ratio = Number(stage.dataset.slideHeight) / Number(stage.dataset.slideWidth);
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    wrap.style.width = `${Math.max(1, Math.min(host.clientWidth, host.clientHeight / ratio))}px`;
    if (typeof syncSlideCanvasScale === "function") syncSlideCanvasScale(wrap);
  }

  function syncPlayback() {
    const unit = typeof getUnit === "function" ? getUnit() : null;
    const surface = activeSurface();
    const playback = $("#classroom-playback");
    playback.hidden = !surface || unit?.type !== "knowledge";
    if (playback.hidden) return;
    const sources = Array.from(surface.querySelectorAll(".coach-line[data-playback-speech], .coach-line[data-audio-src]"));
    const lecturePage=surface.querySelector('[data-openmaic-page]');
    const supplementalActions=global.LessonPlayback?.lecture(surface)?.teachingActions||[];
    const textOnly=Number(lecturePage?.dataset.openmaicPage||1)>1&&!supplementalActions.length;
    playback.hidden = sources.length === 0 && !textOnly;
    $(".classroom-lecture-label").textContent = textOnly ? "讲解 · 文字" : sources.length ? (sources.some(source => source.dataset.audioSrc) ? "讲解 · 合成语音" : "讲解 · 文字") : "互动操作";
    const authored = textOnly ? null : global.LessonPlayback?.snapshot(surface);
    const toolbar = surface.querySelector(".coach-toolbar[data-narration-unit]");
    const queue = !textOnly && !supplementalActions.length && typeof activeNarration !== "undefined" && activeNarration?.unitId === toolbar?.dataset.narrationUnit
      ? activeNarration : null;
    const playing = (authored || queue)?.status === "playing";
    const button = $('[data-classroom-action="play"]');
    const loading = surface.querySelector('[data-openmaic-state="loading"]');
    button.disabled = textOnly || sources.length === 0 || Boolean(loading);
    button.title = textOnly ? "当前页为文字讲解" : playing ? "暂停讲解" : "播放讲解";
    button.setAttribute("aria-label", button.title);
    button.querySelector("img").src = `assets/classroom-icons/${playing ? "Pause" : "Play"}.svg`;
    $('[data-classroom-action="replay"]').disabled = textOnly || sources.length === 0 || Boolean(loading);
    $("#classroom-playback-rate").disabled = textOnly || sources.length === 0;
    const seek = $("#classroom-narration-seek");
    seek.disabled = textOnly || sources.length === 0;
    if (queue) queue.audio.playbackRate = playbackRate;
    if(!textOnly)global.LessonPlayback?.setRate(playbackRate);
    const durations = queue ? narrationTimelineDurations(queue) : [];
    const total = authored?.total ?? durations.reduce((sum, value) => sum + value, 0);
    const elapsed = authored?.elapsed ?? (queue ? (queue.status === "ended" ? total : narrationElapsed(queue)) : 0);
    seek.value = total ? Math.min(1000, Math.round(elapsed / total * 1000)) : 0;
    $("#classroom-narration-time").textContent = formatDuration(elapsed);
    const text = sources[queue?.index || 0]?.textContent?.trim();
    $("#classroom-lecture-text").textContent = textOnly
      ? lecturePage.dataset.openmaicPageSummary || "请阅读当前讲解页中的文字与图形。"
      : (authored?.warning ? `${authored.warning} ` : "")
        + (authored?.caption || supplementalActions.find(action=>action.type==='speech')?.text || text || (sources.length ? "讲解正在加载" : "操作当前互动，观察画面和数值的变化。"));
    const chapter = getChapter();
    const index = (chapter?.units || []).findIndex((entry) => entry.id === unit.id);
    $("#classroom-scene-position").textContent = `${index + 1} / ${chapter?.units?.length || 0}`;
    const locked = global.KnowledgeAssistant?.workspaceSnapshot?.()?.locked !== false;
    for (const action of ["quote", "note"]) $(`[data-classroom-action="${action}"]`).disabled = locked;
  }

  function quoteCurrentSurface() {
    const snapshot = global.KnowledgeAssistant?.workspaceSnapshot?.();
    if (!snapshot || snapshot.locked) return;
    const unit = getUnit();
    const ref = {
      kind: "viewport", scope: canvasMode === "slide" ? "slide" : "interactive",
      label: `${unit.label} · ${canvasMode === "slide" ? "讲解" : "互动探索"}`,
      excerpt: canvasMode === "slide" ? $(".slide-stage")?.innerText?.trim().slice(0, 1200) || unit.label : unit.label,
      sceneType: canvasMode === "interactive" ? selectedKnowledgeSceneType(unit) : "",
      confidence: "low", coarse: true
    };
    global.KnowledgeAssistant.useContext(ref, "classroom-toolbar");
  }

  function setMobilePane(pane) {
    shell.dataset.workspacePane = pane;
    if (pane === "path" && typeof setLessonRailCollapsed === "function") {
      setLessonRailCollapsed(false, { persist: false, focusCurrent: false });
    }
    shell.querySelectorAll("button[data-workspace-pane]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.workspacePane === pane));
    });
    global.dispatchEvent(new CustomEvent("cq:learning-layout-change"));
    global.KnowledgeAssistant?.sync?.();
  }

  function selectTab(next, focus = false) {
    tab = next;
    shell.querySelectorAll("[data-workspace-tab]").forEach((button) => {
      const selected = button.dataset.workspaceTab === tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    });
    shell.querySelectorAll(".workspace-tool-pane").forEach((pane) => {
      // The chat root owns fixed note editors and protected measurement dialogs.
      // Keep their host mounted while hiding only the conversation surface.
      if (pane.id === "workspace-pane-chat") {
        pane.hidden = false;
        pane.classList.toggle("is-tool-inactive", tab !== "chat");
      } else {
        pane.hidden = pane.id !== `workspace-pane-${tab}`;
      }
    });
    shell.dataset.workspaceTool = tab;
    global.KnowledgeAssistant?.sync?.();
    renderTools();
  }

  function textElement(tag, text, className = "") {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function renderTools() {
    const snapshot = global.KnowledgeAssistant?.workspaceSnapshot?.();
    if (!snapshot) return;
    $("#workspace-current-task").textContent = snapshot.unitLabel || "等待课程加载";
    $("#workspace-assistant-state").textContent = snapshot.locked
      ? "独立作答中 · 学习助手暂停"
      : snapshot.signedIn ? "你可以继续探索，需要时再来提问" : "登录后继续学习";
    $("#workspace-note-new").disabled = snapshot.locked || !snapshot.signedIn || !snapshot.unitId;
    if (tab === "notes") {
      const list = $("#workspace-notes");
      list.replaceChildren();
      if (snapshot.locked) {
        list.append(textElement("p", "独立作答期间，笔记暂时收起。", "workspace-empty"));
      } else if (!snapshot.notes.length) {
        list.append(textElement("p", "这个课件还没有笔记。", "workspace-empty"));
      } else {
        snapshot.notes.forEach((note) => {
          const item = textElement("article", "", "workspace-note");
          if (note.excerpt) item.append(textElement("blockquote", note.excerpt));
          item.append(textElement("p", note.note || "已标记这段内容"));
          const edit = textElement("button", "编辑");
          edit.type = "button";
          edit.addEventListener("click", () => global.KnowledgeAssistant.editWorkspaceNote(note.id));
          item.append(edit);
          list.append(item);
        });
      }
    }
    if (tab === "profile") {
      const panel = $("#workspace-profile");
      panel.replaceChildren();
      if (snapshot.locked) {
        panel.append(textElement("p", "独立作答期间，学习画像暂时收起。", "workspace-empty"));
        return;
      }
      const records = [
        ["学习者", snapshot.signedIn ? snapshot.nickname || "已登录学习者" : "未登录"],
        ["当前课程", snapshot.chapterLabel || "尚未选择"],
        ["当前知识点", snapshot.unitLabel || "尚未选择"],
        ["当前课件笔记", `${snapshot.notes.length} 条`],
        ["记录保存", snapshot.noteSyncLabel],
      ];
      const dl = document.createElement("dl");
      dl.className = "workspace-records";
      records.forEach(([label, value]) => {
        dl.append(textElement("dt", label), textElement("dd", value));
      });
      panel.append(dl, textElement("p", "完成进度不是掌握程度；当前没有经校准的能力或情绪评估。", "workspace-caption"));
      if(snapshot.learningMemory){
        panel.append(textElement("h3","学习记录与复习"),textElement("p",snapshot.learningMemory.coverage,"workspace-caption"));
        for(const point of snapshot.learningMemory.points||[]){
          const item=textElement("article","","workspace-note");
          item.append(textElement("strong",point.name),textElement("p",point.lastObservedAt?`最近各题提交：${point.correct} 题答对，${point.incorrect} 题答错，${point.pending} 题待复核。`:"还没有测验记录。"));
          if(point.lastObservedAt)item.append(textElement("small",`最近记录：${new Date(point.lastObservedAt).toLocaleString("zh-CN")}`));
          if(point.needsFreshObservation)item.append(textElement("p","这份记录已超过三天，可在复习时用新的独立作答核对当前理解。","workspace-caption"));
          panel.append(item);
        }
      }
    }
    if (tab === "map") {
      const map = $("#workspace-map");
      map.replaceChildren();
      if (snapshot.locked) {
        map.append(textElement("li", "独立作答期间，知识路径暂时收起。", "workspace-empty"));
        return;
      }
      const chapter = typeof getChapter === "function" ? getChapter() : null;
      const concepts = (chapter?.units || []).filter((unit) => unit.type === "knowledge");
      concepts.forEach((unit) => {
        const item = document.createElement("li");
        const current = unit.id === snapshot.unitId;
        const done = (state.completed || []).includes(unit.id);
        item.className = current ? "is-current" : done ? "is-done" : "";
        const button = textElement("button", unit.label);
        button.type = "button";
        button.dataset.jumpUnit = unit.id;
        if (current) button.setAttribute("aria-current", "step");
        item.append(button, textElement("small", current ? "当前" : done ? "已完成" : "待学习"));
        map.append(item);
      });
      if (!concepts.length) map.append(textElement("li", "当前课程暂无知识路径。", "workspace-empty"));
    }
  }

  function setCanvasMode(mode) {
    const changed = mode !== shell.dataset.classroomSurface;
    if (mode !== canvasMode && typeof pauseNarrationQueue === "function") pauseNarrationQueue();
    canvasMode = mode;
    shell.dataset.classroomSurface = mode;
    const slide = $(".multi-scene-slide-panel");
    const interactive = $(".multi-scene-scene-panel");
    if (!slide || !interactive) return;
    slide.hidden = mode !== "slide";
    interactive.hidden = mode !== "interactive";
    if (mode === "interactive" && global.innerHeight <= 800 && !compactLecturePrepared) {
      compactLecturePrepared = true;
      setLectureCollapsed(true);
    }
    // Preserve the actual embedded viewport instead of scaling its controls down.
    // This is an initial recommendation only; the path toggle remains available.
    if (changed && mode === "interactive" && !compactWorkspace()
      && $(".player").clientWidth < 880 && !shell.classList.contains("lesson-collapsed")
      && typeof setLessonRailCollapsed === "function") {
      setLessonRailCollapsed(true, { persist: false, focusCurrent: false });
    }
    shell.querySelectorAll("[data-workspace-canvas]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.workspaceCanvas === mode));
      button.tabIndex = button.dataset.workspaceCanvas === mode ? 0 : -1;
    });
    // Let the existing canvas and iframe adapters recompute after revealing a pane.
    global.dispatchEvent(new CustomEvent("cq:learning-layout-change"));
    if (changed) global.dispatchEvent(new CustomEvent("cq:classroom-surface-change", { detail: { surface: mode } }));
    syncPlayback();
    syncFullscreenHint();
    syncKnowledgePrimaryAction();
    if (changed && typeof saveState === 'function') saveState();
  }

  function sync() {
    // Bootstrap can render cached units before auth/snapshot hydration has completed.
    if (state.authToken && typeof learningSnapshotReady !== 'undefined' && !learningSnapshotReady) return;
    const unit = typeof getUnit === "function" ? getUnit() : null;
    const scene = unit?.type === "knowledge" ? selectedKnowledgeSceneType(unit) : "";
    const owner = `${state.participant?.participantId || ''}:${typeof learningSnapshotGeneration === 'undefined' ? '' : learningSnapshotGeneration}`;
    const resetPanels = unit?.id !== lastUnitId || owner !== lastSurfaceOwner;
    const restored = typeof learningSurfaceRestoreFor === 'function' ? learningSurfaceRestoreFor(unit?.id) : null;
    if (restored) {
      canvasMode = unit?.type === 'knowledge' && (restored.surface === 'slide'
        || scene && scene === restored.sceneType) ? restored.surface : 'slide';
      if (canvasMode !== restored.surface) learningSurfaceRestore = null;
    } else if (resetPanels) canvasMode = "slide";
    else if (scene && scene !== lastScene) canvasMode = "interactive";
    lastUnitId = unit?.id || "";
    lastScene = scene;
    lastSurfaceOwner = owner;
    const player = $(".multi-scene-knowledge-player");
    const titleBar=shell.querySelector('.player-top');
    const oldHeader=titleBar?.querySelector('.workspace-header-controls');
    if(!player || !player.querySelector('.workspace-canvas-toolbar'))oldHeader?.remove();
    if (player && !player.querySelector(".workspace-canvas-toolbar")) {
      const tabs = document.createElement("div");
      tabs.className = "workspace-canvas-tabs";
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "课件内容");
      [["slide", "讲解"], ["interactive", "互动探索"]].forEach(([mode, label]) => {
        const button = textElement("button", label);
        button.type = "button";
        button.id = `workspace-canvas-tab-${mode}`;
        button.dataset.workspaceCanvas = mode;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-controls", `workspace-canvas-${mode}`);
        tabs.append(button);
        const pane = player.querySelector(mode === "slide" ? ".multi-scene-slide-panel" : ".multi-scene-scene-panel");
        // Keep the existing interactive panel ID, referenced by navigation and tests.
        if (mode === "slide") pane.id = `workspace-canvas-${mode}`;
        button.setAttribute("aria-controls", pane.id);
        pane.setAttribute("role", "tabpanel");
        pane.setAttribute("aria-labelledby", button.id);
      });
      const toolbar = document.createElement("div");
      toolbar.className = "workspace-canvas-toolbar";
      const headerControls=document.createElement('div');headerControls.className='workspace-header-controls';
      headerControls.append(tabs);titleBar?.querySelector('.player-actions')?.before(headerControls);
      const readingButton=textElement('button','查看课件整页','workspace-reading-toggle');
      readingButton.type='button';readingButton.setAttribute('aria-pressed','false');
      readingButton.addEventListener('click',()=>{
        const overview=shell.classList.toggle('slide-overview');
        readingButton.textContent=overview?'放大阅读课件':'查看课件整页';readingButton.setAttribute('aria-pressed',String(overview));
      });headerControls.append(readingButton);
      const slidePane=player.querySelector('.multi-scene-slide-panel');
      const readingNote=textElement('p','课件已放大，可左右滚动阅读；也可以横屏学习。','workspace-reading-note');
      slidePane.prepend(readingNote);
      const readingStage=slidePane.querySelector('[data-resource-fullscreen-target]');
      if(readingStage){readingStage.tabIndex=0;readingStage.setAttribute('aria-label','课件阅读区，可用方向键滚动');}
      const sceneChoice = player.querySelector(".agentic-knowledge-choice");
      if (sceneChoice) toolbar.append(sceneChoice);
      player.prepend(toolbar);
    }
    if (resetPanels) {
      hideFullscreenHint();
      focusRestore = null;
      compactLecturePrepared = false;
      setToolsCollapsed(toolsCollapsed, false, false);
      if (typeof setLessonRailCollapsed === "function") setLessonRailCollapsed(false, { persist: false });
      setLectureCollapsed(false);
    }
    setCanvasMode(canvasMode);
    if (restored) learningSurfaceRestore = null;
    const chapter = typeof getChapter === "function" ? getChapter() : null;
    const units = chapter?.units || [];
    const done = units.filter((entry) => typeof unitCountsTowardProgress === "function"
      ? unitCountsTowardProgress(entry) : (state.completed || []).includes(entry.id)).length;
    $("#workspace-progress").value = units.length ? Math.round(100 * done / units.length) : 0;
    $("#workspace-progress-label").textContent = `${done} / ${units.length} 个学习单元已完成`;
    renderTools();
    syncPlayback();
  }

  shell.addEventListener("click", (event) => {
    if (event.target.closest("#workspace-coach-toggle")) {
      if(typeof getUnit==='function'&&global.LearnerSetup?.afterPretest(getUnit())){global.LearnerSetup.continueAfterPretest();return;}
      coachDismissedUnit = coachVisible && typeof currentUnitId === "string" ? currentUnitId : "";
      setCoachVisible(!coachVisible);
    }
    if (event.target.closest("#workspace-tools-toggle")) {
      const nextCollapsed = !toolsCollapsed;
      setToolsCollapsed(nextCollapsed, true);
      const snapshot = global.KnowledgeAssistant?.workspaceSnapshot?.();
      if (nextCollapsed && $("#knowledge-assistant-root").classList.contains("is-open")) {
        global.KnowledgeAssistant.close();
      } else if (!nextCollapsed && tab === "chat" && snapshot && !snapshot.locked && !snapshot.pendingSupport) {
        global.KnowledgeAssistant.open();
      } else {
        global.KnowledgeAssistant?.sync?.();
      }
    }
    const actionButton=event.target.closest("[data-classroom-action]");
    if(actionButton?.disabled)return;
    const action = actionButton?.dataset.classroomAction;
    if (action === "quote") quoteCurrentSurface();
    if (action === "note") global.KnowledgeAssistant?.editWorkspaceNote?.();
    if (action === "focus-canvas") {
      if (canvasIsFocused()) restoreCanvasLayout();
      else enterCanvasFocus();
    }
    if (action === "play") {
      const surface = activeSurface();
      const queueId = surface?.querySelector(".coach-toolbar")?.dataset.narrationUnit;
      if (global.LessonPlayback?.snapshot(surface)?.status === "playing"
        || (typeof activeNarration !== "undefined" && activeNarration?.unitId === queueId && activeNarration.status === "playing")) pauseNarrationQueue();
      else playNarrationQueue(surface);
      syncPlayback();
    }
    if (action === "replay") {
      stopNarrationQueue();
      playNarrationQueue(activeSurface());
      syncPlayback();
    }
    if (action === "fullscreen") {
      hideFullscreenHint();
      const surface = activeSurface();
      const target = surface?.querySelector("[data-resource-fullscreen-target], [data-knowledge-scene-stage]");
      if (target && typeof toggleResourceFullscreen === "function") toggleResourceFullscreen(target);
    }
    if (action === "toggle-lecture") {
      setLectureCollapsed(!lectureCollapsed);
    }
    const tool = event.target.closest("[data-workspace-tab]");
    if (tool) selectTab(tool.dataset.workspaceTab);
    const pane = event.target.closest("button[data-workspace-pane]");
    if (pane) {
      setMobilePane(pane.dataset.workspacePane);
      if (pane.dataset.workspacePane === 'assistant' && tab === 'chat') global.KnowledgeAssistant?.open?.();
    }
    const canvas = event.target.closest("[data-workspace-canvas]");
    if (canvas) setCanvasMode(canvas.dataset.workspaceCanvas);
    if (event.target.closest("[data-scroll-knowledge-scene]")) setCanvasMode("interactive");
  });
  shell.addEventListener("keydown", (event) => {
    const list = event.target.closest(".workspace-tabs, .workspace-canvas-tabs");
    if (!list || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(list.querySelectorAll('[role="tab"]'));
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click();
    buttons[next].focus();
  });
  $("#workspace-note-new").addEventListener("click", () => global.KnowledgeAssistant?.editWorkspaceNote?.());
  global.addEventListener("cq:lesson-rendered", sync);
  global.addEventListener("cq:workspace-data-change", renderTools);
  global.addEventListener("cq:participant-change", renderTools);
  global.addEventListener("cq:participant-change", () => {
    fullscreenHintsShown.clear();
    hideFullscreenHint();
  });
  global.addEventListener("cq:knowledge-assistant-visibility", async (event) => {
    if (event.detail?.open) {
      setToolsCollapsed(false);
      selectTab("chat");
      if (compactWorkspace()) setMobilePane("assistant");
    } else if (event.detail?.open === false && !compactWorkspace()) setToolsCollapsed(true, true);
  });
  shell.addEventListener("click", (event) => {
    if (event.target.closest("[data-unit], [data-jump-unit]") && compactWorkspace()) {
      setMobilePane("course");
    }
  });
  global.addEventListener("cq:learning-signal", (event) => {
    const signal = event.detail?.event || event.detail;
    if (signal?.eventType === "knowledge_scene_selected") sync();
    rememberKnowledgeInteraction(event.detail);
  });
  $('#lesson-rail')?.addEventListener('click', event => {
    if (!independentCheckActive() || event.target.closest('[data-resume-independent]')) return;
    if (!event.target.closest('[data-unit],[data-jump-unit],button,a')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    syncIndependentNavigationLock();
    $('#independent-navigation-note button')?.focus({ preventScroll: true });
  }, true);
  $("#classroom-playback-rate").addEventListener("change", (event) => {
    if(event.target.disabled)return;
    playbackRate = Number(event.target.value);
    syncPlayback();
  });
  $("#classroom-narration-seek").addEventListener("input", (event) => {
    if(event.target.disabled)return;
    seekNarration(Number(event.target.value) / 1000, activeSurface());
    syncPlayback();
  });
  let layoutFrame = 0;
  function scheduleClassroomLayout() {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      const headerHeight = document.querySelector(".app-header")?.getBoundingClientRect().height || 64;
      document.documentElement.style.setProperty("--learning-header-height", `${Math.ceil(headerHeight)}px`);
      fitClassroomCanvas();
      syncPlayback();
      syncFocusButton();
      updateSupportLocator();
    });
  }
  new ResizeObserver(scheduleClassroomLayout).observe($("#lesson-player"));
  const appHeader = document.querySelector(".app-header");
  if (appHeader) new ResizeObserver(scheduleClassroomLayout).observe(appHeader);
  new MutationObserver(() => {
    scheduleClassroomLayout();
    syncIndependentNavigationLock();
    syncKnowledgePrimaryAction();
  }).observe($("#lesson-player"), { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-openmaic-page','data-openmaic-state','data-slide-active','data-independent-check'] });
  new MutationObserver(syncCoachSurface).observe($("#agentic-coach-panel"), {
    childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"]
  });
  new MutationObserver(updateToolsIndicator).observe($("#knowledge-assistant-root"), { attributes: true, attributeFilter: ["hidden"], subtree: true });
  global.addEventListener("cq:learning-layout-change", scheduleClassroomLayout);
  global.addEventListener("cq:workspace-data-change", syncPlayback);
  global.addEventListener("cq:workspace-support-change", updateToolsIndicator);
  global.addEventListener('cq:proactive-state',event=>{
    syncSupportNotice(event.detail);
    syncIndependentNavigationLock();
    syncKnowledgePrimaryAction();
  });
  global.LearningWorkspace = Object.freeze({ sync, syncPlayback, knowledgePrimaryAction, advanceKnowledge, regulationCourseProtected, resumeRegulationTask,
    openGuide,
    showCoach: () => {
      coachDismissedUnit = "";
      syncCoachSurface();
      if (coachKey) {
        if (compactWorkspace()) setMobilePane("course");
        setCoachVisible(true);
      }
    },
    showLecture: () => { if (compactWorkspace()) setMobilePane('course'); setCanvasMode("slide"); },
    showInteractive: () => { if (compactWorkspace()) setMobilePane('course'); setCanvasMode("interactive"); },
    showTask: () => { if (compactWorkspace()) setMobilePane('course'); setCoachVisible(false); } });
  setToolsCollapsed(toolsCollapsed);
  syncCoachSurface();
  sync();
})(window);
