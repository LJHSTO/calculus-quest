const assert = require("node:assert/strict");

const kg = require("../lib/kg");
const grading = require("../lib/agents/grading");
const orchestrator = require("../lib/agent-orchestrator");
const { buildQuizAttemptSummary } = require("../lib/learning-assistant");

const failed = {
  chapter_id: "V14-C1",
  unit_id: "V14-C1-pre",
  phase: "pre",
  question_id: "failed-q",
  is_correct: 0,
  score: 0,
  max_score: 2,
  ai_error_type: "api_timeout",
  ai_feedback: "已暂记 0 分"
};
const realWrong = {
  ...failed,
  question_id: "real-wrong-q",
  ai_error_type: "none",
  ai_feedback: "计算步骤有误"
};

assert.equal(kg.aiReviewUnavailable(failed), true);
assert.equal(kg.aiReviewUnavailable(realWrong), false);
assert.equal(kg.aiReviewUnavailable({
  ...realWrong,
  question_id: "scored-review-note",
  is_correct: 1,
  ai_feedback: "评分完成，但建议人工复核表达质量。"
}), false, "有效评分附带人工复核建议仍应参与学习分析");
assert.equal(kg.aiReviewUnavailable({
  ...realWrong,
  question_id: "legacy-empty-response",
  ai_error_type: "",
  ai_feedback: "模型接口返回了空文本。"
}), true, "旧版空返回文案仍应保留为待复核");
const summary = kg.summariseQuizResults([failed, realWrong]);
assert.equal(summary.reviewUnavailable, 1);
assert.deepEqual(summary.byChapter, [{
  chapterId: "V14-C1",
  phase: "pre",
  correct: 0,
  total: 1,
  accuracy: 0
}]);
assert.deepEqual(summary.wrongConcepts, [{ tag: "real-wrong-q", count: 1 }]);

assert.equal(grading.isUnavailableGradingResult({ errorType: "api_timeout", score: 0 }), true);
assert.equal(grading.isUnavailableGradingResult({ errorType: "none", score: 0 }), false);
assert.equal(grading.isUnavailableGradingResult({
  errorType: "none",
  score: 1,
  feedback: "评分完成，但建议人工复核表达质量。"
}), false, "人工复核建议不能覆盖有效评分");
assert.equal(grading.isUnavailableGradingResult({
  errorType: "",
  score: 0,
  feedback: "未启用真实大模型，已先按 0 分计入。"
}), true, "旧版 mock/暂记文案仍应视为评分不可用");
assert.deepEqual(
  orchestrator._internals.gradingEvidenceForDecision([
    { questionId: "failed", errorType: "api_timeout", score: 0 },
    { questionId: "wrong", errorType: "none", score: 0 }
  ]).map((item) => item.questionId),
  ["wrong"]
);

const resolved = {
  isQuiz: true,
  unit: {
    phase: "pre",
    quizQuestions: [
      { id: "failed-q", type: "short_answer", points: 2, question: "解释" },
      { id: "real-wrong-q", type: "single", points: 1, question: "选择" }
    ]
  }
};
const assistantSummary = buildQuizAttemptSummary({
  resolved,
  results: [
    failed,
    { ...realWrong, question_id: "real-wrong-q", question_type: "single", response: "A" }
  ]
});
assert.equal(assistantSummary.incorrect, 1);
assert.equal(assistantSummary.pendingReview, 0);
assert.equal(assistantSummary.reviewUnavailable, 1);
assert.equal(assistantSummary.incorrectItems[0].questionId, "real-wrong-q");
assert.equal(assistantSummary.pendingItems[0].questionId, "failed-q");

const validWithReviewNote = buildQuizAttemptSummary({
  resolved,
  results: [{
    ...realWrong,
    question_id: "real-wrong-q",
    question_type: "short_answer",
    is_correct: 0,
    ai_error_type: "none",
    ai_score: 0,
    ai_feedback: "评分完成，但建议人工复核表达质量。"
  }]
});
assert.equal(validWithReviewNote.reviewUnavailable, 0);
assert.equal(validWithReviewNote.incorrect, 1);

console.log("score evidence tests passed");
