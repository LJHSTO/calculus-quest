const assert = require("node:assert/strict");
const {
  buildCourseContextIndex,
  buildAssistantPrompt,
  buildInterventionPrompt,
  classifyAssistantTurn,
  deterministicInterventionDecision,
  enforceQuizSafety,
  mockAssistantAnswer,
  parseInterventionDecision,
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

const conceptualGuidance = classifyAssistantTurn({
  resolved,
  question: "为什么 Δx 变小后，割线会更接近切线？"
});
assert.equal(conceptualGuidance.showUnderstandingCheck, true);
assert.deepEqual(conceptualGuidance.actions, ["self_check", "rephrase", "practice"]);
assert.equal(conceptualGuidance.provenance.show, true);

const simpleGuidance = classifyAssistantTurn({
  resolved: { ...resolved, contextRef: { ...resolved.contextRef, kind: "unit", scope: "lesson" } },
  question: "这个符号怎么读？"
});
assert.equal(simpleGuidance.showUnderstandingCheck, false);
assert.equal(simpleGuidance.provenance.show, false);

const sourceQuestionGuidance = classifyAssistantTurn({
  resolved: { ...resolved, contextRef: { ...resolved.contextRef, kind: "unit", scope: "lesson" } },
  question: "这句话的依据来自课件哪里？"
});
assert.equal(sourceQuestionGuidance.provenance.show, true);

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
assert.match(preSubmitPrompt.system, /每个输入恰好对应一个输出/);
assert.match(preSubmitPrompt.system, /不要误称为“一一对应”/);
assert.match(preSubmitPrompt.system, /不要把“回答依据”或“理解自检”作为每轮固定模板/);
assert.match(preSubmitPrompt.system, /学生明确追问出处、依据或课件位置/);
assert.doesNotMatch(preSubmitPrompt.user, /私有解析/);
assert.doesNotMatch(preSubmitPrompt.user, /"answer"/);

const selfCheckPrompt = buildAssistantPrompt({
  resolved,
  question: "我理解为横向间隔越小，割线斜率越接近切线斜率。",
  history: [],
  quizSubmitted: false,
  assistantIntent: "self_check"
});
assert.equal(selfCheckPrompt.policy.assistantIntent, "self_check");
assert.match(selfCheckPrompt.system, /只评价这句话是否抓住了关键关系/);

const rephrasePrompt = buildAssistantPrompt({
  resolved,
  question: "请换一种方式解释刚才这部分。",
  history: [],
  quizSubmitted: false,
  assistantIntent: "rephrase"
});
assert.match(rephrasePrompt.system, /不要重复上一轮的措辞和结构/);

const practicePrompt = buildAssistantPrompt({
  resolved,
  question: "请围绕刚才的内容出一道小题。",
  history: [],
  quizSubmitted: false,
  assistantIntent: "practice"
});
assert.match(practicePrompt.system, /只出一道题/);
assert.match(practicePrompt.system, /暂不提供答案或解析/);

const continuationPrompt = buildAssistantPrompt({
  resolved,
  question: "7",
  history: [
    { role: "assistant", content: "请完成以下练习：函数规则为‘先平方，再加3’。当输入为-2时，输出值是多少？请按输入→规则→输出的步骤计算。" }
  ],
  quizSubmitted: false
});
assert.match(continuationPrompt.system, /不要因为学生只输入数字、选项或很短的短语就说没有上下文/);
assert.match(continuationPrompt.user, /函数规则为‘先平方，再加3’/);
assert.match(continuationPrompt.user, /"latestAssistantMessage"/);

const fullConversationHistory = Array.from({ length: 60 }, (_, index) => ({
  role: index % 2 === 0 ? "user" : "assistant",
  content: `${index === 0 ? "最早一轮的关键条件" : `第${index + 1}条消息`}：请继续保留这段上下文。`
}));
const fullConversationPrompt = buildAssistantPrompt({
  resolved,
  question: "继续",
  history: fullConversationHistory,
  quizSubmitted: false
});
assert.match(fullConversationPrompt.user, /最早一轮的关键条件/);
assert.match(fullConversationPrompt.user, /第60条消息/);

const overLimitPrompt = buildAssistantPrompt({
  resolved,
  question: "继续",
  history: [
    { role: "assistant", content: "第1轮的旧消息，不应进入 30 轮记忆窗口。" },
    ...Array.from({ length: 60 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `记忆窗口消息${index + 2}`
    })),
    { role: "user", content: "第31轮的新消息。" }
  ],
  quizSubmitted: false
});
assert.doesNotMatch(overLimitPrompt.user, /第1轮的旧消息/);
assert.match(overLimitPrompt.user, /第31轮的新消息/);

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

const conciseMock = mockAssistantAnswer({
  resolved,
  question: "这个符号怎么读？",
  quizSubmitted: false
});
assert.doesNotMatch(conciseMock, /现在试一下/);

const functionSelfCheckMock = mockAssistantAnswer({
  resolved: {
    ...resolved,
    unit: {
      ...resolved.unit,
      unitLabel: "函数的输入与输出",
      knowledgePointLabel: "函数的对应关系",
      goal: "理解函数要求每个输入恰好对应一个输出。",
      misconception: "把函数误解为不同输入必须得到不同输出。"
    },
    contextRef: {
      kind: "text",
      scope: "slide",
      semanticId: "slide:function-definition",
      excerpt: "每个输入恰好对应一个输出",
      confidence: "high"
    }
  },
  question: "我理解为每个输入只能有一个输出。",
  quizSubmitted: false,
  assistantIntent: "self_check"
});
assert.match(functionSelfCheckMock, /每个输入恰好对应一个输出/);
assert.doesNotMatch(functionSelfCheckMock, /Δx|割线|切线/);

const rephraseMock = mockAssistantAnswer({
  resolved,
  question: "请换一种方式解释刚才这部分。",
  quizSubmitted: false,
  assistantIntent: "rephrase"
});
assert.match(rephraseMock, /换个角度/);

const practiceMock = mockAssistantAnswer({
  resolved,
  question: "请围绕刚才的内容出一道小题。",
  quizSubmitted: false,
  assistantIntent: "practice"
});
assert.match(practiceMock, /练习题/);
assert.match(practiceMock, /暂不提供答案/);

const interventionSignal = {
  kind: "repeated_parameter",
  parameter: "步长 h",
  oldValue: "0.5",
  newValue: "0.1",
  dismissStreak: 0,
  pointerMoves: [{ x: 10, y: 20 }]
};
const interventionPrompt = buildInterventionPrompt({ resolved, signal: interventionSignal });
assert.match(interventionPrompt.system, /stay_silent/);
assert.match(interventionPrompt.system, /observe_change/);
assert.match(interventionPrompt.user, /步长 h/);
assert.doesNotMatch(interventionPrompt.user, /pointerMoves|"x"|"y"/);

const parsedIntervention = parseInterventionDecision(JSON.stringify({
  action: "observe_change",
  title: "观察步长变化如何影响割线方向".repeat(8),
  body: "先比较图上的横向间隔和斜率变化，再决定是否需要展开解释。".repeat(12),
  actionLabel: "看看变化",
  draftQuestion: "我连续调整了步长 h，应该重点观察哪些量？".repeat(30),
  why: "连续调整同一参数可能说明观察目标还不清楚。",
  confidence: 0.84
}), { resolved, signal: interventionSignal });
assert.equal(parsedIntervention.action, "observe_change");
assert.equal(parsedIntervention.intervene, true);
assert.ok(parsedIntervention.title.length <= 48);
assert.ok(parsedIntervention.body.length <= 120);
assert.ok(parsedIntervention.draftQuestion.length <= 360);
assert.equal(parsedIntervention.contextMode, "recent_interaction");

const unknownIntervention = parseInterventionDecision(JSON.stringify({
  action: "submit_quiz",
  title: "替学生提交"
}), { resolved, signal: interventionSignal });
assert.equal(unknownIntervention.action, "stay_silent");
assert.equal(unknownIntervention.intervene, false);

const selfExplainIntervention = parseInterventionDecision(JSON.stringify({
  action: "self_explain",
  confidence: 0.72
}), { resolved, signal: { kind: "quiet_dwell", dismissStreak: 0 } });
assert.equal(selfExplainIntervention.draftQuestion, "我理解为：");

const repeatedFallback = deterministicInterventionDecision({ resolved, signal: interventionSignal });
assert.equal(repeatedFallback.action, "observe_change");
assert.match(repeatedFallback.draftQuestion, /步长 h/);

const dismissedDwellFallback = deterministicInterventionDecision({
  resolved,
  signal: { kind: "quiet_dwell", dismissStreak: 2 }
});
assert.equal(dismissedDwellFallback.action, "stay_silent");

console.log("learning assistant tests passed");
