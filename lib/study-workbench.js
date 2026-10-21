"use strict";

// Common learning infrastructure: ordinary practice, engineering previews, or an
// explicitly reviewed frozen protocol. The question bank still requires expert
// validation; answer keys are never exposed through a static client bundle.
const crypto = require("node:crypto");
const { participantAllocation } = require("./study-allocation");
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const points = ["GH-01-K01", "GH-01-K02", "GH-01-K03", "GH-02-K01", "GH-02-K02", "GH-02-K03"];
const labels = ["输入与函数规则", "坐标与函数图像", "变化方向", "附近趋势与点值", "左右极限", "连续的条件"];
const subskills = ["input_uniqueness", "point_membership", "direction_not_sign", "limit_not_point_value", "two_sided_agreement", "continuity_value_match"];
const questions = [
  [["同一输入4被规则同时指定输出2和7，这是函数吗？", ["是", "不是", "由输出正负决定"], 1],
    ["记录中输入-2只对应5，输入3也只对应5。仅这两条记录是否违反函数唯一性？", ["违反", "不违反", "无法比较正负数"], 1],
    ["一台机器对同一合法输入既规定输出红色，又规定输出蓝色。它是否满足每个输入有唯一输出的规则？", ["满足", "不满足", "颜色不影响唯一性"], 1]],
  [["点(2,8)是否在y=3x+1的图像上？", ["在", "不在", "只由横坐标决定"], 1],
    ["点(-1,3)是否在y=2x+5的图像上？", ["在", "不在", "负数不能代入"], 0],
    ["某轨迹满足路程s=4t+2。记录(t,s)=(3,15)与规则是否相符？", ["相符", "不相符", "需要知道所有时间"], 1]],
  [["x增大时，函数值从-9持续增大到-5，这段描述表示什么？", ["上升", "下降", "负数无法比较"], 0],
    ["输出始终为正，是否足以断定函数随输入增大而上升？", ["足以", "不足以", "正数必定上升"], 1],
    ["按时间顺序，账户余额从-20变为-12。只对这两个观测值，应描述为？", ["下降8", "上升8", "因为负数所以不变"], 1]],
  [["x≠3时f(x)=x+4，另设f(3)=20。x趋近3时f(x)的极限是多少？", ["3", "7", "20"], 1],
    ["x≠-1时g(x)=2x+6，g(-1)未定义。x趋近-1时极限是多少？", ["4", "不存在", "6"], 0],
    ["一条曲线在x=5附近满足y=x-2，但点(5,3)被挖去并另标点(5,9)。x趋近5时输出趋近？", ["9", "3", "5"], 1]],
  [["左极限为2，右极限为6，双侧极限存在吗？", ["存在且为4", "存在且为6", "不存在"], 2],
    ["左右极限都为-4，点上的函数值为8，双侧极限为？", ["-4", "8", "不存在"], 0],
    ["向同一时刻从过去靠近，读数趋近10；从未来靠近，读数趋近12。该时刻的双侧极限为？", ["11", "10", "不存在"], 2]],
  [["左右极限都为6，函数值为2，此内点连续吗？", ["连续", "不连续", "只要有函数值就连续"], 1],
    ["左右极限都为-5，函数值也为-5。此内点是否连续？", ["连续", "不连续", "必须先求导数"], 0],
    ["一条曲线两侧靠近某内点时都趋近4，该点没有定义。只补一个点，要使它连续，应补的函数值是？", ["0", "4", "任意数"], 1]]
];
const hints = ["函数的唯一性限制同一个输入对应的输出数量；不同输入可以有相同输出。",
  "把点的第一个坐标代入函数，再把计算结果与第二个坐标比较。",
  "变化方向看输入增大时输出如何变化，与输出为正还是为负分开判断。",
  "极限考察输入靠近目标时附近的趋势，点上的取值要单独看。",
  "先分别确定左极限和右极限，再比较二者是否存在且相等。",
  "内点连续要求函数值有定义、两侧共同极限存在，而且函数值等于该极限。"];
const version = "common-probe-engineering-v1";
const practicePrompts = ["观察当前函数规则。写下一个输入及对应输出，并说明同一输入的输出是否唯一。", "选一个坐标点，写出你打算怎样判断它是否满足当前函数关系。", "按输入增大的方向观察图像，用一句话说明你怎样判断上升或下降。", "观察数表和图像，写下附近趋势与点上取值应该怎样分别判断。", "分别观察左右两侧的趋近，写下判断双侧极限时需要比较的量。", "观察附近趋势与点的位置，写下判断连续需要检查的条件。"];
function fail(code, message, status = 409) { const e = new Error(message); e.code = code; e.status = status; throw e; }
const combinations = Array.from({ length: 64 }, (_, n) => Array.from({ length: 6 }, (_, i) => (n >> i) & 1))
  .filter(a => a.reduce((s, x) => s + x, 0) === 3);
function sequenceFor({ seed, stratum, ordinal }) {
  const block = Math.floor(ordinal / 2), position = ordinal % 2;
  let counter = 0, value;
  // Rejection sampling avoids modulo bias. The complement gives exact balance
  // per knowledge point after each completed allocation pair within a stratum.
  do { value = crypto.createHmac("sha256", seed).update(JSON.stringify([stratum, block, counter++])).digest().readUInt32BE(); }
  while (value >= Math.floor(2 ** 32 / combinations.length) * combinations.length);
  const base = combinations[value % combinations.length];
  return { values: base.map(x => position ? 1 - x : x), block, position,
    sequenceSelectionProbability: position ? 1 : 1 / combinations.length,
    marginalConditionProbability: 0.5, algorithm: "complementary-pairs-v1" };
}
function publicProbe(index, stage) {
  const q = questions[index][{ t0: 0, t1: 1, outcome: 2 }[stage]];
  return { id: `${points[index]}-${stage}-${version}`, subSkill: subskills[index], prompt: q[0],
    options: q[1].map((label, i) => ({ value: String(i), label })), instrumentVersion: version };
}
function grade(index, stage, response) {
  if (response === "skip") return { correct: null, responseKind: "skipped" };
  if (response === "unknown") return { correct: false, responseKind: "dont_know" };
  if (!["0", "1", "2"].includes(response)) fail("probe_response_invalid", "请选择答案、我不会或跳过。", 400);
  return { correct: Number(response) === questions[index][{ t0: 0, t1: 1, outcome: 2 }[stage]][2], responseKind: "answer" };
}
function createWorkbench({ db, env, resources = [], implementationDigest = "unit-test-only", mainEntry = false, humanProtocol = null }) {
  const kind = mainEntry ? humanProtocol?.kind || "practice" : env.PROACTIVE_STUDY_WORKBENCH || "";
  if (!kind) return { enabled: false, protects: () => false };
  if (!mainEntry && (!["recheck", "placement", "embedded"].includes(kind) || env.NODE_ENV === "production")) throw new Error("研究工作台仅支持recheck/placement/embedded的非生产工程预演");
  if(mainEntry && !["practice","recheck","placement"].includes(kind))throw new Error("常规学习协议类型不支持");
  if(humanProtocol && (!mainEntry || !["recheck","placement"].includes(kind) || humanProtocol.questionHash!==hash(questions)
    || humanProtocol.resourceHash!==hash(resources) || !/^[a-zA-Z0-9_-]{8,80}$/.test(humanProtocol.id||"")
    || !["reviewedBy","reviewedAt","approvalReference","consentVersion","consentText","contact","retentionPolicy","withdrawalPolicy"].every(k=>typeof humanProtocol[k]==="string" && humanProtocol[k].trim())))
    throw new Error("真人协议缺少审题/课件摘要、审核记录或完整知情同意信息；请先核验配置");
  const seed = kind === "practice" ? "nonrandomized-normal-learning" : env.PROACTIVE_STUDY_SEED;
  if (!seed || seed.length < 16) throw new Error("研究工作台需要独立且至少16字符的分配种子");
  // Human protocols choose their own frozen design; an environment setting
  // cannot silently change an approved protocol or ordinary practice.
  const assignmentMode = humanProtocol
    ? humanProtocol.assignmentMode || "complementary-pairs"
    : ["practice", "embedded"].includes(kind) ? "complementary-pairs"
      : env.PROACTIVE_STUDY_ASSIGNMENT_MODE || "complementary-pairs";
  if (!["complementary-pairs", "participant-blocks"].includes(assignmentMode))
    throw new Error("研究分组方式仅支持 complementary-pairs 或 participant-blocks");
  const protocol = { id: humanProtocol?.id || (mainEntry ? "main-practice-v1" : env.PROACTIVE_STUDY_PROTOCOL_ID || `${kind}-engineering-v1`), kind, version,
    status: humanProtocol ? "reviewed_human_protocol" : mainEntry ? "ordinary_learning" : "engineering_only", reviewedForHumanUse: Boolean(humanProtocol), conditions: kind === "practice" ? ["guided_learning"] : kind === "embedded" ? ["in_task"] : kind === "recheck" ? ["initial_snapshot", "delivery_recheck"] : ["sidebar", "inline"],
    knowledgePoints: points, subskills, questionHash: hash(questions), hintHash: hash(hints), resourceHash: hash(resources),
    assignmentVersion: kind === "embedded" ? "nonrandomized-demo-v1" : assignmentMode === "participant-blocks" ? "participant-blocks-v1" : "complementary-pairs-v1", seedFingerprint: hash(seed), uiVersion: "study-workbench-ui-v2", implementationDigest, practiceHash: kind === "embedded" ? hash(practicePrompts) : null,
    minimumExploreMs: humanProtocol ? 45000 : 1000, supportDepth: "L2", modality: "tip", mainEntry,
    humanProtocol, reference: humanProtocol ? "以配置所载的机构审批和教师审核范围为准" : "机构审核、专家审题、预试与正式协议尚待完成" };
  // Ordinary practice may evolve without overwriting earlier learning records.
  // Human-study IDs never auto-roll: drift under a frozen ID is rejected.
  if(kind === "practice")protocol.id += "-" + hash(protocol).slice(0,12);
  const fingerprint = hash(protocol);
  let initialized = false;
  function sql() {
    const store = db.getDbSync();
    if (!initialized) {
      store.run(`CREATE TABLE IF NOT EXISTS study_workbench_sessions (
        user_id TEXT NOT NULL, protocol_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
        stratum TEXT NOT NULL, ordinal INTEGER NOT NULL, state_json TEXT NOT NULL,
        PRIMARY KEY(user_id,protocol_id), UNIQUE(protocol_id,stratum,ordinal))`);
      store.run(`CREATE TABLE IF NOT EXISTS study_workbench_events (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, protocol_id TEXT NOT NULL,
        revision INTEGER NOT NULL, at TEXT NOT NULL, event_json TEXT NOT NULL,
        UNIQUE(user_id,protocol_id,revision))`);
      store.run(`CREATE TABLE IF NOT EXISTS study_workbench_process (
        id TEXT PRIMARY KEY,user_id TEXT NOT NULL,protocol_id TEXT NOT NULL,at TEXT NOT NULL,event_json TEXT NOT NULL)`);
      store.run(`CREATE TABLE IF NOT EXISTS study_workbench_protocols (
        protocol_id TEXT NOT NULL,fingerprint TEXT NOT NULL,created_at TEXT NOT NULL,
        protocol_json TEXT NOT NULL,PRIMARY KEY(protocol_id,fingerprint))`);
      // Freeze the actual instructional materials alongside hashes. This table
      // is admin-only and must never be sent by view()/publicProbe().
      const archived = { protocol, collectionSchemaVersion: "common-learning-data-v2",
        instruments: points.map((knowledgePointId, i) => ({ knowledgePointId, subSkill: subskills[i],
          probes: ["t0","t1","outcome"].map((stage, j) => ({
            ...publicProbe(i, stage), answerKey: String(questions[i][j][2])
          })), hint: hints[i], practicePrompt: practicePrompts[i], resource: resources[i] || null })) };
      store.run("INSERT OR IGNORE INTO study_workbench_protocols VALUES (?,?,?,?)",
        [protocol.id,fingerprint,new Date().toISOString(),JSON.stringify(archived)]);
      initialized = true;
    }
    return store;
  }
  function rows(query, params = []) {
    const stmt = sql().prepare(query); try { stmt.bind(params); const out = []; while (stmt.step()) out.push(stmt.getAsObject()); return out; } finally { stmt.free(); }
  }
  const generation = id => typeof db.currentLearningGeneration === "function" ? db.currentLearningGeneration(id) : 1;
  function load(userId, protectOnly = false) {
    const row = rows("SELECT * FROM study_workbench_sessions WHERE user_id=? AND protocol_id=?", [userId, protocol.id])[0];
    if (!row) return null;
    if (row.fingerprint !== fingerprint) fail("study_protocol_changed", "研究版本发生变化。原记录已保留，请使用新的研究编号。");
    const state = JSON.parse(row.state_json);
    if (!protectOnly && state.learningGeneration !== generation(userId)) fail("study_generation_changed", "学习记录代次已变化；研究记录已保留，请使用新的研究编号。");
    return state;
  }
  function persist(userId, state, event) {
    const store = sql(); store.run("BEGIN IMMEDIATE");
    try {
      store.run(`INSERT INTO study_workbench_sessions VALUES (?,?,?,?,?,?)
        ON CONFLICT(user_id,protocol_id) DO UPDATE SET state_json=excluded.state_json`,
      [userId, protocol.id, fingerprint, state.stratum, state.ordinal, JSON.stringify(state)]);
      store.run("INSERT INTO study_workbench_events VALUES (?,?,?,?,?,?)", [crypto.randomUUID(), userId, protocol.id, state.revision, new Date().toISOString(), JSON.stringify(event)]);
      store.run("COMMIT"); db.saveNow();
    } catch (e) { try { store.run("ROLLBACK"); } catch {} throw e; }
  }
  function view(state) {
    const publicProtocol={id:protocol.id,kind,fingerprint,status:protocol.status,mainEntry,
      consent:humanProtocol?{version:humanProtocol.consentVersion,text:humanProtocol.consentText,contact:humanProtocol.contact,retentionPolicy:humanProtocol.retentionPolicy,withdrawalPolicy:humanProtocol.withdrawalPolicy}:null};
    if (!state) return { enabled: true, protocol: publicProtocol, session: null };
    const index = state.index, unit = state.units[index];
    const stage = state.stage;
    const lockedPresentation = kind === "embedded" ? "in_task" : stage === "support" ? (kind === "placement" ? unit.condition : "sidebar") : null;
    return { enabled: true, protocol: publicProtocol, session: {
      revision: state.revision, index, stage, total: points.length, title: labels[index] || "流程完成",
      knowledgePointId: points[index] || "", probe: ["t0", "t1", "outcome"].includes(stage) ? publicProbe(index, stage) : null,
      opportunityId: unit?.opportunityId || null,
      completedPoints:state.units.filter(u=>u.status==="complete").map(u=>u.knowledgePointId),
      exposureRecorded:Boolean(unit?.exposure),
      practicePrompt:practicePrompts[index],
      exploreReadyAt:stage==="explore"?new Date(unit.exploreStartedAt+protocol.minimumExploreMs).toISOString():null,
      feedback:kind==="practice" && ["survey","between_units","complete"].includes(stage) && unit?{text:hints[index],results:Object.fromEntries(Object.entries(unit.probes).map(([key,p])=>[key,p.correct]))}:null,
      resource: ["explore", "support"].includes(stage) ? resources[index]?.url || "" : "",
      practice: kind === "embedded" && stage === "support" ? { id: `${points[index]}-guided-draft-v1`, prompt: practicePrompts[index], response: unit.practiceResponse || "", scored: false } : null,
      help: (stage === "support" && unit?.decision?.action === "present") || (stage === "explore" && unit?.manualHelpVisible)
        ? { text: hints[index], depth: "L2", placement: kind==="practice"?"inline":lockedPresentation || "sidebar", modality: "tip", presentationLocked: true } : null,
      controls: { canWithdraw: !["withdrawn", "complete"].includes(stage), canCloseHelp: stage === "support", canRequestHelp: stage === "explore" },
      // Conditions, correctness and future answers are deliberately absent.
      completion: stage === "complete" ? mainEntry ? humanProtocol ? "本轮研究学习流程已完成。" : "本轮学习验证已完成；普通学习记录不作为研究数据。" : "工程流程已完成；这些记录不能作为真人实验结果。" : ""
    } };
  }
  function start(userId, { acknowledged, consentVersion, knowledgePointId, stratum = "engineering_unstratified" } = {}) {
    const existing = load(userId); if (existing) return view(existing);
    if (acknowledged !== true || humanProtocol && consentVersion!==humanProtocol.consentVersion) fail("study_ack_required", humanProtocol?"请先阅读并确认当前知情同意书。":"请确认开始这段学习。", 400);
    if (rows("SELECT fingerprint FROM study_workbench_sessions WHERE protocol_id=? AND fingerprint<>?", [protocol.id, fingerprint]).length)
      fail("study_protocol_changed", "已有该编号的不同研究版本，请改用新的研究编号。");
    const ordinal = rows("SELECT COUNT(*) AS n FROM study_workbench_sessions WHERE protocol_id=? AND stratum=?", [protocol.id, stratum])[0].n;
    const allocation = ["embedded","practice"].includes(kind)
      ? { values: points.map(() => 0), algorithm: "nonrandomized-demo-v1", sequenceProbability: 1, marginalConditionProbability: 1 }
      : assignmentMode === "participant-blocks"
        ? participantAllocation({ seed, stratum, ordinal }) : sequenceFor({ seed, stratum, ordinal });
    const firstIndex=kind==="practice" && points.includes(knowledgePointId)?points.indexOf(knowledgePointId):0;
    const state = { revision: 0, stratum, ordinal, fingerprint, allocation, learningGeneration: generation(userId), index: firstIndex, stage: "t0", createdAt: new Date().toISOString(),
      consent:humanProtocol?{version:consentVersion,at:new Date().toISOString(),status:"consented"}:null,
      units: points.map((knowledgePointId, i) => ({ opportunityId: crypto.randomUUID(), knowledgePointId,
        subSkill: subskills[i], order: i + 1, condition: protocol.conditions[allocation.values[i]],
        status: "assigned_not_entered", candidateFormed: null, decision: null, probes: {}, survey: null,
        exposure: null, manualHelp: false, studentActions: [] })) };
    state.units[firstIndex].status = "entered";
    persist(userId, state, { type: "assigned", fingerprint, allocation, units: state.units.map(u => ({ opportunityId: u.opportunityId, condition: u.condition, knowledgePointId: u.knowledgePointId })) });
    return view(state);
  }
  function act(userId, input = {}) {
    const state = load(userId); if (!state) fail("study_not_started", "请先开始工程预演。");
    if (input.fingerprint !== fingerprint || input.revision !== state.revision) fail("study_stale", "页面已更新，请刷新；未重复记录这次操作。");
    if (["withdrawn", "complete"].includes(state.stage)) fail("study_closed", "本次流程已结束。");
    const unit = state.units[state.index], at = new Date().toISOString(), previousStage = state.stage;
    let detail = {};
    if (input.action === "withdraw") {
      state.stage = "withdrawn"; unit.status = "withdrawn";
      if(state.consent)state.consent={...state.consent,status:"withdrawn",withdrawnAt:at};
      unit.decision = unit.decision || { action: "unavailable", reason: "withdrawn", at };
    } else if(input.action === "select_unit" && mainEntry && state.stage === "between_units"){
      const next=points.indexOf(input.knowledgePointId);
      if(next<0 || state.units[next].status==="complete" || humanProtocol && next!==state.units.findIndex(u=>u.status!=="complete"))fail("study_unit_order","请按当前学习顺序继续。");
      state.index=next;state.stage="t0";state.units[next].status="entered";
    } else if (input.action === "answer" && ["t0", "t1", "outcome"].includes(state.stage)) {
      const expected = publicProbe(state.index, state.stage);
      if (input.probeId !== expected.id) fail("study_probe_mismatch", "题目与当前阶段不一致。");
      const result = { ...grade(state.index, state.stage, input.response), response: input.response,
        id: expected.id, stage: state.stage, at, serverGraded: true, subSkill: unit.subSkill,
        independent: state.stage !== "t1" || !unit.manualHelp };
      if(mainEntry){
        const explanation = input.explanation ?? "";
        const missingReason = input.explanationMissingReason ?? null;
        if(![0,1,2,null,undefined].includes(input.confidence) || typeof explanation !== "string" || explanation.length > 1200
          || ![null,"cannot_explain","prefer_not_to_answer"].includes(missingReason)
          || (explanation.trim() && missingReason !== null))
          fail("study_response_invalid","说明、未填写原因或把握程度格式不正确。",400);
        result.explanation = explanation;
        result.explanationStatus = explanation.trim() ? "provided" : missingReason || "not_recorded";
        result.responseSchemaVersion = "common-response-v2";
        result.confidence = input.confidence ?? null;
      }
      unit.probes[state.stage] = result; detail = { probe: result };
      if (state.stage === "t0") {
        unit.candidateFormed = result.correct === null ? null : result.correct === false;
        state.stage = "explore"; unit.exploreStartedAt = Date.now();
      } else if (state.stage === "t1") {
        const recovered = result.correct === true && result.independent;
        const candidate = unit.candidateFormed === true;
        unit.decision = { at, action: !candidate ? "silent" : kind === "recheck" && unit.condition === "delivery_recheck" && recovered ? "cancel" : "present",
          reason: !candidate ? (unit.candidateFormed === null ? "initial_evidence_missing" : "no_initial_gap")
            : kind === "recheck" && unit.condition === "delivery_recheck" && recovered ? "independent_target_success" : "initial_target_gap",
          recovery: result.correct === null || !result.independent ? "unknown" : recovered ? "probe_success" : "probe_failure",
          initialSnapshot: unit.probes.t0, currentSnapshot: result,
          proposedSupportDepth: candidate ? "L2" : "L0", contentHash: candidate ? hash(hints[state.index]) : null };
        if(kind==="practice")unit.decision={...unit.decision,action:result.correct===false?"present":"silent",reason:result.correct===false?"current_target_gap":"no_current_verified_gap",proposedSupportDepth:result.correct===false?"L2":"L0"};
        detail.decision = unit.decision;
        state.stage = unit.decision.action === "present" ? "support" : "outcome";
      } else state.stage = "survey";
    } else if (input.action === "courseware_event" && ["explore", "support"].includes(state.stage)) {
      const event = input.event || {};
      const eventType = String(event.type || "").slice(0, 100);
      if (!/^(courseware_|parameter_|maic_)/.test(eventType)) fail("study_event_invalid", "课件事件类型不正确。", 400);
      // Client events are process evidence, never authoritative probe grades.
      detail = { processEvent: { type: eventType, clientAt: typeof event.clientAt === "string" ? event.clientAt.slice(0, 40) : null,
        data: Object.fromEntries(Object.entries(event.data || {}).filter(([key, value]) =>
          ["event_id", "resource_id", "resource_revision", "attempt_id", "challenge_id", "parameter", "value", "correct", "independent", "hint_count", "reset_count"].includes(key)
          && (typeof value === "boolean" || typeof value === "number" || typeof value === "string" && value.length <= 200))),
        provenance: "client_reported_not_mastery" } };
    } else if (input.action === "request_help" && state.stage === "explore") {
      unit.manualHelp = true; unit.manualHelpVisible = true; detail = { contentHash: hash(hints[state.index]), effect: "t1_not_independent" };
    } else if (input.action === "dismiss_manual_help" && state.stage === "explore") {
      unit.manualHelpVisible = false; detail = { effect: "hidden_but_t1_remains_nonindependent" };
    } else if (input.action === "continue" && state.stage === "explore") {
      if (Date.now() - unit.exploreStartedAt < protocol.minimumExploreMs) fail("study_explore_too_short", "请先完成共同探索，再进入下一题。");
      state.stage = "t1";
    } else if (["accept", "close", "skip", "later"].includes(input.action) && state.stage === "support") {
      unit.studentActions.push({ action: input.action, at });
      unit.followup = input.action === "accept" ? "accepted_then_independent_check" : "closed_without_escalation";
      state.stage = "outcome";
    } else if (input.action === "practice_draft" && kind === "embedded" && state.stage === "support") {
      if (typeof input.response !== "string" || input.response.length > 1200) fail("practice_draft_invalid", "练习想法最多1200字。", 400);
      unit.practiceResponse = input.response; detail = { response: input.response, assisted: true, countsAsAssessment: false };
    } else if (input.action === "exposure" && state.stage === "support") {
      if (input.fraction !== 0.5 || typeof input.visibleDurationMs !== "number" || input.visibleDurationMs < 1000 || input.visibleDurationMs > 3600000)
        fail("study_exposure_invalid", "可见记录格式不正确。", 400);
      unit.exposure = unit.exposure || { at, minimumFraction: .5, visibleDurationMs: input.visibleDurationMs, source: "client_reported", readingEstablished: false };
      detail = { exposure: unit.exposure };
    } else if (input.action === "survey" && state.stage === "survey") {
      const answers = input.answers || {};
      for (const key of ["interruption", "control", "effort"]) {
        if (answers[key] !== null && !(Number.isInteger(answers[key]) && answers[key] >= 1 && answers[key] <= 7)) fail("study_survey_invalid", "问卷需选择1至7或跳过。", 400);
      }
      unit.survey = { interruption: answers.interruption, control: answers.control, effort: answers.effort, at, version: "draft-unit-survey-v1" };
      unit.status = "complete"; detail = { survey: unit.survey };
      if(mainEntry)state.stage=state.units.every(u=>u.status==="complete")?"complete":"between_units";
      else {state.index++;state.stage=state.index>=points.length?"complete":"t0";if(state.units[state.index])state.units[state.index].status="entered";}
    } else fail("study_action_invalid", "此操作不适用于当前步骤。", 400);
    state.revision++; state.updatedAt = at;
    persist(userId, state, { type: input.action, at, previousStage, stage: state.stage, opportunityId: unit.opportunityId,
      protocolFingerprint: fingerprint, ...detail });
    return view(state);
  }
  return { enabled: true, kind, fingerprint, requiresPretest: Boolean(humanProtocol && assignmentMode === "participant-blocks"), state: id => view(load(id)), start, act,
    recordProcess(id,input={}){
      const s=load(id);if(!s || !["explore","support"].includes(s.stage) || input.knowledgePointId!==points[s.index])return {recorded:false,reason:"outside_current_exploration"};
      if(input.fingerprint!==fingerprint)fail("study_protocol_changed","学习版本不一致，请刷新。");
      const event=input.event||{};
      if(!/^(courseware_|parameter_|maic_|scene_|manual_)/.test(event.type||""))return {recorded:false};
      const opportunityId=s.units[s.index].opportunityId;
      if(input.opportunityId && input.opportunityId!==opportunityId)return {recorded:false,reason:"opportunity_mismatch"};
      const details=Object.fromEntries(Object.entries(event.data||{}).filter(([k,v])=>["event_id","attempt_id","attempt_number","resource_revision","hint_count","reset_count","time_on_task_ms","parameter","oldValue","newValue","value","event_type","source","independent","is_correct","challenge_id","resource_id","sceneType","correct","counts_as_student_evidence"].includes(k) && (typeof v==="boolean" || typeof v==="number"&&Number.isFinite(v) || typeof v==="string"&&v.length<=300)));
      const boundedId=value=>typeof value==="string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value)?value:null;
      const clientEventId=boundedId(event.eventId)||boundedId(details.event_id);
      const clientAt=typeof event.clientAt==="string" && /^\d{4}-\d\d-\d\dT/.test(event.clientAt) && event.clientAt.length<=40 && Number.isFinite(Date.parse(event.clientAt))?new Date(event.clientAt).toISOString():null;
      const at=new Date().toISOString(),record={type:String(event.type).slice(0,100),at,opportunityId,knowledgePointId:points[s.index],stage:s.stage,revision:s.revision,data:details,provenance:"client_reported_not_mastery",
        schemaVersion:"common-process-v2",clientEventId,clientAt,clientSessionId:boundedId(event.sessionId),
        sequenceIndex:Number.isSafeInteger(event.sequenceIndex)&&event.sequenceIndex>=0?event.sequenceIndex:null,
        observedStage:["explore","support"].includes(input.observedStage)?input.observedStage:null,
        clockSource:"server_receipt_and_untrusted_client"};
      const eventId=clientEventId?hash([id,protocol.id,opportunityId,clientEventId]):crypto.randomUUID();
      const store=sql();store.run("INSERT OR IGNORE INTO study_workbench_process VALUES (?,?,?,?,?)",[eventId,id,protocol.id,at,JSON.stringify(record)]);
      const inserted=store.getRowsModified()>0;db.saveNow();return {recorded:true,duplicate:!inserted,eventId};
    },
    specification:()=>({questionHash:protocol.questionHash,resourceHash:protocol.resourceHash,kind,protocolId:protocol.id}),
    manages:id=>Boolean(humanProtocol && load(id) && !["withdrawn","complete"].includes(load(id).stage)),
    latestEvidence(id,kp){const s=load(id);const u=s?.units.find(u=>u.knowledgePointId===kp);return u?{subSkill:u.subSkill,initial:u.probes.t0||null,current:u.probes.t1||null,outcome:u.probes.outcome||null}:null;},
    protects: id => ["t0", "t1", "outcome"].includes(load(id, true)?.stage),
    exportData() { return { protocol, fingerprint, generatedAt: new Date().toISOString(), dataClass: humanProtocol?"human_consented_research":mainEntry?"ordinary_learning_not_research":"engineering_synthetic_only",
      collectionSchemaVersion:"common-learning-data-v2",
      protocolArchives:rows("SELECT * FROM study_workbench_protocols WHERE protocol_id=? AND fingerprint=?",[protocol.id,fingerprint])
        .map(r=>({...r,archive:JSON.parse(r.protocol_json),protocol_json:undefined})),
      sessions: rows("SELECT user_id,state_json FROM study_workbench_sessions WHERE protocol_id=?", [protocol.id]).map(r => ({ userId: r.user_id, ...JSON.parse(r.state_json) })),
      events: rows("SELECT * FROM study_workbench_events WHERE protocol_id=? ORDER BY at,revision", [protocol.id]).map(r => ({ ...r, event: JSON.parse(r.event_json), event_json: undefined })),
      processEvents:rows("SELECT * FROM study_workbench_process WHERE protocol_id=? ORDER BY at,rowid",[protocol.id]).map(r=>({...r,event:JSON.parse(r.event_json),event_json:undefined})) }; }
  };
}
module.exports = { createWorkbench, sequenceFor, publicProbe, points, version };
