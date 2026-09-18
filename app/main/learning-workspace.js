(function initLearningWorkspace(global) {
  "use strict";
  const shell = document.querySelector(".core-learning-workspace");
  if (!shell) return;
  const $ = (selector) => shell.querySelector(selector);
  let tab = "chat";
  let lastUnitId = "";
  let lastScene = "";
  let canvasMode = "slide";
  let playbackRate = 1;
  let toolsCollapsed = false;
  let lectureCollapsed = false;
  let focusRestore = null;
  let coachKey = "";
  let coachVisible = false;
  let fullscreenHintTimer = 0;
  const fullscreenHintsShown = new Set();
  const fullscreenButton = $('[data-classroom-action="fullscreen"]');
  const fullscreenHint = document.createElement("span");
  fullscreenHint.className = "classroom-fullscreen-hint";
  fullscreenHint.setAttribute("role", "status");
  fullscreenHint.textContent = "建议全屏学习";
  fullscreenHint.hidden = true;
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
  fullscreenHint.append(fullscreenHintClose);
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
    fullscreenHint.hidden = false;
    fullscreenHintTimer = setTimeout(hideFullscreenHint, scene === "game" ? 6000 : 4000);
  }
  try { toolsCollapsed = localStorage.getItem("classroomToolsCollapsed") === "1"; } catch {}

  function updateToolsIndicator() {
    const pending = global.KnowledgeAssistant?.workspaceSnapshot?.()?.pendingSupport === true;
    const button = $("#workspace-tools-toggle");
    button.classList.toggle("has-pending-support", toolsCollapsed && pending);
    button.title = toolsCollapsed
      ? pending ? "展开学习助手，查看学习建议" : "展开学习助手"
      : "收起学习助手";
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
    if (global.innerWidth <= 900) return;
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

  function setCoachVisible(visible) {
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
    global.dispatchEvent(new CustomEvent("cq:learning-layout-change"));
  }

  function syncCoachSurface() {
    const panel = $("#agentic-coach-panel");
    const card = panel.querySelector(".decision, .grading-pending");
    const pending = Boolean(card) && !panel.hidden;
    // Ignore busy labels and checkbox changes: neither should reopen a dismissed surface.
    const key = pending ? `${typeof currentUnitId === "string" ? currentUnitId : ""}:${card.className}` : "";
    $("#workspace-coach-toggle").hidden = !pending;
    if (key !== coachKey) {
      coachKey = key;
      setCoachVisible(pending);
    }
    if (typeof renderBottomNextButton === "function") renderBottomNextButton();
  }

  function fitClassroomCanvas() {
    if (global.innerWidth <= 900) return;
    const interactive = $(".multi-scene-courseware-stage");
    if (interactive?.clientHeight > 0) {
      const width = `${Math.floor(interactive.clientHeight * 2.2)}px`;
      if (interactive.style.maxWidth !== width) interactive.style.maxWidth = width;
    }
    const host = $(".multi-scene-slide-fullscreen-stage");
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
    const sources = Array.from(surface.querySelectorAll(".coach-line[data-audio-src]"));
    const toolbar = surface.querySelector(".coach-toolbar[data-narration-unit]");
    const queue = typeof activeNarration !== "undefined" && activeNarration?.unitId === toolbar?.dataset.narrationUnit
      ? activeNarration : null;
    const playing = queue?.status === "playing";
    const button = $('[data-classroom-action="play"]');
    button.disabled = sources.length === 0;
    button.title = playing ? "暂停讲解" : "播放讲解";
    button.setAttribute("aria-label", button.title);
    button.querySelector("img").src = `assets/classroom-icons/${playing ? "Pause" : "Play"}.svg`;
    $('[data-classroom-action="replay"]').disabled = sources.length === 0;
    $("#classroom-playback-rate").disabled = sources.length === 0;
    const seek = $("#classroom-narration-seek");
    seek.disabled = sources.length === 0;
    if (queue) queue.audio.playbackRate = playbackRate;
    const durations = queue ? narrationTimelineDurations(queue) : [];
    const total = durations.reduce((sum, value) => sum + value, 0);
    const elapsed = queue ? (queue.status === "ended" ? total : narrationElapsed(queue)) : 0;
    seek.value = total ? Math.min(1000, Math.round(elapsed / total * 1000)) : 0;
    $("#classroom-narration-time").textContent = formatDuration(elapsed);
    const text = sources[queue?.index || 0]?.textContent?.trim();
    $("#classroom-lecture-text").textContent = text || (sources.length ? "讲解正在加载" : "当前场景暂无语音讲解");
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
    shell.querySelectorAll("[data-workspace-canvas]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.workspaceCanvas === mode));
      button.tabIndex = button.dataset.workspaceCanvas === mode ? 0 : -1;
    });
    // Let the existing canvas and iframe adapters recompute after revealing a pane.
    global.dispatchEvent(new CustomEvent("cq:learning-layout-change"));
    if (changed) global.dispatchEvent(new CustomEvent("cq:classroom-surface-change", { detail: { surface: mode } }));
    syncPlayback();
    syncFullscreenHint();
  }

  function sync() {
    const unit = typeof getUnit === "function" ? getUnit() : null;
    const scene = unit?.type === "knowledge" ? selectedKnowledgeSceneType(unit) : "";
    if (unit?.id !== lastUnitId) {
      hideFullscreenHint();
      canvasMode = "slide";
      focusRestore = null;
      setToolsCollapsed(false, false, true);
      if (typeof setLessonRailCollapsed === "function") setLessonRailCollapsed(false, { persist: true });
      setLectureCollapsed(false);
    }
    else if (scene && scene !== lastScene) canvasMode = "interactive";
    lastUnitId = unit?.id || "";
    lastScene = scene;
    const player = $(".multi-scene-knowledge-player");
    if (player && !player.querySelector(".workspace-canvas-tabs")) {
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
      toolbar.append(tabs);
      const sceneChoice = player.querySelector(".agentic-knowledge-choice");
      if (sceneChoice) toolbar.append(sceneChoice);
      player.prepend(toolbar);
    }
    setCanvasMode(canvasMode);
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
    if (event.target.closest("#workspace-coach-toggle")) setCoachVisible(!coachVisible);
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
    const action = event.target.closest("[data-classroom-action]")?.dataset.classroomAction;
    if (action === "quote") quoteCurrentSurface();
    if (action === "note") global.KnowledgeAssistant?.editWorkspaceNote?.();
    if (action === "focus-canvas") {
      if (canvasIsFocused()) restoreCanvasLayout();
      else enterCanvasFocus();
    }
    if (action === "play") {
      const surface = activeSurface();
      const queueId = surface?.querySelector(".coach-toolbar")?.dataset.narrationUnit;
      if (typeof activeNarration !== "undefined" && activeNarration?.unitId === queueId && activeNarration.status === "playing") pauseNarrationQueue();
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
    if (pane) setMobilePane(pane.dataset.workspacePane);
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
  global.addEventListener("cq:knowledge-assistant-visibility", (event) => {
    if (event.detail?.open) {
      setToolsCollapsed(false);
      selectTab("chat");
      if (global.innerWidth <= 900) setMobilePane("assistant");
    } else if (event.detail?.open === false && global.innerWidth > 900) setToolsCollapsed(true, true);
  });
  shell.addEventListener("click", (event) => {
    if (event.target.closest("[data-unit], [data-jump-unit]") && global.innerWidth <= 900) {
      setMobilePane("course");
    }
  });
  global.addEventListener("cq:learning-signal", (event) => {
    if (event.detail?.eventType === "knowledge_scene_selected") sync();
  });
  $("#classroom-playback-rate").addEventListener("change", (event) => {
    playbackRate = Number(event.target.value);
    syncPlayback();
  });
  $("#classroom-narration-seek").addEventListener("input", (event) => {
    seekNarration(Number(event.target.value) / 1000, activeSurface());
    syncPlayback();
  });
  let layoutFrame = 0;
  function scheduleClassroomLayout() {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      fitClassroomCanvas();
      syncPlayback();
      syncFocusButton();
    });
  }
  new ResizeObserver(scheduleClassroomLayout).observe($("#lesson-player"));
  new MutationObserver(scheduleClassroomLayout).observe($("#lesson-player"), { childList: true, subtree: true });
  new MutationObserver(syncCoachSurface).observe($("#agentic-coach-panel"), {
    childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"]
  });
  new MutationObserver(updateToolsIndicator).observe($("#knowledge-assistant-root"), { attributes: true, attributeFilter: ["hidden"], subtree: true });
  global.addEventListener("cq:learning-layout-change", scheduleClassroomLayout);
  global.addEventListener("cq:workspace-data-change", syncPlayback);
  global.addEventListener("cq:workspace-support-change", updateToolsIndicator);
  global.LearningWorkspace = Object.freeze({ sync, syncPlayback,
    showCoach: () => {
      syncCoachSurface();
      if (coachKey) {
        if (global.innerWidth <= 900) setMobilePane("course");
        setCoachVisible(true);
      }
    },
    showInteractive: () => setCanvasMode("interactive") });
  setToolsCollapsed(toolsCollapsed);
  syncCoachSurface();
  sync();
})(window);
