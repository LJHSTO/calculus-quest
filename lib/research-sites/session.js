"use strict";
const crypto = require("node:crypto");
const materials = require("./materials");
const { decide, PROTECTED } = require("./policy");
const { digest } = require("./catalog");

const fail = (code, message, status = 409) => { throw Object.assign(new Error(message), { code, status }); };
const clone = x => JSON.parse(JSON.stringify(x));
const validGoals = ["cognitive", "metacognitive", "motivational", "emotional", "behavioral"];
const event = (s, type, now, details = {}) => ({ type, at: now, sessionId: s.id, learningSessionId: s.learningSessionId,
  index: s.index, scope: materials.points[s.index] || null, phase: s.phase, ...details });
function delay(s, protocol, name) { return s.mode === "demo" ? 1500 : protocol.study.parameters[name]; }

function createSession({ userId, protocol, mode, consent, now }) {
  if (!["demo", "formal"].includes(mode)) fail("research_mode_invalid", "研究模式无效。", 400);
  if (consent?.acknowledged !== true) fail("research_consent_required", "请先阅读说明并确认。", 400);
  if (mode === "formal" && (consent.version !== protocol.consentVersion || consent.adult !== true || consent.eligible !== true))
    fail("research_eligibility_required", "请核对参与条件和当前知情同意书。", 400);
  return {
    id: crypto.randomUUID(), userId, protocolId: protocol.id, fingerprint: protocol.fingerprint, mode,
    dataClass: mode === "formal" ? "consented_human_study" : "demonstration_not_research",
    revision: 0, phase: "baseline", index: 0, createdAt: now, lastSeen: now,
    learningSessionId: crypto.randomUUID(), allocation: null,
    consent: { version: protocol.consentVersion, at: now, acknowledged: true,
      externalModel: consent.externalModel === true, futureBenchmark: consent.futureBenchmark === true },
    baseline: null, quizzes: {}, survey: null, drafts: {},
    authority: { paused: false, withdrawn: false, declinedPoint: null, grant: null },
    offers: 0, lastOfferAt: null, units: materials.points.map(scope => ({ scope, probes: {}, offers: [], feedback: [], processSummary: {}, memory: null })),
    activeOffer: null, candidate: null, sampledFeedback: 0, returnVisit: false,
    caseResponses: [], designResponse: null, conversation: []
  };
}
function scopeOf(s) { return materials.points[s.index]; }
function syncOffer(s) {
  if (!s.activeOffer) return;
  for (const unit of s.units) {
    const index = unit.offers.findIndex(o => o.id === s.activeOffer.id);
    if (index >= 0) unit.offers[index] = clone(s.activeOffer);
  }
}
function startPoint(s, now) {
  s.phase = "t0"; s.authority.declinedPoint = null; s.authority.grant = null;
  s.activeOffer = null; s.candidate = null; s.pointStartedAt = now;
}
function planSupport(s, protocol, offer, goal) {
  return materials.support(s.index, { goal: goal || offer.decision.supportGoal,
    efficacyEvidence: protocol.study.id === "efficacy" && s.allocation.arm === "evidence_feedback"
      ? s.units[s.index].probes.t1 || s.units[s.index].probes.t0 : null });
}
function tick(s, protocol, now, rawContext, events) {
  if (!["explore", "after_t1", "explore_return"].includes(s.phase)) return;
  const unit = s.units[s.index];
  if (s.activeOffer) {
    if (s.activeOffer.status === "inquiry" && now >= s.activeOffer.expiresAt) {
      s.activeOffer.status = "expired"; events.push(event(s, "inquiry_expired", now, { opportunityId: s.activeOffer.id }));
      syncOffer(s); s.activeOffer = null;
    } else return;
  }
  if (!s.candidate || s.candidate.closed) return;
  const boundary = s.phase === "after_t1" || s.phase === "explore_return";
  const context = { phase: s.phase, scope: scopeOf(s), sessionId: s.learningSessionId, returnSession: s.returnVisit,
    visible: rawContext?.visible === true, typing: rawContext?.typing === true, dragging: rawContext?.dragging === true,
    busy: rawContext?.busy === true, idleMs: Math.min(Math.max(Number(rawContext?.idleMs) || 0, 0), 60000), boundary };
  const decision = decide({ study: protocol.study, arm: s.allocation.arm, now, context,
    evidence: { initial: unit.probes.t0, current: s.returnVisit ? unit.probes.return_probe : unit.probes.t1,
      historical: unit.memory, explicitNeed: s.candidate.explicitNeed, candidateAt: s.candidate.at },
    authority: s.authority, budget: { pointOffers: unit.offers.length - (s.returnVisit ? unit.returnOfferStart || 0 : 0), sessionOffers: s.offers, lastOfferAt: s.lastOfferAt } });
  // Heartbeat repetition is not another independent observation or opportunity.
  const signature = digest({ action: decision.action, reason: decision.reason, candidate: s.candidate.id });
  if (signature !== s.candidate.lastDecision) {
    events.push(event(s, "decision", now, { opportunityId: s.candidate.id, decision, context,
      evidence: { initial: unit.probes.t0 || null, current: context.returnSession ? unit.probes.return_probe : unit.probes.t1 || null, historical: unit.memory } }));
    s.candidate.lastDecision = signature;
  }
  if (decision.action === "cancel") { s.candidate.closed = true; return; }
  if (!["inquire", "present"].includes(decision.action)) return;
  const offer = { id: s.candidate.id, decision, offeredAt: now, expiresAt: now + protocol.study.parameters.inquiryExpiryMs,
    status: decision.action === "present" ? "support" : "inquiry", exposure: null, acceptedAt: null, content: null };
  if (offer.status === "support") { offer.content = planSupport(s, protocol, offer); offer.acceptedAt = now; offer.authorization = "scoped_grant"; }
  s.activeOffer = offer; unit.offers.push(offer); s.offers++; s.lastOfferAt = now; s.candidate.closed = true;
  events.push(event(s, "offer_created", now, { opportunityId: offer.id, decision, actualExposure: false }));
}
function candidate(s, now, basis, explicitNeed = null) {
  s.candidate = { id: crypto.randomUUID(), at: now, basis, explicitNeed, closed: false };
}
function closeHelp(s, now, events, reason) {
  if (s.activeOffer) {
    events.push(event(s, "support_closed", now, { opportunityId: s.activeOffer.id, reason }));
    s.activeOffer.status = "closed"; syncOffer(s); s.activeOffer = null;
  }
}

function applyAction(previous, protocol, input, now, { allocate } = {}) {
  if (!input || typeof input !== "object" || !Number.isFinite(now)) fail("research_action_invalid", "操作格式无效。", 400);
  if (input.fingerprint !== protocol.fingerprint || previous.fingerprint !== protocol.fingerprint)
    fail("research_protocol_changed", "本研究材料或协议已更新，请联系研究负责人；旧记录已保留。");
  if (input.revision !== previous.revision) fail("research_revision_conflict", "页面已更新，请刷新后重试；没有重复提交。");
  const s = clone(previous), events = [], unit = s.units[s.index];
  if (s.phase === "withdrawn") fail("research_withdrawn", "你已退出本研究。");
  if (input.action === "withdraw") {
    closeHelp(s, now, events, "withdrawn"); s.phase = "withdrawn";
    s.authority = { paused: true, withdrawn: true, grant: null, declinedPoint: scopeOf(s) };
    s.consent.withdrawnAt = now;
  } else if (input.action === "save_draft") {
    if (!PROTECTED.has(s.phase) || ["complete", "withdrawn"].includes(s.phase) || !input.draft || typeof input.draft !== "object" || Array.isArray(input.draft)
      || Buffer.byteLength(JSON.stringify(input.draft)) > 50000) fail("research_draft_invalid", "当前阶段不能保存该草稿。", 400);
    s.drafts[s.phase] = { at: now, value: clone(input.draft) };
  } else if (input.action === "baseline_submit" && s.phase === "baseline") {
    s.baseline = materials.validateSurvey(protocol.study.id === "design-space" ? "framework_baseline" : "baseline", input.responses); s.phase = "pre";
    if (protocol.study.id === "design-space") {
      if (typeof allocate !== "function") throw new Error("案例次序分配服务不可用");
      s.allocation = allocate(s); s.phase = "case_coding";
      events.push(event(s, "randomized", now, { allocation: s.allocation, purpose: "counterbalance_case_order_not_learning_treatment" }));
    }
  } else if (input.action === "quiz_submit" && ["pre", "post", "transfer", "retention"].includes(s.phase)) {
    const phase = s.phase;
    s.quizzes[phase] = { ...materials.gradeQuiz(phase, input.responses), at: now, independent: true };
    delete s.drafts[phase];
    if (phase === "pre") {
      if (typeof allocate !== "function") throw new Error("研究分配服务不可用");
      s.allocation = allocate(s); s.learningStartedAt = now; startPoint(s, now);
      events.push(event(s, "randomized", now, { allocation: s.allocation, baselineQuiz: { score: s.quizzes.pre.score, pendingReview: s.quizzes.pre.pendingReview } }));
    } else if (phase === "post") { s.phase = "transfer"; s.retentionDueAt = now + delay(s, protocol, "retentionDelayMs"); }
    else if (phase === "transfer") s.phase = "survey";
    else { s.phase = "complete"; s.completedAt = now; }
  } else if (input.action === "probe_submit" && ["t0", "t1", "outcome", "return_probe", "return_outcome"].includes(s.phase)) {
    const phase = s.phase, form = phase === "return_probe" ? "t0" : phase === "return_outcome" ? "outcome" : phase;
    const expected = materials.publicProbe(s.index, form);
    if (input.probeId !== expected.id) fail("research_probe_mismatch", "题目不属于当前阶段。", 400);
    if (input.confidence != null && (typeof input.confidence !== "number" || input.confidence < 0 || input.confidence > 100 || !Number.isFinite(input.confidence))) fail("research_confidence_invalid", "把握程度应在0至100之间。", 400);
    if (typeof (input.explanation || "") !== "string" || (input.explanation || "").length > 2000) fail("research_explanation_invalid", "说明文字过长。", 400);
    const check = { ...materials.gradeProbe(s.index, form, input.response), id: `${s.id}:${scopeOf(s)}:${phase}`,
      scope: scopeOf(s), response: input.response, confidence: input.confidence ?? null, explanation: input.explanation || "",
      at: now, serverGraded: true, independent: true, formVersion: expected.instrumentVersion };
    unit.probes[phase] = check; delete s.drafts[phase];
    events.push(event(s, "independent_probe", now, { check }));
    if (phase === "t0") { s.phase = "explore"; unit.exploreStartedAt = now; candidate(s, now, "t0"); }
    else if (phase === "t1") {
      s.phase = "after_t1";
      if (!s.candidate || s.candidate.closed) candidate(s, now, "t1");
    } else if (phase === "return_probe") { s.phase = "explore_return"; candidate(s, now, "historical"); }
    else s.phase = "between";
  } else if (input.action === "context" && ["explore", "after_t1", "explore_return"].includes(s.phase)) {
    tick(s, protocol, now, input.context, events);
    if (!s.candidate || !s.activeOffer) {
      const eligible = !unit.sampleChecked && !s.feedbackSample && s.sampledFeedback < protocol.study.parameters.maximumSamplePrompts
        && !s.authority.paused && s.authority.declinedPoint !== scopeOf(s)
        && input.context?.visible === true && input.context?.typing !== true && input.context?.dragging !== true
        && Number(input.context?.idleMs) >= protocol.study.parameters.safeIdleMs;
      if (eligible) {
        unit.sampleChecked = true;
        // Stable per-opportunity sampling prevents selecting a favourable subset after seeing labels.
        const draw = parseInt(digest([s.id, scopeOf(s), "no-offer-sample"]).slice(0, 8), 16) / 2 ** 32;
        const selected = draw < protocol.study.parameters.unsolicitedFeedbackSampleProbability;
        events.push(event(s, "feedback_sampling_decision", now, { selected, probability: protocol.study.parameters.unsolicitedFeedbackSampleProbability, source: "first_eligible_no_offer_moment" }));
        if (selected) {
          s.feedbackSample = { id: crypto.randomUUID(), at: now, scope: scopeOf(s), trigger: "no_offer", drawProbability: protocol.study.parameters.unsolicitedFeedbackSampleProbability };
          s.sampledFeedback++; events.push(event(s, "feedback_sampled", now, s.feedbackSample));
        }
      }
    }
  } else if (input.action === "begin_t1" && s.phase === "explore") {
    if (now - unit.exploreStartedAt < (s.mode === "demo" ? 1000 : protocol.study.parameters.minimumExploreMs)) fail("research_explore_too_short", "请先完成这一段讲解或探索，再继续独立检查。");
    closeHelp(s, now, events, "independent_probe"); s.phase = "t1";
  } else if (input.action === "begin_outcome" && ["after_t1", "explore_return"].includes(s.phase)) {
    unit.feedbackWindow = { from: (s.returnVisit ? unit.probes.return_probe : unit.probes.t1)?.at || null, to: now,
      returnVisit: s.returnVisit, offered: unit.offers.some(o=>o.offeredAt >= ((s.returnVisit ? unit.probes.return_probe : unit.probes.t1)?.at || now)) };
    closeHelp(s, now, events, "independent_outcome"); s.phase = s.returnVisit ? "return_outcome" : "outcome";
  } else if (input.action === "accept" && s.activeOffer?.status === "inquiry" && !PROTECTED.has(s.phase)) {
    const offer = s.activeOffer;
    if (offer.id !== input.opportunityId || now >= offer.expiresAt) fail("research_offer_expired", "这次询问已过期。");
    let goal = offer.decision.supportGoal;
    if (offer.decision.needsClarification) {
      if (!validGoals.includes(input.goal)) fail("research_need_required", "请确认希望解决的问题，或拒绝这次帮助。", 400);
      goal = input.goal;
    }
    if (input.grant === true && !offer.decision.allowScopedPermission) fail("research_grant_not_available", "当前研究条件不提供连续授权。", 400);
    if (input.grant === true) s.authority.grant = { scope: scopeOf(s), sessionId: s.learningSessionId, goal,
      grantedAt: now, expiresAt: now + 30 * 60 * 1000, revoked: false };
    offer.status = "support"; offer.acceptedAt = now; offer.confirmedGoal = goal;
    offer.content = planSupport(s, protocol, offer, goal); offer.authorization = input.grant ? "new_scoped_grant" : "single_confirmation";
    events.push(event(s, "support_accepted", now, { opportunityId: offer.id, authorization: offer.authorization, content: offer.content, goal }));
  } else if (input.action === "offer_exposed" && s.activeOffer && !PROTECTED.has(s.phase)) {
    if (input.opportunityId !== s.activeOffer.id || !["inquiry", "support"].includes(input.kind) || input.kind !== s.activeOffer.status)
      fail("research_exposure_mismatch", "帮助显示状态已改变。");
    if (input.visible !== true) fail("research_exposure_not_visible", "未确认可见的内容不能计为曝光。", 400);
    const property = input.kind === "inquiry" ? "inquiryExposure" : "exposure";
    if (!s.activeOffer[property]) {
      s.activeOffer[property] = { at: now, source: "client_visibility_report", placement: s.activeOffer.decision.placement };
      events.push(event(s, "actual_exposure_report", now, { opportunityId: s.activeOffer.id, kind: input.kind, ...s.activeOffer[property] }));
    }
  } else if (["decline", "later", "close_help"].includes(input.action) && !PROTECTED.has(s.phase)) {
    const id = s.activeOffer?.id;
    closeHelp(s, now, events, input.action);
    if (input.action === "decline") { s.authority.declinedPoint = scopeOf(s); s.authority.grant = null; }
    if (input.action === "later") s.lastOfferAt = now;
    events.push(event(s, "student_help_choice", now, { opportunityId: id || null, choice: input.action }));
  } else if (input.action === "revoke") {
    s.authority.grant = null; closeHelp(s, now, events, "permission_revoked");
  } else if (input.action === "pause") {
    s.authority.paused = true; s.authority.grant = null; closeHelp(s, now, events, "paused");
  } else if (input.action === "resume") {
    s.authority.paused = false;
  } else if (input.action === "end_learning_session") {
    s.authority.grant = null; s.learningSessionId = crypto.randomUUID(); closeHelp(s, now, events, "session_ended");
  } else if (input.action === "feedback_submit") {
    if (PROTECTED.has(s.phase)) fail("research_feedback_protected", "请先完成独立测量，再填写帮助反馈。");
    const sample = s.feedbackSample?.id === input.opportunityId ? s.feedbackSample : null;
    const feedbackUnit = sample ? s.units[materials.points.indexOf(sample.scope)] : s.units.find(u => u.offers.some(o => o.id === input.opportunityId));
    const source = sample || feedbackUnit?.offers.find(o => o.id === input.opportunityId);
    if (!source || feedbackUnit.feedback.some(f => f.opportunityId === source.id)) fail("research_feedback_mismatch", "反馈对象无效或已经提交。");
    feedbackUnit.feedback.push({ opportunityId: source.id, at: now, sampling: source.trigger || "offered",
      contextAt: source.at || source.offeredAt, responses: materials.validateSurvey("opportunity", input.responses) });
    if (s.feedbackSample?.id === source.id) s.feedbackSample = null;
  } else if (input.action === "common_feedback" && s.phase === "between") {
    if (unit.commonFeedback?.some(f=>f.window.returnVisit===s.returnVisit)) fail("research_feedback_duplicate","这段时间的反馈已经保存。");
    unit.commonFeedback ||= [];
    unit.commonFeedback.push({at:now,window:clone(unit.feedbackWindow),responses:materials.validateSurvey("common_decision",input.responses),
      interpretation:"retrospective_report_not_preintervention_ground_truth"});
  } else if (input.action === "next_point" && s.phase === "between") {
    if (s.feedbackSample) { events.push(event(s,"feedback_sample_expired",now,{opportunityId:s.feedbackSample.id,reason:"knowledge_point_changed_without_response"}));s.feedbackSample=null; }
    if (s.index < 5) { s.index++; startPoint(s, now); if (s.returnVisit) s.phase = "return_probe"; }
    else if (protocol.study.id === "memory" && !s.returnVisit) {
      for (const u of s.units) u.memory = clone(u.probes.outcome);
      s.phase = "return_wait"; s.returnDueAt = now + delay(s, protocol, "memoryReturnDelayMs");
    } else s.phase = "post";
  } else if (input.action === "begin_return" && s.phase === "return_wait") {
    if (now < s.returnDueAt) fail("research_return_too_early", "尚未到跨会话回访时间。");
    s.returnVisit = true; s.returnStartedAt = now; s.index = 0; s.learningSessionId = crypto.randomUUID();
    s.offers = 0; s.lastOfferAt = null; s.sampledFeedback = 0; s.feedbackSample = null;
    for (const u of s.units) { u.returnOfferStart = u.offers.length; u.sampleChecked = false; }
    startPoint(s, now); s.phase = "return_probe";
  } else if (input.action === "survey_submit" && s.phase === "survey") {
    s.survey = { at: now, responses: materials.validateSurvey(protocol.study.id === "design-space" ? "framework_final" : "final", input.responses), instrumentVersion: materials.VERSION };
    s.phase = protocol.study.id === "design-space" ? "complete" : "retention_wait";
    if (s.phase === "complete") s.completedAt = now;
  } else if (input.action === "case_submit" && s.phase === "case_coding") {
    if (!Array.isArray(input.responses) || input.responses.length !== 4 || new Set(input.responses.map(r => r?.caseId)).size !== 4 || input.responses.some(r => ![0, 1, 2, 3].includes(r?.caseId) || typeof r?.interpretation !== "string" || r.interpretation.length < 1 || r.interpretation.length > 4000
      || !Array.isArray(r.dimensions) || r.dimensions.some(d => !["D1", "D2", "D3", "D4", "D5", "D6", "无法归类"].includes(d)))) fail("research_case_invalid", "请填写四个案例的分类、依据或无法归类的原因。", 400);
    s.caseResponses = clone(input.responses); s.phase = "design_task";
  } else if (input.action === "design_submit" && s.phase === "design_task") {
    if (typeof input.response !== "string" || input.response.trim().length < 10 || input.response.length > 8000) fail("research_design_invalid", "请描述你的策略及适用边界。", 400);
    s.designResponse = input.response; s.phase = "survey";
  } else if (input.action === "begin_retention" && s.phase === "retention_wait") {
    if (now < s.retentionDueAt) fail("research_retention_too_early", "尚未到延迟测量时间。");
    s.phase = "retention";
  } else fail("research_action_not_allowed", "当前阶段不允许这项操作。", 400);
  if (now - s.lastSeen > 30 * 60 * 1000 || s.authority.grant?.expiresAt <= now) s.authority.grant = null;
  syncOffer(s); s.lastSeen = now; s.revision++;
  events.push(event(s, input.action, now, { previousPhase: previous.phase, revision: s.revision }));
  return { state: s, events };
}

function publicView(s, protocol, now) {
  if (!s) return { protocol: publicProtocol(protocol), session: null };
  const assessmentPhase = ["pre", "post", "transfer", "retention"].includes(s.phase);
  const probePhase = ["t0", "t1", "outcome", "return_probe", "return_outcome"].includes(s.phase);
  const form = s.phase === "return_probe" ? "t0" : s.phase === "return_outcome" ? "outcome" : s.phase;
  const learnPhase = ["explore", "after_t1", "explore_return"].includes(s.phase);
  const active = learnPhase ? s.activeOffer : null;
  const grant = s.authority.grant?.expiresAt > now ? s.authority.grant : null;
  return { protocol: publicProtocol(protocol), session: {
    id: s.id, mode: s.mode, dataClass: s.dataClass, revision: s.revision, phase: s.phase, index: s.index,
    total: 6, scope: scopeOf(s), name: materials.lesson(s.index)?.name, fingerprint: s.fingerprint,
    quiz: assessmentPhase ? materials.publicQuiz(s.phase) : null,
    probe: probePhase ? materials.publicProbe(s.index, form) : null,
    questionnaire: ["baseline", "survey"].includes(s.phase) ? materials.questionnaire(protocol.study.id === "design-space" ? s.phase === "baseline" ? "framework_baseline" : "framework_final" : s.phase) : null,
    draft: s.drafts[s.phase]?.value || null, lesson: learnPhase ? materials.lesson(s.index) : null,
    exploreReadyAt: s.phase === "explore" ? s.units[s.index].exploreStartedAt + (s.mode === "demo" ? 1000 : protocol.study.parameters.minimumExploreMs) : null,
    offer: active ? { id: active.id, status: active.status, expiresAt: active.expiresAt, placement: active.decision.placement,
      text: active.status === "inquiry" ? (protocol.study.id === "memory" ? "上次独立练习的记录里有一个不确定的地方；这次也可能已经解决。现在需要一点支持吗？你可以拒绝。" : "前面的学习记录里有过一个不确定的地方；现在也可能已经解决。需要一点支持吗？你也可以继续独立思考。") : null,
      clarification: active.decision.needsClarification, canGrant: active.decision.allowScopedPermission,
      content: active.status === "support" ? active.content : null } : null,
    feedbackSample: !PROTECTED.has(s.phase) && s.feedbackSample ? { ...s.feedbackSample, questionnaire: { ...materials.questionnaire("opportunity"), items: materials.questionnaire("opportunity").items.filter(q=>q.id!=="fit") } } : null,
    feedbackOffers: learnPhase ? s.units[s.index].offers.filter(o => o.status !== "inquiry" && !s.units[s.index].feedback.some(f => f.opportunityId === o.id))
      .map(o => ({ id: o.id, questionnaire: materials.questionnaire("opportunity") })) : [],
    controls: { paused: s.authority.paused, grantActive: Boolean(grant), grantExpiresAt: grant?.expiresAt || null,
      canAsk: learnPhase && s.consent.externalModel, canWithdraw: s.phase !== "withdrawn", assistanceAllowed: learnPhase },
    conversation: learnPhase ? s.conversation.filter(c => c.scope === scopeOf(s)).slice(-20) : [],
    returnDueAt: s.returnDueAt || null, retentionDueAt: s.retentionDueAt || null,
    caseOrder: s.phase === "case_coding" ? (s.allocation?.conditionIndex ? [2, 3, 0, 1] : [0, 1, 2, 3]) : null,
    commonFeedback: s.phase === "between" ? { questionnaire: materials.questionnaire("common_decision"), saved: Boolean(s.units[s.index].commonFeedback?.some(f=>f.window.returnVisit===s.returnVisit)) } : null,
    summary: s.phase === "complete" ? { completedAt: s.completedAt, next: "本次研究流程已完成，感谢参与。成绩解释与研究结果请按说明联系负责人。" } : null
  } };
}
function publicProtocol(p) {
  return { id: p.id, fingerprint: p.fingerprint, studyId: p.study.id, title: p.study.participantTitle,
    mode: p.mode, consentVersion: p.consentVersion, consent: p.consent, readiness: p.readiness,
    materialsVersion: materials.VERSION, questionnaireStatus: "adapted_items_not_validated_scale",
    scoreRelease: "after_independent_measurement_and_blind_review" };
}
module.exports = { createSession, applyAction, publicView, publicProtocol };
