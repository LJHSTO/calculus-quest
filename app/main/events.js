// User input, click, change, and fullscreen event wiring.
document.addEventListener("click", (event) => {
  const brandBackButton = event.target.closest(".brand[data-view]");
  if (
    brandBackButton
    && typeof ReturnContext !== "undefined"
    && ReturnContext.shouldReturnToLearning(currentView)
  ) {
    returnToLearningCourseware().catch((error) => {
      console.warn("Return to learning failed:", error.message);
      switchView("learn");
    });
    return;
  }

  if (brandBackButton && state.returnToQuiz?.unitId && currentUnitId !== state.returnToQuiz.unitId) {
    const quizUnitId = state.returnToQuiz.unitId;
    const questionId = state.returnToQuiz.questionId || "";
    const quizUnit = getUnit(quizUnitId);
    state.returnToQuiz = null;
    if (quizUnit) {
      currentChapterId = quizUnit.chapterId;
      currentUnitId = quizUnit.id;
      switchView("learn");
      renderAll();
    } else {
      saveState();
    }
    window.setTimeout(() => {
      if (!questionId) return;
      const safeQuestionId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(questionId) : String(questionId).replace(/"/g, '\\"');
      const card = document.querySelector(`[data-question="${safeQuestionId}"]`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    switchView(viewButton.dataset.view);
    return;
  }

  const quizResourceLink = event.target.closest("[data-quiz-resource-link]");
  if (quizResourceLink) {
    const targetUnitId = quizResourceLink.dataset.quizResourceLink || "";
    const sceneType = quizResourceLink.dataset.quizResourceScene || "";
    const sourceUnit = getUnit();
    const targetUnit = getUnit(targetUnitId);
    const questionCard = quizResourceLink.closest("[data-question]");
    if (sourceUnit?.type === "quiz") {
      state.returnToQuiz = {
        unitId: sourceUnit.id,
        questionId: questionCard?.dataset.question || "",
        createdAt: beijingNow()
      };
      saveState();
    }
    if (sceneType && typeof setKnowledgeSceneType === "function") setKnowledgeSceneType(targetUnitId, sceneType);
    if (targetUnit) {
      currentChapterId = targetUnit.chapterId;
      currentUnitId = targetUnit.id;
      if (typeof analyticsEnterUnit === "function") analyticsEnterUnit(targetUnit, "quiz_resource_link");
      trackLearningEvent("quiz_resource_link_open", {
        fromUnitId: sourceUnit?.id || "",
        targetUnitId,
        sceneType
      }, false);
      switchView("learn");
      renderAll();
      window.setTimeout(() => {
        const playerTop = document.querySelector(".player-top");
        if (playerTop) window.scrollTo({ top: playerTop.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
      }, 80);
    }
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

  const knowledgeSceneButton = event.target.closest("[data-knowledge-scene]");
  if (knowledgeSceneButton) {
    const uid = knowledgeSceneButton.dataset.unit || currentUnitId;
    const sceneType = knowledgeSceneButton.dataset.knowledgeScene;
    if (setKnowledgeSceneType(uid, sceneType)) {
      renderAll();
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
        addLog(`学习路径切换失败：${error.message || "请稍后重试"}`);
      });
    }
    return;
  }

  const reviewChoice = event.target.closest("[data-agentic-review-choice]");
  if (reviewChoice) {
    if (typeof agenticUpdateReviewChoiceMode === "function") {
      agenticUpdateReviewChoiceMode(reviewChoice.dataset.agenticReviewChoice, reviewChoice.dataset.agenticReviewMode);
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

  const playNarrationButton = event.target.closest("[data-play-narration]");
  if (playNarrationButton) {
    trackLearningEvent("play_narration", { unitId: getUnit().id }, false);
    analyticsTrack("narration_play_click", { source: "narration", data: { unitId: getUnit().id } });
    playNarrationQueue(playNarrationButton.closest("[data-coach-strip]") || document);
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
    seekNarration(Number(seek.value) / Number(seek.max || 1000), seek.closest("[data-coach-strip]") || document);
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
  const knowledgeChoice = event.target.closest("[data-agentic-knowledge-choice]");
  if (knowledgeChoice) {
    if (typeof agenticUpdatePendingKnowledgeChoice === "function") {
      agenticUpdatePendingKnowledgeChoice(knowledgeChoice.dataset.agenticKnowledgeChoice, knowledgeChoice.checked);
    }
    return;
  }

  const choice = event.target.closest("[data-choice-answer]");
  if (!choice) return;
  const unitId = choice.dataset.unitId;
  const questionId = choice.dataset.questionId;
  const values = selectedChoiceValues(unitId, questionId);
  const unit = getUnit(unitId);
  const questions = unit?.scene?.content?.questions || [];
  const questionIndex = questions.findIndex((question) => question.id === questionId);
  const question = questionIndex >= 0 ? questions[questionIndex] : {};
  analyticsTrack("answer_select", {
    source: "quiz",
    data: {
      unitId,
      questionId,
      questionIndex: questionIndex >= 0 ? questionIndex : null,
      questionText: question.question || question.prompt || question.title || question.text || "",
      phase: unit?.assessmentPhase || "",
      moduleId: question.moduleId || "",
      moduleTitle: question.moduleTitle || "",
      knowledgePointIds: question.knowledgePointIds || question.coachHint?.knowledgePointIds || [],
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
