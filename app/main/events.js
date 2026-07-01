// User input, click, change, and fullscreen event wiring.
document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    switchView(viewButton.dataset.view);
    return;
  }

  const chapterButton = event.target.closest("[data-chapter]");
  if (chapterButton) {
    const cid = chapterButton.dataset.chapter;
    if (typeof agenticIsChapterUnlocked === "function" && !agenticIsChapterUnlocked(cid)) {
      addLog(`「${cid}」章节尚未解锁，请先完成当前下一步。`);
      if (typeof renderAgenticCoachPanel === "function") renderAgenticCoachPanel();
    } else {
      selectChapter(cid).catch((error) => console.warn("Chapter navigation failed:", error));
    }
    return;
  }

  const unitButton = event.target.closest("[data-unit]");
  if (unitButton) {
    const uid = unitButton.dataset.unit;
    const skipped = typeof agenticIsSkipped === "function" && agenticIsSkipped(uid);
    if (typeof agenticIsUnitUnlocked === "function" && !agenticIsUnitUnlocked(uid) && !skipped) {
      if (typeof agenticLockedMessage === "function") agenticLockedMessage(uid);
    } else {
      selectUnit(uid);
    }
    return;
  }

  const jumpButton = event.target.closest("[data-jump-unit]");
  if (jumpButton) {
    const uid = jumpButton.dataset.jumpUnit;
    if (typeof agenticGuardNavigation === "function" && !agenticGuardNavigation(uid, { allowPrevious: true })) return;
    analyticsTrack("jump_unit", { data: { unitId: uid, source: "library" } });
    selectUnit(uid);
    switchView("learn");
    return;
  }

  const agenticActionBtn = event.target.closest("[data-agentic-action]");
  if (agenticActionBtn) {
    const type = agenticActionBtn.dataset.agenticAction;
    if (typeof agenticApplyDecision === "function") {
      agenticActionBtn.disabled = true;
      agenticApplyDecision(type).catch((error) => {
        console.warn("Agentic decision failed:", error);
        addLog(`Agent 路径切换失败：${error.message || "请稍后重试"}`);
      });
    }
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    libraryFilter = filterButton.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((node) => node.classList.toggle("active", node === filterButton));
    trackLearningEvent("filter_library", { filter: libraryFilter }, false);
    analyticsTrack("library_filter", { data: { filter: libraryFilter } });
    renderLibrary();
    return;
  }

  const submitQuizButton = event.target.closest("[data-submit-quiz]");
  if (submitQuizButton) {
    submitQuiz(submitQuizButton.dataset.submitQuiz);
    return;
  }

  const revealAnswerButton = event.target.closest("[data-reveal-answer]");
  if (revealAnswerButton) {
    if (typeof revealQuestionAnswer === "function") revealQuestionAnswer(revealAnswerButton);
    return;
  }

  const quizNavBtn = event.target.closest(".quiz-nav-btn");
  if (quizNavBtn && quizNavBtn.dataset.unit) {
    if (typeof agenticGuardNavigation === "function" && !agenticGuardNavigation(quizNavBtn.dataset.unit, { allowPrevious: true })) return;
    selectUnit(quizNavBtn.dataset.unit);
    return;
  }

  const resourceFullscreenButton = event.target.closest("[data-resource-fullscreen]");
  if (resourceFullscreenButton) {
    const shell = resourceFullscreenButton.closest("[data-resource-shell]");
    trackLearningEvent("resource_fullscreen", { unitId: getUnit().id, entering: document.fullscreenElement !== shell }, false);
    analyticsTrack("resource_fullscreen", {
      data: { unitId: getUnit().id, entering: document.fullscreenElement !== shell }
    });
    toggleResourceFullscreen(shell);
    return;
  }

  if (event.target.closest("#fullscreen-player")) {
    analyticsTrack("learning_fullscreen_toggle", { data: { entering: !document.fullscreenElement } });
    toggleFullscreenLearning();
    return;
  }

  if (event.target.closest("[data-play-narration]")) {
    trackLearningEvent("play_narration", { unitId: getUnit().id }, false);
    analyticsTrack("narration_play_click", { source: "narration", data: { unitId: getUnit().id } });
    playNarrationQueue();
    return;
  }

  if (event.target.closest("[data-pause-narration]")) {
    trackLearningEvent("pause_narration", { unitId: getUnit().id }, false);
    analyticsTrack("narration_pause_click", { source: "narration", data: { unitId: getUnit().id } });
    pauseNarrationQueue();
    return;
  }

  if (event.target.closest("[data-stop-narration]")) {
    trackLearningEvent("stop_narration", { unitId: getUnit().id }, false);
    analyticsTrack("narration_stop_click", { source: "narration", data: { unitId: getUnit().id } });
    stopNarrationQueue();
    return;
  }

  if (event.target.closest("[data-toggle-narration]")) {
    toggleNarrationCollapse();
  }
});

const shortAnswerAnalyticsTimers = new Map();

document.addEventListener("input", (event) => {
  const seek = event.target.closest("[data-narration-seek]");
  if (seek) {
    analyticsTrack("narration_seek_input", {
      source: "narration",
      value: { new: Number(seek.value), max: Number(seek.max || 1000) }
    });
    seekNarration(Number(seek.value) / Number(seek.max || 1000));
    return;
  }

  const shortAnswer = event.target.closest("[data-short-answer]");
  if (shortAnswer) {
    rememberQuizDraft(shortAnswer.dataset.unitId, shortAnswer.dataset.questionId, shortAnswer.value);
    const key = `${shortAnswer.dataset.unitId}:${shortAnswer.dataset.questionId}`;
    clearTimeout(shortAnswerAnalyticsTimers.get(key));
    shortAnswerAnalyticsTimers.set(key, setTimeout(() => {
      shortAnswerAnalyticsTimers.delete(key);
      analyticsTrack("short_answer_input", {
        source: "quiz",
        data: {
          unitId: shortAnswer.dataset.unitId,
          questionId: shortAnswer.dataset.questionId,
          length: shortAnswer.value.length
        }
      });
    }, 3000));
  }
});

document.addEventListener("change", (event) => {
  const choice = event.target.closest("[data-choice-answer]");
  if (!choice) return;
  const unitId = choice.dataset.unitId;
  const questionId = choice.dataset.questionId;
  const values = selectedChoiceValues(unitId, questionId);
  analyticsTrack("answer_select", {
    source: "quiz",
    data: {
      unitId,
      questionId,
      inputType: choice.type,
      values
    }
  });
  rememberQuizDraft(unitId, questionId, choice.type === "radio" ? values[0] || "" : values);
});

document.addEventListener("fullscreenchange", () => {
  analyticsTrack("fullscreen_change", { data: { active: Boolean(document.fullscreenElement) } });
  updateFullscreenButton();
  updateResourceFullscreenButtons();
  syncNarrationUi();
});
