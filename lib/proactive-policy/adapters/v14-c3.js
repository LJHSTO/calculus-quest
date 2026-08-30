"use strict";

const CHAPTER_ID = "V14-C3";
const VERSION = "v14-c3-adapter-v2";

const KNOWLEDGE_POINTS = Object.freeze({
  "GH-06-K01": Object.freeze({
    label: "小矩形逼近面积",
    misconception: "只记住矩形和结论，没有比较分割、误差与极限过程。",
    selfExplanationPrompt: "不看解析，用“分割、每块误差、整体逼近”解释：为什么把区间分得更细，矩形和通常会更接近目标面积？",
    conceptHint: "先分开看两层：每个小区间怎样选矩形高度，以及分割变细后每块误差怎样变化。分割更细会压缩局部误差，但不保证所有矩形和都从同一侧逼近。结合这条线索，说说你刚才的判断漏掉了哪一层。"
  }),
  "GH-06-K02": Object.freeze({
    label: "定积分作为累积",
    misconception: "把有向累积等同于路程，忽略负值区间的抵消。",
    selfExplanationPrompt: "用自己的话解释：当变化率为负时，定积分表示的累计量为什么可能下降，而路程仍会增加？",
    conceptHint: "把每小段看成“变化率乘小时间”得到的有向增量。正增量加入累计，负增量会抵消先前累计；路程则把方向去掉。根据这个区别，重新说明题目中的量是在累计净变化还是累计总路程。"
  }),
  "GH-06-K03": Object.freeze({
    label: "原函数和不定积分",
    misconception: "把一个原函数当作不定积分，遗漏任意常数。",
    selfExplanationPrompt: "解释为什么两个只相差常数的函数会有相同导数，以及这件事为什么要求不定积分写上“+C”。",
    conceptHint: "导数描述局部斜率，整体上下平移不会改变任何位置的斜率。因此一个导函数对应的是一族彼此相差常数的原函数。请据此检查你刚才写的是一个函数，还是完整的函数族。"
  }),
  "GH-07-K01": Object.freeze({
    label: "变上限积分",
    misconception: "把变化的积分上限当作常数，忽略末端新增面积。",
    selfExplanationPrompt: "把积分上限从 x 增加到 x+Δx，新增的是哪一小条面积？用它解释变上限积分的导数为什么与末端函数值有关。",
    conceptHint: "比较 F(x+Δx) 与 F(x)：旧区间的累计会相消，只剩末端一条宽约为 Δx、高约为 f(x) 的窄条。先用这条窄条写出增量的近似关系，再说明除以 Δx 后保留下什么。"
  }),
  "GH-07-K02": Object.freeze({
    label: "牛顿-莱布尼茨公式",
    misconception: "把原函数端点差误写成被积函数端点差。",
    selfExplanationPrompt: "解释公式中 f、F、a、b 各自表示什么，并说明为什么定积分取的是原函数 F 的端点差，而不是 f 的端点差。",
    conceptHint: "f 描述瞬时变化率，F 描述累计量；从 a 到 b 的净累计变化应比较累计量在两个端点的差。先判断题目给出的每个符号是“率”还是“累计”，再决定端点代入谁。"
  }),
  "GH-07-K03": Object.freeze({
    label: "换元法直觉",
    misconception: "替换表达式时没有同步处理微分元与积分上下限。",
    selfExplanationPrompt: "用一句话说明换元时为什么不能只替换内层表达式，还必须同时处理微分元；定积分时为什么还要同步换上下限。",
    conceptHint: "换元是在改写整个积分变量系统，不是在公式里替换一个片段。圈出内层函数、它的导数因子和原上下限，逐项检查它们是否都已经用新变量表达。先说出目前哪一项还留在旧变量里。"
  }),
  "GH-07-K04": Object.freeze({
    label: "分部积分直觉",
    misconception: "机械选择 u 与 dv，无法判断转换后是否更简单。",
    selfExplanationPrompt: "从乘积求导公式反向解释分部积分，并说明选择 u 与 dv 时为什么要比较转换后的积分是否更简单。",
    conceptHint: "分部积分把一个乘积积分换成“边界乘积减去另一个乘积积分”。选择不是靠固定口令，而是比较求导后的 u 与积分后的 dv 是否让新积分更容易。分别预演两种选择，只比较新积分的复杂度。"
  })
});

function verificationOption(value, label) {
  return Object.freeze({ value, label });
}

function verificationCheck({
  id,
  stage,
  prompt,
  options,
  answer
}) {
  return Object.freeze({
    id,
    stage,
    prompt,
    options: Object.freeze(options),
    answer
  });
}

const VERIFICATION_CHECKS = Object.freeze({
  "GH-06-K01": Object.freeze({
    L1: verificationCheck({
      id: "GH-06-K01-probe-l1-v1",
      stage: "after_l1",
      prompt: "把区间分得更细时，下面哪种说法最准确？",
      options: [
        verificationOption("a", "矩形和一定单调增加并从下方逼近真实面积"),
        verificationOption("b", "局部宽度变小通常会压缩逼近误差，但不保证每次都从同一侧接近"),
        verificationOption("c", "只要矩形数量增加，矩形高度的选择就不再影响结果")
      ],
      answer: "b"
    }),
    L2: verificationCheck({
      id: "GH-06-K01-probe-l2-v1",
      stage: "after_l2",
      prompt: "同一分割下，上和与下和分别从两侧夹住面积。继续细分时，最关键的变化是什么？",
      options: [
        verificationOption("a", "上和与下和的差距缩小，从两侧夹逼目标面积"),
        verificationOption("b", "上和与下和会立即变成完全相同"),
        verificationOption("c", "只有下和变化，上和保持不变")
      ],
      answer: "a"
    })
  }),
  "GH-06-K02": Object.freeze({
    L1: verificationCheck({
      id: "GH-06-K02-probe-l1-v1",
      stage: "after_l1",
      prompt: "速度在一小段时间内为负时，净位移与路程怎样变化？",
      options: [
        verificationOption("a", "净位移的累计可能下降，路程仍按速度绝对值增加"),
        verificationOption("b", "净位移和路程都会减少"),
        verificationOption("c", "净位移不变，只有路程变化")
      ],
      answer: "a"
    }),
    L2: verificationCheck({
      id: "GH-06-K02-probe-l2-v1",
      stage: "after_l2",
      prompt: "某段变化率图像在横轴上方的有向面积为 5、下方的面积大小为 2。净变化与总路程分别是多少？",
      options: [
        verificationOption("a", "净变化 7，总路程 3"),
        verificationOption("b", "净变化 3，总路程 7"),
        verificationOption("c", "净变化 5，总路程 2")
      ],
      answer: "b"
    })
  }),
  "GH-06-K03": Object.freeze({
    L1: verificationCheck({
      id: "GH-06-K03-probe-l1-v1",
      stage: "after_l1",
      prompt: "不定积分 ∫2x dx 的完整结果应写成什么？",
      options: [
        verificationOption("a", "x²"),
        verificationOption("b", "x² + C"),
        verificationOption("c", "2 + C")
      ],
      answer: "b"
    }),
    L2: verificationCheck({
      id: "GH-06-K03-probe-l2-v1",
      stage: "after_l2",
      prompt: "若 F'(x)=G'(x) 在同一区间内恒成立，可以确定什么？",
      options: [
        verificationOption("a", "F(x) 与 G(x) 必须完全相同"),
        verificationOption("b", "F(x)-G(x) 是常数"),
        verificationOption("c", "F(x)+G(x) 是常数")
      ],
      answer: "b"
    })
  }),
  "GH-07-K01": Object.freeze({
    L1: verificationCheck({
      id: "GH-07-K01-probe-l1-v1",
      stage: "after_l1",
      prompt: "若 F(x)=∫ₐˣ f(t)dt，把上限从 x 增加到 x+Δx 时，新增量最接近什么？",
      options: [
        verificationOption("a", "f(a)Δx"),
        verificationOption("b", "f(x)Δx"),
        verificationOption("c", "F(x)Δx")
      ],
      answer: "b"
    }),
    L2: verificationCheck({
      id: "GH-07-K01-probe-l2-v1",
      stage: "after_l2",
      prompt: "在某点附近 f(x)<0 时，变上限积分 F(x)=∫ₐˣ f(t)dt 在该处怎样变化？",
      options: [
        verificationOption("a", "F 在增加"),
        verificationOption("b", "F 在减少"),
        verificationOption("c", "F 必定等于 0")
      ],
      answer: "b"
    })
  }),
  "GH-07-K02": Object.freeze({
    L1: verificationCheck({
      id: "GH-07-K02-probe-l1-v1",
      stage: "after_l1",
      prompt: "若 F'(x)=f(x)，定积分 ∫ₐᵇ f(x)dx 应计算为哪一项？",
      options: [
        verificationOption("a", "f(b)-f(a)"),
        verificationOption("b", "F(b)-F(a)"),
        verificationOption("c", "F(a)-F(b)")
      ],
      answer: "b"
    }),
    L2: verificationCheck({
      id: "GH-07-K02-probe-l2-v1",
      stage: "after_l2",
      prompt: "为什么公式使用原函数 F 的端点差，而不是被积函数 f 的端点差？",
      options: [
        verificationOption("a", "F 表示累计量，端点差给出区间内的净累计变化"),
        verificationOption("b", "f 的端点值在任何题里都相等"),
        verificationOption("c", "F 的数值总比 f 更大")
      ],
      answer: "a"
    })
  }),
  "GH-07-K03": Object.freeze({
    L1: verificationCheck({
      id: "GH-07-K03-probe-l1-v1",
      stage: "after_l1",
      prompt: "定积分换元时，除了替换内层表达式，还必须同步处理什么？",
      options: [
        verificationOption("a", "只处理积分号"),
        verificationOption("b", "微分元，并把上下限改写为新变量的取值"),
        verificationOption("c", "只把被积函数前的常数删掉")
      ],
      answer: "b"
    }),
    L2: verificationCheck({
      id: "GH-07-K03-probe-l2-v1",
      stage: "after_l2",
      prompt: "计算 ∫₀¹ 2x cos(x²)dx，令 u=x² 后，新的上下限是什么？",
      options: [
        verificationOption("a", "0 到 1"),
        verificationOption("b", "0 到 2"),
        verificationOption("c", "1 到 2")
      ],
      answer: "a"
    })
  }),
  "GH-07-K04": Object.freeze({
    L1: verificationCheck({
      id: "GH-07-K04-probe-l1-v1",
      stage: "after_l1",
      prompt: "对 ∫x eˣ dx 使用分部积分，哪种选择通常会让新积分更简单？",
      options: [
        verificationOption("a", "u=x，dv=eˣdx"),
        verificationOption("b", "u=eˣ，dv=x dx"),
        verificationOption("c", "u=1，dv=x eˣdx")
      ],
      answer: "a"
    }),
    L2: verificationCheck({
      id: "GH-07-K04-probe-l2-v1",
      stage: "after_l2",
      prompt: "分部积分公式的正确结构是什么？",
      options: [
        verificationOption("a", "∫u dv = uv - ∫v du"),
        verificationOption("b", "∫u dv = uv + ∫u du"),
        verificationOption("c", "∫u dv = u/v")
      ],
      answer: "a"
    })
  })
});

const ACTION_PROFILES = Object.freeze({
  elicit_self_explanation: Object.freeze({
    action: "elicit_self_explanation",
    supportLevel: "L1",
    presentation: "assistant_prompt",
    helpNeedScore: 0.92,
    interruptibilityScore: 1,
    uncertaintyScore: 0.08,
    requiredEvidenceFamilies: Object.freeze(["result"])
  }),
  concept_hint: Object.freeze({
    action: "concept_hint",
    supportLevel: "L2",
    presentation: "assistant_prompt",
    helpNeedScore: 0.94,
    interruptibilityScore: 1,
    uncertaintyScore: 0.06,
    requiredEvidenceFamilies: Object.freeze(["history"])
  })
});

const CANDIDATE_PROFILES = Object.freeze({
  repeated_parameter: Object.freeze({
    action: "observe_change",
    supportLevel: "L1",
    presentation: "inline_nudge",
    helpNeedScore: 0.78,
    interruptibilityScore: 0.82,
    uncertaintyScore: 0.22,
    requiredEvidenceFamilies: Object.freeze(["process", "task"])
  }),
  quiet_dwell: Object.freeze({
    action: "ask_clarification",
    supportLevel: "L0",
    presentation: "inline_nudge",
    helpNeedScore: 0.45,
    interruptibilityScore: 0.6,
    uncertaintyScore: 0.45,
    requiredEvidenceFamilies: Object.freeze(["time"])
  }),
  quiz_review: Object.freeze({
    action: "review_mistake",
    supportLevel: "L1",
    presentation: "assistant_prompt",
    helpNeedScore: 0.92,
    interruptibilityScore: 1,
    uncertaintyScore: 0.08,
    requiredEvidenceFamilies: Object.freeze(["result"])
  }),
  formative_outcome: ACTION_PROFILES.elicit_self_explanation,
  independent_attempt_outcome: ACTION_PROFILES.concept_hint
});

function compact(value = "", limit = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function knowledgePoint(unitId = "") {
  return KNOWLEDGE_POINTS[String(unitId || "")] || null;
}

function supportsUnit(unitId = "", { isQuiz = false, knowledgePointId = "" } = {}) {
  return Boolean(
    knowledgePoint(unitId)
    || (isQuiz && (!knowledgePointId || knowledgePoint(knowledgePointId)))
  );
}

function candidateProfile(kind = "") {
  return CANDIDATE_PROFILES[String(kind || "")] || null;
}

function actionProfile(action = "") {
  return ACTION_PROFILES[String(action || "")] || null;
}

function verificationCheckFor(knowledgePointId = "", supportLevel = "") {
  const checks = VERIFICATION_CHECKS[String(knowledgePointId || "")];
  return checks?.[String(supportLevel || "").toUpperCase()] || null;
}

function publicVerificationCheck(knowledgePointId = "", supportLevel = "") {
  const check = verificationCheckFor(knowledgePointId, supportLevel);
  if (!check) return null;
  return {
    id: check.id,
    stage: check.stage,
    supportLevel: String(supportLevel || "").toUpperCase(),
    prompt: check.prompt,
    options: check.options.map((option) => ({ ...option }))
  };
}

function gradeVerificationCheck({
  knowledgePointId = "",
  supportLevel = "",
  checkId = "",
  response = ""
} = {}) {
  const check = verificationCheckFor(knowledgePointId, supportLevel);
  if (!check || check.id !== String(checkId || "")) return null;
  const normalizedResponse = compact(response, 80);
  if (!check.options.some((option) => option.value === normalizedResponse)) {
    return null;
  }
  return {
    checkId: check.id,
    stage: check.stage,
    supportLevel: String(supportLevel || "").toUpperCase(),
    response: normalizedResponse,
    correct: normalizedResponse === check.answer
  };
}

function studentReplyDecision({
  action,
  title,
  body,
  actionLabel,
  assistantPrompt,
  why,
  confidence,
  contextSummary
}) {
  return {
    action,
    intervene: true,
    eyebrow: "知点复盘",
    title,
    body,
    actionLabel,
    draftQuestion: "",
    assistantPrompt,
    replyOptions: [],
    interactionMode: "student_reply",
    contextMode: "unit",
    contextSummary,
    why,
    confidence
  };
}

function renderAction(action = "", context = {}) {
  const point = knowledgePoint(context.knowledgePointId);
  if (!point) return null;
  if (action === "elicit_self_explanation") {
    return studentReplyDecision({
      action,
      title: `先解释「${point.label}」里的关键关系`,
      body: "先不看完整解析，用自己的话连接条件、变化和结果。",
      actionLabel: "说说我的理解",
      assistantPrompt: point.selfExplanationPrompt,
      why: "形成性测验出现已确认错误，先用自我解释暴露当前推理，再决定是否需要更强支架。",
      confidence: 0.92,
      contextSummary: compact(
        `已确认形成性错题 · 易混点：${point.misconception}`,
        120
      )
    });
  }
  if (action === "concept_hint") {
    return studentReplyDecision({
      action,
      title: `换一层线索再看「${point.label}」`,
      body: "刚才的自我解释后仍出现同类错误，这次只补一条概念关系。",
      actionLabel: "用线索再试",
      assistantPrompt: point.conceptHint,
      why: "学生已接受并完成 L1 自我解释，但后续独立尝试仍有已确认错误，因此只升级一级。",
      confidence: 0.94,
      contextSummary: "L1 自我解释后，下一次独立尝试仍出现已确认错误"
    });
  }
  return null;
}

module.exports = Object.freeze({
  chapterId: CHAPTER_ID,
  version: VERSION,
  knowledgePoints: KNOWLEDGE_POINTS,
  knowledgePoint,
  supportsUnit,
  candidateProfile,
  actionProfile,
  publicVerificationCheck,
  gradeVerificationCheck,
  renderAction
});
