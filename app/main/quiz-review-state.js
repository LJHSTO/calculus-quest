(function initQuizReviewState(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.QuizReviewState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createQuizReviewState() {
  const FAILURE_TYPES = new Set([
    "api_error",
    "api_timeout",
    "parse_error",
    "empty_response",
    "mock_provider",
    "manual_fallback",
    "unknown"
  ]);
  const CONTINUE_SUFFIX = "评分暂不可用，未计分；可以继续学习，之后可重新评分或人工复核。";
  const FAILED_FEEDBACK_RE = /评分超时|评分出错|解析失败|评分.*未返回|模型接口返回了空文本|未启用真实(?:大模型|智能评分)|(?:已先按|已暂记)\s*0\s*分|fetch failed|failed to fetch/i;

  function errorType(result = {}) {
    return String(result.aiErrorType || result.ai_error_type || "").trim().toLowerCase();
  }

  function feedback(result = {}) {
    return String(result.aiFeedback || result.ai_feedback || "").trim();
  }

  function rawPending(result = {}) {
    return result.status === "pending_review" || result.isCorrect === null || result.is_correct === -1;
  }

  function aiReviewFailed(result = {}) {
    if (result.status === "grading_unavailable" || FAILURE_TYPES.has(errorType(result))) return true;
    if (FAILED_FEEDBACK_RE.test(feedback(result))) return true;
    // A manual-review recommendation is not a failed score. Without an
    // explicit failure type or legacy failure message, keep the record as
    // pending when it is unresolved and as scored when it is resolved.
    return false;
  }

  function isPending(result = {}) {
    return rawPending(result) && !aiReviewFailed(result);
  }

  function hasScoredEvidence(result = {}) {
    return !isPending(result) && !aiReviewFailed(result);
  }

  function continuationFeedback(value = "") {
    const text = String(value || "").trim().replace(/(?:已先按|已暂记)\s*0\s*分[\s\S]*$/u, "").replace(/评分暂不可用，未计分[\s\S]*$/u, "");
    const prefix = text ? `${text.replace(/[。.!！？?\s]+$/u, "")}。` : "";
    return `${prefix}${CONTINUE_SUFFIX}`;
  }

  function normalizeFailed(result = {}) {
    if (!aiReviewFailed(result)) return result;
    if (result.status === "grading_unavailable" && result.score === null && result.aiScore === null && result.isCorrect === null && result.fallbackScored === false) return result;
    return {
      ...result,
      aiScore: null,
      aiConfidence: Number(result.aiConfidence ?? result.ai_confidence ?? 0) || 0,
      aiFeedback: continuationFeedback(feedback(result)),
      aiErrorType: errorType(result) || "unknown",
      aiNeedsReview: true,
      status: "grading_unavailable",
      isCorrect: null,
      score: null,
      fallbackScored: false
    };
  }

  return {
    FAILURE_TYPES,
    aiReviewFailed,
    continuationFeedback,
    errorType,
    feedback,
    hasScoredEvidence,
    isPending,
    normalizeFailed,
    rawPending
  };
});
