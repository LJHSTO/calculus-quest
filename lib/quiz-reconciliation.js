const DEFAULT_FALLBACK_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function valueFrom(record = {}, ...keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") return record[key];
  }
  return "";
}

function timestampFor(record = {}, snapshot = {}, fallbackTimestamp = "") {
  const value = valueFrom(record, "timestamp", "createdAt", "created_at", "submittedAt")
    || valueFrom(snapshot, "capturedAt", "clientCapturedAt")
    || fallbackTimestamp
    || DEFAULT_FALLBACK_TIMESTAMP;
  return Number.isFinite(Date.parse(String(value))) ? String(value) : DEFAULT_FALLBACK_TIMESTAMP;
}

function responseFor(question = {}, value) {
  if (question.type === "multiple") {
    let source = value;
    if (typeof source === "string" && source.trim().startsWith("[")) {
      try { source = JSON.parse(source); } catch {}
    }
    return Array.isArray(source)
      ? Array.from(new Set(source.map((item) => String(item).trim()).filter(Boolean))).slice(0, 30)
      : [];
  }
  return String(value ?? "").trim().slice(0, 12000);
}

function responseHasValue(question = {}, response) {
  return question.type === "multiple"
    ? Array.isArray(response) && response.length > 0
    : String(response || "").trim() !== "";
}

function recordTimestamp(record = {}) {
  return Date.parse(String(valueFrom(record, "timestamp", "createdAt", "created_at", "submittedAt") || "")) || 0;
}

function snapshotQuizRecords(snapshot = {}) {
  const records = [];
  if (Array.isArray(snapshot.quizResults)) records.push(...snapshot.quizResults);
  const attempts = snapshot.quizAttempts && typeof snapshot.quizAttempts === "object" && !Array.isArray(snapshot.quizAttempts)
    ? snapshot.quizAttempts
    : {};
  Object.values(attempts).forEach((attempt) => {
    if (Array.isArray(attempt?.records)) records.push(...attempt.records);
  });
  return records;
}

function buildSnapshotQuizRecords({
  userId,
  generation,
  snapshot = {},
  assessmentIndex,
  courseAssessment,
  fallbackTimestamp = ""
} = {}) {
  const submittedUnits = new Set(
    (Array.isArray(snapshot.submittedQuizzes) ? snapshot.submittedQuizzes : [])
      .map((unitId) => String(unitId || "").trim())
      .filter(Boolean)
  );
  const latestByQuestion = new Map();
  snapshotQuizRecords(snapshot).forEach((record) => {
    const unitId = String(valueFrom(record, "unitId", "unit_id") || "").trim();
    const questionId = String(valueFrom(record, "questionId", "question_id") || "").trim();
    if (!unitId || !questionId || !submittedUnits.has(unitId)) return;
    const previous = latestByQuestion.get(`${unitId}\u001f${questionId}`);
    if (!previous || recordTimestamp(record) >= recordTimestamp(previous)) {
      latestByQuestion.set(`${unitId}\u001f${questionId}`, record);
    }
  });

  const records = [];
  latestByQuestion.forEach((source) => {
    const unitId = String(valueFrom(source, "unitId", "unit_id") || "").trim();
    const questionId = String(valueFrom(source, "questionId", "question_id") || "").trim();
    const chapterId = String(valueFrom(source, "chapterId", "chapter_id") || "").trim();
    const phase = String(source.phase || "").trim();
    const entry = courseAssessment?.assessmentEntry?.(assessmentIndex, {
      chapterId,
      unitId,
      questionId,
      phase
    });
    if (!entry?.question) return;

    const question = entry.question;
    // `answer` is the private answer key copied onto some legacy client rows;
    // only reconcile the learner's submitted response.
    const response = responseFor(question, valueFrom(source, "response"));
    if (!responseHasValue(question, response)) return;

    const maxScore = Math.max(0, Number(question.points || 0));
    const shortAnswer = question.type === "short_answer";
    const scored = shortAnswer
      ? { isCorrect: -1, score: 0, status: "pending_review" }
      : courseAssessment.scoreObjectiveQuestion(question, response);
    records.push({
      id: `${userId}-g${Number(generation)}-${entry.unitId}-${question.id}`,
      user_id: userId,
      chapter_id: entry.chapterId,
      chapter_label: entry.chapterLabel || "",
      unit_id: entry.unitId,
      unit_label: entry.unitLabel || "",
      question_id: question.id,
      question_type: question.type,
      phase: entry.phase,
      points: maxScore,
      response,
      is_correct: scored.isCorrect === true ? 1 : scored.isCorrect === false ? 0 : -1,
      status: scored.status || (shortAnswer ? "pending_review" : ""),
      score: scored.score || 0,
      max_score: maxScore,
      learning_generation: Number(generation),
      created_at: timestampFor(source, snapshot, fallbackTimestamp)
    });
  });
  return records;
}

function reconcileSnapshotQuizResults(options = {}) {
  const records = buildSnapshotQuizRecords(options);
  const result = options.db?.insertQuizResultsIfMissing?.(records) || { inserted: 0, skipped: 0 };
  return { ...result, candidates: records.length };
}

module.exports = {
  buildSnapshotQuizRecords,
  reconcileSnapshotQuizResults
};
