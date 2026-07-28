(function attachQuizQuestionOrder(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizQuestionOrder = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createQuizQuestionOrder() {
  "use strict";

  const TYPE_RANK = Object.freeze({
    single: 0,
    true_false: 0,
    multiple: 1,
    text: 2,
    short_answer: 3
  });

  function questionSource(question = {}) {
    return String(question.sourceFile || question.source_file || question.source || "");
  }

  function shouldHideQuestion(question = {}, phase = "") {
    return String(phase || "") === "post" && /mml/i.test(questionSource(question));
  }

  function difficultyRank(question = {}) {
    const type = TYPE_RANK[question.type] ?? 2;
    const points = Number(question.points || 0);
    return points * 10 + type;
  }

  function compareQuestions(a = {}, b = {}) {
    return difficultyRank(a) - difficultyRank(b)
      || String(a.id || "").localeCompare(String(b.id || ""), "zh-Hans-CN");
  }

  function orderQuestions(questions = [], phase = "") {
    return [...(Array.isArray(questions) ? questions : [])]
      .filter((question) => !shouldHideQuestion(question, phase))
      .sort(compareQuestions);
  }

  return Object.freeze({
    compareQuestions,
    difficultyRank,
    orderQuestions,
    questionSource,
    shouldHideQuestion
  });
});
