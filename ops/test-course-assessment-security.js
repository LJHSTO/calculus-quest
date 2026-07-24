const assert = require("node:assert/strict");
const {
  authoritativeGradingQuestions,
  buildAssessmentIndex,
  buildPublicLearningRoute,
  scoreObjectiveQuestion
} = require("../lib/course-assessment");

const route = {
  versionId: "security-fixture",
  chapters: [
    {
      id: "C1",
      flow: {
        preQuiz: {
          questions: [
            {
              id: "q-single",
              type: "single",
              question: "2 + 3 = ?",
              options: [
                { value: "A", label: "4" },
                { value: "B", label: "5" }
              ],
              answer: ["B"],
              analysis: "2 + 3 = 5",
              commentPrompt: "按结果评分",
              points: 10,
              hasAnswer: true
            },
            {
              id: "q-multiple",
              type: "multiple",
              question: "选择偶数",
              options: [
                { value: "A", label: "2" },
                { value: "B", label: "3" },
                { value: "C", label: "4" }
              ],
              answer: ["A", "C"],
              analysis: "2 和 4 是偶数",
              points: 20,
              hasAnswer: true
            }
          ]
        }
      },
      modules: [
        {
          id: "M1",
          knowledgePoints: [
            { id: "GH-01-K01", name: "输入、输出和函数规则" }
          ],
          flow: {
            preQuiz: {
              questions: [
                {
                  id: "q-short",
                  type: "short_answer",
                  question: "解释函数的输入和输出。",
                  knowledgePointIds: ["GH-01-K01"],
                  analysis: "说明同一输入对应唯一输出。",
                  commentPrompt: "关注输入、规则和输出的关系。",
                  points: 10
                }
              ]
            }
          }
        }
      ]
    }
  ]
};

const publicRoute = buildPublicLearningRoute(route);
const publicQuestions = publicRoute.chapters[0].flow.preQuiz.questions;

assert.equal(publicQuestions[0].answer, undefined);
assert.equal(publicQuestions[0].analysis, undefined);
assert.equal(publicQuestions[0].commentPrompt, undefined);
assert.equal(publicQuestions[0].hasAnswer, undefined);
assert.deepEqual(route.chapters[0].flow.preQuiz.questions[0].answer, ["B"], "source route must remain unchanged");

const index = buildAssessmentIndex(route);
assert.equal(index.get("q-single").phase, "pre");
assert.equal(index.get("q-single").chapterId, "C1");

assert.deepEqual(scoreObjectiveQuestion(index.get("q-single").question, "B"), {
  isCorrect: true,
  score: 10,
  maxScore: 10,
  status: "correct"
});
assert.deepEqual(scoreObjectiveQuestion(index.get("q-single").question, "A"), {
  isCorrect: false,
  score: 0,
  maxScore: 10,
  status: "incorrect"
});
assert.equal(scoreObjectiveQuestion(index.get("q-multiple").question, ["C", "A"]).isCorrect, true);
assert.equal(scoreObjectiveQuestion(index.get("q-multiple").question, ["A"]).isCorrect, false);

const gradingQuestions = authoritativeGradingQuestions(index, [{
  question_id: "q-short",
  unit_id: "M1-pre",
  chapter_id: "C1",
  response: "函数把输入按规则变成输出。"
}]);
assert.deepEqual(gradingQuestions[0].concepts, ["输入、输出和函数规则"]);

console.log("course assessment security tests passed");
