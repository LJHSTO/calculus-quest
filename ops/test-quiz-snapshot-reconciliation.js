const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-quiz-reconciliation-"));
  process.env.DB_PATH = path.join(tempDir, "quiz-reconciliation.db");
  const db = require("../db");
  const courseAssessment = require("../lib/course-assessment");
  const reconciliation = require("../lib/quiz-reconciliation");
  const route = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "multi-scene-learning-route.json"), "utf8")
  );
  const assessmentIndex = courseAssessment.buildAssessmentIndex(route);
  const chapter = route.chapters[0];
  const unitId = `${chapter.id}-pre`;
  const entries = courseAssessment.assessmentEntriesForUnit(assessmentIndex, {
    chapterId: chapter.id,
    unitId,
    phase: "pre"
  });
  const objectiveEntry = entries.find((entry) => entry.question.type !== "short_answer");
  const shortEntry = entries.find((entry) => entry.question.type === "short_answer");
  assert.ok(objectiveEntry && shortEntry, "the first pretest must contain objective and short-answer questions");

  const userId = "snapshot-reconciliation-user";
  const createdAt = "2026-08-19T10:00:00.000+08:00";
  const snapshot = {
    submittedQuizzes: [unitId],
    capturedAt: createdAt,
    quizResults: [
      {
        id: "legacy-client-objective-id",
        unitId,
        chapterId: chapter.id,
        phase: "pre",
        questionId: objectiveEntry.question.id,
        response: objectiveEntry.question.type === "multiple"
          ? objectiveEntry.question.answer
          : objectiveEntry.question.answer?.[0],
        isCorrect: false,
        score: 0,
        status: "incorrect",
        timestamp: createdAt
      },
      {
        id: "legacy-client-short-id",
        unitId,
        chapterId: chapter.id,
        phase: "pre",
        questionId: shortEntry.question.id,
        response: "我会说明导数的定义、变化率和判断依据。",
        isCorrect: false,
        score: shortEntry.question.points,
        status: "ai_reviewed",
        aiErrorType: "api_timeout",
        timestamp: "2026-08-19T10:01:00.000+08:00"
      },
      {
        id: "legacy-client-invalid-question",
        unitId,
        chapterId: chapter.id,
        phase: "pre",
        questionId: "not-in-current-assessment",
        response: "不应进入权威测验表。",
        timestamp: createdAt
      }
    ],
    quizAttempts: {
      [unitId]: {
        submittedAt: createdAt,
        records: [{
          id: "duplicated-attempt-record",
          unitId,
          chapterId: chapter.id,
          phase: "pre",
          questionId: shortEntry.question.id,
          response: "我会说明导数的定义、变化率和判断依据。",
          timestamp: "2026-08-19T10:01:00.000+08:00"
        }]
      }
    }
  };

  await db.getDb();
  db.upsertUser(userId, "快照对账测试", createdAt, createdAt);

  const first = reconciliation.reconcileSnapshotQuizResults({
    db,
    userId,
    generation: 1,
    snapshot,
    assessmentIndex,
    courseAssessment,
    fallbackTimestamp: createdAt
  });
  assert.equal(first.candidates, 2, "only valid submitted questions should become candidates");
  assert.equal(first.inserted, 2);

  const rows = db.getDbSync().exec(
    `SELECT id, question_id, question_type, is_correct, status, score, max_score
     FROM quiz_results WHERE user_id = ? ORDER BY question_id`,
    [userId]
  )[0].values;
  assert.equal(rows.length, 2);
  const objectiveRow = rows.find((row) => row[1] === objectiveEntry.question.id);
  const shortRow = rows.find((row) => row[1] === shortEntry.question.id);
  assert.deepEqual(objectiveRow.slice(2), [objectiveEntry.question.type, 1, "correct", objectiveEntry.question.points, objectiveEntry.question.points]);
  assert.deepEqual(shortRow.slice(2), ["short_answer", -1, "pending_review", 0, shortEntry.question.points]);
  assert.match(shortRow[0], new RegExp(`^${userId}-g1-${unitId}-`));

  const repeat = reconciliation.reconcileSnapshotQuizResults({
    db,
    userId,
    generation: 1,
    snapshot,
    assessmentIndex,
    courseAssessment,
    fallbackTimestamp: createdAt
  });
  assert.equal(repeat.inserted, 0, "reconciliation must be idempotent");
  assert.equal(repeat.skipped, 2);

  db.getDbSync().run(
    "UPDATE quiz_results SET score = 0, is_correct = 0, status = 'manual_hold' WHERE id = ?",
    [objectiveRow[0]]
  );
  const afterExisting = reconciliation.reconcileSnapshotQuizResults({
    db,
    userId,
    generation: 1,
    snapshot,
    assessmentIndex,
    courseAssessment,
    fallbackTimestamp: createdAt
  });
  assert.equal(afterExisting.inserted, 0);
  const preserved = db.getDbSync().exec(
    "SELECT score, is_correct, status FROM quiz_results WHERE id = ?",
    [objectiveRow[0]]
  )[0].values[0];
  assert.deepEqual(preserved, [0, 0, "manual_hold"], "existing historical evidence must not be overwritten");

  const applied = db.applyQuizResultRegrade({
    quiz_result_id: shortRow[0],
    proposed_grade: {
      score: shortEntry.question.points,
      confidence: 0.96,
      errorType: "none",
      feedback: "重评完成。"
    },
    trigger_source: "test",
    llm_provider: "test",
    llm_model: "test",
    id: "reconciliation-audit",
    created_at: "2026-08-19T10:02:00.000+08:00"
  });
  assert.equal(applied.ok, true);

  const phase = db.phaseComparison();
  const pre = phase.find((row) => row.user_id === userId && row.chapter_id === chapter.id);
  assert.equal(pre.pre_count, 2);
  assert.equal(pre.pre_score, shortEntry.question.points);
  assert.equal(pre.pre_max_score, objectiveEntry.question.points + shortEntry.question.points);
  assert.equal(pre.pre_accuracy, 50, "manual_hold remains incorrect while regraded short answer counts as correct");

  const candidates = db.shortAnswerRegradeCandidates({ limit: 20 });
  assert.equal(candidates.rows.some((row) => row.id === shortRow[0]), false, "applied regrade leaves the retry queue");
  const detail = db.userDetail(userId);
  assert.equal(detail.quizOverall.totalScore, shortEntry.question.points);
  assert.equal(detail.quizOverall.pending, 0);

  const draftOnly = reconciliation.reconcileSnapshotQuizResults({
    db,
    userId: "draft-only-user",
    generation: 1,
    snapshot: {
      quizResults: [{
        unitId,
        chapterId: chapter.id,
        phase: "pre",
        questionId: shortEntry.question.id,
        response: "这是尚未提交的草稿。"
      }]
    },
    assessmentIndex,
    courseAssessment,
    fallbackTimestamp: createdAt
  });
  assert.equal(draftOnly.candidates, 0, "a draft without an explicit submitted marker must not be promoted");

  console.log("quiz snapshot reconciliation tests passed");
  db.saveNow();
  db.releaseWriteLock();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
