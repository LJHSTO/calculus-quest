// Quiz answer handling, review, scoring, and quiz navigation.
function selectedChoiceValues(unitId, questionId) {
  return Array.from(document.querySelectorAll(`input[name="${unitId}-${questionId}"]:checked`)).map((input) => input.value);
}

function optionText(question, value) {
  const option = (question.options || []).find((item) => item.value === value);
  return option ? `${option.value}. ${option.label}` : value;
}

function formatAnswerValues(question, values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  if (!list.length) return "未作答";
  return list.map((value) => optionText(question, value)).join("；");
}

function renderQuestionReview({ question, result, index }) {
  if (question.type === "short_answer") {
    return `
      <div class="question-review pending" data-question-review>
        <div class="review-heading">
          <span class="status-pill todo">待复核</span>
          <strong>第 ${index + 1} 题参考要点</strong>
        </div>
        <p><b>你的回答：</b>${escapeHtml(result.response || "")}</p>
        <p><b>参考要点：</b>${renderInlineMath(question.analysis || "请围绕题目要求说明关键步骤、几何意义或实际含义。")}</p>
        ${question.commentPrompt ? `<p><b>评分提示：</b>${renderInlineMath(question.commentPrompt)}</p>` : ""}
      </div>
    `;
  }

  const correct = result.isCorrect === true;
  return `
    <div class="question-review ${correct ? "correct" : "incorrect"}" data-question-review>
      <div class="review-heading">
        <span class="status-pill ${correct ? "done" : "todo"}">${correct ? "正确" : "需复盘"}</span>
        <strong>第 ${index + 1} 题答案解析</strong>
      </div>
      <p><b>你的选择：</b>${renderInlineMath(formatAnswerValues(question, result.response))}</p>
      <p><b>正确答案：</b>${renderInlineMath(formatAnswerValues(question, question.answer || []))}</p>
      <p><b>解析：</b>${renderInlineMath(question.analysis || "这道题暂无解析。")}</p>
    </div>
  `;
}

function showQuizReview(unit, records) {
  records.forEach((record) => {
    const card = document.querySelector(`[data-question="${record.question.id}"]`);
    if (!card) return;
    card.querySelector("[data-question-review]")?.remove();
    card.insertAdjacentHTML("beforeend", renderQuestionReview(record));
  });
  analyticsTrack("quiz_review_shown", {
    source: "quiz",
    data: {
      unitId: unit.id,
      phase: unit.assessmentPhase || "",
      questionCount: records.length
    }
  });
}

function setupQuizVisibilityTracking(unit) {
  const cards = Array.from(document.querySelectorAll(`[data-question]`));
  if (!cards.length || typeof IntersectionObserver === "undefined") return;
  const seen = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const questionId = entry.target.dataset.question;
      if (!questionId || seen.has(questionId)) return;
      seen.add(questionId);
      analyticsTrack("question_visible", {
        source: "quiz",
        data: {
          unitId: unit.id,
          chapterId: unit.chapterId,
          phase: unit.assessmentPhase || "",
          questionId
        }
      });
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.55 });
  cards.forEach((card) => observer.observe(card));
}

function jumpToFeedback(unitId) {
  const banner = document.querySelector(`#quiz-top-banner-${unitId}`);
  if (banner) {
    banner.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const feedback = document.querySelector(`#feedback-${unitId}`);
  if (feedback) {
    feedback.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function findNavTargets(unitId) {
  const all = currentNavigableUnits();
  const idx = all.findIndex(u => u.id === unitId);
  return {
    prevId: idx > 0 ? all[idx - 1].id : null,
    nextId: idx < all.length - 1 ? all[idx + 1].id : null
  };
}

function submitQuiz(unitId) {
  if ((state.submittedQuizzes || []).includes(unitId)) return;
  if (submitInProgress === unitId) return;
  submitInProgress = unitId;
  try {
  const unit = getUnit(unitId);
  if (!unit?.scene?.content?.questions) return;
  const questions = unit.scene.content.questions;
  const feedback = document.querySelector(`#feedback-${unit.id}`);
  const missing = [];
  const records = [];

  questions.forEach((question, index) => {
    if (question.type === "short_answer") {
      const textarea = document.querySelector(`textarea[name="${unit.id}-${question.id}"]`);
      const response = (textarea?.value || readQuizDraft(unit.id, question.id, "")).trim();

      if (!response) {
        missing.push(index + 1);
        return;
      }

      const estimate = estimateShortAnswer(response, question);
      rememberQuizDraft(unit.id, question.id, response);
      records.push({
        index,
        question,
        result: {
          mode: "short_answer",
          response,
          isCorrect: null,
          status: "pending_review",
          score: estimate.score,
          maxScore: question.points || 0,
          estimateLabel: estimate.label
        }
      });
      return;
    }

    const selected = selectedChoiceValues(unit.id, question.id);
    if (!selected.length) {
      missing.push(index + 1);
      return;
    }

    const response = question.type === "multiple" ? selected : selected[0];
    rememberQuizDraft(unit.id, question.id, question.type === "multiple" ? selected : selected[0]);
    const answer = [...(question.answer || [])].sort();
    const isCorrect = JSON.stringify([...selected].sort()) === JSON.stringify(answer);
    records.push({
      index,
      question,
      result: {
        mode: question.type,
        response,
        isCorrect,
        status: isCorrect ? "correct" : "incorrect",
        score: isCorrect ? question.points || 0 : 0,
        maxScore: question.points || 0
      }
    });
  });

  if (missing.length) {
    analyticsTrack("quiz_submit_blocked", {
      source: "quiz",
      data: {
        unitId: unit.id,
        chapterId: unit.chapterId,
        phase: unit.assessmentPhase || "",
        missingQuestions: missing
      }
    });
    if (feedback) feedback.textContent = `还有第 ${missing.join("、")} 题未作答，补齐后再提交。`;
    return;
  }

  // Clear old results for this quiz to avoid duplicate counting
  state.quizResults = (state.quizResults || []).filter(r => r.unitId !== unit.id);
  records.forEach(({ question, result }) => recordQuizResult(unit, question, result, { sync: false }));
  trackLearningEvent("quiz_submission", {
    unitId: unit.id,
    chapterId: unit.chapterId,
    unitLabel: unit.label,
    phase: unit.assessmentPhase || "",
    questionCount: records.length,
    pendingReview: records.filter(({ result }) => result.status === "pending_review").length,
    correct: records.filter(({ result }) => result.isCorrect === true).length,
    incorrect: records.filter(({ result }) => result.isCorrect === false).length
  });
  analyticsTrack("quiz_submit_success", {
    source: "quiz",
    data: {
      unitId: unit.id,
      chapterId: unit.chapterId,
      unitLabel: unit.label,
      phase: unit.assessmentPhase || "",
      questionCount: records.length,
      pendingReview: records.filter(({ result }) => result.status === "pending_review").length,
      correct: records.filter(({ result }) => result.isCorrect === true).length,
      incorrect: records.filter(({ result }) => result.isCorrect === false).length
    }
  });
  state.submittedQuizzes = state.submittedQuizzes || [];
  if (!state.submittedQuizzes.includes(unit.id)) state.submittedQuizzes.push(unit.id);
  saveState();
  // Lock all answer controls to prevent modification after submission
  document.querySelectorAll(`[data-question]`).forEach(card => {
    card.querySelectorAll("input, textarea").forEach(el => el.disabled = true);
  });
  showQuizReview(unit, records);
  if (feedback) {
    feedback.closest(".quiz-submit-panel")?.classList.add("submitted");
    const submitBtn = feedback.closest(".quiz-submit-panel")?.querySelector("[data-submit-quiz]");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "已提交"; }
  }
  const isPre = unit.assessmentPhase === "pre";
  const { prevId, nextId } = findNavTargets(unitId);

  // Banner + scroll hint at top of quiz card
  const quizCard = feedback ? feedback.closest(".quiz-card") : null;
  if (quizCard) {
    const existingBanner = quizCard.querySelector(".quiz-encouragement-banner");
    if (existingBanner) existingBanner.remove();
    const existingHint = quizCard.querySelector(".quiz-scroll-hint");
    if (existingHint) existingHint.remove();
    const correctCount = records.filter(({ result }) => result.isCorrect === true).length;
    const objectiveCount = records.filter(r => r.result.isCorrect !== null).length;
    const shortAnswerCount = records.length - objectiveCount;
    const displayTotal = (objectiveCount > 0 ? objectiveCount : records.length) + "道题中";
    const shortNotice = shortAnswerCount > 0 ? `，${shortAnswerCount}道简答题待复核` : "";
    const isPost = unit.assessmentPhase === "post";
    if (isPre) {
      quizCard.insertAdjacentHTML("afterbegin", `<div class="quiz-encouragement-banner" id="quiz-top-banner-${unitId}">前测提交成功！你在 ${displayTotal} 答对了 <strong>${correctCount}</strong> 题${shortNotice}。没答对的也不要紧——这正是接下来要学的内容。学完本章后会再做一次后测，对比看看自己进步了多少。</div><p class="quiz-scroll-hint">向下滑动查看每道题的答案解析和参考要点。</p>`);
    } else if (isPost) {
      quizCard.insertAdjacentHTML("afterbegin", `<div class="quiz-encouragement-banner post" id="quiz-top-banner-${unitId}">后测提交成功！你在 ${displayTotal} 答对了 <strong>${correctCount}</strong> 题${shortNotice}。和前测对比一下，看看这一章你攻克了多少一开始不会的题目。</div><p class="quiz-scroll-hint">向下滑动查看每道题的答案解析和参考要点。</p>`);
    } else {
      quizCard.insertAdjacentHTML("afterbegin", `<div class="quiz-encouragement-banner formative" id="quiz-top-banner-${unitId}">形成性测验提交成功！你在 ${displayTotal} 答对了 <strong>${correctCount}</strong> 题${shortNotice}。卡住的地方正好说明接下来要重点理解的内容——Agent 会根据你的答题情况推荐补给资源。</div><p class="quiz-scroll-hint">向下滑动查看每道题的答案解析和参考要点。</p>`);
    }
  }

  // Navigation buttons in the submit panel
  if (feedback) {
    feedback.innerHTML = `
    <div class="quiz-nav-buttons">
      <button class="button soft quiz-nav-btn" data-unit="${prevId || ''}" ${prevId ? '' : 'disabled'}>&larr; 上一节</button>
      <button class="button primary quiz-nav-btn" data-unit="${nextId || ''}" ${nextId ? '' : 'disabled'}>下一节 &rarr;</button>
    </div>
  `;
  }

  addLog(`提交「${unit.label}」整页测验：${records.length} 题已记录。`);
  renderProgress();
  renderRecommendationPanel();
  renderLibrary();
  window.setTimeout(() => jumpToFeedback(unitId), 300);
  } finally {
    submitInProgress = null;
  }
}

function estimateShortAnswer(response, question) {
  const text = response.replace(/\s+/g, "");
  const expected = `${question.analysis || ""} ${question.commentPrompt || ""}`;
  const keywords = Array.from(
    new Set((expected.match(/[\u4e00-\u9fa5]{2,}|[A-Za-z]{3,}|\d+(?:\.\d+)?/g) || []).filter((word) => word.length <= 8))
  ).slice(0, 18);
  const hits = keywords.filter((word) => response.includes(word)).length;
  const lengthScore = Math.min(1, text.length / 80);
  const keywordScore = keywords.length ? hits / keywords.length : 0.4;
  const ratio = Math.max(0.1, Math.min(0.95, lengthScore * 0.45 + keywordScore * 0.55));
  const score = Math.round((question.points || 0) * ratio);

  return {
    score,
    label: ratio >= 0.75 ? "较完整" : ratio >= 0.45 ? "基本可评" : "偏简略"
  };
}

function recordQuizResult(unit, question, result, options = {}) {
  state.quizResults = state.quizResults || [];
  const chapter = getChapter(unit.chapterId);
  const record = {
    id: `${unit.id}-${question.id}-${Date.now()}`,
    unitId: unit.id,
    questionId: question.id,
    chapterId: unit.chapterId,
    chapterLabel: chapter.label,
    unitLabel: unit.label,
    questionType: question.type,
    points: question.points || 0,
    phase: unit.assessmentPhase || "",
    timestamp: beijingNow(),
    ...result
  };

  state.quizResults.unshift(record);
  state.quizResults = state.quizResults.slice(0, 200);
  if (options.sync !== false) saveState();
  if (options.track !== false) trackLearningEvent("quiz_result", record, options.sync !== false);
}

els.completeLesson.addEventListener("click", async () => {
  completeCurrentUnit();
  // Navigate forward unless this is the very last unit
  const chapter = getChapter();
  const unitIdx = chapter.units.findIndex(u => u.id === currentUnitId);
  const isLastInChapter = unitIdx >= chapter.units.length - 1;
  const chapterIdx = curriculum.findIndex(c => c.id === chapter.id);
  const isLastUnit = isLastInChapter && chapterIdx >= curriculum.length - 1;
  if (!isLastUnit) await goToNextUnit();
});

async function goToPrevUnit() {
  const all = currentNavigableUnits();
  const idx = all.findIndex(u => u.id === currentUnitId);
  if (idx > 0) {
    const prev = all[idx - 1];
    if (prev.chapterId !== currentChapterId) await selectChapter(prev.chapterId);
    selectUnit(prev.id);
    return;
  }
  const chIdx = curriculum.findIndex(c => c.id === getChapter().id);
  if (chIdx > 0) {
    const prevChapter = curriculum[chIdx - 1];
    await selectChapter(prevChapter.id);
    const prevUnits = prevChapter.units || [];
    if (prevUnits.length) selectUnit(prevUnits[prevUnits.length - 1].id);
  }
}

async function goToNextUnit() {
  const all = currentNavigableUnits();
  const idx = all.findIndex(u => u.id === currentUnitId);
  if (idx >= 0 && idx + 1 < all.length) {
    const next = all[idx + 1];
    if (next.chapterId !== currentChapterId) await selectChapter(next.chapterId);
    selectUnit(next.id);
    return;
  }
  const chIdx = curriculum.findIndex(c => c.id === getChapter().id);
  if (chIdx >= 0 && chIdx + 1 < curriculum.length) {
    await selectChapter(curriculum[chIdx + 1].id);
  }
}
