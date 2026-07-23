const assert = require("node:assert/strict");
const {
  buildCourseContextIndex,
  buildAssistantPrompt,
  enforceQuizSafety,
  mockAssistantAnswer,
  resolveAssistantContext
} = require("../lib/learning-assistant");

const route = {
  versionId: "assistant-fixture-v1",
  chapters: [
    {
      id: "C1",
      title: "导数入门",
      summary: "从割线走向切线。",
      flow: {
        preQuiz: {
          title: "导数前测",
          questions: [
            {
              id: "q1",
              type: "single",
              question: "当时间间隔缩小时，平均速度会怎样帮助我们理解瞬时速度？",
              options: [
                { value: "A", label: "完全没有关系" },
                { value: "B", label: "逐步逼近瞬时速度" }
              ],
              answer: ["B"],
              analysis: "私有解析：平均速度在时间间隔趋近于零时逼近瞬时速度。",
              points: 10
            }
          ]
        }
      },
      modules: [
        {
          id: "M1",
          title: "变化率",
          coreIntuition: "让区间逐步缩小，观察平均变化率的稳定趋势。",
          knowledgePoints: [
            {
              id: "KP1",
              name: "从割线到切线",
              goal: "解释 Δx 趋近于 0 时割线斜率为何趋近切线斜率。",
              misconception: "把趋近于零误解为直接等于零。",
              slide: {
                title: "割线怎样变成切线",
                summary: "缩小两个点之间的横向间隔。",
                canvas: {
                  id: "canvas-1",
                  elements: [
                    {
                      id: "text-1",
                      type: "text",
                      content: "<p>当 Δx 趋近于 0 时，割线斜率趋近于切线斜率。</p>"
                    },
                    {
                      id: "latex-1",
                      type: "latex",
                      latex: "\\Delta x \\to 0"
                    },
                    {
                      id: "table-1",
                      type: "table",
                      data: [
                        [
                          {
                            text: "<span style=\"color:#e74c3c\">乘法法则：(fg)' = f'g + fg'</span>"
                          }
                        ]
                      ]
                    }
                  ]
                }
              },
              resourceCandidates: [
                {
                  root: "open-maic/M1",
                  file: "interactive/h-slider.html",
                  title: "步长实验",
                  type: "simulation",
                  description: "拖动 h 观察割线变化。"
                }
              ]
            }
          ],
          flow: {}
        }
      ]
    }
  ]
};

const index = buildCourseContextIndex(route);
assert.equal(index.units.get("KP1").knowledgePointLabel, "从割线到切线");
assert.equal(index.units.get("C1-pre").type, "quiz");

const resolved = resolveAssistantContext({
  index,
  chapterId: "C1",
  unitId: "KP1",
  sceneType: "simulation",
  contextRef: {
    kind: "text",
    scope: "slide",
    semanticId: "slide:canvas-1:text-1",
    excerpt: "Δx 趋近于 0",
    outerHTML: "<p>不应进入提示词</p>",
    selector: ".secret"
  }
});
assert.equal(resolved.contextRef.confidence, "high");
assert.equal(resolved.contextRef.label, "当 Δx 趋近于 0 时，割线斜率趋近于切线斜率。");
assert.equal(resolved.contextRef.outerHTML, undefined);
assert.ok(resolved.contextRef.resourceFingerprint);

const tableContext = resolveAssistantContext({
  index,
  chapterId: "C1",
  unitId: "KP1",
  contextRef: {
    kind: "object",
    scope: "slide",
    semanticId: "slide:canvas-1:table-1",
    label: "客户端纯文本标签"
  }
});
assert.equal(tableContext.contextRef.label, "乘法法则：(fg)' = f'g + fg'");
assert.doesNotMatch(tableContext.contextRef.label, /<span|style=/i);

assert.throws(
  () => resolveAssistantContext({
    index,
    chapterId: "forged",
    unitId: "KP1",
    contextRef: {}
  }),
  (error) => error.code === "assistant_context_mismatch"
);

const quizContext = resolveAssistantContext({
  index,
  chapterId: "C1",
  unitId: "C1-pre",
  contextRef: {
    kind: "quiz",
    scope: "quiz",
    semanticId: "quiz:q1",
    questionId: "q1",
    excerpt: "当时间间隔缩小时"
  },
  quizSubmitted: false
});
const preSubmitPrompt = buildAssistantPrompt({
  resolved: quizContext,
  question: "直接告诉我选哪个",
  history: [],
  quizSubmitted: false
});
assert.equal(preSubmitPrompt.policy.mode, "quiz_guidance");
assert.doesNotMatch(preSubmitPrompt.user, /私有解析/);
assert.doesNotMatch(preSubmitPrompt.user, /"answer"/);

const guarded = enforceQuizSafety("正确答案是 B，因为它会逐步逼近。", {
  isQuiz: true,
  quizSubmitted: false,
  resolved: quizContext
});
assert.doesNotMatch(guarded, /答案是 B/);
assert.match(guarded, /一级提示/);

[
  "B 更符合题意，因为它描述了逐步逼近。",
  "A 不符合题意，可以先排除。",
  "逐步逼近瞬时速度才是题目要找的结论。"
].forEach((unsafeAnswer) => {
  const protectedAnswer = enforceQuizSafety(unsafeAnswer, {
    isQuiz: true,
    quizSubmitted: false,
    resolved: quizContext
  });
  assert.match(protectedAnswer, /一级提示/, `must block equivalent quiz conclusion: ${unsafeAnswer}`);
});

const safeGuidance = "先区分“时间间隔缩小”和“速度本身变小”，再检查这个选项描述的是哪一种变化。";
assert.equal(
  enforceQuizSafety(safeGuidance, {
    isQuiz: true,
    quizSubmitted: false,
    resolved: quizContext
  }),
  safeGuidance
);

const submittedPrompt = buildAssistantPrompt({
  resolved: quizContext,
  question: "请给我完整解析",
  history: [],
  quizSubmitted: true
});
assert.match(submittedPrompt.user, /私有解析/);

const mock = mockAssistantAnswer({
  resolved,
  question: "为什么 h 变小会更接近切线？",
  quizSubmitted: false
});
assert.match(mock, /现在试一下/);
assert.match(mock, /Δx 趋近于 0/);

console.log("learning assistant tests passed");
