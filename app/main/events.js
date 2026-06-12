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
    selectUnit(jumpButton.dataset.jumpUnit);
    switchView("learn");
    return;
  }

  if (event.target.closest("[data-toggle-recommendations]")) {
    toggleRecommendationCollapse();
    return;
  }

  const completeSupplementButton = event.target.closest("[data-complete-supplement]");
  if (completeSupplementButton) {
    markSupplementComplete(completeSupplementButton.dataset.completeSupplement);
    return;
  }

  const supplementButton = event.target.closest("[data-open-supplement]");
  if (supplementButton) {
    selectUnit(supplementButton.dataset.openSupplement);
    switchView("learn");
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    libraryFilter = filterButton.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((node) => node.classList.toggle("active", node === filterButton));
    trackLearningEvent("filter_library", { filter: libraryFilter }, false);
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
    toggleResourceFullscreen(shell);
    return;
  }

  if (event.target.closest("#fullscreen-player")) {
    toggleFullscreenLearning();
    return;
  }

  if (event.target.closest("[data-play-narration]")) {
    trackLearningEvent("play_narration", { unitId: getUnit().id }, false);
    playNarrationQueue();
    return;
  }

  if (event.target.closest("[data-pause-narration]")) {
    trackLearningEvent("pause_narration", { unitId: getUnit().id }, false);
    pauseNarrationQueue();
    return;
  }

  if (event.target.closest("[data-stop-narration]")) {
    trackLearningEvent("stop_narration", { unitId: getUnit().id }, false);
    stopNarrationQueue();
  }
});

document.addEventListener("input", (event) => {
  const seek = event.target.closest("[data-narration-seek]");
  if (seek) {
    seekNarration(Number(seek.value) / Number(seek.max || 1000));
    return;
  }

  const shortAnswer = event.target.closest("[data-short-answer]");
  if (shortAnswer) {
    rememberQuizDraft(shortAnswer.dataset.unitId, shortAnswer.dataset.questionId, shortAnswer.value);
  }
});

document.addEventListener("change", (event) => {
  const choice = event.target.closest("[data-choice-answer]");
  if (!choice) return;
  const unitId = choice.dataset.unitId;
  const questionId = choice.dataset.questionId;
  const values = selectedChoiceValues(unitId, questionId);
  rememberQuizDraft(unitId, questionId, choice.type === "radio" ? values[0] || "" : values);
});

document.addEventListener("fullscreenchange", () => {
  updateFullscreenButton();
  updateResourceFullscreenButtons();
  syncNarrationUi();
});
