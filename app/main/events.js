// User input, click, change, and fullscreen event wiring.
document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    switchView(viewButton.dataset.view);
    return;
  }

  const chapterButton = event.target.closest("[data-chapter]");
  if (chapterButton) {
    selectChapter(chapterButton.dataset.chapter).catch((error) => console.warn("Chapter navigation failed:", error));
    return;
  }

  const unitButton = event.target.closest("[data-unit]");
  if (unitButton) {
    selectUnit(unitButton.dataset.unit);
    return;
  }

  const jumpButton = event.target.closest("[data-jump-unit]");
  if (jumpButton) {
    analyticsTrack("jump_unit", { data: { unitId: jumpButton.dataset.jumpUnit, source: "library" } });
    selectUnit(jumpButton.dataset.jumpUnit);
    switchView("learn");
    return;
  }

  if (event.target.closest("[data-toggle-recommendations]")) {
    analyticsTrack("recommendation_toggle", { data: { collapsedBefore: Boolean(state.recommendationsCollapsed) } });
    toggleRecommendationCollapse();
    return;
  }

  const completeSupplementButton = event.target.closest("[data-complete-supplement]");
  if (completeSupplementButton) {
    analyticsTrack("supplement_complete_click", { data: { unitId: completeSupplementButton.dataset.completeSupplement } });
    markSupplementComplete(completeSupplementButton.dataset.completeSupplement);
    return;
  }

  const supplementButton = event.target.closest("[data-open-supplement]");
  if (supplementButton) {
    analyticsTrack("supplement_open", { data: { unitId: supplementButton.dataset.openSupplement } });
    selectUnit(supplementButton.dataset.openSupplement);
    switchView("learn");
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

  const quizNavBtn = event.target.closest(".quiz-nav-btn");
  if (quizNavBtn && quizNavBtn.dataset.unit) {
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
  }
});

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
    analyticsTrack("short_answer_input", {
      source: "quiz",
      data: {
        unitId: shortAnswer.dataset.unitId,
        questionId: shortAnswer.dataset.questionId,
        length: shortAnswer.value.length
      }
    });
    rememberQuizDraft(shortAnswer.dataset.unitId, shortAnswer.dataset.questionId, shortAnswer.value);
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
