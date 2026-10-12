const crypto = require("crypto");

const PHASE_KEYS = {
  preQuiz: "pre",
  formativeQuiz: "formative",
  postQuiz: "post"
};

const PRIVATE_QUESTION_FIELDS = new Set([
  "answer",
  "answerText",
  "analysis",
  "commentPrompt",
  "correctAnswer",
  "explanation",
  "hasAnswer",
  "referenceAnswer",
  "rubric",
  "solution"
]);
const RETRYABLE_AI_ERROR_TYPES = new Set([
  "api_error",
  "api_timeout",
  "parse_error",
  "empty_response",
  "mock_provider",
  "manual_fallback",
  "unknown"
]);

function isQuestion(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && value.id
    && value.type
    && (value.question || value.prompt || value.title || value.text)
  );
}

function clonePublicValue(value) {
  if (Array.isArray(value)) return value.map(clonePublicValue);
  if (!value || typeof value !== "object") return value;

  const question = isQuestion(value);
  const clone = {};
  Object.entries(value).forEach(([key, child]) => {
    if (question && PRIVATE_QUESTION_FIELDS.has(key)) return;
    clone[key] = clonePublicValue(child);
  });
  return clone;
}

function buildPublicLearningRoute(route) {
  const publicRoute = clonePublicValue(route || {});
  function addUnknown(value) {
    if (!value || typeof value !== "object") return;
    if (isQuestion(value) && Array.isArray(value.options)
      && !value.options.some(option => option.value === "__unknown__")) {
      value.options.push({ value: "__unknown__", label: "我不会" });
    }
    Object.values(value).forEach(child => {
      if (child && typeof child === "object") addUnknown(child);
    });
  }
  addUnknown(publicRoute);
  for (const chapter of publicRoute.chapters || []) {
    for (const module of chapter.modules || []) {
      if (module.legacyAssessmentStatus !== "archived") continue;
      for (const key of Object.keys(PHASE_KEYS)) {
        if (module.flow?.[key]) {
          module.flow[key] = { ...module.flow[key], questions: [], assessmentStatus: "archived" };
        }
      }
    }
  }
  return publicRoute;
}

function addFlowQuestions(index, flow = {}, context = {}) {
  Object.entries(PHASE_KEYS).forEach(([flowKey, phase]) => {
    const quiz = flow?.[flowKey];
    const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
    questions.forEach((question) => {
      if (!isQuestion(question) || index.has(question.id)) return;
      index.set(question.id, {
        ...context,
        phase,
        unitId: `${context.unitPrefix || context.chapterId}-${phase}`,
        unitLabel: quiz.title || "",
        question
      });
    });
  });
}

function buildAssessmentIndex(route) {
  const index = new Map();
  const knowledgePointLabels = new Map();
  (route?.chapters || []).forEach((chapter) => {
    (chapter.modules || []).forEach((module) => {
      (module.knowledgePoints || []).forEach((knowledgePoint) => {
        const id = String(knowledgePoint?.id || "").trim();
        const label = String(knowledgePoint?.name || knowledgePoint?.title || "").trim();
        if (id && label) knowledgePointLabels.set(id, label);
      });
    });
  });
  Object.defineProperty(index, "knowledgePointLabels", {
    value: knowledgePointLabels,
    enumerable: false
  });
  (route?.chapters || []).forEach((chapter) => {
    const chapterContext = {
      chapterId: chapter.id || "",
      chapterLabel: chapter.title || "",
      unitPrefix: chapter.id || ""
    };

    // The chapter-level curated quizzes are the current public learning route.
    addFlowQuestions(index, chapter.flow, chapterContext);

    // Keep module quizzes available for older route modes without overriding
    // the curated chapter-level version of a duplicated question.
    (chapter.modules || []).forEach((module) => {
      addFlowQuestions(index, module.flow, {
        chapterId: chapter.id || "",
        chapterLabel: chapter.title || "",
        moduleId: module.id || "",
        moduleTitle: module.title || "",
        assessmentStatus: module.legacyAssessmentStatus === "archived" ? "archived" : "active",
        unitPrefix: module.id || chapter.id || ""
      });
      (module.knowledgePoints || []).forEach((knowledgePoint) => {
        const quiz = knowledgePoint.formativeQuiz;
        const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
        questions.forEach((question) => {
          if (!isQuestion(question) || index.has(question.id)) return;
          index.set(question.id, {
            chapterId: chapter.id || "",
            chapterLabel: chapter.title || "",
            moduleId: module.id || "",
            moduleTitle: module.title || "",
            knowledgePointId: knowledgePoint.id || "",
            phase: "formative",
            unitId: `${knowledgePoint.id}-formative`,
            unitLabel: quiz.title || `知识点检测：${knowledgePoint.name || ""}`,
            question
          });
        });
      });
    });
  });
  return index;
}

function studentFacingConcepts(index, values) {
  const concepts = Array.isArray(values) ? values : values == null ? [] : [values];
  const labels = index?.knowledgePointLabels;
  return Array.from(new Set(
    concepts
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value) => labels?.get(value) || value)
  ));
}

function normalizeChoiceValues(value) {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return Array.from(new Set(
    values
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 30)
  )).sort();
}

function scoreObjectiveQuestion(question, response) {
  const maxScore = Math.max(0, Number(question?.points || 0));
  const expected = normalizeChoiceValues(question?.answer);
  const actual = normalizeChoiceValues(response);
  if (actual.includes("__unknown__")) {
    return { isCorrect: false, score: 0, maxScore, status: "incorrect" };
  }
  const isCorrect = expected.length > 0
    && expected.length === actual.length
    && expected.every((value, index) => value === actual[index]);
  return {
    isCorrect,
    score: isCorrect ? maxScore : 0,
    maxScore,
    status: isCorrect ? "correct" : "incorrect"
  };
}

function assessmentEntry(index, query = {}) {
  const questionId = String(query.questionId || query.question_id || "").trim();
  const entry = index?.get(questionId);
  if (!entry) return null;
  const chapterId = String(query.chapterId || query.chapter_id || "").trim();
  const unitId = String(query.unitId || query.unit_id || "").trim();
  const phase = String(query.phase || "").trim();
  if (chapterId && entry.chapterId !== chapterId) return null;
  if (unitId && entry.unitId !== unitId) return null;
  if (phase && entry.phase !== phase) return null;
  return entry;
}

function assessmentEntriesForUnit(index, query = {}) {
  const chapterId = String(query.chapterId || query.chapter_id || "").trim();
  const unitId = String(query.unitId || query.unit_id || "").trim();
  const phase = String(query.phase || "").trim();
  return Array.from(index?.values?.() || []).filter((entry) => (
    (!chapterId || entry.chapterId === chapterId)
    && (!unitId || entry.unitId === unitId)
    && (!phase || entry.phase === phase)
  ));
}

function assessmentFingerprint(route) {
  const index = buildAssessmentIndex(route);
  const signature = Array.from(index.values())
    .map((entry) => {
      const question = entry.question || {};
      return {
        chapterId: entry.chapterId || "",
        unitId: entry.unitId || "",
        phase: entry.phase || "",
        questionId: question.id || "",
        type: question.type || "",
        text: question.question || question.prompt || question.title || question.text || "",
        points: Number(question.points || 0),
        options: Array.isArray(question.options)
          ? question.options.map((option) => ({
            value: option?.value ?? "",
            label: option?.label ?? ""
          }))
          : [],
        answer: Array.isArray(question.answer) ? question.answer : question.answer ?? ""
      };
    })
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(signature))
    .digest("hex")
    .slice(0, 24);
}

const UNKNOWN_OPTION_VALUE = "__unknown__";

// The versioned feedback bank emits one line per option as
// "选项X（应选|不应选）：<reason>". Recover the per-option reason so the
// structured field and the flat analysis say the same thing once each.
function bankOptionReason(bankAnalysis = "", value = "") {
  const line = String(bankAnalysis)
    .split(/\n\s*\n/)
    .find((part) => part.startsWith(`选项${value}（`));
  if (!line) return "";
  const separator = line.indexOf("：");
  return separator >= 0 ? line.slice(separator + 1).trim() : "";
}

function publicReviewFields(question = {}) {
  const revisedFeedback = require("./assessments/v14-c3-feedback-r1").review(question);
  const allOptions = Array.isArray(question.options) ? question.options : [];
  // "我不会" is a self-report, not a choice to be explained. It must never get an
  // option-level reason ("选项__unknown__ 不应选" is not student-facing text).
  const options = allOptions.filter(
    (option) => String(option?.value ?? "") !== UNKNOWN_OPTION_VALUE
  );
  const unknownOption = allOptions.find(
    (option) => String(option?.value ?? "") === UNKNOWN_OPTION_VALUE
  ) || null;
  const answerValues = new Set(
    (Array.isArray(question.answer) ? question.answer : [question.answer])
      .filter((value) => value !== undefined && value !== null && value !== "")
      .map((value) => String(value))
  );
  const baseAnalysis = String(
    question.analysis
      || question.referenceAnswer
      || question.answerText
      || question.explanation
      || ""
  ).trim();
  const correctList = Array.from(answerValues).join("、") || "题目要求的答案";
  const explicitFeedback = question.optionFeedback || question.optionExplanations;
  const optionFeedback = options.map((option, index) => {
    const value = String(option?.value ?? "");
    const isCorrect = answerValues.has(value);
    const explicit = Array.isArray(explicitFeedback)
      ? explicitFeedback[index]
      : explicitFeedback && typeof explicitFeedback === "object"
        ? explicitFeedback[value]
        : "";
    // Priority: author-supplied reason -> versioned feedback bank -> generic.
    // The whole-question analysis must NOT be appended here. Doing that repeated
    // the same paragraph once per option, and then `analysis` concatenated those
    // repeats, so a five-option question showed the identical text five times.
    const reason = String(explicit || "").trim()
      || bankOptionReason(revisedFeedback?.analysis, value)
      || (isCorrect
        ? `选项${value}符合题干给出的条件。`
        : `选项${value}与题干给出的条件不符；本题应选${correctList}。`);
    return {
      value,
      label: String(option?.label || ""),
      isCorrect,
      reason
    };
  });
  // One authoritative explanation, stated once. The bank's own text is kept
  // verbatim (a frozen instrument asserts its exact shape); only the fallback
  // path changed, and it no longer re-states itself once per option.
  const fallbackAnalysis = baseAnalysis
    || (optionFeedback.length
      ? `本题应选${correctList}；每个选项的差异见下方逐项说明。`
      : "")
    || "请结合题干条件说明关键步骤，并核对答案与条件是否一致。";
  return {
    answer: Array.isArray(question.answer) ? [...question.answer] : question.answer ?? [],
    analysis: String(revisedFeedback?.analysis || fallbackAnalysis),
    commentPrompt: String(question.commentPrompt || question.rubric || ""),
    optionFeedback,
    unknownOptionLabel: String(unknownOption?.label || ""),
    explanationSource: revisedFeedback?.analysis
      ? "author_bank"
      : baseAnalysis
        ? "author"
        : optionFeedback.length ? "generated" : "fallback",
    explanationVersion: 1,
    ...(revisedFeedback || {})
  };
}

function automaticGradingRetryable(row = {}) {
  const status = String(row.status || "").trim().toLowerCase();
  const errorType = String(row.aiErrorType || row.ai_error_type || "").trim().toLowerCase();
  return status === "pending_review"
    || Number(row.isCorrect ?? row.is_correct) === -1
    || RETRYABLE_AI_ERROR_TYPES.has(errorType);
}

function authoritativeGradingQuestions(index, rows = [], options = {}) {
  return (rows || []).flatMap((row) => {
    if (options.retryableOnly && !automaticGradingRetryable(row)) return [];
    const entry = assessmentEntry(index, row);
    const question = entry?.question;
    const response = row?.response;
    if (!question || entry.assessmentStatus === "archived"
      || question.type !== "short_answer" || response === "__unknown__"
      || response === undefined || response === null || response === "") {
      return [];
    }
    return [{
      questionId: question.id,
      unitId: row.unitId || row.unit_id || entry.unitId,
      chapterId: row.chapterId || row.chapter_id || entry.chapterId,
      questionType: question.type,
      questionText: question.question || question.prompt || question.title || question.text || "",
      referenceAnswer: question.referenceAnswer || question.answerText || question.analysis || "",
      rubric: question.rubric || question.commentPrompt || "",
      concepts: studentFacingConcepts(index, question.knowledgePointIds || question.concepts || question.tags),
      points: Math.max(0, Number(question.points || 0)),
      response: typeof response === "string" ? response : JSON.stringify(response)
    }];
  });
}

module.exports = {
  automaticGradingRetryable,
  assessmentEntry,
  assessmentEntriesForUnit,
  assessmentFingerprint,
  authoritativeGradingQuestions,
  buildAssessmentIndex,
  buildPublicLearningRoute,
  publicReviewFields,
  scoreObjectiveQuestion
};
