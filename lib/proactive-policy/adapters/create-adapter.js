"use strict";
function createAdapter(overrides) {
const CHAPTER_ID = overrides.chapterId;
const VERSION = overrides.version;
const KNOWLEDGE_POINTS = overrides.knowledgePoints;
const verificationV3 = overrides.verification;
const verificationV2 = { checks: {} };
const VERIFICATION_CHECKS = {};
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
  }),
  decompose_subgoal: Object.freeze({
    action: "decompose_subgoal",
    supportLevel: "L3",
    presentation: "assistant_prompt",
    helpNeedScore: 0.96,
    interruptibilityScore: 1,
    uncertaintyScore: 0.05,
    requiredEvidenceFamilies: Object.freeze(["history"])
  }),
  next_step_hint: Object.freeze({
    action: "next_step_hint",
    supportLevel: "L4",
    presentation: "assistant_prompt",
    helpNeedScore: 0.97,
    interruptibilityScore: 1,
    uncertaintyScore: 0.04,
    requiredEvidenceFamilies: Object.freeze(["history"])
  }),
  partial_worked_example: Object.freeze({
    action: "partial_worked_example",
    supportLevel: "L5",
    presentation: "assistant_prompt",
    helpNeedScore: 0.98,
    interruptibilityScore: 1,
    uncertaintyScore: 0.03,
    requiredEvidenceFamilies: Object.freeze(["history"])
  }),
  switch_representation: Object.freeze({
    action: "switch_representation",
    supportLevel: "L2",
    presentation: "inline_nudge",
    helpNeedScore: 1,
    interruptibilityScore: 1,
    uncertaintyScore: 0.02,
    requiredEvidenceFamilies: Object.freeze(["history", "preference"])
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
    supportLevel: "L1",
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
  independent_attempt_outcome: ACTION_PROFILES.concept_hint,
  student_requested_alternative: ACTION_PROFILES.switch_representation
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

function verificationCheckFor(knowledgePointId = "", supportLevel = "", checkId = "") {
  const key = String(knowledgePointId || "");
  const level = String(supportLevel || "").toUpperCase();
  const current = verificationV3.checks[key]?.[level];
  if (!checkId || current?.id === checkId) return current || null;
  const previous = verificationV2.checks[key]?.[level];
  if (previous?.id === checkId) return previous;
  const legacy = VERIFICATION_CHECKS[key]?.[level];
  return legacy?.id === checkId ? legacy : null;
}

function publicVerificationCheck(knowledgePointId = "", supportLevel = "", checkId = "") {
  const check = verificationCheckFor(knowledgePointId, supportLevel, checkId);
  if (!check) return null;
  return {
    id: check.id,
    stage: check.stage,
    supportLevel: String(supportLevel || "").toUpperCase(),
    instrumentVersion: check.instrumentVersion || "v14-c3-verification-v1",
    evidenceScope: "post_support_local_check",
    subSkill: check.subSkill || "legacy_unspecified",
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
  const check = verificationCheckFor(knowledgePointId, supportLevel, checkId);
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

const SCENE_LABELS = Object.freeze({
  simulation: "互动实验",
  mindMap: "关系图",
  game: "误解修复挑战",
  visualization3d: "空间视角"
});

const PREFERRED_ALTERNATIVES = Object.freeze({
  simulation: Object.freeze(["mindMap", "visualization3d", "game"]),
  mindMap: Object.freeze(["simulation", "game", "visualization3d"]),
  game: Object.freeze(["mindMap", "simulation", "visualization3d"]),
  visualization3d: Object.freeze(["simulation", "mindMap", "game"])
});

function normalizedSceneType(value = "") {
  if (value && typeof value === "object") {
    return compact(value.type || value.typeId || value.id, 80);
  }
  return compact(value, 80);
}

function representationAlternative({
  currentSceneType = "",
  availableSceneTypes = []
} = {}) {
  const current = normalizedSceneType(currentSceneType);
  const available = Array.from(new Set(
    (Array.isArray(availableSceneTypes) ? availableSceneTypes : [])
      .map(normalizedSceneType)
      .filter(Boolean)
  ));
  const preferred = PREFERRED_ALTERNATIVES[current] || Object.freeze([]);
  const targetSceneType = preferred.find((type) => (
    type !== current && available.includes(type)
  )) || available.find((type) => type !== current) || "";
  if (!targetSceneType) return null;
  return {
    targetSceneType,
    targetSceneLabel: SCENE_LABELS[targetSceneType] || targetSceneType
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
  if (action === "decompose_subgoal") {
    return studentReplyDecision({
      action,
      title: `把「${point.label}」拆成可完成的子目标`,
      body: "连续两次独立检查仍有同类困难，这次只拆任务，不代替你完成。",
      actionLabel: "按子目标再试",
      assistantPrompt: point.subgoalPrompt,
      why: "L2 概念线索后仍有已确认错误，按最小必要原则升级为任务分解。",
      confidence: 0.96,
      contextSummary: "L2 概念线索后，独立验证仍出现同类错误"
    });
  }
  if (action === "next_step_hint") {
    return studentReplyDecision({
      action,
      title: `只推进「${point.label}」的下一步`,
      body: "任务分解后仍未恢复，这次给出一个可执行的下一步，不展开完整解法。",
      actionLabel: "完成下一步",
      assistantPrompt: point.nextStepPrompt,
      why: "L3 子目标支架后的独立验证仍失败，因此提供下一步提示并保留主要推理。",
      confidence: 0.97,
      contextSummary: "L3 子目标支架后，独立验证仍出现同类错误"
    });
  }
  if (action === "partial_worked_example") {
    return studentReplyDecision({
      action,
      title: `接着完成「${point.label}」的半成品例题`,
      body: "前四级支架后仍未恢复，这次展示部分过程，最后的计算与解释仍由你完成。",
      actionLabel: "接着做完",
      assistantPrompt: point.partialExamplePrompt,
      why: "L4 下一步提示后的独立验证仍失败，达到本试验允许的最高支架级别。",
      confidence: 0.98,
      contextSummary: "L4 下一步提示后，独立验证仍出现同类错误"
    });
  }
  if (action === "switch_representation") {
    const alternative = representationAlternative(context);
    if (!alternative) return null;
    return {
      action,
      intervene: true,
      eyebrow: "换一种帮助",
      title: `换个表征理解「${point.label}」`,
      body: `当前方式不合适时，可以切到${alternative.targetSceneLabel}。只有你确认后才会切换。`,
      actionLabel: `切换到${alternative.targetSceneLabel}`,
      draftQuestion: "",
      assistantPrompt: "",
      replyOptions: [],
      interactionMode: "scene_switch",
      contextMode: "unit",
      contextSummary: compact(
        `学生主动请求替代帮助 · 当前表征：${SCENE_LABELS[normalizedSceneType(context.currentSceneType)] || normalizedSceneType(context.currentSceneType) || "未知"}`,
        120
      ),
      targetSceneType: alternative.targetSceneType,
      targetSceneLabel: alternative.targetSceneLabel,
      why: "学生明确请求换一种帮助，系统仅推荐合法替代表征并保留学生确认权。",
      confidence: 0.98
    };
  }
  return null;
}

function coursewareVerificationMatch() {
  return { eligible: false, reasonCode: "courseware_target_alignment_unverified",
    evidenceScope: "courseware_task_result", subSkill: "unverified",
    matchingVersion: "functions-limits-courseware-match-r1" };
}

return Object.freeze({
  createAdapter,
  chapterId: CHAPTER_ID,
  version: VERSION,
  verificationVersion: verificationV3.version,
  knowledgePoints: KNOWLEDGE_POINTS,
  knowledgePoint,
  supportsUnit,
  candidateProfile,
  actionProfile,
  representationAlternative,
  publicVerificationCheck,
  gradeVerificationCheck,
  coursewareVerificationMatch,
  renderAction
});
}

module.exports = { createAdapter };
