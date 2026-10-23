"use strict";

const crypto = require("node:crypto");

const VERSION = "research-sites-v1-20261023";
const SOURCES = Object.freeze({
  mixedInitiative: "https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/chi99horvitz.pdf",
  assistanceDilemma: "https://doi.org/10.1007/s10648-007-9049-0",
  helpNeed: "https://arxiv.org/html/2207.03025v1",
  embeddedHints: "https://doi.org/10.1007/s40593-020-00213-3",
  permissions: "https://people.eecs.berkeley.edu/~daw/papers/iva-soups22.pdf",
  boundaries: "https://doi.org/10.1145/1357054.1357070",
  valueSupport: "https://link.springer.com/article/10.1007/s10648-026-10133-8",
  utilityValue: "https://files.eric.ed.gov/fulltext/ED565393.pdf",
  humanAI: "https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/",
  longTerm: "https://www.samspaulding.com/resources/SpauldingLifelongFrontiers21.pdf",
  agencyFramework: "https://arxiv.org/html/2604.13534v2",
  imi: "https://selfdeterminationtheory.org/intrinsic-motivation-inventory/"
});

// Values are frozen operational choices, not fitted probabilities or universal
// educational constants. No inactivity-only candidate is permitted in these studies.
const PARAMETERS = Object.freeze({
  version: "event-evidence-policy-v1",
  probabilityCalibration: "not_calibrated_no_probability_gate",
  candidateRule: "incorrect_independent_probe_or_explicit_need",
  quietAloneTriggers: false,
  inquiryAtSafeBoundary: true,
  minimumExploreMs: 45000,
  safeIdleMs: 3000,
  cooldownMs: 120000,
  candidateTtlMs: 600000,
  maximumOffersPerPoint: 2,
  maximumOffersPerSession: 6,
  inquiryExpiryMs: 90000,
  retentionDelayMs: 72 * 60 * 60 * 1000,
  memoryReturnDelayMs: 24 * 60 * 60 * 1000,
  unsolicitedFeedbackSampleProbability: 0.25,
  maximumSamplePrompts: 2,
  numericBasis: "operational_defaults_for_comparison_not_empirically_optimal",
  revisionPolicy: "new_protocol_version_required_after_enrollment"
});

const definitions = [
  {
    id: "authorization", title: "逐次确认与有限授权", dimensions: ["D5"],
    researchQuestion: "有限且可撤回的授权怎样改变感知控制与管理帮助的负担？",
    arms: ["confirm_each", "scoped_permission"], primaryOutcome: "perceived_choice_control",
    mechanism: "authorization", priority: "primary_candidate",
    references: ["permissions", "mixedInitiative", "agencyFramework", "imi"],
    distinctiveness: "权限机制已有先例；检验学习调节责任、管理负担与无辅助表现的教育机制。",
    extraStages: [], defaultGoal: "cognitive"
  },
  {
    id: "timing", title: "首次安全机会与任务边界", dimensions: ["D2"],
    researchQuestion: "困难出现后，在安全机会询问或等待自然边界再复核，有何学习与打扰后果？",
    arms: ["first_safe", "boundary_recheck"], primaryOutcome: "unaided_transfer",
    mechanism: "timing", priority: "primary_candidate",
    references: ["boundaries", "assistanceDilemma", "helpNeed"],
    distinctiveness: "估计等待并复核的策略效果；不将差异归因于固定延迟秒数。",
    extraStages: [], defaultGoal: "cognitive"
  },
  {
    id: "recheck", title: "投递前证据复核", dimensions: ["D1", "D2", "D6"],
    researchQuestion: "帮助候选等待后，使用初始证据或最新同技能独立证据，如何改变过时帮助与误撤销？",
    arms: ["initial_snapshot", "delivery_recheck"], primaryOutcome: "reported_mismatch_rate",
    mechanism: "recheck", priority: "mechanism_candidate",
    references: ["humanAI", "helpNeed", "assistanceDilemma"],
    distinctiveness: "同一等待流程下比较证据更新；正确一次不宣称已经掌握，记录可能猜测。",
    extraStages: [], defaultGoal: "cognitive"
  },
  {
    id: "clarification", title: "确认需要的成本与收益", dimensions: ["D1", "D3", "D5"],
    researchQuestion: "在可拒绝的主动帮助中，先确认需要再匹配支持是否值得额外一次交互？",
    arms: ["concept_offer", "confirm_and_match"], primaryOutcome: "reported_support_fit",
    mechanism: "clarification", priority: "exploratory_candidate",
    references: ["humanAI", "mixedInitiative", "valueSupport"],
    distinctiveness: "跨维策略包比较，不能把结果解释为D3单一成分效应。两组均可拒绝。",
    extraStages: [], defaultGoal: "cognitive"
  },
  {
    id: "value", title: "价值联系与概念线索", dimensions: ["D1", "D3"],
    researchQuestion: "价值联系与概念线索的结果是否随介入前价值感、信心和知识状态而异？",
    arms: ["value_connection", "concept_hint"], primaryOutcome: "unaided_transfer",
    mechanism: "support_goal", priority: "exploratory_candidate",
    references: ["valueSupport", "utilityValue"],
    distinctiveness: "已有相近比较；状态是测量变量，30–60人不足以保证交互检验功效。",
    extraStages: [], defaultGoal: "assigned"
  },
  {
    id: "memory", title: "历史困难与当前证据", dimensions: ["D1", "D6"],
    researchQuestion: "跨会话复习中，历史错误候选与当前独立成功冲突时应如何处理？",
    arms: ["historical_candidate", "current_evidence"], primaryOutcome: "reported_mismatch_rate",
    mechanism: "memory", priority: "longitudinal_candidate",
    references: ["longTerm", "helpNeed", "humanAI"],
    distinctiveness: "必须有真实跨次会话；不能把同一会话的浏览器刷新冒充长期记忆效果。",
    extraStages: ["return_wait", "return_probe"], defaultGoal: "cognitive"
  },
  {
    id: "placement", title: "任务内与侧栏呈现", dimensions: ["D4"],
    researchQuestion: "相同帮助正文在任务内或侧栏呈现，如何影响查看、打扰和独立表现？",
    arms: ["inline", "sidebar"], primaryOutcome: "unaided_transfer",
    mechanism: "placement", priority: "replication_extension",
    references: ["embeddedHints", "humanAI"],
    distinctiveness: "嵌入帮助已有直接先例；控制正文和布局面积，研究可见性与选择权而非首创嵌入。",
    extraStages: [], defaultGoal: "cognitive"
  },
  {
    id: "efficacy", title: "学习证据与能力反馈", dimensions: ["D3"],
    researchQuestion: "同等概念支持中加入真实独立表现的能力反馈，如何改变信心与表现的匹配？",
    arms: ["concept_only", "evidence_feedback"], primaryOutcome: "confidence_performance_alignment",
    mechanism: "efficacy", priority: "exploratory_candidate",
    references: ["helpNeed", "assistanceDilemma", "humanAI"],
    distinctiveness: "不夸大掌握、不伪造进步；信心校准和任务特定自我效能分开计量。",
    extraStages: [], defaultGoal: "cognitive"
  },
  {
    id: "design-space", title: "六维空间的覆盖与使用", dimensions: ["D1", "D2", "D3", "D4", "D5", "D6"],
    researchQuestion: "六维空间能否帮助研究者解释支持案例、发现遗漏并设计有区别的策略？",
    arms: ["case_order_a", "case_order_b"], primaryOutcome: "framework_use_and_coverage",
    mechanism: "framework", priority: "qualitative_framework_study",
    references: ["agencyFramework", "mixedInitiative", "humanAI"],
    distinctiveness: "使用、反例和编码研究，不以学习成绩或某条件胜出证明六维完备。",
    extraStages: ["case_coding", "design_task"], defaultGoal: "cognitive"
  }
];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const digest = value => crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const clone = value => JSON.parse(JSON.stringify(value));

function getStudy(id) {
  const definition = definitions.find(s => s.id === id);
  if (!definition) return null;
  return {
    ...clone(definition), version: VERSION, parameters: clone(PARAMETERS),
    randomization: { unit: "participant", algorithm: "participant-blocks-v1", allocationRatio: [1, 1], blockSizes: [4, 6], strata: "unstratified_baseline_covariate_adjustment", concealFutureAssignments: true },
    fixedDimensions: ["D1", "D2", "D3", "D4", "D5", "D6"].filter(d => !definition.dimensions.includes(d)),
    teachingContent: "functions-limits-six-points-r4",
    supportContent: "versioned_common_stimuli_and_audited_optional_dialogue",
    samplePlan: definition.id === "design-space"
      ? { target: 12, maximum: 18, minimum: 8, population: "有教育、学习系统或HCI研究经验的研究者／教师", rationale: "质性目的抽样，不以此人数保证饱和", separatePilotRequired: false, repeatedLogsAreIndependentParticipants: false }
      : { target: 48, maximum: 60, minimum: 30, separatePilotRequired: false, repeatedLogsAreIndependentParticipants: false },
    formalReadiness: "institution_owned_information_and_material_review_required",
    analysis: definition.id === "design-space"
      ? { approach: "qualitative_framework_use_and_counterexamples", primaryOutcomes: [definition.primaryOutcome], noLearningEffectClaim: true, caseOrderCounterbalanced: true }
      : { intentionToTreat: true, primaryOutcomes: [definition.primaryOutcome], adjustment: "baseline_knowledge", noEffectBasedEarlyStopping: true, exploratoryInteractions: true, noAutomaticNoninferiorityClaim: true },
    participantTitle: definition.id === "design-space" ? "六维设计空间使用研究" : "函数与极限学习研究", references: definition.references.map(key => ({ key, url: SOURCES[key] }))
  };
}

module.exports = { VERSION, PARAMETERS, SOURCES, digest, getStudy, listStudies: () => definitions.map(s => getStudy(s.id)) };
