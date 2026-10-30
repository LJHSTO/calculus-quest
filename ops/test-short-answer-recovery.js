const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

async function testEmptyRetryResultFails() {
  const quizSource = fs.readFileSync(path.join(__dirname, "../app/main/quiz.js"), "utf8");
  const retryStart = quizSource.indexOf("async function retryFailedShortAnswer");
  const retryEnd = quizSource.indexOf("\nfunction revealQuestionAnswer", retryStart);
  assert.ok(retryStart >= 0 && retryEnd > retryStart, "short-answer retry must remain testable");
  const logs = [];
  const context = vm.createContext({
    getUnit: () => ({ id: "V14-C3-pre", label: "第三章前测" }),
    apiRequest: async () => ({ results: [] }),
    agenticApplyGradingResults: () => {},
    currentUnitId: "V14-C3-pre",
    renderQuiz: () => {},
    addLog: (message) => logs.push(message)
  });
  vm.runInContext(quizSource.slice(retryStart, retryEnd), context, {
    filename: "app/main/quiz.js"
  });
  assert.equal(
    await context.retryFailedShortAnswer("V14-C3-pre", "GH-07-pre-q5"),
    false,
    "an empty grading response must not be reported as a successful retry"
  );
  assert.equal(logs.some((message) => message.includes("已重新批改")), false);
}

function testClientFallbackEvidence(reviewState) {
  const coreSource = fs.readFileSync(path.join(__dirname, "../app/main/core.js"), "utf8");
  const helpersStart = coreSource.indexOf("function quizLatestResultsByQuestion");
  const helpersEnd = coreSource.indexOf("// Render $...$ math", helpersStart);
  assert.ok(helpersStart >= 0 && helpersEnd > helpersStart, "quiz summary helpers must remain testable");
  const context = vm.createContext({
    QuizReviewState: reviewState,
    learningQuizRecordTimestamp: () => 0
  });
  vm.runInContext(coreSource.slice(helpersStart, helpersEnd), context, {
    filename: "app/main/core.js"
  });

  const timedOut = {
    questionId: "timeout-q",
    status: "ai_reviewed",
    isCorrect: false,
    score: 0,
    maxScore: 2,
    aiScore: 0,
    aiErrorType: "api_timeout"
  };
  assert.equal(context.quizHasScoredEvidence(timedOut), false);
  assert.equal(context.quizQuestionScoreLabel({ points: 2 }, timedOut), "本题评分暂不可用（未计分；满分 2 分）");
  assert.equal(context.quizEarnedScore(timedOut, { points: 2 }), null);
  const timeoutSummary = context.summarizeQuizAttempt([timedOut], [{ id: "timeout-q", points: 2 }]);
  assert.equal(timeoutSummary.reviewUnavailable, 1);
  assert.equal(timeoutSummary.scoredQuestions, 0);
  assert.equal(timeoutSummary.scoreReady, false);
  assert.match(context.quizOutcomeHtml(timeoutSummary), /本次评分待复核/);
  assert.match(context.quizOutcomeHtml(timeoutSummary), /暂未返回评分/);

  const scoredZero = {
    questionId: "scored-zero-q",
    status: "ai_reviewed",
    isCorrect: false,
    score: 0,
    maxScore: 2,
    aiScore: 0,
    aiErrorType: "none"
  };
  assert.equal(context.quizHasScoredEvidence(scoredZero), true);
  const scoredSummary = context.summarizeQuizAttempt([scoredZero], [{ id: "scored-zero-q", points: 2 }]);
  assert.equal(scoredSummary.reviewUnavailable, 0);
  assert.equal(scoredSummary.scoredQuestions, 1);
  assert.equal(scoredSummary.scoreReady, true);
  const questions = Array.from({length:10},(_,i)=>({id:`q${i}`,type:'single',points:1})).concat([{id:'unknown',type:'short_answer',points:2},{id:'fail',type:'short_answer',points:2}]);
  const records = questions.map(q=>({questionId:q.id,questionType:q.type,isCorrect:false,score:0,maxScore:q.points,aiErrorType:'none'}));
  records[10].response='__unknown__'; records[11]={...timedOut,questionId:'fail'};
  const mixed=context.summarizeQuizAttempt(records,questions);
  assert.equal(mixed.objectiveTotal,10);assert.equal(mixed.scoredQuestions,11);assert.equal(mixed.reviewUnavailable,1);assert.equal(mixed.scoredPossible,12);
}

async function testDatabaseRecovery() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-short-answer-recovery-"));
  const dbPath = path.join(tmpDir, "recovery.db");
  process.env.DB_PATH = dbPath;
  const db = require("../db");

  try {
    await db.getDb();
    db.upsertUser("recovery-user", "恢复测试", "2026-07-23T00:00:00.000Z", "2026-07-23T00:00:00.000Z");
    db.insertQuizResult({
      id: "failed-review",
      user_id: "recovery-user",
      chapter_id: "V14-C3",
      unit_id: "V14-C3-pre",
      question_id: "GH-07-pre-q5",
      question_type: "short_answer",
      phase: "pre",
      points: 2,
      response: "测试回答",
      is_correct: -1,
      status: "pending_review",
      score: 2,
      max_score: 2,
      created_at: "2026-07-09T15:14:13.316+08:00"
    });
    db.insertQuizResult({
      id: "genuine-pending",
      user_id: "recovery-user",
      chapter_id: "V14-C3",
      unit_id: "V14-C3-pre",
      question_id: "GH-07-pre-q6",
      question_type: "short_answer",
      phase: "pre",
      points: 2,
      response: "仍在批改",
      is_correct: -1,
      status: "pending_review",
      score: 0,
      max_score: 2,
      created_at: "2026-07-09T15:14:13.317+08:00"
    });
    db.insertQuizResult({
      id: "legacy-pending-flag",
      user_id: "recovery-user",
      chapter_id: "V14-C3",
      unit_id: "V14-C3-pre",
      question_id: "GH-07-pre-q7",
      question_type: "short_answer",
      phase: "pre",
      points: 2,
      response: "旧版待批改",
      is_correct: 1,
      status: "pending_review",
      score: 0,
      max_score: 2,
      created_at: "2026-07-09T15:14:13.318+08:00"
    });
    db.insertQuizResult({
      id: "valid-reviewed-correct",
      user_id: "recovery-user",
      chapter_id: "V14-C3",
      unit_id: "V14-C3-pre",
      question_id: "GH-07-pre-q8",
      question_type: "short_answer",
      phase: "pre",
      points: 2,
      response: "已经正确评分",
      is_correct: -1,
      status: "ai_reviewed",
      score: 2,
      max_score: 2,
      created_at: "2026-07-09T15:14:13.319+08:00"
    });
    db.getDbSync().run(
      "UPDATE quiz_results SET ai_error_type = 'api_error', ai_feedback = '评分出错：fetch failed' WHERE id = 'failed-review'"
    );
    db.getDbSync().run(
      "UPDATE quiz_results SET ai_score = 2 WHERE id = 'valid-reviewed-correct'"
    );

    const legacyFlags = db.normalizeLegacyPendingShortAnswerFlags();
    assert.equal(legacyFlags, 1);
    const flagRows = db.getDbSync().exec(
      "SELECT id, is_correct FROM quiz_results WHERE id IN ('legacy-pending-flag', 'valid-reviewed-correct') ORDER BY id"
    )[0].values;
    assert.deepEqual(flagRows, [
      ["legacy-pending-flag", -1],
      ["valid-reviewed-correct", -1]
    ]);
    const reviewedFlags = db.normalizeReviewedShortAnswerFlags();
    assert.equal(reviewedFlags, 1);
    const restoredReviewedFlag = db.getDbSync().exec(
      "SELECT is_correct FROM quiz_results WHERE id = 'valid-reviewed-correct'"
    )[0].values[0][0];
    assert.equal(restoredReviewedFlag, 1);

    const recovered = db.normalizeFailedPendingQuizReviews();
    assert.equal(recovered, 1, "only explicit AI failures should be normalised");

    const failed = db.getDbSync().exec(
      "SELECT status, is_correct, score, ai_score, ai_error_type, ai_feedback FROM quiz_results WHERE id = 'failed-review'"
    )[0].values[0];
    assert.deepEqual(failed.slice(0, 5), ["grading_unavailable", -1, null, null, "api_error"]);
    assert.match(failed[5], /未计分/);

    const updatedIds = db.updateQuizResultAiGrading("GH-07-pre-q5", "recovery-user", {
      unitId: "V14-C3-pre",
      aiScore: 2,
      aiConfidence: 0.98,
      aiFeedback: "重新批改成功。",
      aiErrorType: "none"
    });
    assert.deepEqual(updatedIds, ["failed-review"], "评分应返回实际更新的作答标识供审计绑定");
    const retried = db.getDbSync().exec(
      "SELECT status, is_correct, score, ai_score, ai_error_type FROM quiz_results WHERE id = 'failed-review'"
    )[0].values[0];
    assert.deepEqual(retried, ["ai_reviewed", 1, 2, 2, "none"], "explicit AI failures must be safely regradable");

    const pending = db.getDbSync().exec(
      "SELECT status, is_correct, ai_score, ai_error_type FROM quiz_results WHERE id = 'genuine-pending'"
    )[0].values[0];
    assert.deepEqual(pending, ["pending_review", -1, null, ""]);

    db.updateQuizResultAiGrading("GH-07-pre-q6", "recovery-user", {
      unitId: "V14-C3-pre",
      aiScore: null,
      aiConfidence: 0,
      aiFeedback: "评分出错：fetch failed",
      aiErrorType: "api_error"
    });
    const futureFailure = db.getDbSync().exec(
      "SELECT status, is_correct, score, ai_score FROM quiz_results WHERE id = 'genuine-pending'"
    )[0].values[0];
    assert.deepEqual(futureFailure, ["grading_unavailable", -1, null, null]);
    assert.equal(db.normalizeFailedPendingQuizReviews(),0,'normalization is idempotent');
  } finally {
    db.saveNow();
    db.releaseWriteLock();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  await testEmptyRetryResultFails();
  const reviewState = require("../app/main/quiz-review-state");
  const failedPending = {
    questionType: "short_answer",
    status: "pending_review",
    isCorrect: null,
    score: 2,
    aiScore: null,
    aiErrorType: "api_error",
    aiFeedback: "评分出错：fetch failed"
  };
  assert.equal(reviewState.aiReviewFailed(failedPending), true);
  assert.equal(reviewState.isPending(failedPending), false);
  assert.equal(reviewState.hasScoredEvidence(failedPending), false);
  assert.deepEqual(
    reviewState.normalizeFailed(failedPending),
    {
      ...failedPending,
      aiScore: null,
      aiConfidence: 0,
      aiFeedback: "评分出错：fetch failed。评分暂不可用，未计分；可以继续学习，之后可重新评分或人工复核。",
      aiErrorType: "api_error",
      aiNeedsReview: true,
      status: "grading_unavailable",
      isCorrect: null,
      score: null,
      fallbackScored: false
    }
  );
  assert.equal(
    reviewState.isPending({ status: "pending_review", isCorrect: null, aiErrorType: "" }),
    true
  );
  assert.equal(
    reviewState.aiReviewFailed({
      status: "ai_reviewed",
      isCorrect: false,
      aiScore: 0,
      aiErrorType: "empty_response",
      aiFeedback: "模型接口返回了空文本。"
    }),
    true
  );
  assert.equal(
    reviewState.aiReviewFailed({
      status: "ai_reviewed",
      isCorrect: true,
      aiScore: 2,
      aiErrorType: "none",
      aiFeedback: "评分完成，但建议人工复核表达质量。"
    }),
    false
  );
  assert.equal(
    reviewState.aiReviewFailed({
      status: "ai_reviewed",
      isCorrect: false,
      aiScore: 0,
      aiErrorType: "",
      aiFeedback: "已先按 0 分计入，不影响继续学习。"
    }),
    true,
    "旧版暂记 0 分文案即使缺少错误类型也应保留待复核"
  );
  assert.equal(
    reviewState.isPending({
      status: "pending_review",
      isCorrect: null,
      aiErrorType: "",
      aiFeedback: "评分完成，但建议人工复核表达质量。"
    }),
    true,
    "仅有人工复核建议时应保持真正待复核，而不是伪造失败 0 分"
  );
  testClientFallbackEvidence(reviewState);

  const agenticSource = fs.readFileSync(path.join(__dirname, "../app/main/agentic-path.js"), "utf8");
  const eventsSource = fs.readFileSync(path.join(__dirname, "../app/main/events.js"), "utf8");
  assert.match(agenticSource, /const recoveryAvailable = pending\.gradingRecoveryAvailable === true/);
  assert.match(agenticSource, /data-agentic-grading-action="retry"/);
  assert.match(agenticSource, /data-agentic-grading-action="continue"/);
  assert.match(agenticSource, /recoveryAvailable\s*\?/);
  assert.match(agenticSource, /async function agenticRecoverInterruptedGrading/);
  assert.match(eventsSource, /data-agentic-grading-action/);

  await testDatabaseRecovery();
  console.log("short answer recovery tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
