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
  if (typeof agenticIsChapterUnlocked === "function" && !agenticIsChapterUnlocked(chapterId)) {
    addLog(`「${chapterId}」章节尚未解锁，请先完成当前下一步。`);
    if (typeof renderAgenticCoachPanel === "function") renderAgenticCoachPanel();
    return;
  }
  const previousChapterId = currentChapterId;
  analyticsTrack("chapter_select", {
    data: {
      fromChapterId: previousChapterId,
      toChapterId: chapterId
    }
  });
  currentChapterId = chapterId;
  const chapter = getChapter(chapterId);
  const chapterPathUnits = typeof agenticDisplayUnitsForChapter === "function"
    ? agenticDisplayUnitsForChapter(chapter)
    : chapter.units;
  const firstUnlocked = chapterPathUnits.find((unit) =>
    typeof agenticIsUnitUnlocked !== "function" || agenticIsUnitUnlocked(unit.id)
  );
  currentUnitId = firstUnlocked?.id || chapterPathUnits[0]?.id || chapter.units[0]?.id || "";
  trackLearningEvent("select_chapter", { chapterId, chapterLabel: chapter.label });
  if (!chapter.loaded) {
    renderAll();
    try {
      await ensureChapterLoaded(chapterId);
      const loadedChapter = getChapter(chapterId);
      const loadedPathUnits = typeof agenticDisplayUnitsForChapter === "function"
        ? agenticDisplayUnitsForChapter(loadedChapter)
        : loadedChapter.units;
      const unlocked = loadedPathUnits.find((unit) =>
        typeof agenticIsUnitUnlocked !== "function" || agenticIsUnitUnlocked(unit.id)
      );
      currentUnitId = unlocked?.id || loadedPathUnits[0]?.id || loadedChapter.units[0]?.id || "";
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
  if (typeof agenticGuardNavigation === "function" && !agenticGuardNavigation(unitId, { allowPrevious: true })) return;
  const previousUnit = getUnit(currentUnitId);
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
  if (typeof agenticGuardNavigation === "function" && !agenticGuardNavigation(unit.id, { allowPrevious: true, silent: true })) return false;
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
  return true;
}

function addLog(text) {
  const time = new Date().toLocaleString("zh-CN", { hour12: false });
  state.logs.unshift(`${time} · ${text}`);
  state.logs = state.logs.slice(0, 18);
  saveState();
}
