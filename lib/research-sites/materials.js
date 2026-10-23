"use strict";
const bank = require("../assessments/functions-limits-r2");
const outcomes = require("../proactive-outcomes/functions-limits");
const common = require("../study-workbench");
const goals = require("../support-goals");
const route = require("../../data/multi-scene-learning-route.json");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { digest } = require("./catalog");

const points = route.chapters.find(c => c.id === "V14-C1").modules.flatMap(m => m.knowledgePoints);
const VERSION = "research-materials-r4-20261023";
const fail = message => { throw Object.assign(new Error(message), { status: 400, code: "research_response_invalid" }); };
const copy = value => JSON.parse(JSON.stringify(value));
const scale = (id, label, min, max, construct) => ({ id, label, type: "rating", min, max, construct, allowSkip: true });

const baseline = [
  scale("value", "我觉得理解函数、极限与连续对自己有用。", 1, 7, "task_value"),
  scale("interest", "我对接下来学习的内容感兴趣。", 1, 7, "task_interest"),
  scale("effort_cost", "我预计完成这段学习会让我感到费力。", 1, 7, "perceived_cost"),
  ...points.map(p => scale("efficacy_" + p.id, `即使题目换一种形式，我也有把握解释“${p.name}”的关键关系。`, 0, 100, "task_specific_self_efficacy"))
];
const finalSurvey = [
  scale("choice_accept", "我能自主决定是否接受系统提供的帮助。", 1, 7, "perceived_choice_control"),
  scale("choice_continue", "系统的帮助没有夺走我继续独立思考的选择。", 1, 7, "perceived_choice_control"),
  scale("choice_correct", "系统判断不合适时，我能够改变它接下来提供帮助的方式。", 1, 7, "perceived_choice_control"),
  scale("choice_pressure", "我感到自己被迫接受系统的帮助。", 1, 7, "perceived_choice_control_reverse"),
  scale("management_burden", "处理是否接受帮助的决定让我分心。", 1, 7, "management_burden"),
  scale("disruption", "主动帮助打断了我的思路。", 1, 7, "perceived_interruption"),
  scale("scope_understanding", "我清楚自己允许系统做什么，以及这种允许何时结束。", 1, 7, "manipulation_understanding"),
  ...baseline,
  { id: "example", type: "text", label: "请描述一次合适或不合适的帮助；也可以说明没有收到帮助。", maxLength: 3000, allowSkip: true }
];
const opportunitySurvey = [
  { id: "need", type: "choice", label: "刚才那个时刻，你需要帮助吗？", choices: ["需要", "不需要", "不确定"], allowSkip: true },
  scale("timing", "刚才那个时刻插入一句帮助是否合适？", 1, 5, "reported_receptivity"),
  scale("fit", "刚才的支持符合我想解决的问题（未查看支持请跳过）。", 1, 5, "reported_support_fit"),
  { id: "activity", type: "choice", label: "你当时主要在做什么？", choices: ["阅读", "思考", "操作", "作答", "暂时离开", "其他"], allowSkip: true }
];
const frameworkBaseline = [scale("teaching_experience", "我熟悉教学或学习支持的设计。", 1, 7, "background"),
  scale("hci_experience", "我熟悉人机交互或学习系统研究。", 1, 7, "background")];
const frameworkFinal = [scale("clarity", "六个维度的定义容易理解。", 1, 7, "framework_clarity"),
  scale("separability", "我能区分这些维度负责的设计决策。", 1, 7, "framework_separability"),
  scale("usefulness", "这些维度有助于发现策略中遗漏的设计决策。", 1, 7, "framework_usefulness"),
  {id:"counterexample",type:"text",label:"哪些案例无法归类，或必须同时使用多个维度？请指出遗漏和边界。",maxLength:3000,allowSkip:true},
  {id:"revision",type:"text",label:"你会合并、拆分、重命名或增加哪些维度？为什么？",maxLength:3000,allowSkip:true}];
const commonDecisionSurvey = [
  { id:"need",type:"choice",label:"回想本节最近一次独立检查后、进入刚才的独立练习前：那段时间你希望系统提供帮助吗？",choices:["需要","不需要","不确定"],allowSkip:true },
  scale("timing","在那段时间，系统主动询问是否需要帮助是合适的。",1,5,"retrospective_common_window_receptivity")
];

function questionnaire(phase) {
  const items = phase === "common_decision" ? commonDecisionSurvey : phase === "framework_baseline" ? frameworkBaseline : phase === "framework_final" ? frameworkFinal : phase === "baseline" ? baseline : phase === "opportunity" ? opportunitySurvey : finalSurvey;
  return { version: VERSION, status: "adapted_operational_items_not_validated_scale", items: copy(items) };
}
function validateSurvey(phase, responses) {
  if (!responses || typeof responses !== "object" || Array.isArray(responses)) fail("问卷格式无效。");
  const items = questionnaire(phase).items;
  if (Object.keys(responses).some(id => !items.some(q => q.id === id))) fail("问卷包含未知项目。");
  const clean = {};
  for (const item of items) {
    const value = responses[item.id];
    if (value === null || value === undefined || value === "skip") { clean[item.id] = null; continue; }
    if (item.type === "rating" && (typeof value !== "number" || !Number.isFinite(value) || value < item.min || value > item.max)) fail("问卷评分超出范围。");
    if (item.type === "choice" && !item.choices.includes(value)) fail("问卷选项无效。");
    if (item.type === "text" && (typeof value !== "string" || value.length > item.maxLength)) fail("问卷文字过长。");
    clean[item.id] = value;
  }
  return clean;
}

function publicQuiz(phase) {
  if (["transfer", "retention"].includes(phase)) return { ...outcomes.publicStage(phase), instrumentVersion: outcomes.version };
  if (!["pre", "post"].includes(phase)) return null;
  return {
    id: phase, label: phase === "pre" ? "知识前测" : "知识后测", instrumentVersion: bank.version,
    agentAssistanceAllowed: false, feedbackPolicy: "acknowledgement_only",
    scoring: "单选答对得分；多选全对得满分，无错但漏选得一半，错选不得分。简答按量规由教师复核。可选我不会或跳过，两者分别记录。",
    items: bank.questions(phase).map(q => ({ id: q.id, prompt: q.question, type: q.type, maxScore: q.points,
      knowledgePointId: q.knowledgePointId, options: copy(q.options) }))
  };
}
function validateResponse(question, response) {
  if (response === "skip" || response === "__unknown__") return response;
  if (question.type === "short_answer") {
    if (typeof response !== "string" || !response.trim() || response.length > 4000) fail("请填写回答、选择我不会或跳过。");
    return response.trim();
  }
  const values = Array.isArray(response) ? response : [response];
  if (!values.length || new Set(values).size !== values.length || values.some(v => !question.options.some(o => o.value === v))) fail("题目选项无效。");
  if (values.includes("__unknown__") && values.length !== 1) fail("我不会不能和其他答案同时选择。");
  if (values[0] === "__unknown__") return "__unknown__";
  if (question.type !== "multiple" && values.length !== 1) fail("单选题只能选择一项。");
  return question.type === "multiple" ? [...values].sort() : values[0];
}
function gradeQuiz(phase, responses) {
  const publicForm = publicQuiz(phase);
  if (!publicForm || !responses || typeof responses !== "object" || Array.isArray(responses)) fail("测验格式无效。");
  if (Object.keys(responses).some(id => !publicForm.items.some(q => q.id === id))) fail("题目与当前测验不一致。");
  const clean = {}, confidences = {};
  for (const q of publicForm.items) {
    if (!Object.hasOwn(responses, q.id)) fail("请逐题作答或明确选择跳过。");
    const raw = responses[q.id];
    const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw.response : raw;
    const confidence = raw && typeof raw === "object" && !Array.isArray(raw) ? raw.confidence : null;
    if (confidence != null && (typeof confidence !== "number" || confidence < 0 || confidence > 100 || !Number.isFinite(confidence))) fail("把握程度应在0至100之间。");
    clean[q.id] = validateResponse(q, value); confidences[q.id] = confidence ?? null;
  }
  if (["transfer", "retention"].includes(phase)) {
    // Grade explicit skips separately, never silently equate omission with failure.
    const grading = outcomes.grade(phase, Object.fromEntries(Object.entries(clean).map(([k, v]) => [k, v === "skip" ? "__unknown__" : v])));
    if (!grading) fail("测验答案格式无效。");
    return { ...grading, version: publicForm.instrumentVersion, results: grading.results.map(r => ({ ...r,
      response: clean[r.itemId], responseKind: clean[r.itemId] === "skip" ? "skipped" : clean[r.itemId] === "__unknown__" ? "dont_know" : "answer",
      confidence: confidences[r.itemId], correct: clean[r.itemId] === "skip" ? null : r.correct })) };
  }
  const rows = bank.questions(phase).map(q => {
    const response = clean[q.id], responseKind = response === "skip" ? "skipped" : response === "__unknown__" ? "dont_know" : "answer";
    const base = { itemId: q.id, response, responseKind, confidence: confidences[q.id], maxScore: q.points, knowledgePointId: q.knowledgePointId };
    if (responseKind !== "answer") return { ...base, score: 0, correct: responseKind === "skipped" ? null : false, status: responseKind };
    if (q.type === "short_answer") return { ...base, score: null, correct: null, status: "pending_blind_review", rubric: copy(q.rubric), referenceAnswer: q.referenceAnswer };
    const actual = Array.isArray(response) ? response : [response], expected = q.answer;
    const complete = actual.length === expected.length && actual.every(v => expected.includes(v));
    const subset = actual.length > 0 && actual.every(v => expected.includes(v));
    return { ...base, score: complete ? q.points : q.type === "multiple" && subset ? q.points / 2 : 0,
      correct: complete, status: complete ? "correct" : subset ? "partial" : "incorrect" };
  });
  return { stageId: phase, version: bank.version, scoringVersion: "objective-partial-short-blind-v1", score: rows.reduce((n, r) => n + (r.score || 0), 0),
    maxScore: rows.reduce((n, r) => n + r.maxScore, 0), pendingReview: rows.filter(r => r.status === "pending_blind_review").length, results: rows };
}

function lesson(index) {
  const p = points[index]; if (!p) return null;
  return { id: p.id, name: p.name, goal: p.goal, slide: copy(p.slide), resources: p.resourceCandidates.map(r => ({
    type: r.type, title: r.title, url: `/resources/${r.root}/${r.file}?cqContextBridge=1` })) };
}
function support(index, { goal = "cognitive", efficacyEvidence = null } = {}) {
  const scope = points[index]?.id;
  const primaryGoal = Object.hasOwn(goals.GOALS, goal) ? goal : "cognitive";
  const strategy = { cognitive: "concept_hint", metacognitive: "self_check", motivational: "value_connection", emotional: "acknowledge_reframe", behavioral: "study_plan" }[primaryGoal] || goals.GOALS[primaryGoal].strategies[0];
  const content = goals.fallbackFor({ scope, plan: { primaryGoal, strategy, dose: "brief" } });
  // A frozen stimulus is intentionally not described as live model generation.
  if (efficacyEvidence?.serverGraded && efficacyEvidence.independent && typeof efficacyEvidence.correct === "boolean") {
    content.message += efficacyEvidence.correct
      ? " 刚才这道独立检查回答正确，这是一次具体成功的证据；还不能由一道题判断已经完全掌握。"
      : " 刚才这道独立检查尚未答对；这是本次表现，不是对你能力的定论。可以先核对一个条件，再独立尝试。";
  }
  return { ...content, goal: primaryGoal, strategy, version: VERSION, source: "frozen_research_stimulus",
    contentHash: digest(content), teacherReviewed: false };
}
const fingerprint = digest({ version: VERSION, points, pre: bank.questions("pre"), post: bank.questions("post"),
  outcomeScoringSources: ["../proactive-outcomes/functions-limits", "../assessments/functions-limits-retention-r2", "../assessments/functions-limits-retention-r3", "../assessments/functions-limits-transfer-r4"]
    .map(file => ({ file, sha256: crypto.createHash("sha256").update(fs.readFileSync(require.resolve(file))).digest("hex") })),
  resourceBytes: points.flatMap(p => p.resourceCandidates).map(r => {
    const file = path.resolve(__dirname, "../../resources", r.root, r.file);
    return { resource: `${r.root}/${r.file}`, sha256: fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : "missing" };
  }),
  outcomes: ["transfer", "retention"].map(p => outcomes.publicStage(p)),
  probes: points.map((_, i) => ["t0", "t1", "outcome"].map(p => ({ ...common.publicProbe(i, p),
    keys: ["0", "1", "2"].map(v => common.gradeProbe(i, p, v)) }))),
  stimuli: points.map((_, i) => Object.keys(goals.GOALS).map(goal => support(i, { goal }))), baseline, finalSurvey, frameworkBaseline, frameworkFinal, commonDecisionSurvey });

module.exports = { VERSION, fingerprint, points: points.map(p => p.id), lesson, publicQuiz, gradeQuiz,
  questionnaire, validateSurvey, publicProbe: common.publicProbe, gradeProbe: common.gradeProbe, support };
