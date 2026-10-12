const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const presentation = require("../admin/presentation");

assert.equal(typeof presentation.publicCourseText, "function");
assert.equal(typeof presentation.feedbackContentHtml, "function");
assert.equal(typeof presentation.sceneTypeLabel, "function");
assert.equal(typeof presentation.knowledgeSceneLabel, "function");
assert.equal(typeof presentation.questionDisplayLabel, "function");
assert.equal(typeof presentation.questionInteractionLabel, "function");
assert.equal(typeof presentation.questionTypeLabel, "function");
assert.equal(typeof presentation.compareTableValues, "function");
assert.equal(typeof presentation.coachActionLabel, "function");
assert.equal(typeof presentation.plannerReasonsText, "function");

assert.equal(
  presentation.publicCourseText("V14-C1 GH-01-K01 输入、输出和函数规则"),
  "输入、输出和函数规则"
);
assert.equal(
  presentation.publicCourseText("GH-01 知识点：输入、输出和函数规则"),
  "知识点：输入、输出和函数规则"
);
assert.equal(presentation.publicCourseText("V14-C1", "未命名章节"), "未命名章节");
assert.equal(presentation.publicCourseText("V14-C1-post", "结业后测"), "结业后测");
assert.equal(presentation.publicCourseText("V14-X1 EXT-01-K01 微分方程", ""), "微分方程");
assert.equal(presentation.sceneTypeLabel("slide"), "讲解页");
assert.equal(presentation.sceneTypeLabel("simulation"), "动手调一调");
assert.equal(presentation.sceneTypeLabel("game"), "找错并改正");
assert.equal(
  presentation.knowledgeSceneLabel("GH-01-K01 输入、输出和函数规则", "game"),
  "输入、输出和函数规则 · 找错并改正"
);
assert.equal(
  presentation.knowledgeSceneLabel("输入、输出和函数规则", ""),
  "输入、输出和函数规则 · 历史记录未包含场景"
);
assert.equal(presentation.questionDisplayLabel("GH-01-PRE-Q3", "pre"), "前测第 3 题");
assert.equal(
  presentation.questionInteractionLabel({
    questionId: "GH-01-pre-q1",
    phase: "pre",
    order: 1,
    moduleTitle: "函数、坐标与图像读法入门",
    questionText: "输入 2 后，函数机器会输出什么？"
  }),
  "函数、坐标与图像读法入门 · 前测第 1 题「输入 2 后，函数机器会输出什么？」"
);
assert.doesNotMatch(
  presentation.questionInteractionLabel({
    questionId: "GH-01-pre-q1",
    phase: "pre",
    order: 1,
    moduleTitle: "GH-01 函数、坐标与图像读法入门"
  }),
  /GH-01/
);
assert.equal(presentation.questionTypeLabel("short_answer"), "简答题");
assert.equal(presentation.riskLevelLabel("high"), "高风险");
assert.equal(presentation.coachActionLabel("alternate_scene"), "换一种表征重学");
assert.equal(presentation.coachActionLabel("select_knowledge"), "自主勾选知识点");
assert.equal(presentation.coachActionLabel("review_knowledge"), "回看知识点");
assert.equal(presentation.coachActionLabel("unskip_knowledge"), "补学已跳过内容");
assert.equal(presentation.coachActionLabel("review_and_unskip_knowledge"), "回看并补学知识点");
assert.equal(presentation.coachActionLabel("unknown_internal_action"), "其他学习选择");
assert.equal(
  presentation.plannerReasonsText("same_concept_cluster;different_representation"),
  "属于同一知识簇、采用不同表征"
);
assert.equal(presentation.qaStatusLabel("pass"), "通过");
assert.ok(presentation.compareTableValues("10", "2", "asc") > 0);
assert.ok(presentation.compareTableValues("80%", "60%", "desc") < 0);
assert.ok(presentation.compareTableValues("2分 5秒", "45秒", "asc") > 0);
assert.ok(presentation.compareTableValues("2026-07-16 10:00", "2026-07-15 10:00", "desc") < 0);
assert.ok(presentation.compareTableValues("暂无", "1", "asc") > 0);

const shortContent = presentation.feedbackContentHtml("PPT乱码问题", (value) => value);
assert.equal(shortContent, '<p class="feedback-body">PPT乱码问题</p>');
assert.equal((shortContent.match(/PPT乱码问题/g) || []).length, 1);

const longText = "这是一条需要完整展示的较长反馈。".repeat(20);
const longContent = presentation.feedbackContentHtml(longText, (value) => value);
assert.equal((longContent.match(/这是一条需要完整展示的较长反馈。/g) || []).length, 20);
assert.doesNotMatch(longContent, /<summary>/);

const adminSource = fs.readFileSync(path.join(__dirname, "..", "admin", "admin.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");
const adminCss = fs.readFileSync(path.join(__dirname, "..", "admin", "admin.css"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
assert.doesNotMatch(adminSource, /<td>\$\{d\.nickname\}<\/td>/);
assert.doesNotMatch(adminSource, /<td[^>]*>\$\{users\[i\]\}<\/td>/);
assert.doesNotMatch(adminSource, /<th>\$\{ch\}<\/th>/);
[
  "quiz_submission",
  "quiz_resource_link_open",
  "quiz_resource_review_returned",
  "quiz_resource_review_abandoned",
  "short_answer_regrade_requested",
  "short_answer_regrade_succeeded",
  "short_answer_regrade_failed",
  "quiz_review_ready",
  "courseware_pre_check_submitted",
  "courseware_formative_check_submitted",
  "courseware_challenge_result",
  "courseware_exit_ticket_submitted",
  "courseware_confidence_submitted",
  "courseware_reflection_submitted",
  "knowledge_proactive_agent_decided",
  "knowledge_proactive_agent_silent",
  "knowledge_proactive_suggestion_shown",
  "knowledge_proactive_suggestion_accepted",
  "knowledge_proactive_suggestion_dismissed",
  "knowledge_proactive_suggestion_snoozed",
  "knowledge_proactive_scope_preference_changed",
  "knowledge_proactive_consent_notice_opened",
  "knowledge_proactive_withdrawal_confirm_opened",
  "knowledge_proactive_withdrawal_confirm_cancelled",
  "knowledge_proactive_participation_enrolled",
  "knowledge_proactive_participation_withdrawn",
  "proactive_participation_enrolled",
  "proactive_participation_withdrawn",
  "knowledge_proactive_outcomes_opened",
  "knowledge_proactive_outcome_submitted",
  "knowledge_quiz_review_continue",
  "knowledge_quiz_review_next",
  "knowledge_quiz_review_stopped",
  "knowledge_quiz_review_completed"
].forEach((eventType) => {
  assert.match(adminSource, new RegExp(`\\b${eventType}:\\s*["']`), `${eventType} must have a Chinese admin label`);
  if (eventType.startsWith("courseware_")) {
    assert.match(adminSource, /type\.startsWith\("courseware_"\)/, `${eventType} must use the courseware behavior summary`);
  } else {
    assert.match(adminSource, new RegExp(`type === ["']${eventType}["']|includes\\([^\\n]*["']${eventType}["']`), `${eventType} must have an admin behavior summary`);
  }
});
assert.match(adminHtml, /id="proactive-funnel-metrics"/);
assert.match(adminHtml, /id="export-phase-csv"/);
assert.match(adminHtml, /id="export-paths-csv"/);
assert.match(adminHtml, /id="export-engagement-csv"/);
assert.match(adminHtml, /id="export-courseware-checks-csv"/);
assert.match(adminHtml, /data-tab="proactive"/);
assert.match(adminHtml, /id="proactive-study-metrics"/);
assert.match(adminHtml, /id="table-proactive-decisions"/);
assert.match(adminHtml, /id="export-proactive-decisions-csv"/);
assert.match(adminHtml, /id="proactive-outcome-overview"/);
assert.match(adminHtml, /id="table-proactive-outcome-summary"/);
assert.match(adminHtml, /id="table-proactive-outcome-attempts"/);
assert.match(adminHtml, /id="export-proactive-outcomes-csv"/);
assert.match(adminHtml, /id="export-proactive-outcome-sessions-csv"/);
assert.match(adminHtml, /id="proactive-runtime-status"/);
assert.match(adminHtml, /id="proactive-runtime-toggle"/);
assert.match(adminHtml, /id="proactive-pause-reason"/);
assert.match(adminHtml, /id="proactive-protocol-facts"/);
assert.match(adminHtml, /id="proactive-integrity-signals"/);
assert.match(adminHtml, /id="table-proactive-participant-flow"/);
assert.match(adminHtml, /id="table-proactive-runtime-events"/);
assert.match(adminHtml, /id="table-proactive-assignment-roster"/);
assert.match(adminHtml, /个人分组名册/);
assert.match(adminHtml, /id="proactive-analysis-overview"/);
assert.match(adminHtml, /id="proactive-data-quality-status"/);
assert.match(adminHtml, /id="table-proactive-participant-analysis"/);
assert.match(adminHtml, /id="table-proactive-challenge-analysis"/);
assert.match(adminHtml, /id="export-proactive-participants-csv"/);
assert.match(adminHtml, /id="export-proactive-challenges-csv"/);
assert.match(adminHtml, /id="export-proactive-shadow-csv"/);
assert.match(adminHtml, /id="preview-regrade-btn"/);
assert.match(adminHtml, /id="run-regrade-btn"/);
assert.match(adminHtml, /id="select-all-regrade"/);
assert.match(adminHtml, /全选全部候选/);
assert.match(adminHtml, /id="export-regrade-audits-csv"/);
assert.match(adminHtml, /id="table-regrade-candidates"/);
assert.match(adminHtml, /admin\/admin\.js\?v=20260909-analysis-package-v11/);
assert.match(adminHtml, /admin\/admin\.css\?v=20260831-proactive-governance-v1/);
assert.match(adminHtml, /id="proactive-audit-timeline"/);
assert.match(adminHtml, /id="proactive-audit-detail"/);
assert.match(adminHtml, /id="proactive-audit-load-all"/);
assert.match(
  serverSource,
  /const retentionDelayHours = Number\([\s\S]*?protocol\?\.definition\?\.retentionDelayHours[\s\S]*?instrumentVersion:\s*protocol\?\.definition\?\.outcomeInstrumentVersion[\s\S]*?retentionDelayHours,/,
  "历史主动实验必须使用各自冻结协议中的量表版本与保持延迟"
);
assert.doesNotMatch(adminHtml, /id="table-phase-comparison"/);
assert.match(adminSource, /function phaseCsvRows/);
assert.match(adminSource, /function pathCsvRows/);
assert.match(adminSource, /function engagementCsvRows/);
assert.match(adminSource, /function renderProactiveFunnel/);
assert.match(adminSource, /interactionDashboard\?\.proactiveFunnel/);
assert.match(adminSource, /function renderProactiveStudy/);
assert.match(adminSource, /function renderProactiveAudit/);
assert.match(adminSource, /function proactiveAuditChain/);
assert.match(adminSource, /function proactiveLearningGeneration/);
assert.match(adminSource, /function proactiveStateTransitionHtml/);
assert.match(adminSource, /function proactiveLifecyclePhaseLabel/);
assert.match(adminSource, /function selectProactiveDecision/);
assert.match(adminSource, /data-proactive-audit-id/);
assert.match(adminSource, /formative_outcome:\s*"形成性测验结果"/);
assert.match(adminSource, /independent_attempt_outcome:\s*"支架后独立尝试"/);
assert.match(adminSource, /elicit_self_explanation:\s*"引导自我解释"/);
assert.match(adminSource, /concept_hint:\s*"概念关系线索"/);
assert.match(adminSource, /decompose_subgoal:\s*"拆分子目标"/);
assert.match(adminSource, /next_step_hint:\s*"提示下一步"/);
assert.match(adminSource, /partial_worked_example:\s*"部分解题示例"/);
assert.match(adminSource, /switch_representation:\s*"切换学习表征"/);
assert.match(adminSource, /policy_owned_probe:\s*"平台支架后检查题"/);
assert.match(adminSource, /courseware_semantic_event:\s*"课件语义结果事件"/);
assert.match(adminSource, /proactive_verification_submitted:\s*"支架后检查已提交"/);
assert.match(adminSource, /support_escalation_not_delivered:\s*"升级支架未实际交付，本轮已安全结束"/);
assert.match(adminSource, /closed:\s*"升级未交付，本轮已安全结束"/);
assert.match(adminSource, /function proactiveEvidenceItems/);
assert.match(adminSource, /"策略范围"/);
assert.match(adminSource, /"学习代次"/);
assert.match(adminSource, /<h5>决策状态转移<\/h5>/);
assert.match(adminSource, /"后续结果"/);
assert.match(adminSource, /"后续证据来源"/);
assert.match(adminSource, /"验证题ID"/);
assert.match(adminSource, /summary\.independent_success_exits/);
assert.match(adminSource, /summary\.l3_subgoal_decompositions/);
assert.match(adminSource, /summary\.l4_next_step_hints/);
assert.match(adminSource, /summary\.l5_partial_examples/);
assert.match(adminSource, /summary\.representation_switches/);
assert.match(adminSource, /summary\.snoozed/);
assert.match(adminSource, /summary\.alternative_requested/);
assert.match(adminSource, /autonomy\.scope_mutes/);
assert.match(adminSource, /scope_muted:\s*"已关闭知识点提醒"/);
assert.match(adminSource, /preference_off:\s*"已关闭全局主动提示"/);
assert.match(adminSource, /learning_reset:\s*"学习代次已重置"/);
assert.match(adminSource, /function syncProactiveConditionOptions/);
assert.match(adminSource, /policy\?\.experimentArms/);
assert.match(adminSource, /treatment_shallow:\s*"浅层主动组"/);
assert.match(adminSource, /treatment_full:\s*"完整主动组"/);
assert.match(adminSource, /data\.assignmentRoster/);
assert.match(adminSource, /#table-proactive-assignment-roster tbody/);
assert.match(adminSource, /function renderProactiveOutcomes/);
assert.match(adminSource, /function revealActiveAdminTab/);
assert.match(adminSource, /function proactiveOutcomeCsvRows/);
assert.match(adminSource, /function fetchAllProactiveOutcomeRows/);
assert.match(adminSource, /function proactiveOutcomeSessionCsvRows/);
assert.match(adminSource, /function fetchAllProactiveOutcomeSessionRows/);
assert.match(adminSource, /sessionSummary:\s*safeRows/);
assert.match(adminSource, /function proactiveAuditDisclosure/);
assert.match(adminSource, /<details class="proactive-audit-disclosure">/);
assert.match(adminSource, /proactiveAuditDisclosure\("证据快照"/);
assert.match(adminSource, /proactiveAuditDisclosure\("约束与预算"/);
assert.match(adminSource, /proactiveAuditDisclosure\("执行生命周期"/);
assert.match(adminSource, /proactiveAuditDisclosure\("后续结果"/);
assert.match(adminCss, /\.proactive-audit-chain-step/);
assert.match(adminCss, /\.proactive-audit-transition-state/);
assert.match(adminCss, /\.proactive-outcome-overview/);
assert.match(adminCss, /\.proactive-outcome-grid/);
assert.match(adminCss, /\.proactive-audit-chain-step\.is-l5/);
assert.match(adminCss, /\.proactive-audit-disclosure > summary/);
assert.match(adminCss, /\.proactive-audit-disclosure > summary:focus-visible/);
assert.match(adminCss, /\.proactive-audit-disclosure\[open\] > summary/);
assert.match(adminSource, /api\/admin\/research\/proactive-decisions/);
assert.match(adminSource, /function proactiveDecisionCsvRows/);
assert.match(adminSource, /function proactiveShadowCodingCsvRows/);
assert.match(adminSource, /function fetchAllProactiveDecisionRows/);
[
  "participation_status",
  "participation_consent_version",
  "participation_consented_at",
  "participation_withdrawn_at",
  "participation_withdrawal_reason"
].forEach((field) => {
  assert.match(
    adminSource,
    new RegExp(`row\\.${field}`),
    `proactive CSV exports must retain ${field}`
  );
});
const fetchProactiveStudySource = adminSource.match(
  /async function fetchProactiveStudy[\s\S]*?(?=\nfunction normalizePageData)/
)?.[0] || "";
assert.ok(
  fetchProactiveStudySource,
  "the proactive study fetch adapter must be inspectable"
);
[
  "participation",
  "protocol",
  "runtime",
  "runtimeEvents",
  "integrity",
  "participantFlow",
  "assignmentRoster",
  "participantAnalysis",
  "coursewareChallenges",
  "analysisSummary",
  "dataQuality"
].forEach((field) => {
  assert.match(
    fetchProactiveStudySource,
    new RegExp(`${field}:`),
    `the live admin fetch adapter must retain ${field}`
  );
});
assert.match(adminSource, /function renderProactiveGovernance/);
assert.match(adminSource, /function renderProactiveExperimentAnalysis/);
assert.match(adminSource, /function proactiveParticipantAnalysisCsvRows/);
assert.match(adminSource, /function proactiveChallengeAnalysisCsvRows/);
assert.match(adminSource, /cachedProactiveStudyData\.participantAnalysis/);
assert.match(adminSource, /cachedProactiveStudyData\.coursewareChallenges/);
assert.match(adminSource, /function updateProactiveRuntime/);
assert.match(adminSource, /api\/admin\/research\/proactive-runtime/);
assert.match(adminSource, /reviewer_id/);
assert.match(adminSource, /help_need_label/);
assert.match(adminSource, /interruptibility_label/);
assert.match(adminSource, /should_intervene/);
assert.match(adminSource, /false_positive/);
assert.match(adminCss, /\.proactive-governance-grid/);
assert.match(adminCss, /\.proactive-integrity-signal/);
assert.match(adminCss, /\.proactive-runtime-badge/);
assert.match(adminSource, /function loadRegradeCandidates/);
assert.match(adminSource, /function runSelectedRegrade/);
assert.match(adminSource, /function refreshRegradeAffectedViews/);
assert.match(adminSource, /function chunkedRegradeIds/);
assert.match(adminSource, /await loadUserDetail\(openUserDetailId, \{ scroll: false, signal \}\)/);
assert.match(adminSource, /function regradeAuditCsvRows/);
assert.match(adminSource, /REVIEW_AND_REGRADING/);
const regradeRefreshSource = adminSource.match(
  /async function refreshRegradeAffectedViews[\s\S]*?(?=\nasync function runSelectedRegrade)/
)?.[0] || "";
assert.ok(regradeRefreshSource, "the regrade refresh function must be inspectable");
[
  "overview",
  "user-progress",
  "chapter-accuracy",
  "question-errors",
  "phase-comparison",
  "question-type-accuracy",
  "score-distribution",
  "short-answer-responses"
].forEach((endpoint) => {
  assert.match(
    regradeRefreshSource,
    new RegExp(`fetchStats\\("${endpoint}"\\)`),
    `regrade refresh must reload ${endpoint}`
  );
});
assert.match(regradeRefreshSource, /cachedChapterData\s*=\s*chapter/);
assert.match(regradeRefreshSource, /cachedPhaseData\s*=\s*phase/);
assert.match(regradeRefreshSource, /loadUserDetail\(detailUserId,\s*\{\s*scroll:\s*false\s*\}\)/);
assert.match(
  adminSource,
  /await loadRegradeCandidates\(\{\s*quiet:\s*true\s*\}\);[\s\S]*await refreshRegradeAffectedViews\(affectedUserIds\)/,
  "a successful regrade must refresh candidates before all affected learning-outcome views"
);

console.log("admin presentation tests passed");
