"use strict";
// Runnable check for the B3 guard: an applied regrade must survive a stale
// client snapshot. Without the guard, a regraded short-answer row whose new
// ai_confidence stays below the review threshold remains "needs review" and the
// snapshot reconcile overwrites the regraded score with the pre-regrade value.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-regrade-guard-"));
process.env.DB_PATH = path.join(tmpDir, "guard.db");

const db = require("../db");

const userId = "regrade-guard-user";
const quizResultId = "regrade-guard-result";

async function main() {
await db.getDb();
db.upsertUser(userId, "回归用户", new Date().toISOString(), new Date().toISOString());

db.insertQuizResult({
  id: quizResultId,
  user_id: userId,
  chapter_id: "V14-C1",
  chapter_label: "函数与极限",
  unit_id: "V14-C1-post",
  unit_label: "函数与极限 · 后测",
  question_id: "V14-C1-fl-r2-post-10",
  question_type: "short_answer",
  phase: "post",
  points: 10,
  response: "我的作答",
  is_correct: -1,
  status: "pending_review",
  score: 0,
  max_score: 10,
  learning_generation: 1,
  ai_score: null,
  ai_confidence: null,
  ai_feedback: "",
  created_at: new Date().toISOString()
});

// The stale snapshot the browser still holds: captured before the regrade.
// reconcileQuizResults keys on user+generation+unit+question, so all of those
// must be present for the row to be considered at all.
const staleSnapshotRecord = {
  id: quizResultId,
  user_id: userId,
  learning_generation: 1,
  unit_id: "V14-C1-post",
  question_id: "V14-C1-fl-r2-post-10",
  created_at: new Date().toISOString(),
  question_type: "short_answer",
  phase: "post",
  ai_score: 0,
  ai_confidence: 0.4,
  ai_feedback: "模型评分不可用，请人工复核。",
  ai_error_type: "api_timeout",
  is_correct: 0,
  status: "ai_reviewed",
  score: 0
};

// 1. Without any regrade, the snapshot is allowed to fill in the missing grade.
const before = db.reconcileQuizResults([{ ...staleSnapshotRecord }]);
const filled = db.getQuizResultById(quizResultId);
assert.equal(before.updated, 1, "an ungraded row should accept the snapshot grade");
assert.equal(Number(filled.score), 0);

// 2. An administrator regrades it. Confidence stays low on purpose: that is the
//    condition that used to re-open the row for the stale snapshot.
const applied = db.applyQuizResultRegrade({
  id: "regrade-guard-audit",
  batch_id: "regrade-guard-batch",
  quiz_result_id: quizResultId,
  proposed_grade: {
    score: 8,
    maxScore: 10,
    confidence: 0.55,
    feedback: "人工重新评分：关键步骤正确。",
    isCorrect: true,
    errorType: ""
  },
  llm_provider: "test",
  llm_model: "test",
  created_at: new Date().toISOString()
});
assert.equal(applied.ok, true, `regrade should apply, got ${applied.code || ""}`);
const regraded = db.getQuizResultById(quizResultId);
assert.equal(Number(regraded.score), 8, "regrade should write the new score");
assert.ok(
  Number(regraded.ai_confidence) < 0.7,
  `guard scenario needs low confidence, got ${regraded.ai_confidence}`
);

// 3. The same stale snapshot arrives again (student submits, page had old data).
const after = db.reconcileQuizResults([{ ...staleSnapshotRecord }]);
const finalRow = db.getQuizResultById(quizResultId);
assert.equal(
  Number(finalRow.score), 8,
  `stale snapshot reverted the regrade: score is ${finalRow.score}, expected 8`
);
assert.equal(Number(finalRow.is_correct), 1, "stale snapshot reverted is_correct");
assert.equal(after.updated, 0, "no row should have been overwritten");
assert.equal(after.regradeProtected, 1, "the guard should report one protected row");

console.log("regrade guard OK: stale snapshot cannot revert an applied regrade");
console.log(`  ungraded row accepted snapshot : updated=${before.updated}`);
console.log(`  regrade applied                : score=${regraded.score}, confidence=${regraded.ai_confidence}`);
console.log(`  stale snapshot afterwards      : updated=${after.updated}, regradeProtected=${after.regradeProtected}, score=${finalRow.score}`);
}

main()
  .then(() => fs.rmSync(tmpDir, { recursive: true, force: true }))
  .catch((error) => {
    console.error(error);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exitCode = 1;
  });
