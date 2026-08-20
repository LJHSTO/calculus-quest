const FAILURE_TYPES = new Set([
  "api_error",
  "api_timeout",
  "parse_error",
  "empty_response",
  "mock_provider",
  "manual_fallback",
  "unknown"
]);

const FAILURE_PATTERNS = [
  "评分出错",
  "评分超时",
  "解析失败",
  "模型接口返回了空文本",
  "未启用真实大模型",
  "已先按 0 分计入",
  "已暂记 0 分"
];

const DEFAULT_FALLBACK_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function valueFrom(record = {}, ...keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") return record[key];
  }
  return "";
}

function finiteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedQuestionText(value) {
  return String(value || "")
    .replace(/^\s*【[^】]{1,80}】\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedAnswerValues(value) {
  const values = Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];
  return values
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .sort();
}

function snapshotQuestionMatches(record = {}, question = {}) {
  const suppliedType = valueFrom(record, "questionType", "question_type", "mode");
  if (
    String(suppliedType || "").trim()
    && String(suppliedType).trim().toLowerCase() !== String(question.type || "").trim().toLowerCase()
  ) {
    return false;
  }

  const suppliedText = valueFrom(record, "questionText", "question_text");
  const authoritativeText = question.question || question.prompt || question.title || question.text || "";
  if (
    String(suppliedText || "").trim()
    && normalizedQuestionText(suppliedText) !== normalizedQuestionText(authoritativeText)
  ) {
    return false;
  }

  const suppliedMaxScore = finiteNumber(valueFrom(record, "maxScore", "max_score"));
  if (
    suppliedMaxScore !== null
    && Math.abs(suppliedMaxScore - Math.max(0, Number(question.points || 0))) > 1e-9
  ) {
    return false;
  }

  if (question.type !== "short_answer" && Object.prototype.hasOwnProperty.call(record, "answer")) {
    if (
      JSON.stringify(normalizedAnswerValues(record.answer))
      !== JSON.stringify(normalizedAnswerValues(question.answer))
    ) {
      return false;
    }
  }
  return true;
}

function normalizeMultipleResponse(value) {
  let source = value;
  if (typeof source === "string" && source.trim().startsWith("[")) {
    try { source = JSON.parse(source); } catch { source = []; }
  }
  return Array.isArray(source)
    ? Array.from(new Set(source.map((item) => String(item ?? "").trim()).filter(Boolean))).slice(0, 30)
    : [];
}

function normalizeResponse(question = {}, value) {
  if (question.type === "multiple") return normalizeMultipleResponse(value);
  if (Array.isArray(value)) return value.length ? String(value[0] ?? "").trim().slice(0, 12000) : "";
  return String(value ?? "").trim().slice(0, 12000);
}

function responsePresent(question = {}, response) {
  return question.type === "multiple"
    ? Array.isArray(response) && response.length > 0
    : String(response ?? "").trim() !== "";
}

function normalizedErrorType(record = {}) {
  const value = String(valueFrom(record, "aiErrorType", "ai_error_type") || "")
    .trim()
    .toLowerCase();
  return ["", "none", "no_error"].includes(value) ? "" : value;
}

function hasFailedReview(record = {}) {
  const feedback = String(valueFrom(record, "aiFeedback", "ai_feedback") || "");
  return FAILURE_TYPES.has(normalizedErrorType(record))
    || record.fallbackScored === true
    || FAILURE_PATTERNS.some((pattern) => feedback.includes(pattern));
}

function hasGradingState(record = {}) {
  return (
    valueFrom(record, "aiScore", "ai_score") !== ""
    || Boolean(normalizedErrorType(record))
    || record.fallbackScored === true
    || String(record.status || "").trim().toLowerCase() === "ai_reviewed"
    || String(valueFrom(record, "aiFeedback", "ai_feedback") || "").trim() !== ""
  );
}

function recordTimestamp(record = {}) {
  return Date.parse(String(valueFrom(
    record,
    "timestamp",
    "createdAt",
    "created_at",
    "submittedAt"
  ) || "")) || 0;
}

function validTimestamp(value, fallback = "") {
  const candidate = String(value || "").trim();
  if (candidate && Number.isFinite(Date.parse(candidate))) return candidate;
  const fallbackValue = String(fallback || "").trim();
  return fallbackValue && Number.isFinite(Date.parse(fallbackValue))
    ? fallbackValue
    : DEFAULT_FALLBACK_TIMESTAMP;
}

function boundedScore(value, maxScore) {
  const number = finiteNumber(value);
  if (number === null) return null;
  const max = Math.max(0, Number(maxScore || 0));
  const bounded = max ? Math.max(0, Math.min(max, number)) : Math.max(0, number);
  return Math.round(bounded * 10) / 10;
}

function snapshotRecordCandidates(snapshot = {}) {
  const candidates = [];
  const attempts = snapshot.quizAttempts
    && typeof snapshot.quizAttempts === "object"
    && !Array.isArray(snapshot.quizAttempts)
    ? snapshot.quizAttempts
    : {};

  Object.entries(attempts).forEach(([attemptUnitId, attempt]) => {
    if (!Array.isArray(attempt?.records)) return;
    attempt.records.forEach((record) => {
      candidates.push({
        record: {
          ...record,
          unitId: valueFrom(record, "unitId", "unit_id") || attemptUnitId,
          chapterId: valueFrom(record, "chapterId", "chapter_id") || attempt.chapterId || attempt.chapter_id || "",
          phase: valueFrom(record, "phase", "assessment_phase") || attempt.phase || attempt.assessmentPhase || ""
        },
        fallbackCreatedAt: attempt.submittedAt || attempt.submitted_at || ""
      });
    });
  });

  if (Array.isArray(snapshot.quizResults)) {
    snapshot.quizResults.forEach((record) => {
      candidates.push({
        record,
        fallbackCreatedAt: snapshot.capturedAt || snapshot.clientCapturedAt || ""
      });
    });
  }
  return candidates;
}

function buildSnapshotQuizRecords({
  userId = "",
  generation = 1,
  snapshot = {},
  assessmentIndex,
  courseAssessment,
  assessmentFingerprint = "",
  fallbackTimestamp = ""
} = {}) {
  const normalizedUserId = String(userId || "").trim();
  const resolvedGeneration = Number(generation);
  if (!normalizedUserId || !Number.isInteger(resolvedGeneration) || resolvedGeneration < 1) return [];
  if (!assessmentIndex || !courseAssessment?.assessmentEntry) return [];

  const snapshotFingerprint = String(snapshot.courseAssessmentFingerprint || "").trim();
  const expectedFingerprint = String(assessmentFingerprint || "").trim();
  if (snapshotFingerprint && expectedFingerprint && snapshotFingerprint !== expectedFingerprint) return [];

  const submittedUnits = new Set(
    (Array.isArray(snapshot.submittedQuizzes) ? snapshot.submittedQuizzes : [])
      .map((unitId) => String(unitId || "").trim())
      .filter(Boolean)
  );
  const latestByQuestion = new Map();
  snapshotRecordCandidates(snapshot).forEach(({ record, fallbackCreatedAt }) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) return;
    const unitId = String(valueFrom(record, "unitId", "unit_id") || "").trim();
    const questionId = String(valueFrom(record, "questionId", "question_id") || "").trim();
    if (!unitId || !questionId || !submittedUnits.has(unitId)) return;
    const key = `${unitId}\u001f${questionId}`;
    const previous = latestByQuestion.get(key);
    const candidate = { ...record, _fallbackCreatedAt: fallbackCreatedAt };
    if (
      !previous
      || hasGradingState(candidate) && !hasGradingState(previous)
      || hasGradingState(candidate) === hasGradingState(previous)
        && recordTimestamp(candidate) >= recordTimestamp(previous)
    ) {
      latestByQuestion.set(key, candidate);
    }
  });

  const records = [];
  latestByQuestion.forEach((source) => {
    const unitId = String(valueFrom(source, "unitId", "unit_id") || "").trim();
    const questionId = String(valueFrom(source, "questionId", "question_id") || "").trim();
    const chapterId = String(valueFrom(source, "chapterId", "chapter_id") || "").trim();
    const phase = String(valueFrom(source, "phase", "assessment_phase") || "").trim();
    const entry = courseAssessment.assessmentEntry(assessmentIndex, {
      chapterId,
      unitId,
      questionId,
      phase
    });
    if (!entry?.question || !snapshotQuestionMatches(source, entry.question)) return;

    const question = entry.question;
    const response = normalizeResponse(question, valueFrom(source, "response"));
    if (!responsePresent(question, response)) return;

    const maxScore = Math.max(0, Number(question.points || 0));
    const base = {
      id: `${normalizedUserId}-g${resolvedGeneration}-${entry.unitId}-${question.id}`,
      user_id: normalizedUserId,
      chapter_id: entry.chapterId,
      chapter_label: entry.chapterLabel || "",
      unit_id: entry.unitId,
      unit_label: entry.unitLabel || "",
      question_id: question.id,
      question_type: question.type,
      phase: entry.phase,
      points: maxScore,
      response,
      max_score: maxScore,
      learning_generation: resolvedGeneration,
      created_at: validTimestamp(
        valueFrom(source, "timestamp", "createdAt", "created_at", "submittedAt"),
        source._fallbackCreatedAt || snapshot.capturedAt || fallbackTimestamp
      ),
      ai_score: null,
      ai_confidence: null,
      ai_feedback: "",
      ai_error_type: ""
    };

    if (question.type !== "short_answer") {
      const scored = courseAssessment.scoreObjectiveQuestion(question, response);
      records.push({
        ...base,
        is_correct: scored.isCorrect ? 1 : 0,
        status: scored.status || (scored.isCorrect ? "correct" : "incorrect"),
        score: scored.score,
        max_score: scored.maxScore
      });
      return;
    }

    const failed = hasFailedReview(source);
    const aiScore = boundedScore(valueFrom(source, "aiScore", "ai_score"), maxScore);
    const graded = aiScore !== null || failed;
    const resolvedScore = aiScore === null && failed ? 0 : aiScore;
    const rawConfidence = finiteNumber(valueFrom(source, "aiConfidence", "ai_confidence"));
    const aiConfidence = graded
      ? Math.max(0, Math.min(1, rawConfidence === null ? 0 : rawConfidence))
      : null;
    const suppliedCorrect = Object.prototype.hasOwnProperty.call(source, "isCorrect")
      ? source.isCorrect
      : source.is_correct;
    const hasSuppliedCorrect = suppliedCorrect !== undefined
      && suppliedCorrect !== null
      && suppliedCorrect !== "";
    const isCorrect = failed
      ? 0
      : hasSuppliedCorrect && (suppliedCorrect === true || Number(suppliedCorrect) === 1)
        ? 1
        : hasSuppliedCorrect && (suppliedCorrect === false || Number(suppliedCorrect) === 0)
          ? 0
          : resolvedScore !== null && maxScore > 0 && resolvedScore >= maxScore * 0.6
            ? 1
            : graded
              ? 0
              : -1;
    records.push({
      ...base,
      is_correct: isCorrect,
      status: graded ? "ai_reviewed" : "pending_review",
      score: resolvedScore === null ? 0 : resolvedScore,
      ai_score: resolvedScore,
      ai_confidence: aiConfidence,
      ai_feedback: String(valueFrom(source, "aiFeedback", "ai_feedback") || "").slice(0, 4000),
      ai_error_type: normalizedErrorType(source) || (failed ? "unknown" : "")
    });
  });
  return records;
}

function reconcileSnapshotQuizResults(options = {}) {
  const records = buildSnapshotQuizRecords(options);
  const result = options.db?.reconcileQuizResults?.(records)
    || { inserted: 0, updated: 0, skipped: records.length, total: records.length };
  return { ...result, candidates: records.length };
}

module.exports = {
  buildSnapshotQuizRecords,
  hasFailedReview,
  reconcileSnapshotQuizResults,
  snapshotQuestionMatches
};
