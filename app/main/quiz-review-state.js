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
  const CONTINUE_SUFFIX = "已先按 0 分计入，不影响继续学习。";

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
    const resolved = result.status === "ai_reviewed" && (
      result.aiScore !== undefined && result.aiScore !== null
      || result.ai_score !== undefined && result.ai_score !== null
      || result.isCorrect === true
      || result.isCorrect === false
      || result.is_correct === 1
      || result.is_correct === 0
    );
    if (resolved) return false;
    return /解析失败|评分超时|评分出错|人工评阅|人工复核|fetch failed|failed to fetch/i.test(feedback(result));
  }

  function isPending(result = {}) {
    return rawPending(result) && !aiReviewFailed(result);
  }

  function continuationFeedback(value = "") {
    const text = String(value || "").trim();
    if (text.includes("已先按 0 分计入") || text.includes("可以继续学习")) return text;
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
    isPending,
    normalizeFailed,
    rawPending
  };
});
