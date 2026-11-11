// Quiz answer handling, review, scoring, and quiz navigation.
function renderAssessmentFigure(figure = {}) {
  if (!figure || !/^assets\/assessment\/functions-limits-r(?:11|13)\/[a-z0-9-]+\.svg$/.test(String(figure.src || ''))) return '';
  const width = Math.max(100, Math.min(1600, Number(figure.width) || 640));
  const height = Math.max(80, Math.min(1200, Number(figure.height) || 360));
  const alt = String(figure.alt || '题目图示').slice(0, 2400);
  return `<figure class="assessment-figure"><img src="${escapeHtml(figure.src)}" alt="${escapeHtml(alt)}" width="${width}" height="${height}" decoding="async">${figure.caption ? `<figcaption>${escapeHtml(String(figure.caption).slice(0, 1200))}</figcaption>` : ''}<details class="assessment-figure-description"><summary>查看图的文字说明</summary><p>${escapeHtml(alt)}</p></details></figure>`;
}

function quizResponseIsOmitted(response) {
  return response === '__skip__' || Array.isArray(response) && response.includes('__skip__');
}

function renderQuizOmissionAction(unit, question, submitted, draft) {
  if (question.type !== 'short_answer' && !(question.options || []).some(option => option.value === '__skip__')) return '';
  const omitted = quizResponseIsOmitted(draft);
  return `<div class="quiz-omission-actions"><button type="button" data-quiz-omission data-unit-id="${escapeHtml(unit.id)}" data-question-id="${escapeHtml(question.id)}" aria-pressed="${omitted}" ${submitted ? 'disabled' : ''}>${omitted ? '返回作答' : '暂不作答'}</button><span data-quiz-omission-status role="status" ${omitted ? '' : 'hidden'}>${submitted ? '本题未作答，已单独记录。' : '本题暂不作答，可在提交前返回。'}</span></div>`;
}

function toggleQuizOmission(button) {
  const unit = getUnit(button.dataset.unitId);
  const question = unit?.scene?.content?.questions?.find(q => q.id === button.dataset.questionId);
  if (!question || (state.submittedQuizzes || []).includes(unit.id)
    || quizRecordsForUnit(unit.id).some(row => row.questionId === question.id)) return false;
  const card = button.closest('[data-question]');
  if (!card) return false;
  const current = readQuizDraft(unit.id, question.id, '');
  const omitted = !quizResponseIsOmitted(current);
  let response = '__skip__';
  if (omitted) button.dataset.previousResponse = JSON.stringify(current);
  else { try { response = JSON.parse(button.dataset.previousResponse || '""'); } catch { response = ''; } }
  const choices = Array.isArray(response) ? response : [response];
  for (const input of card.querySelectorAll('[data-choice-answer]')) {
    input.checked = !omitted && choices.includes(input.value);
    input.disabled = omitted;
  }
  const unknown = card.querySelector('[data-short-unknown]');
  if (unknown) { unknown.checked = !omitted && response === '__unknown__'; unknown.disabled = omitted; }
  const textarea = card.querySelector('[data-short-answer]');
  if (textarea) {
    textarea.disabled = omitted || response === '__unknown__';
    if (!omitted && !['__unknown__', '__skip__'].includes(response)) textarea.value = response || '';
  }
  rememberQuizDraft(unit.id, question.id, response);
  button.textContent = omitted ? '返回作答' : '暂不作答';
  button.setAttribute('aria-pressed', String(omitted));
  card.querySelector('[data-quiz-omission-status]').hidden = !omitted;
  analyticsTrack('answer_select', { source: 'quiz', data: { unitId: unit.id, questionId: question.id, values: omitted ? ['__skip__'] : choices.filter(Boolean), responseKind: omitted ? 'skipped' : 'answer' } });
  if (!omitted) (textarea || card.querySelector('[data-choice-answer]'))?.focus({ preventScroll: true });
  return true;
}

function selectedChoiceValues(unitId, questionId) {
  return Array.from(document.querySelectorAll(`input[name="${unitId}-${questionId}"]:checked`)).map((input) => input.value);
}

function optionText(question, value) {
  if (value === "__unknown__") return "我不会";
  if (value === "__skip__") return "暂不作答";
  const options = (question.options || []).filter(item => !['__unknown__','__skip__'].includes(item.value));
  const index = options.findIndex(item => item.value === value),option=options[index];
  return option ? `${String.fromCharCode(65+index)}. ${displayOptionLabel(option)}` : value;
}

function displayQuestionText(question = {}) {
  const raw = String(question.question || question.prompt || question.title || question.text || "");
  return raw.replace(/^\s*【[^】]{1,80}】\s*/, "").trim() || raw;
}

function formatAnswerValues(question, values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  if (!list.length) return "未作答";
  return list.map((value) => optionText(question, value)).join("；");
}

function formatAnswerValuesHtml(question, values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  if (!list.length) return '<div class="answer-lines muted">未作答</div>';
  return `
    <div class="answer-lines">
      ${list.map((value) => {
        const options = (question.options || []).filter(item => !['__unknown__','__skip__'].includes(item.value));
        const index = options.findIndex(item => item.value === value),option=options[index];
        const marker = value === "__unknown__" ? "?" : option ? String.fromCharCode(65+index) : String(value || "?").trim().toUpperCase();
        const label = value === "__unknown__" ? "我不会" : option ? displayOptionLabel(option) : String(value || "");
        return `<div class="answer-line">
          <span class="answer-choice-marker" aria-hidden="true">${escapeHtml(marker)}</span>
          <span class="answer-choice-copy">${renderQuestionMath(label)}</span>
        </div>`;
      }).join("")}
    </div>
  `;
}

function renderReviewBlock(label, bodyHtml, className = "") {
  return `
    <div class="review-answer-block ${className}">
      <b>${escapeHtml(label)}</b>
      ${bodyHtml}
    </div>
  `;
}

function renderAnalysisBlock(text) {
  const paragraphs = String(text || "请结合题干条件说明关键步骤，并核对答案与条件是否一致。").split(/\n\s*\n/);
  return renderReviewBlock("解析", paragraphs.map((paragraph) =>
    `<div class="analysis-line">${renderQuestionMath(paragraph)}</div>`).join(""));
}

function renderReferenceAnswerBlock(label, text, className = "") {
  return renderReviewBlock(
    label,
    `<div class="review-answer-copy">${renderQuestionMath(text || "暂无内容。")}</div>`,
    className
  );
}

// Per-option reasoning. The server has always sent `optionFeedback`, but the
// client never rendered it: students only ever saw one flat analysis block.
// Skipped when it would merely restate text the analysis already carries (the
// frozen V14-C3 feedback bank folds its per-option lines into `analysis`).
function renderOptionFeedbackBlock(question = {}, result = {}) {
  const feedback = Array.isArray(result.optionFeedback)
    ? result.optionFeedback
    : Array.isArray(question.optionFeedback) ? question.optionFeedback : [];
  if (!feedback.length) return "";
  const analysis = String(result.analysis || question.analysis || "");
  const addsInformation = feedback.some((item) => {
    const reason = String(item.reason || "").trim();
    return reason && !analysis.includes(reason);
  });
  if (!addsInformation) return "";
  return renderReviewBlock("逐选项说明", `
    <div class="answer-lines">
      ${feedback.map((item) => {
        const marker = String(item.value || "?").trim().toUpperCase();
        const tone = item.isCorrect ? "is-correct" : "is-incorrect";
        return `<div class="answer-line option-feedback-line ${tone}">
          <span class="answer-choice-marker" aria-hidden="true">${escapeHtml(marker)}</span>
          <span class="answer-choice-copy">
            <b>${renderQuestionMath(String(item.label || ""))}</b>
            <span class="option-feedback-reason">${renderQuestionMath(String(item.reason || ""))}</span>
          </span>
        </div>`;
      }).join("")}
    </div>
  `, "option-feedback");
}

function questionReviewAnalysis(question = {}, result = {}) {
  return String(
    result.analysis
      || question.analysis
      || result.referenceAnswer
      || question.referenceAnswer
      || result.answerText
      || question.answerText
      || "请结合题干条件说明关键步骤，并核对答案与条件是否一致。"
  );
}

function questionConceptTags(question) {
  const explicit = question.coachHint?.concepts || question.concepts || question.tags || [];
  const tags = new Set(Array.isArray(explicit) ? explicit : [explicit].filter(Boolean));
  const source = `${question.question || ""} ${question.analysis || ""} ${question.commentPrompt || ""}`;
  [
    "自变量", "因变量", "函数", "函数图像", "坐标", "映射", "唯一性", "斜率", "变化率",
    "平均变化率", "局部线性", "切线", "导数", "速度", "方向", "向量", "矩阵", "梯度"
  ].forEach((tag) => {
    if (source.includes(tag)) tags.add(tag);
  });
  return Array.from(tags).slice(0, 4);
}

function aiReviewStatus(result, question = {}) {
  const aiScore = result.aiScore ?? result.ai_score;
  const aiErrorType = result.aiErrorType || result.ai_error_type || "";
  const feedback = result.aiFeedback || result.ai_feedback || "";
  const hasAiScore = aiScore !== undefined && aiScore !== null;
  const maxScore = quizMaxScoreFor(question, result || {});
  const aiFailed = quizAiReviewFailed(result);
  const pendingReview = quizReviewIsPending(result);
  const fallbackScored = aiFailed && !pendingReview;
  const displayScore = !aiFailed && hasAiScore ? quizScoreFromAiScore(aiScore, maxScore) : null;
  const reviewCompleted = !pendingReview && !aiFailed && hasAiScore;
  const badgeText = aiFailed ? "待复核" : reviewCompleted ? (Number(displayScore) === 0 ? "需复盘" : "已批改") : "待批改";
  const badgeClass = reviewCompleted && Number(displayScore) > 0 ? "done" : "todo";
  let line = "智能批改正在等待返回；结果回来后会保留在这里。";
  if (aiFailed) {
    line = aiErrorType === "mock_provider"
      ? "当前环境未启用真实智能评分。这题未计分并保留待复核；你可以继续学习，之后可重新评分。"
      : aiErrorType === "api_timeout"
        ? "智能评分在规定时间内未返回。这题未计分并保留待复核；你可以继续学习，之后可重新评分。"
        : "智能评分暂时未得到可用结果。这题未计分并保留待复核；你可以继续学习，之后可重新评分。";
  } else if (hasAiScore) {
    const confidence = result.aiConfidence != null ? ` · 判断把握 ${Math.round(Number(result.aiConfidence) * 100)}%` : "";
    const denominator = maxScore ? ` / ${quizFormatScore(maxScore)}` : "";
    line = `建议得分：${quizFormatScore(displayScore)}${denominator} 分${confidence}`;
  }
  return { hasAiScore, aiFailed, badgeText, badgeClass, line, feedback: aiFailed ? "" : feedback };
}

function shortAnswerReferenceText(question, result = {}) {
  return result.referenceAnswer
    || result.answerText
    || result.analysis
    || question.referenceAnswer
    || question.answerText
    || question.analysis
    || "请围绕题目要求说明关键步骤、几何意义或实际含义。";
}

function renderQuestionReview({ question, result, index, unit }) {
  if(/^fl-r(?:7|10|11|12|13)-(pre|post)-/.test(question.id))return '<div class="question-review" data-question-review><p>回答已保存。本次独立测量暂不显示分数和答案；简答题由评分者按量规复核。</p></div>';
  if(quizResponseIsOmitted(result.response))return '<div class="question-review" data-question-review>本题未作答，已单独记录。</div>';
  if (question.type === "short_answer" && result.response === "__unknown__") {
    return renderReviewBlock("你的回答", "我不会（0 分）") + renderAnalysisBlock(shortAnswerReferenceText(question, result));
  }
  if (question.type === "short_answer") {
    const ai = aiReviewStatus(result, question);
    const referenceText = shortAnswerReferenceText(question, result);
    const rubricText = result.commentPrompt || result.rubric || question.commentPrompt || question.rubric || "";
    const weakConceptLabels = typeof KnowledgePointLabels !== "undefined"
      ? KnowledgePointLabels.labelsFor(result.aiWeakConcepts, typeof curriculum !== "undefined" ? curriculum : [], unit?.chapterId)
      : (Array.isArray(result.aiWeakConcepts) ? result.aiWeakConcepts : []);
    return `
      <div class="question-review pending" data-question-review>
        <div class="review-heading">
          <span class="status-pill ${ai.badgeClass}">${ai.badgeText}</span>
          <strong>第 ${index + 1} 题参考要点</strong>
          <span class="question-score-pill">${escapeHtml(quizQuestionScoreLabel(question, result))}</span>
        </div>
        <p><b>你的回答：</b>${escapeHtml(result.response || "")}</p>
        <div class="ai-review-box" data-ai-review>
          <strong>智能批改建议</strong>
          <p>${escapeHtml(ai.line)}</p>
          ${ai.feedback ? `<p><b>反馈：</b>${escapeHtml(ai.feedback)}</p>` : ""}
          ${weakConceptLabels.length ? `<p><b>薄弱概念：</b>${escapeHtml(weakConceptLabels.join("、"))}</p>` : ""}
          ${result.aiReasoning ? `<p><b>评分依据：</b>${escapeHtml(result.aiReasoning)}</p>` : ""}
        </div>
        ${ai.aiFailed ? `<button class="button soft" type="button" data-retry-ai-grade data-unit="${escapeHtml(unit?.id || result.unitId || "")}" data-question-id="${escapeHtml(question.id || result.questionId || "")}">重新批改</button>` : ""}
        ${renderReferenceAnswerBlock("参考答案", referenceText, "reference-answer")}
        ${renderReferenceAnswerBlock("解析与评分参考", rubricText || "请围绕题目要求说明关键步骤、依据和结论。", "reference-rubric")}
        ${renderQuizCoverage(question, unit)}
      </div>
    `;
  }

  const correct = result.isCorrect === true;
  const correctAnswer = result.answer ?? question.answer ?? [];
  const analysis = questionReviewAnalysis(question, result);
  return `
    <div class="question-review ${correct ? "correct" : "incorrect"}" data-question-review>
      <div class="review-heading">
        <span class="status-pill ${correct ? "done" : "todo"}">${correct ? "正确" : "需复盘"}</span>
        <strong>第 ${index + 1} 题解析</strong>
      </div>
      ${correct ? '' : renderReviewBlock("正确答案", formatAnswerValuesHtml(question, correctAnswer), "correct-answer")}
      ${renderOptionFeedbackBlock(question, result)}
      ${renderAnalysisBlock(analysis)}
      ${renderQuizCoverage(question, unit)}
    </div>
  `;
}

async function retryFailedShortAnswer(unitId = "", questionId = "") {
  const unit = getUnit(unitId);
  if (!unit?.id || !questionId) return false;
  const trackRegrade = (eventType, data = {}) => {
    if (typeof analyticsTrack !== "function") return;
    analyticsTrack(eventType, {
      source: "quiz",
      data: { unitId: unit.id, questionId, ...data }
    });
  };
  trackRegrade("short_answer_regrade_requested");
  const payload = await apiRequest("api/learning/grade", {
    unitId: unit.id,
    questions: [{ questionId }]
  }, { timeoutMs: 12000 });
  if (Array.isArray(payload?.results) && typeof agenticApplyGradingResults === "function") {
    agenticApplyGradingResults(payload.results, unit);
  }
  const result = (payload?.results || []).find((item) => item.questionId === questionId) || null;
  if (!result) {
    trackRegrade("short_answer_regrade_failed", { reason: "empty_response" });
    if (unit.id === currentUnitId) renderQuiz(unit);
    addLog(`「${unit.label}」中的简答题没有收到有效的重新批改结果。`);
    return false;
  }
  const failed = result && typeof QuizReviewState !== "undefined"
    ? QuizReviewState.FAILURE_TYPES.has(String(result.errorType || "").toLowerCase())
    : Boolean(result?.errorType && result.errorType !== "none");
  if (failed) {
    trackRegrade("short_answer_regrade_failed", {
      reason: result.errorType || "grading_failed"
    });
    if (unit.id === currentUnitId) renderQuiz(unit);
    addLog(`「${unit.label}」中的简答题重新批改仍未完成。`);
    return false;
  }

  const path = typeof ensureAgenticPath === "function" ? ensureAgenticPath() : null;
  if (
    path?.pendingPlan?.unitId === unit.id
    && path.pendingPlan.phase !== "grading_pending"
    && typeof agenticBuildRecommendationAfterGrading === "function"
  ) {
    await agenticBuildRecommendationAfterGrading(
      unit,
      typeof agenticQuizRecordsForUnit === "function" ? agenticQuizRecordsForUnit(unit.id) : [],
      null
    );
  }
  if (unit.id === currentUnitId) renderQuiz(unit);
  trackRegrade("short_answer_regrade_succeeded", {
    score: result.score,
    confidence: result.confidence,
    provider: result.provider || ""
  });
  addLog(`「${unit.label}」中的简答题已重新批改。`);
  return true;
}

function revealQuestionAnswer(button) {
  const card = button?.closest("[data-question]");
  if (!card) return false;
  const answerHidden = card.querySelector("[data-answer-hidden]");
  if (!answerHidden) return false;
  const coachHint = card.querySelector("[data-coach-hint]");
  answerHidden.style.display = "";
  if (coachHint) coachHint.style.display = "none";
  button.style.display = "none";
  analyticsTrack("quiz_answer_revealed", {
    source: "quiz",
    data: {
      unitId: getUnit()?.id || "",
      questionId: card.dataset.question || "",
      phase: getUnit()?.assessmentPhase || ""
    }
  });
  return true;
}

function showQuizReview(unit, records) {
  records.forEach((record) => {
    const card = document.querySelector(`[data-question="${record.question.id}"]`);
    if (!card) return;
    card.querySelector("[data-question-review]")?.remove();
    card.querySelector("[data-coach-hint]")?.remove();
    card.querySelector(".coach-reveal-btn")?.remove();
    card.insertAdjacentHTML("beforeend", renderQuestionReview({ ...record, unit }));
    const revealBtn = card.querySelector("[data-reveal-answer]");
    if (revealBtn) revealBtn.addEventListener("click", function() { revealQuestionAnswer(revealBtn); });
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
  if(currentUnitId!==unitId)return;
  const help=window.KnowledgeAssistant?.designSpaceSnapshot?.();
  if(help?.unitId===unitId&&help.quizSubmitted&&help.view.placement==='inline'&&(help.offer||help.prompt||help.check)&&window.TaskSupport?.locate())return;
  const banner = document.querySelector(`#quiz-top-banner-${unitId}`);
  if (banner) {
    banner.scrollIntoView({ behavior: "instant", block: "start" });
    return;
  }
  const feedback = document.querySelector(`#feedback-${unitId}`);
  if (feedback) {
    feedback.scrollIntoView({ behavior: "instant", block: "start" });
  }
}

function quizResourceReviewContext(unitId = currentUnitId) {
  const context = state.returnToQuiz;
  if (!context?.unitId || !context?.targetUnitId || context.targetUnitId !== unitId) return null;
  const quizUnit = getUnit(context.unitId);
  return quizUnit ? { ...context, quizUnit } : null;
}

function findNavTargets(unitId) {
  const previous = typeof agenticPreviousUnlockedUnitBefore === "function"
    ? agenticPreviousUnlockedUnitBefore(unitId)
    : null;
  const next = typeof agenticNextUnlockedUnitAfter === "function"
    ? agenticNextUnlockedUnitAfter(unitId)
    : null;
  return {
    prevId: previous?.id || null,
    nextId: next?.id || null
  };
}

function renderQuizPathNavigation(unit) {
  if(window.LearnerSetup?.afterPretest(unit))return `<div class="quiz-nav-buttons"><button class="button primary quiz-nav-btn guided-next" type="button" data-quiz-path-action="pilot-next">${escapeHtml(window.LearnerSetup.pretestActionLabel())}</button></div>`;
  const { prevId, nextId } = findNavTargets(unit.id);
  const pending = typeof agenticIsCurrentPending === "function" && agenticIsCurrentPending(unit.id);
  const pathReady = typeof agenticQuizPathReady !== "function" || agenticQuizPathReady(unit);
  const nextUnit = nextId ? getUnit(nextId) : null;
  const nextLabel = nextUnit?.chapterId && nextUnit.chapterId !== unit.chapterId ? "进入下一章" : "下一节";
  const nextButton = pending
    ? '<button class="button primary quiz-nav-btn guided-next" type="button" data-quiz-path-action="coach">下一步：选择学习内容</button>'
    : nextId
      ? `<button class="button primary quiz-nav-btn" type="button" data-unit="${escapeHtml(nextId)}">${nextLabel}</button>`
      : !pathReady
        ? '<button class="button primary quiz-nav-btn" type="button" disabled>正在生成学习建议</button>'
        : '<button class="button primary quiz-nav-btn" type="button" disabled>当前路径已完成</button>';
  return `
    <div class="quiz-nav-buttons">
      <button class="button soft quiz-nav-btn" type="button" data-unit="${escapeHtml(prevId || "")}" ${prevId ? "" : "disabled"}>上一节</button>
      ${nextButton}
    </div>
  `;
}

async function submitQuizWithRecovery(unit, answers) {
  const session = learningSession();
  try {
    const result = await apiRequest("/api/learning/quiz/submit", {
      unitId: unit.id, chapterId: unit.chapterId, phase: unit.assessmentPhase || "", answers
    }, { timeoutMs: 15000 });
    if (!Array.isArray(result.results) || !answers.every(a => result.results.some(r => r.questionId === a.questionId))) {
      throw Object.assign(new Error("成绩回执不完整，正在核对已保存的结果。"), { status: 502 });
    }
    return result;
  } catch (error) {
    if (!learningSessionIsCurrent(session)) return null;
    if (error.code !== "quiz_already_submitted" && error.code !== "quiz_question_set_mismatch"
      && !learningSnapshotSyncErrorIsRetryable(error)) throw error;
    // A lost acknowledgement must not turn a saved attempt into another submission.
    const saved = await fetchAuthoritativeQuizResults(unit.id).catch(() => null);
    if (!learningSessionIsCurrent(session)) return null;
    const results = (saved || []).filter(row => row.unitId === unit.id && answers.some(a => a.questionId === row.questionId));
    if (results.length !== answers.length || !answers.every(a => results.some(r => r.questionId === a.questionId))) throw error;
    return { results, requiresDiagnostic: Boolean(unit.adaptiveFormative
      && results.some(r => r.questionId.endsWith("-check-q1") && r.isCorrect === false)
      && !saved.some(r => r.questionId.endsWith("-check-q2"))), recovered: true };
  }
}

async function submitQuiz(unitId) {
  const unit = getUnit(unitId);
  const diagnosticPending = Boolean(
    unit?.adaptiveFormative
    && typeof quizAdaptiveFormativeState === "function"
    && quizAdaptiveFormativeState(unit).needsDiagnostic
  );
  if ((state.submittedQuizzes || []).includes(unitId) && !diagnosticPending) return;
  if (diagnosticPending) {
    state.submittedQuizzes = (state.submittedQuizzes || []).filter((id) => id !== unitId);
    state.completed = (state.completed || []).filter((id) => id !== unitId);
  }
  if (submitInProgress === unitId) return;
  submitInProgress = unitId;
  let feedback = null;
  let submitButton = null;
  let requestSession = null;
  try {
  if (!unit?.scene?.content?.questions) return;
  if (
    typeof agenticUnitCompletionAllowed === "function"
    && !agenticUnitCompletionAllowed(unit.id)
  ) {
    feedback = document.querySelector(`#feedback-${unit.id}`);
    if (feedback) feedback.textContent = "该测验当前仅供预览；接受学习建议后才能提交并记录本节。";
    return;
  }
  const allQuestions = unit.scene.content.questions;
  const questions = typeof quizQuestionsForCurrentStage === "function"
    ? quizQuestionsForCurrentStage(unit)
    : allQuestions;
  if (!questions.length) return;
  feedback = document.querySelector(`#feedback-${unit.id}`);
  const missing = [];
  const submissions = [];

  questions.forEach((question) => {
    const index = Math.max(0, allQuestions.findIndex((item) => item.id === question.id));
    if (quizResponseIsOmitted(readQuizDraft(unit.id, question.id, ''))) {
      submissions.push({ index, question, response: '__skip__' });
      return;
    }
    if (question.type === "short_answer") {
      const textarea = document.querySelector(`textarea[name="${unit.id}-${question.id}"]`);
      const unknown = document.querySelector(`[data-short-unknown][data-question-id="${question.id}"]`)?.checked;
      const response = document.querySelector(`[data-short-skip][data-question-id="${question.id}"]`)?.checked ? "__skip__" : unknown ? "__unknown__" : (textarea?.value || readQuizDraft(unit.id, question.id, "")).trim();

      if (!response) {
        missing.push(index + 1);
        return;
      }

      rememberQuizDraft(unit.id, question.id, response);
      submissions.push({
        index,
        question,
        response
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
    submissions.push({
      index,
      question,
      response
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

  submitButton = feedback?.closest(".quiz-submit-panel")?.querySelector("[data-submit-quiz]") || null;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "正在提交";
  }
  if (feedback) feedback.textContent = "正在由服务器核对答案...";
  requestSession = learningSession();
  const submitted = await submitQuizWithRecovery(unit,
    submissions.map(({ question, response }) => ({
      questionId: question.id,
      response
    }))
  );
  if (!submitted || !learningSessionIsCurrent(requestSession)) return;
  const authoritative = new Map(
    (submitted.results || []).map((result) => [result.questionId, result])
  );
  const records = submissions.map(({ index, question, response }) => {
    const result = authoritative.get(question.id);
    if (!result) throw new Error(`题目 ${question.id} 缺少服务端评分结果。`);
    const review = {
      answer: result.answer,
      analysis: result.analysis || "",
      feedbackVersion: result.feedbackVersion || "",
      commentPrompt: result.commentPrompt || ""
    };
    Object.assign(question, review);
    return {
      index,
      question,
      result: {
        id: result.id,
        mode: result.questionType || question.type,
        response: result.response ?? response,
        isCorrect: result.isCorrect,
        status: result.status,
        score: result.score,
        maxScore: result.maxScore,
        timestamp: result.timestamp,
        ...review
      }
    };
  });

  // Ordinary quizzes replace a whole attempt. Adaptive formative quizzes retain
  // the core result while a diagnostic follow-up is submitted separately.
  const submittedIds = new Set(records.map(({ question }) => question.id));
  state.quizResults = (state.quizResults || []).filter((row) => (
    row.unitId !== unit.id || (unit.adaptiveFormative && !submittedIds.has(row.questionId))
  ));
  const storedRecords = records.map(({ question, result, index }) =>
    recordQuizResult(unit, question, result, { sync: false, track: false, index })
  );
  rememberQuizAttempt(unit, storedRecords);
  const scoredRecords = records.filter(({ result }) => quizHasScoredEvidence(result));
  const unavailableReviews = records.filter(({ result }) => quizAiReviewFailed(result)).length;
  trackLearningEvent("quiz_submission", {
    unitId: unit.id,
    chapterId: unit.chapterId,
    unitLabel: unit.label,
    phase: unit.assessmentPhase || "",
    questionCount: records.length,
    pendingReview: records.filter(({ result }) => quizReviewIsPending(result)).length,
    reviewUnavailable: unavailableReviews,
    correct: scoredRecords.filter(({ result }) => result.isCorrect === true).length,
    incorrect: scoredRecords.filter(({ result }) => result.isCorrect === false).length
  });
  analyticsTrack("quiz_submit_success", {
    source: "quiz",
    data: {
      unitId: unit.id,
      chapterId: unit.chapterId,
      unitLabel: unit.label,
      phase: unit.assessmentPhase || "",
      questionCount: records.length,
      pendingReview: records.filter(({ result }) => quizReviewIsPending(result)).length,
      reviewUnavailable: unavailableReviews,
      correct: scoredRecords.filter(({ result }) => result.isCorrect === true).length,
      incorrect: scoredRecords.filter(({ result }) => result.isCorrect === false).length
    }
  });
  const needsDiagnostic = submitted.requiresDiagnostic === true || Boolean(
    unit.adaptiveFormative && unit.assessmentPhase === "formative"
    && (submitted.results || []).some((result) => (
      result.questionType !== "multiple" && result.status === "incorrect"
    ))
  );
  if (needsDiagnostic) {
    saveState();
    if (unit.adaptiveFormative && typeof syncLearningSnapshot === "function") {
      await syncLearningSnapshot("adaptive_formative_core_pending");
    }
    addLog(`「${unit.label}」核心题答错，进入诊断题。`);
    renderProgress();
    renderRecommendationPanel();
    renderLibrary();
    window.setTimeout(() => {
      renderLessons();
      renderPlayer();
    }, 250);
    return;
  }
  state.submittedQuizzes = state.submittedQuizzes || [];
  if (!state.submittedQuizzes.includes(unit.id)) state.submittedQuizzes.push(unit.id);
  if(unit.assessmentPhase==='pre'||unit.assessmentPhase==='post')await window.PilotStudyUI?.reload?.();
  if (!state.completed.includes(unit.id)) {
    state.completed.push(unit.id);
    addLog(`提交并完成「${unit.label}」。`);
  }
  saveState();
  if (unit.adaptiveFormative && typeof syncLearningSnapshot === "function") {
    await syncLearningSnapshot("adaptive_formative_completed");
  }
  // Lock all answer controls to prevent modification after submission
  document.querySelectorAll(`[data-question]`).forEach(card => {
    card.querySelectorAll("input, textarea, [data-quiz-omission]").forEach(el => el.disabled = true);
  });
  showQuizReview(unit, records);
  if (feedback) {
    feedback.closest(".quiz-submit-panel")?.classList.add("submitted");
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = "已提交"; }
  }
  const isPre = unit.assessmentPhase === "pre";
  // Banner + scroll hint at top of quiz card
  const quizCard = feedback ? feedback.closest(".quiz-card") : null;
  if (quizCard) {
    quizCard.closest('.resource-body')?.querySelector('.assessment-banner')?.remove();
    const existingBanner = quizCard.querySelector(".quiz-encouragement-banner");
    if (existingBanner) existingBanner.remove();
    const existingHint = quizCard.querySelector(".quiz-scroll-hint");
    if (existingHint) existingHint.remove();
    const summaryQuestions = unit.adaptiveFormative ? questions : allQuestions;
    const summary = summarizeQuizAttempt(state.quizResults.filter((r) => r.unitId === unit.id), summaryQuestions);
    const outcomeHtml = /^fl-r(?:7|10|11|12|13)-/.test(allQuestions[0]?.id||'')&&['pre','post'].includes(unit.assessmentPhase)?'回答已保存，答案与分数将在研究规定的反馈时间提供':quizOutcomeHtml(summary);
    const isPost = unit.assessmentPhase === "post";
    if (isPre) {
      quizCard.insertAdjacentHTML("afterbegin", `<div class="quiz-encouragement-banner" id="quiz-top-banner-${unitId}">前测已提交：${outcomeHtml}。</div>`);
    } else if (isPost) {
      quizCard.insertAdjacentHTML("afterbegin", `<div class="quiz-encouragement-banner post" id="quiz-top-banner-${unitId}">后测已提交：${outcomeHtml}。</div>`);
    } else {
      quizCard.insertAdjacentHTML("afterbegin", `<div class="quiz-encouragement-banner formative" id="quiz-top-banner-${unitId}">已提交：${outcomeHtml}。</div>`);
    }
  }

  // Navigation buttons in the submit panel
  if (feedback) {
    const summaryQuestions = unit.adaptiveFormative ? questions : allQuestions;
    const currentSummary = summarizeQuizAttempt(state.quizResults.filter((r) => r.unitId === unit.id), summaryQuestions);
    const totalLine = quizOutcomeHtml(currentSummary);
    feedback.innerHTML = `
    ${renderQuizPathNavigation(unit)}
  `;
  }

  addLog(`提交「${unit.label}」整页测验：${records.length} 题已记录。`);
  renderProgress();
  renderRecommendationPanel();
  renderLibrary();
  requestAnimationFrame(()=>jumpToFeedback(unitId));
  if ((unit.assessmentPhase === "pre" || unit.assessmentPhase === "post" || unit.assessmentPhase === "formative") && typeof agenticAfterQuizSubmit === "function") {
    Promise.resolve(agenticAfterQuizSubmit(unit, records)).catch((error) => {
      console.warn("Agentic quiz follow-up failed:", error);
      if (typeof agenticMarkGradingRecoveryAvailable === "function") {
        agenticMarkGradingRecoveryAvailable(unit, error);
      }
    });
  } else if (typeof agenticOnUnitCompleted === "function") {
    agenticOnUnitCompleted(unit);
  }
  } catch (error) {
    if (requestSession && !learningSessionIsCurrent(requestSession)) return;
    console.warn("Quiz submission failed:", error);
    if (feedback) feedback.textContent = error.message || "测验提交失败，请稍后重试。";
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "提交本次测验";
    }
  } finally {
    if (!requestSession || learningSessionIsCurrent(requestSession)) submitInProgress = null;
  }
}

function recordQuizResult(unit, question, result, options = {}) {
  state.quizResults = state.quizResults || [];
  const chapter = getChapter(unit.chapterId);
  const record = {
    id: `${unit.id}-${question.id}-${Date.now()}`,
    unitId: unit.id,
    questionId: question.id,
    questionIndex: Number.isFinite(options.index) ? options.index : null,
    questionText: displayQuestionText(question),
    chapterId: unit.chapterId,
    chapterLabel: chapter.label,
    unitLabel: unit.label,
    questionType: question.type,
    adaptiveRole: question.adaptiveRole || "",
    moduleId: question.moduleId || "",
    moduleTitle: question.moduleTitle || "",
    knowledgePointIds: question.knowledgePointIds || question.coachHint?.knowledgePointIds || [],
    concepts: questionConceptTags(question),
    points: question.points || 0,
    phase: unit.assessmentPhase || "",
    timestamp: beijingNow(),
    ...result
  };

  state.quizResults.unshift(record);
  state.quizResults = state.quizResults.slice(0, 200);
  if (options.sync !== false) saveState();
  if (options.track !== false) trackLearningEvent("quiz_result", record, options.sync !== false);
  return record;
}

els.completeLesson.addEventListener("click", (event) => {
  const outcomeAction = window.KnowledgeAssistant?.outcomeNavigationAction?.(getUnit()) || null;
  if (outcomeAction) {
    event.preventDefault();
    window.KnowledgeAssistant?.openOutcomeStage?.(outcomeAction.stageId || "");
    return;
  }
  completeAndAdvanceCurrentUnit(event);
});

async function goToPrevUnit() {
  const previous = typeof agenticPreviousUnlockedUnitBefore === "function"
    ? agenticPreviousUnlockedUnitBefore(currentUnitId)
    : null;
  if (!previous?.id) {
    addLog("这里是当前学习路线的第一节。");
    return;
  }
  if (typeof agenticGuardNavigation === "function" && !agenticGuardNavigation(previous.id, { allowPrevious: true })) return;
  if (typeof agenticOpenUnit === "function") await agenticOpenUnit(previous.id);
}

async function goToNextUnit() {
  if (typeof agenticCanLeaveCurrent === "function" && !agenticCanLeaveCurrent()) {
    addLog("请先在学习建议卡片中选择下一步，再继续下一关。");
    if (typeof focusAgenticCoachPanel === "function") focusAgenticCoachPanel();
    else if (typeof renderAgenticCoachPanel === "function") renderAgenticCoachPanel();
    return;
  }
  const next = typeof agenticNextUnlockedUnitAfter === "function"
    ? agenticNextUnlockedUnitAfter(currentUnitId)
    : null;
  if (!next?.id) {
    const unit = getUnit();
    if (unit?.type === "quiz" && typeof agenticQuizPathReady === "function" && !agenticQuizPathReady(unit)) {
      addLog("学习建议正在生成，请稍候片刻。");
      if (typeof focusAgenticCoachPanel === "function") focusAgenticCoachPanel();
      return;
    }
    addLog("当前没有已解锁的下一节，请先完成本节或确认学习建议。");
    return;
  }
  if (typeof agenticGuardNavigation === "function" && !agenticGuardNavigation(next.id, { allowPrevious: true })) return;
  if (typeof agenticOpenUnit === "function") await agenticOpenUnit(next.id);
}
