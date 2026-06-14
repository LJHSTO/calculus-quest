// View, chapter, unit, completion, and activity-log navigation.
function renderAll() {
  applyView(currentView);
  renderAuth();
  renderMetrics();
  renderChapters();
  renderLessons();
  renderPlayer();
  renderLibrary();
  renderProgress();
}

function applyView(view) {
  const nextView = validViews.has(view) ? view : "home";
  currentView = nextView;
  document.querySelectorAll(".view").forEach((node) => node.classList.toggle("active", node.id === `${nextView}-view`));
  document.querySelectorAll("[data-view]").forEach((node) => {
    if (node.classList.contains("nav-button")) node.classList.toggle("active", node.dataset.view === nextView);
  });
}

function switchView(view) {
  analyticsTrack("switch_view", { data: { from: currentView, to: view } });
  currentView = view;
  applyView(currentView);
  saveState();
  window.scrollTo({ top: 0, behavior: "smooth" });
  trackLearningEvent("switch_view", { view: currentView });
}

async function selectChapter(chapterId) {
  const previousChapterId = currentChapterId;
  analyticsTrack("chapter_select", {
    data: {
      fromChapterId: previousChapterId,
      toChapterId: chapterId
    }
  });
  currentChapterId = chapterId;
  const chapter = getChapter(chapterId);
  currentUnitId = chapter.units[0]?.id || "";
  trackLearningEvent("select_chapter", { chapterId, chapterLabel: chapter.label });
  if (!chapter.loaded) {
    renderAll();
    try {
      await ensureChapterLoaded(chapterId);
      currentUnitId = getChapter(chapterId).units[0]?.id || "";
      preloadChapterResources(chapterId);
    } catch {
      // Chapter load failed; stay on current chapter view
      return;
    }
  }
  renderAll();
  const playerTop = document.querySelector(".player-top");
  if (playerTop) {
    window.scrollTo({ top: playerTop.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
  }
}

function selectUnit(unitId) {
  const unit = getUnit(unitId);
  if (!unit) return;
  const previousUnit = getUnit(currentUnitId);
  // Track entry point when navigating from main unit to supplement
  const prevUnit = getUnit(currentUnitId);
  if (unit.kind === "supplement" && prevUnit?.kind !== "supplement") {
    supplementEntryUnitId = currentUnitId;
  }
  if (unit.kind !== "supplement") {
    supplementEntryUnitId = "";
  }
  currentChapterId = unit.chapterId;
  currentUnitId = unit.id;
  if (previousUnit?.id !== unit.id) analyticsEnterUnit(unit, "select_unit");
  trackLearningEvent("open_unit", {
    unitId: unit.id,
    chapterId: unit.chapterId,
    kind: unit.kind,
    type: unit.type,
    label: unit.label
  });
  renderAll();
  const playerTop = document.querySelector(".player-top");
  if (playerTop) {
    window.scrollTo({ top: playerTop.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
  }
}

function completeCurrentUnit() {
  const unit = getUnit();
  if (!state.completed.includes(unit.id)) {
    state.completed.push(unit.id);
    addLog(`完成「${getChapter(unit.chapterId).label}」中的「${unit.label}」。`);
    trackLearningEvent("complete_unit", {
      unitId: unit.id,
      chapterId: unit.chapterId,
      kind: unit.kind,
      type: unit.type,
      label: unit.label
    });
    analyticsTrack("unit_complete", {
      data: {
        unitId: unit.id,
        chapterId: unit.chapterId,
        kind: unit.kind,
        type: unit.type,
        moduleRole: moduleRoleForUnit(unit),
        label: unit.label
      }
    });
  } else {
    addLog(`复习「${unit.label}」。`);
    trackLearningEvent("review_unit", {
      unitId: unit.id,
      chapterId: unit.chapterId,
      kind: unit.kind,
      type: unit.type,
      label: unit.label
    });
    analyticsTrack("unit_review_complete", {
      data: {
        unitId: unit.id,
        chapterId: unit.chapterId,
        kind: unit.kind,
        type: unit.type,
        moduleRole: moduleRoleForUnit(unit),
        label: unit.label
      }
    });
  }
  saveState();
  renderAll();
}

function markSupplementComplete(unitId) {
  const unit = supplementUnits.find((item) => item.id === unitId);
  if (!unit) return;
  if (!state.completed.includes(unit.id)) {
    state.completed.push(unit.id);
    addLog(`完成推荐补给「${unit.analysis.title}」(${unit.modelLabel})。`);
    trackLearningEvent("complete_supplement", {
      unitId: unit.id,
      chapterId: unit.chapterId,
      modelId: unit.modelId,
      file: unit.file,
      title: unit.analysis.title
    });
  }
  saveState();
  renderRecommendationPanel();
  renderLibrary();
  renderProgress();
}

function toggleRecommendationCollapse() {
  state.recommendationsCollapsed = !state.recommendationsCollapsed;
  saveState();
  renderRecommendationPanel();
}

function addLog(text) {
  const time = new Date().toLocaleString("zh-CN", { hour12: false });
  state.logs.unshift(`${time} · ${text}`);
  state.logs = state.logs.slice(0, 18);
  saveState();
}
