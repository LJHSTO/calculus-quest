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
  const CONTINUE_SUFFIX = "已暂记 0 分，可继续学习；该暂记分数不会用于学习建议，仍可重新评分或人工复核。";
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
    if (FAILURE_TYPES.has(errorType(result))) return true;
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
    const text = String(value || "").trim();
    if (text.includes("已先按 0 分计入") || text.includes("已暂记 0 分") || text.includes("可以继续学习")) return text;
    const prefix = text ? `${text.replace(/[。.!！？?\s]+$/u, "")}。` : "";
    return `${prefix}${CONTINUE_SUFFIX}`;
  }

  function normalizeFailed(result = {}) {
    if (!rawPending(result) || !aiReviewFailed(result)) return result;
    return {
      ...result,
      aiScore: 0,
      aiConfidence: Number(result.aiConfidence ?? result.ai_confidence ?? 0) || 0,
      aiFeedback: continuationFeedback(feedback(result)),
      aiErrorType: errorType(result) || "unknown",
      aiNeedsReview: true,
      status: "ai_reviewed",
      isCorrect: false,
      score: 0,
      fallbackScored: true
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
