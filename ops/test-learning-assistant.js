const assert = require("node:assert/strict");
const {
  buildCourseContextIndex,
  buildAssistantPrompt,
  buildInterventionPrompt,
  classifyAssistantTurn,
  buildQuizAttemptSummary,
  deterministicInterventionDecision,
  enforceQuizSafety,
  mockAssistantAnswer,
  parseInterventionDecision,
  quizReviewContinuation,
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
            },
            {
              id: "q2",
              type: "short_answer",
              question: "用一句话说明割线斜率怎样趋近切线斜率。",
              referenceAnswer: "当横向间隔趋近于零时，割线斜率趋近该点的切线斜率。",
              analysis: "需要同时说明横向间隔趋近于零和斜率的稳定趋势。",
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
              ],
              formativeQuiz: {
                title: "从割线到切线即时检测",
                questions: [
                  {
                    id: "KP1-formative-q1",
                    type: "single",
                    question: "当横向间隔趋近于零时，割线斜率会怎样？",
                    options: [
                      { value: "A", label: "趋近切线斜率" },
                      { value: "B", label: "必然变成零" }
                    ],
                    answer: ["A"],
                    points: 10
                  }
                ]
              }
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
const formativeUnit = index.units.get("KP1-formative");
assert.ok(formativeUnit, "知识点级形成性测验必须进入助教上下文索引");
assert.equal(formativeUnit.type, "quiz");
assert.equal(formativeUnit.phase, "formative");
assert.equal(formativeUnit.knowledgePointId, "KP1");
assert.equal(formativeUnit.moduleId, "M1");
assert.equal(formativeUnit.quizQuestions[0].id, "KP1-formative-q1");

const formativeContext = resolveAssistantContext({
  index,
  chapterId: "C1",
  unitId: "KP1-formative",
  contextRef: {
    kind: "quiz",
    scope: "quiz",
    semanticId: "quiz:KP1-formative-q1",
    questionId: "KP1-formative-q1"
  },
  quizSubmitted: false
});
assert.equal(formativeContext.isQuiz, true);
assert.equal(formativeContext.contextRef.knowledgePointId, "KP1");
assert.equal(formativeContext.question.id, "KP1-formative-q1");

const reorderedQuizIndex = buildCourseContextIndex({
  versionId: "assistant-question-order-v1",
  chapters: [
    {
      id: "ORDER-C1",
      title: "题序一致性",
      flow: {
        postQuiz: {
          title: "题序一致性后测",
          questions: [
            {
              id: "raw-first",
              type: "single",
              question: "原始数据中的第一题",
              options: [
                { value: "A", label: "原始选项 A" },
                { value: "B", label: "原始选项 B" }
              ],
              answer: ["A"],
              points: 20
            },
            {
              id: "visible-first",
              type: "single",
              question: "页面排序后的第一题",
              options: [
                { value: "C", label: "页面选项 C" },
                { value: "D", label: "页面选项 D" }
              ],
              answer: ["D"],
              points: 10
            }
          ]
        }
      },
      modules: []
    }
  ]
});
const reorderedQuizUnit = reorderedQuizIndex.units.get("ORDER-C1-post");
assert.deepEqual(
  reorderedQuizUnit.quizQuestions.map((question) => question.id),
  ["visible-first", "raw-first"],
  "知点必须复用 Quiz 页面的由易到难题序"
);
const reorderedQuizAttempt = buildQuizAttemptSummary({
  resolved: { isQuiz: true, unit: reorderedQuizUnit },
  results: [
    {
      question_id: "raw-first",
      response: "B",
      is_correct: 0,
      status: "incorrect",
      score: 0,
      max_score: 20
    },
    {
      question_id: "visible-first",
      response: "C",
      is_correct: 0,
      status: "incorrect",
      score: 0,
      max_score: 10
    }
  ]
});
assert.equal(reorderedQuizAttempt.incorrectItems[0].questionId, "visible-first");
assert.equal(reorderedQuizAttempt.incorrectItems[0].studentResponse, "C. 页面选项 C");

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

quizContext.quizAttempt = buildQuizAttemptSummary({
  resolved: quizContext,
  results: [
    {
      question_id: "q1",
      response: "A",
      is_correct: 0,
      status: "incorrect",
      score: 0,
      max_score: 10,
      created_at: "2026-07-26T12:00:00.000Z"
    },
    {
      question_id: "q2",
      response: "割线就是切线。",
      is_correct: -1,
      status: "pending_review",
      score: 0,
      max_score: 10,
      created_at: "2026-07-26T12:00:00.000Z"
    }
  ]
});
quizContext.quizSubmitted = true;
assert.equal(quizContext.quizAttempt.incorrect, 1);
assert.equal(quizContext.quizAttempt.pendingReview, 1);
assert.match(quizContext.quizAttempt.incorrectItems[0].studentResponse, /A\./);
assert.match(quizContext.quizAttempt.incorrectItems[0].correctAnswer, /B\./);
assert.doesNotMatch(
  JSON.stringify(quizContext.quizAttempt.pendingItems),
  /correctAnswer/,
  "待批改简答题不能被伪装成已有标准结论"
);
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

const repairedFunctionDefinition = enforceQuizSafety(
  "函数是输入输出的一对一关系，输入 2 会得到唯一结果。",
  {
    isQuiz: true,
    quizSubmitted: true,
    resolved: quizContext
  }
);
assert.match(repairedFunctionDefinition, /函数要求每个输入恰好对应一个输出/);
assert.doesNotMatch(repairedFunctionDefinition, /一对一关系/);

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

const clarificationIntervention = parseInterventionDecision(JSON.stringify({
  action: "ask_clarification",
  title: "先说说你的卡点",
  body: "知点先听你描述，再决定从哪里开始解释。",
  actionLabel: "和知点说说",
  assistantPrompt: "这次测验里，哪一道题或哪一步最让你困惑？",
  draftQuestion: "这句话不应进入学生输入框。",
  why: "先确认学生的真实卡点。"
}), { resolved, signal: { kind: "quiet_dwell", dismissStreak: 0 } });
assert.equal(clarificationIntervention.action, "ask_clarification");
assert.equal(clarificationIntervention.interactionMode, "student_reply");
assert.equal(clarificationIntervention.draftQuestion, "");
assert.match(clarificationIntervention.assistantPrompt, /哪一道题或哪一步/);

const quizReviewFallback = deterministicInterventionDecision({
  resolved: quizContext,
  signal: {
    kind: "quiz_review",
    incorrect: 99,
    pendingReview: 99,
    dismissStreak: 0
  }
});
assert.equal(
  quizReviewFallback.action,
  "stay_silent",
  "简答题尚未批改完成时，服务端策略也不能提前开始错题复盘"
);

const readyQuizContext = {
  ...quizContext,
  unit: {
    ...quizContext.unit,
    quizQuestions: quizContext.unit.quizQuestions.map((question) => (
      question.id === "q1"
        ? {
            ...question,
            question: "在[cq-unit:EXT-01-K01|simulation]回看课件：当时间间隔缩小时，平均速度会怎样帮助我们理解瞬时速度？"
          }
        : question
    ))
  }
};
readyQuizContext.quizAttempt = buildQuizAttemptSummary({
  resolved: readyQuizContext,
  results: [
    {
      question_id: "q1",
      response: "A",
      is_correct: 0,
      status: "incorrect",
      score: 0,
      max_score: 10
    },
    {
      question_id: "q2",
      response: "割线就是切线。",
      is_correct: 0,
      status: "ai_reviewed",
      score: 0,
      max_score: 10,
      ai_feedback: "没有说明横向间隔趋近于零。"
    }
  ]
});
readyQuizContext.quizSubmitted = true;
assert.equal(readyQuizContext.quizAttempt.pendingReview, 0);
assert.equal(readyQuizContext.quizAttempt.incorrect, 2);
assert.doesNotMatch(readyQuizContext.quizAttempt.incorrectItems[0].question, /\[cq-unit:|回看课件/);

const longQuizQuestions = Array.from({ length: 32 }, (_, index) => ({
  ...quizContext.unit.quizQuestions[0],
  id: `long-q${index + 1}`,
  question: `综合测验第 ${index + 1} 题`
}));
const longQuizContext = {
  ...quizContext,
  unit: {
    ...quizContext.unit,
    quizQuestions: longQuizQuestions
  }
};
longQuizContext.quizAttempt = buildQuizAttemptSummary({
  resolved: longQuizContext,
  results: longQuizQuestions.map((question) => ({
    question_id: question.id,
    response: "A",
    is_correct: 0,
    status: "incorrect",
    score: 0,
    max_score: 10
  }))
});
assert.equal(longQuizContext.quizAttempt.incorrect, 32);
assert.equal(
  longQuizContext.quizAttempt.incorrectItems.length,
  30,
  "逐题复盘最多保留 30 道错题，与单会话 30 轮上限一致"
);

const readyQuizReview = deterministicInterventionDecision({
  resolved: readyQuizContext,
  signal: {
    kind: "quiz_review",
    incorrect: 99,
    pendingReview: 0,
    dismissStreak: 0
  }
});
assert.equal(readyQuizReview.action, "review_mistake");
assert.equal(readyQuizReview.interactionMode, "student_reply");
assert.equal(readyQuizReview.draftQuestion, "");
assert.match(readyQuizReview.assistantPrompt, /第 1 \/ 2 道错题/);
assert.match(readyQuizReview.assistantPrompt, /题目要点/);
assert.match(readyQuizReview.assistantPrompt, /时间间隔缩小时/);
assert.doesNotMatch(readyQuizReview.assistantPrompt, /仍在批改|完整题目/);
assert.doesNotMatch(readyQuizReview.assistantPrompt, /正确答案/);
assert.doesNotMatch(readyQuizReview.assistantPrompt, /原测验第|\[cq-unit:|\[\]/);
assert.deepEqual(
  readyQuizReview.replyOptions,
  ["题意没读懂", "概念或公式记混", "推到一半卡住", "当时主要靠猜"]
);
assert.match(readyQuizReview.contextSummary, /第 1 \/ 2 道错题/);
assert.match(readyQuizReview.contextSummary, /你的作答/);
assert.doesNotMatch(readyQuizReview.contextSummary, /正确答案|时间间隔缩小时|\[cq-unit:/);

const nextQuizReview = quizReviewContinuation({
  resolved: readyQuizContext,
  completedIndex: 0
});
assert.equal(nextQuizReview.done, false);
assert.equal(nextQuizReview.reviewIndex, 1);
assert.equal(nextQuizReview.reviewTotal, 2);
assert.match(nextQuizReview.decision.assistantPrompt, /第 2 \/ 2 道错题/);
assert.doesNotMatch(nextQuizReview.decision.contextSummary, /割线斜率怎样趋近切线斜率/);

const completedQuizReview = quizReviewContinuation({
  resolved: readyQuizContext,
  completedIndex: 1
});
assert.equal(completedQuizReview.done, true);
assert.equal(completedQuizReview.reviewTotal, 2);
assert.match(completedQuizReview.completionMessage, /2 道错题已复盘完成/);

const parsedQuizReview = parseInterventionDecision(JSON.stringify({
  action: "review_mistake",
  title: "错题回顾",
  body: "让学生重新选择一次答案。",
  actionLabel: "查看错题",
  draftQuestion: "这句话不应进入学生输入框。",
  assistantPrompt: "请重新选择这道题的正确答案。",
  replyOptions: ["A. 完全没有关系", "B. 逐步逼近瞬时速度", "C. 以上都不对"],
  contextSummary: "学生答错了，正确答案是 B。",
  confidence: 0.9
}), {
  resolved: readyQuizContext,
  signal: { kind: "quiz_review", incorrect: 2, pendingReview: 0 }
});
assert.equal(parsedQuizReview.interactionMode, "student_reply");
assert.equal(parsedQuizReview.draftQuestion, "");
assert.match(parsedQuizReview.assistantPrompt, /第 1 \/ 2 道错题/);
assert.doesNotMatch(parsedQuizReview.assistantPrompt, /正确答案|重新选择/);
assert.equal(parsedQuizReview.title, readyQuizReview.title);
assert.equal(parsedQuizReview.body, readyQuizReview.body);
assert.equal(parsedQuizReview.actionLabel, "开始复盘");
assert.deepEqual(parsedQuizReview.replyOptions, readyQuizReview.replyOptions);
assert.equal(parsedQuizReview.contextSummary, readyQuizReview.contextSummary);
assert.doesNotMatch(parsedQuizReview.contextSummary, /正确答案/);

const mismatchedObservation = parseInterventionDecision(JSON.stringify({
  action: "observe_change",
  title: "看看变化",
  confidence: 0.8
}), {
  resolved,
  signal: { kind: "quiet_dwell", dwellSeconds: 90 }
});
assert.equal(mismatchedObservation.action, "stay_silent");
assert.equal(mismatchedObservation.intervene, false);

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

const dwellFallback = deterministicInterventionDecision({
  resolved,
  signal: { kind: "quiet_dwell", dwellSeconds: 90, dismissStreak: 0 }
});
assert.equal(dwellFallback.action, "ask_clarification");
assert.equal(dwellFallback.interactionMode, "student_reply");
assert.equal(dwellFallback.draftQuestion, "");
assert.match(dwellFallback.assistantPrompt, /最想先弄清/);

const dismissedDwellFallback = deterministicInterventionDecision({
  resolved,
  signal: { kind: "quiet_dwell", dismissStreak: 2 }
});
assert.equal(dismissedDwellFallback.action, "stay_silent");

const proactiveReplyPrompt = buildAssistantPrompt({
  resolved: quizContext,
  question: "公式或概念记混了。",
  proactivePrompt: "我先从第 1 题开始。你当时更像是题意没读懂，还是概念记混了？",
  history: [],
  quizSubmitted: true
});
assert.match(proactiveReplyPrompt.system, /正在回答知点刚才提出的问题/);
assert.match(proactiveReplyPrompt.user, /proactiveAssistantPrompt/);
assert.match(proactiveReplyPrompt.user, /公式或概念记混/);
assert.match(proactiveReplyPrompt.user, /incorrectItems/);
assert.match(proactiveReplyPrompt.user, /逐步逼近瞬时速度/);

const interventionWithContext = buildInterventionPrompt({
  resolved: quizContext,
  signal: { kind: "quiz_review", incorrect: 1, pendingReview: 1 },
  history: [
    { role: "user", content: "我总把平均速度和瞬时速度混在一起。" },
    { role: "assistant", content: "先区分区间上的平均量和一点处的瞬时量。" }
  ]
});
assert.match(interventionWithContext.user, /quizReview/);
assert.match(interventionWithContext.user, /recentConversation/);
assert.match(interventionWithContext.user, /平均速度和瞬时速度/);

const quizReviewMock = mockAssistantAnswer({
  resolved: readyQuizContext,
  question: "公式或概念记混了。",
  quizSubmitted: true,
  proactivePrompt: readyQuizReview.assistantPrompt
});
assert.match(quizReviewMock, /第 1 题/);
assert.match(quizReviewMock, /完全没有关系/);
assert.doesNotMatch(quizReviewMock, /当时间间隔缩小时，平均速度会怎样/);
assert.doesNotMatch(quizReviewMock, /请提供你做错的题目/);

console.log("learning assistant tests passed");
