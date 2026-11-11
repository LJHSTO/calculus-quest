"use strict";

function isProtectedQuestionId(id) {
  return /^fl-r\d+-(pre|post)-/.test(id || "");
}

function learningRows(rows) {
  return rows.filter(row => !isProtectedQuestionId(row.question_id));
}

function publicPretest(state) {
  return state ? { ready: state.ready, submitted: state.submitted, expected: state.expected } : null;
}

function finalFeedbackOpen({ outcomesTerminal, studyRun, regulationStatus, judgmentStatus }) {
  if (!outcomesTerminal) return false;
  if (!studyRun) return true;
  return studyRun.regulationVersion
    ? ["submitted", "expired"].includes(regulationStatus)
    : judgmentStatus === "submitted";
}

module.exports = { isProtectedQuestionId, learningRows, publicPretest, finalFeedbackOpen };
