"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const audit = require("../lib/proactive-policy/evidence-audit");
const policy = require("../lib/proactive-policy");
const proactivity = require("../lib/proactive-policy/proactivity");
const root = path.resolve(__dirname, "..");
const passed = [];
const check = (name, fn) => { fn(); passed.push(name); };
const now = Date.parse("2026-10-14T02:00:00.000Z");
const iso = offset => new Date(now + offset).toISOString();
const pendingRow = { pending_candidate_kind: "quiet_dwell", pending_candidate_at: iso(-10000),
  pending_candidate_expires_at: iso(10000), pending_evidence_json: JSON.stringify({
    confirmedGapCount: 2, families: ["time", "result"], capturedAt: iso(-10000)
  }) };
const visible = { exposureSource: "qualified_visible", qualifiedVisible: true, fraction: 0.6,
  visibleDurationMs: 1050, minimumFraction: 0.5, minimumDurationMs: 1000 };
const clicked = { exposureSource: "explicit_interaction", qualifiedVisible: false, fraction: 0,
  visibleDurationMs: 0, minimumFraction: 0, minimumDurationMs: 0 };

check("旧展示请求保留兼容并明确未测量", () => assert.deepEqual(audit.exposureReceipt({}).value,
  { exposureSource: "legacy_unspecified", qualifiedVisible: false, measurementProvenance: "legacy_unqualified" }));
check("合格可见与显式交互严格分开", () => {
  assert.equal(audit.exposureReceipt(visible).value.qualifiedVisible, true);
  assert.equal(audit.exposureReceipt(clicked).value.qualifiedVisible, false);
});
check("类型、范围、阈值降级与权限额外字段", () => {
  for (const body of [{ ...visible, qualifiedVisible: "true" }, { ...visible, visibleDurationMs: "1000" },
    { ...visible, visibleDurationMs: Infinity }, { ...visible, visibleDurationMs: -1 },
    { ...visible, fraction: 1.1 }, { ...visible, fraction: 0.49 },
    { ...visible, minimumFraction: 0.1 }, { ...visible, minimumDurationMs: 1 },
    { ...clicked, qualifiedVisible: true }, { ...visible, exposureSource: "admin" }]) {
    assert.equal(audit.exposureReceipt(body).ok, false);
  }
  assert.equal(Object.hasOwn(audit.exposureReceipt({ ...visible, role: "admin", supportLevel: "L5" }).value, "role"), false);
});
check("候选缺失、过期、未来与非法有效期", () => {
  assert.equal(audit.pendingCandidate({}, now).reason, "pending_absent");
  assert.equal(audit.pendingCandidate({ ...pendingRow, pending_candidate_expires_at: iso(-1) }, now).reason, "pending_expired");
  assert.equal(audit.pendingCandidate({ ...pendingRow, pending_candidate_at: iso(1) }, now).reason, "pending_in_future");
  assert.equal(audit.pendingCandidate({ ...pendingRow, pending_candidate_expires_at: iso(-10001) }, now).reason, "pending_timestamp_invalid");
});
const target = { knowledgePointId: "GH-01-K01", subSkill: "unique-input", evidenceScope: "sub_skill" };
const correctResult = { id: "server-score-1", ...target, independent: true, serverGraded: true,
  capturedAt: iso(-1), correct: true };
check("恢复须同子技能、独立、服务器评分且时间有效", () => {
  const args = { target, knowledgePointId: target.knowledgePointId, candidateAt: now - 10000, now };
  assert.equal(audit.recoveryAssessment({ ...args, results: [correctResult] }).status, "verified_recovered");
  for (const row of [{ ...correctResult, subSkill: "different" }, { ...correctResult, independent: false },
    { ...correctResult, serverGraded: false }, { ...correctResult, capturedAt: iso(1) },
    { ...correctResult, capturedAt: iso(-10001) }, { ...correctResult, knowledgePointId: "different" }]) {
    assert.equal(audit.recoveryAssessment({ ...args, results: [row] }).status, "unknown");
  }
  assert.equal(audit.recoveryAssessment({ ...args, results: [correctResult,
    { ...correctResult, id: "new-failure", capturedAt: iso(0), correct: false }] }).status, "not_recovered");
  assert.equal(audit.recoveryAssessment({ ...args, results: [correctResult,
    { ...correctResult, id: "conflict", correct: false }] }).status, "unknown");
});
check("普通进度和未映射技能始终unknown，历史缺口不冒充当前缺口", () => {
  const result = audit.boundaryAudit({ pending: audit.pendingCandidate(pendingRow, now), now,
    knowledgePointId: target.knowledgePointId, unitId: target.knowledgePointId,
    evidence: { confirmedGapCount: 0, naturalBoundary: true }, observedProgressCount: 3 });
  assert.equal(result.initialEvidenceSnapshot.confirmedGapCount, 2);
  assert.equal(result.currentEvidenceSnapshot.confirmedGapCount, 0);
  assert.equal(result.recovery.status, "unknown");
  assert.equal(result.progressEstablishesMastery, false);
  assert.equal(audit.boundaryAudit({ pending: audit.pendingCandidate({}, now), now,
    knowledgePointId: target.knowledgePointId, evidence: {} }).initialEvidenceSnapshot, null);
});
check("可信恢复进入策略静默而unknown仍执行原有需求判断", () => {
  const config = policy.configFromEnv({ PROACTIVE_POLICY_MODE: "active", PROACTIVE_ASSIGNMENT_SALT: "audit-only" });
  const args = { config, assignment: { condition: "treatment" },
    context: { chapterId: "V14-C1", unitId: "GH-01-K01", knowledgePointId: "GH-01-K01", sceneType: "simulation" },
    signal: { kind: "quiet_dwell", boundaryRecheck: true }, now, budget: { remaining: 20 } };
  const evidence = { families: ["time", "result"], confirmedGapCount: 1, dwellSeconds: 180,
    pendingCandidateValid: true, naturalBoundary: true };
  const recovered = policy.evaluate({ ...args, evidence: { ...evidence,
    boundaryRecheckAudit: { recovery: audit.recoveryAssessment({ target, results: [correctResult],
      knowledgePointId: target.knowledgePointId, candidateAt: now - 10000, now }) } } });
  assert.equal(recovered.displayAllowed, false);
  assert.ok(recovered.reasonCodes.includes("quiet_dwell_verified_target_recovery"));
  assert.equal(policy.evaluate({ ...args, evidence }).decision, "intervene");
});

async function port() { return new Promise((resolve, reject) => {
  const socket = net.createServer(); socket.on("error", reject); socket.listen(0, "127.0.0.1", () => {
    const value = socket.address().port; socket.close(() => resolve(value));
  });
}); }

async function main() {
  const output = path.join(root, "output", "本轮平台优化");
  fs.mkdirSync(output, { recursive: true });
  const temp = fs.mkdtempSync(path.join(output, "证据API隔离-"));
  const dbPath = path.join(temp, "study.sqlite");
  const address = `http://127.0.0.1:${await port()}`;
  const launch = () => spawn(process.execPath, ["server.js", new URL(address).port], { cwd: root, windowsHide: true,
    env: { ...process.env, HOST: "127.0.0.1", DB_PATH: dbPath, LLM_PROVIDER: "mock", NODE_ENV: "development",
      ADMIN_TOKEN: "audit-test-only", LOCAL_ADMIN_AUTH_BYPASS: "false", PROACTIVE_POLICY_MODE: "active",
      PROACTIVE_EXPERIMENT_ID: "evidence-audit-api", PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C1",
      PROACTIVE_POLICY_VERSION: "evidence-audit-api-r1", PROACTIVE_ASSIGNMENT_SALT: "audit-only",
      PROACTIVE_EXPERIMENT_ARMS: "treatment", PROACTIVE_DISPLAY_ARMS: "treatment",
      PROACTIVE_PARTICIPATION_MODE: "implicit-pilot", PROACTIVE_GLOBAL_PREFERENCE_CONTROL: "true",
      LEARNING_ASSISTANT_DAILY_INTERVENTIONS: "100", LEARNING_ASSISTANT_COUNT_MOCK_USAGE: "true" },
    stdio: ["ignore", "pipe", "pipe"] });
  let server = launch(), logs = "";
  const capture = () => { server.stdout.on("data", x => { logs += x; }); server.stderr.on("data", x => { logs += x; }); };
  capture();
  const stop = async () => { if (server.exitCode === null) {
    const exited = new Promise(resolve => server.once("exit", resolve)); server.kill("SIGTERM"); await exited;
  } };
  const healthy = async () => {
    for (let i = 0; ; i++) {
      if (server.exitCode !== null) throw new Error(`隔离服务启动失败 ${logs.slice(-1500)}`);
      try { if ((await fetch(address + "/api/health")).ok) break; } catch {}
      if (i >= 99) throw new Error("隔离服务健康检查超时");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  const call = async (route, body, token) => {
    const response = await fetch(address + route, { method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(route==='/api/admin/learning/reset'?{'x-admin-token':'audit-test-only'}:{}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  };
  const SQL = await require("sql.js")();
  const query = (sql, params = []) => { const database = new SQL.Database(fs.readFileSync(dbPath));
    try { const s = database.prepare(sql); s.bind(params); const rows = []; while (s.step()) rows.push(s.getAsObject()); s.free(); return rows; }
    finally { database.close(); } };
  const chapter = require("../data/multi-scene-learning-route.json").chapters.find(x => x.id === "V14-C1");
  const points = chapter.modules.flatMap(x => x.knowledgePoints);
  let sequence = 0;
  const participant = async () => {
    const registered = await call("/api/auth/register", { nickname: `证据测试${++sequence}`, password: "audit-test-password", email: "" });
    assert.equal(registered.status, 200);
    const token = registered.data.token, userId = registered.data.participant.participantId;
    const pre = await call("/api/learning/quiz/submit", { chapterId: "V14-C1", unitId: "V14-C1-pre", phase: "pre",
      answers: chapter.flow.preQuiz.questions.map(q => ({ questionId: q.id,
        response: q.type === "short_answer" ? "__unknown__" : q.type === "multiple" ? q.answer : q.answer[0] })) }, token);
    assert.equal(pre.status, 200, JSON.stringify(pre.data));
    const point = points.find((x, index) => index < 4 && proactivity.proactivityPolicyForCondition(proactivity.assignKnowledgePointCondition({
      participantId: userId, knowledgePointIndex: index, knowledgePointCount: points.length, salt: "audit-only" }).condition) === "fixed");
    assert.ok(point); return { token, userId, point, scene: point.interactionTypes[0] };
  };
  const formative = async (p, correct) => {
    const q = p.point.formativeQuiz.questions[0];
    const result = await call("/api/learning/quiz/submit", { chapterId: "V14-C1", unitId: `${p.point.id}-formative`, phase: "formative",
      answers: [{ questionId: q.id, response: correct ? q.answer[0] : q.options.find(x => !q.answer.includes(x.value)).value }] }, p.token);
    assert.equal(result.status, 200, JSON.stringify(result.data)); return result;
  };
  const event = async (p, type, age = 0, data = {}, research) => {
    const id = `audit-${++sequence}`;
    const result = await call("/api/learning/events", { events: [{ eventId: id, type: "interaction", payload: {
      eventId: id, schemaVersion: 1, eventType: type, source: "iframe", chapterId: "V14-C1",
      unitId: p.point.id, unitType: "knowledge", sceneType: p.scene,
      timing: { clientAt: new Date(Date.now() + age).toISOString(), durationMs: 300 }, data,
      ...(research === undefined ? {} : { research }) } }] }, p.token);
    assert.equal(result.status, 200, JSON.stringify({ response: result.data, server: logs.slice(-3000) })); return id;
  };
  const quiet = (p, recheck = false) => call("/api/learning/assistant/intervention", { chapterId: "V14-C1", unitId: p.point.id,
    sceneType: p.scene, signal: { kind: "quiet_dwell", dwellSeconds: 180, boundaryRecheck: recheck }, contextRef: { kind: "unit", scope: "lesson" } }, p.token);
  const hint = async p => {
    await formative(p, false);
    const result = await call("/api/learning/assistant/intervention", { chapterId: "V14-C1", unitId: `${p.point.id}-formative`,
      sceneType: "", signal: { kind: "formative_outcome", phase: "formative" }, contextRef: { kind: "quiz", scope: "quiz" } }, p.token);
    assert.equal(result.status, 200); assert.equal(result.data.study.deliveryDecision, "intervene"); return result.data.decisionId;
  };
  try {
    await healthy();
    for (const [label, metadata] of [["旧请求", {}], ["实际可见", visible], ["显式交互", clicked]]) {
      const p = await participant(), decisionId = await hint(p);
      const resolutionUrl = `/api/learning/proactive/${decisionId}/resolution`;
      assert.equal((await call(resolutionUrl, { resolution: "shown", ...visible, minimumFraction: 0.1 }, p.token)).status, 400);
      const shown = await call(resolutionUrl, { resolution: "shown", ...metadata, supportLevel: "L5", role: "admin" }, p.token);
      assert.equal(shown.status, 200);
      const replay = await call(resolutionUrl, { resolution: "shown", ...clicked }, p.token);
      assert.equal(replay.status, 200); assert.equal(replay.data.data.idempotent, true);
      assert.equal((await call(resolutionUrl, { resolution: "accepted" }, p.token)).status, 200);
      const row = query("SELECT followup_outcome_json FROM proactive_interventions WHERE decision_id = ?", [decisionId])[0];
      const saved = JSON.parse(row.followup_outcome_json).shownExposure;
      assert.deepEqual(saved, audit.exposureReceipt(metadata).value);
      const receipt = JSON.parse(query("SELECT payload FROM events WHERE id = ?", [`${decisionId}:shown`])[0].payload).data;
      assert.equal(receipt.exposureSource, saved.exposureSource);
      assert.equal(receipt.qualifiedVisible, saved.qualifiedVisible);
      assert.equal(query("SELECT support_level FROM proactive_decisions WHERE id = ?", [decisionId])[0].support_level, "L1");
      passed.push(`API${label}：白名单、持久化、幂等与接受后保留`);
    }
    {
      const p = await participant(), decisionId = await hint(p);
      assert.equal((await call(`/api/learning/proactive/${decisionId}/resolution`, {
        resolution: "shown", ...clicked
      }, p.token)).status, 200);
      const interactedId = await event(p, "knowledge_proactive_suggestion_interacted", 0, {
        decisionId, interaction: "accept", ...clicked
      });
      const forged = { experimentId: "unrelated-experiment", protocolFingerprint: "old-or-forged",
        learningGeneration: 9999, condition: "forged", assignmentVersion: "forged" };
      const visibleId = await event(p, "proactive_surface_visible", 0, { decisionId, ...visible }, forged);
      const rows = query("SELECT id, user_id, learning_generation, payload FROM events WHERE id IN (?, ?)",
        [`${p.userId}:${interactedId}`, `${p.userId}:${visibleId}`]);
      assert.equal(rows.length, 2);
      for (const row of rows) {
        const research = JSON.parse(row.payload).research;
        assert.equal(row.user_id, p.userId);
        assert.equal(row.learning_generation, 1);
        assert.equal(research.learningGeneration, 1);
        assert.equal(research.experimentId, "evidence-audit-api");
        assert.notEqual(research.protocolFingerprint, forged.protocolFingerprint);
        assert.notEqual(research.condition, forged.condition);
        assert.notEqual(research.assignmentVersion, forged.assignmentVersion);
        assert.equal(research.measurementContextSource, "authenticated_server_ingest");
        assert.ok(Number.isFinite(Date.parse(research.measurementContextBoundAt)));
      }
      const exported = await call("/api/admin/research/analysis-package?experimentId=evidence-audit-api", undefined, "audit-test-only");
      assert.equal(exported.status, 200);
      const summary = exported.data.data.tables.proactive_decisions.find(row => row.decision_id === decisionId);
      assert.equal(summary.exposure_measurement_status, "qualified_visible");
      assert.equal(summary.qualified_visible, true);
      assert.equal(summary.qualified_visible_event_count, 1);
      assert.equal(summary.explicit_interaction_observed, true);
      assert.equal(JSON.parse(summary.followup_outcome_json).shownExposure.exposureSource, "explicit_interaction",
        "先点击的业务回执保留，后续纯曝光须由独立事件补齐");
      assert.deepEqual(JSON.parse(summary.qualified_visible_event_ids_json), [`${p.userId}:${visibleId}`]);
      passed.push("真实事件API到分析导出：缺省/伪造research由认证上下文绑定，先点击后曝光正确合并");

      const other = await participant();
      await event(other, "proactive_surface_visible", 0, { decisionId, ...visible }, forged);
      const afterOther = await call("/api/admin/research/analysis-package?experimentId=evidence-audit-api", undefined, "audit-test-only");
      const ownerSummary = afterOther.data.data.tables.proactive_decisions.find(row => row.decision_id === decisionId);
      assert.equal(ownerSummary.qualified_visible_event_count, 1,
        "另一认证身份不能把曝光事件配给本学生候选");
      passed.push("真实事件API到分析导出：跨学生候选引用不计入原学生曝光");

      // A stored historical receipt must not acquire the current protocol on
      // replay. Seed one old row in the stopped, isolated fixture only.
      const legacyEventId = `historical-visible-${++sequence}`;
      const legacyPayload = { eventId: legacyEventId, eventType: "proactive_surface_visible", chapterId: "V14-C1",
        unitId: p.point.id, research: { experimentId: "evidence-audit-api", protocolFingerprint: "historical-protocol",
          learningGeneration: 1 }, data: { decisionId, ...visible } };
      await stop();
      const database = new SQL.Database(fs.readFileSync(dbPath));
      database.run("INSERT INTO events (id,user_id,type,payload,learning_generation,created_at) VALUES (?,?,?,?,?,?)",
        [`${p.userId}:${legacyEventId}`, p.userId, "interaction", JSON.stringify(legacyPayload), 1, new Date().toISOString()]);
      fs.writeFileSync(dbPath, Buffer.from(database.export())); database.close();
      server = launch(); capture(); await healthy();
      assert.equal((await call("/api/learning/events", { events: [{ eventId: legacyEventId,
        type: "interaction", payload: { ...legacyPayload, research: forged } }] }, p.token)).status, 200);
      const unchanged = query("SELECT payload FROM events WHERE id=?", [`${p.userId}:${legacyEventId}`])[0];
      assert.deepEqual(JSON.parse(unchanged.payload), legacyPayload);
      const afterReplay = await call("/api/admin/research/analysis-package?experimentId=evidence-audit-api", undefined, "audit-test-only");
      assert.equal(afterReplay.data.data.tables.proactive_decisions.find(row => row.decision_id === decisionId).qualified_visible_event_count, 1);
      passed.push("历史曝光事件重放不改写原协议，旧协议事件继续排除");

      const resetParticipant = await participant(), oldDecisionId = await hint(resetParticipant);
      const snapshotState = await call("/api/learning/snapshot", undefined, resetParticipant.token);
      const reset = await call("/api/admin/learning/reset", { generation: snapshotState.data.generation,
        baseRevision: snapshotState.data.revision, snapshot: {} }, resetParticipant.token);
      assert.equal(reset.status, 200);
      const staleGenerationId = await event(resetParticipant, "proactive_surface_visible", 0, {
        decisionId: oldDecisionId, ...visible
      }, { ...forged, learningGeneration: 1 });
      const staleGenerationRow = query("SELECT learning_generation, payload FROM events WHERE id=?",
        [`${resetParticipant.userId}:${staleGenerationId}`])[0];
      assert.equal(staleGenerationRow.learning_generation, 2);
      assert.equal(JSON.parse(staleGenerationRow.payload).research.learningGeneration, 2);
      const afterReset = await call("/api/admin/research/analysis-package?experimentId=evidence-audit-api", undefined, "audit-test-only");
      assert.equal(afterReset.data.data.tables.proactive_decisions.find(row => row.decision_id === oldDecisionId).qualified_visible_event_count, 0,
        "重置后的客户端旧代次声明不能给旧候选补造曝光");
      passed.push("重置后旧代次声明按当前代次绑定，不能关联旧回合候选");
    }
    {
      const p = await participant(); await event(p, "interactive_submit");
      const result = await quiet(p, true); assert.equal(result.status, 200);
      assert.equal(result.data.study.observation.d2.recheck.pendingStatus, "pending_absent");
      assert.equal(result.data.study.deliveryDecision, "stay_silent"); passed.push("API缺失候选不允许伪造边界展示");
    }
    {
      const p = await participant(); await formative(p, false); await event(p, "interactive_scroll", -120000);
      const initial = await quiet(p); assert.equal(initial.data.study.pendingBoundaryEvaluation, true);
      const noBoundary = await quiet(p, true); assert.equal(noBoundary.data.study.deliveryDecision, "stay_silent");
      assert.equal(noBoundary.data.study.observation.d2.recheck.reason, "natural_boundary_not_verified");
      await event(p, "courseware_interaction_complete", 0, { completed: true });
      const current = await quiet(p, true); assert.equal(current.status, 200);
      assert.equal(current.data.study.observation.d2.recheck.recovery.status, "unknown");
      assert.equal(current.data.study.observation.d2.recheck.reason, "current_confirmed_gap_persists");
      assert.equal(current.data.study.observation.d1.facts.sceneAttempts, 0,
        "一般完成事件的completed=true不能变成一次独立正确作答");
      const stored = JSON.parse(query("SELECT evidence_snapshot_json FROM proactive_decisions WHERE id = ?", [current.data.decisionId])[0].evidence_snapshot_json);
      assert.ok(stored.boundaryRecheckAudit.initialEvidenceSnapshot.confirmedGapCount > 0);
      assert.equal(stored.boundaryRecheckAudit.initialDecisionId, initial.data.decisionId);
      assert.ok(stored.proactivityCondition); assert.ok(stored.proactivityAssignmentDigest);
      passed.push("API错误持续：边界校验、普通完成不证明恢复、双快照与分配入库");
    }
    {
      const p = await participant(); await formative(p, false); await event(p, "interactive_scroll", -120000);
      assert.equal((await quiet(p)).data.study.pendingBoundaryEvaluation, true);
      await event(p, "interactive_submit", 60000);
      const result = await quiet(p, true);
      assert.equal(result.data.study.deliveryDecision, "stay_silent");
      assert.equal(result.data.study.observation.d2.recheck.reason, "natural_boundary_not_verified");
      passed.push("API未来边界事件被排除，不能提前授权送达");
    }
    {
      const p = await participant(); await formative(p, false); await event(p, "interactive_scroll", -120000);
      assert.equal((await quiet(p)).data.study.pendingBoundaryEvaluation, true);
      // A completed formative assessment cannot be resubmitted. Simulate an
      // authoritative stored-result correction in the stopped isolated fixture.
      // This is not evidence of a new independent skill assessment.
      await stop();
      const database = new SQL.Database(fs.readFileSync(dbPath));
      database.run("UPDATE quiz_results SET is_correct=1, score=max_score WHERE user_id=? AND unit_id=?",
        [p.userId, `${p.point.id}-formative`]);
      fs.writeFileSync(dbPath, Buffer.from(database.export())); database.close();
      server = launch(); capture(); await healthy();
      await event(p, "interactive_submit");
      const result = await quiet(p, true); const snapshots = result.data.study.observation.d1.evidenceSnapshots;
      assert.ok(snapshots.initial.confirmedGapCount > 0); assert.equal(snapshots.current.confirmedGapCount, 0);
      assert.equal(result.data.study.observation.d2.recheck.recovery.status, "unknown");
      assert.equal(result.data.study.deliveryDecision, "stay_silent");
      passed.push("API旧缺口已关闭：不回灌历史错误，也不冒称独立掌握");
    }
    for (const kind of ["expired", "future"]) {
      const p = await participant(); await formative(p, false); await event(p, "interactive_scroll", -120000);
      assert.equal((await quiet(p)).data.study.pendingBoundaryEvaluation, true);
      await stop();
      const database = new SQL.Database(fs.readFileSync(dbPath));
      if (kind === "expired") database.run("UPDATE proactive_policy_state SET pending_candidate_at=?, pending_candidate_expires_at=? WHERE user_id=? AND scope_key=?",
        [new Date(Date.now()-100000).toISOString(), new Date(Date.now()-1000).toISOString(), p.userId, p.point.id]);
      else database.run("UPDATE proactive_policy_state SET pending_candidate_at=?, pending_candidate_expires_at=? WHERE user_id=? AND scope_key=?",
        [new Date(Date.now()+120000).toISOString(), new Date(Date.now()+240000).toISOString(), p.userId, p.point.id]);
      fs.writeFileSync(dbPath, Buffer.from(database.export())); database.close();
      server = launch(); capture(); await healthy(); await event(p, "interactive_submit");
      const result = await quiet(p, true);
      assert.equal(result.status, 200); assert.equal(result.data.study.deliveryDecision, "stay_silent");
      assert.equal(result.data.study.observation.d2.recheck.pendingStatus,
        kind === "expired" ? "pending_expired" : "pending_in_future");
      passed.push(`API${kind === "expired" ? "过期" : "未来"}候选无法授权展示`);
    }
    {
      const p = await participant();
      await event(p, "courseware_challenge_result", -130000, { is_correct: false, independent: true, hint_count: 0, reset_count: 0 });
      const initial = await quiet(p); assert.equal(initial.data.study.pendingBoundaryEvaluation, true);
      await event(p, "interactive_submit"); const result = await quiet(p, true);
      assert.ok(result.data.study.observation.d1.facts.sceneFailures > 0);
      assert.equal(result.data.study.observation.d2.recheck.reason, "current_process_struggle_persists");
      assert.equal(result.data.study.deliveryDecision, "intervene");
      passed.push("API过程挣扎：无测验缺口的候选在边界仍可达");
    }
    const report = { at: new Date().toISOString(), result: "通过", count: passed.length, tests: passed,
      limitations: ["verified恢复仅做严格pure helper/策略分支测试；现有真实候选缺少独立子技能映射，API明确保持unknown。",
        "隔离mock API回归，不是学生学习效果或真人实验。"] };
    fs.writeFileSync(path.join(output, "后端证据与曝光回归.json"), JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await stop();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
