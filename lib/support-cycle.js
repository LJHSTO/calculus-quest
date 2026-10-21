"use strict";

const crypto = require("node:crypto");
const goals = require("./support-goals");
const activeStatuses = ["queued", "offered", "engaged", "awaiting_check", "postponed"];

function createStore({ db, clock = Date.now, experimentId }) {
  let initialized = false;
  const pending = new Map();
  function sql() {
    const d = db.getDbSync();
    if (!initialized) {
      d.run(`CREATE TABLE IF NOT EXISTS learner_support_cycles (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, scope TEXT NOT NULL,
        generation INTEGER NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL,
        payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS learner_support_owner ON learner_support_cycles(user_id,generation,scope,updated_at);`);
      initialized = true;
    }
    return d;
  }
  const now = () => new Date(clock()).toISOString();
  function rows(query, args) {
    const stmt = sql().prepare(query), result = [];
    try { stmt.bind(args); while (stmt.step()) result.push(stmt.getAsObject()); } finally { stmt.free(); }
    return result.map(r => ({ ...JSON.parse(r.payload_json), id: r.id, status: r.status, revision: r.revision }));
  }
  function current(user, scope, generation) {
    return rows("SELECT * FROM learner_support_cycles WHERE user_id=? AND scope=? AND generation=? ORDER BY rowid DESC LIMIT 1", [user, scope, generation])[0] || null;
  }
  function get(user, id, generation) {
    return rows("SELECT * FROM learner_support_cycles WHERE user_id=? AND id=? AND generation=?", [user, id, generation])[0] || null;
  }
  function audit(user, cycle, eventType, extra = {}) {
    db.insertEvent({ id: crypto.randomUUID(), user_id: user, type: "interaction", created_at: now(), payload: {
      schemaVersion: 1, eventType: `support_cycle_${eventType}`, source: "support_cycle_server",
      chapterId: "V14-C1", unitId: cycle.scope, generation: cycle.generation,
      research: { experimentId, kind: "engineering-demonstration" },
      data: { cycleId: cycle.id, revision: cycle.revision, status: cycle.status, at: now(), ...extra }
    } });
  }
  function save(user, cycle, eventType, extra) {
    cycle.revision = (cycle.revision || 0) + 1;
    cycle.updatedAt = now();
    sql().run(`INSERT INTO learner_support_cycles VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,revision=excluded.revision,payload_json=excluded.payload_json,updated_at=excluded.updated_at`,
    [cycle.id, user, cycle.scope, cycle.generation, cycle.status, cycle.revision, JSON.stringify(cycle), cycle.createdAt, cycle.updatedAt]);
    audit(user, cycle, eventType, extra); db.saveNow(); return cycle;
  }
  function report(user, scope, generation, input, profile, profileRevision) {
    if (!goals.CURRICULUM[scope]) throw new Error("知识点无效");
    const need = goals.validateNeed(input);
    const prior = current(user, scope, generation);
    const requestId=typeof input.requestId==="string"&&/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId)?input.requestId:null;
    if(requestId&&prior?.requestId===requestId)return prior;
    if (prior?.status === "awaiting_check") throw Object.assign(new Error("请先完成或跳过独立检查"), { status: 409 });
    if (prior && activeStatuses.includes(prior.status)) save(user, { ...prior, status: "closed", closeReason: "student_revised_need" }, "superseded");
    const plan = goals.selectPlan(need, profile), at = clock();
    const cycle = { id: crypto.randomUUID(), requestId, experimentId, scope, generation, createdAt: now(), revision: 0,
      status: plan ? "queued" : "closed", closeReason: need.need === "none" ? "student_declined" : plan ? null : "need_unresolved",
      blockedUntil:need.need==="none"?new Date(at+profile.cooldownSeconds*1000).toISOString():null,
      need, plan, profile: { ...profile }, profileRevision, contentVersion: goals.VERSION,
      dueAt: new Date(at + (profile.timingMode === "delayed" ? profile.delaySeconds * 1000 : 0)).toISOString(),
      expiresAt: new Date(at + profile.ttlSeconds * 1000).toISOString(), rounds: 0, content: null,
      feedback: null, check: null, checkResult: null, exposure: null,
      initiation: "student_confirmed_need", evidenceBoundary: "自述不是诊断；操作次数不用于推断动机；自评不等于掌握" };
    return save(user, cycle, "need_confirmed", { need, plan, profile: cycle.profile, profileRevision, initiation: cycle.initiation });
  }
  function checkOwner(user, id, generation, revision) {
    const cycle = get(user, id, generation);
    if (!cycle) throw Object.assign(new Error("学习支持记录不存在或不属于当前账号与轮次"), { status: 404 });
    if (current(user, cycle.scope, generation)?.id !== id) throw Object.assign(new Error("本轮帮助已更新，请重新读取"), { status: 409 });
    if (revision !== undefined && revision !== cycle.revision) throw Object.assign(new Error("记录已在另一页面更新，请重新读取"), { status: 409 });
    return cycle;
  }
  function gateReason(cycle, guard) {
    if (guard.protected) return "independent_assessment";
    if (guard.profileRevision !== cycle.profileRevision) return "configuration_changed";
    if (guard.disabled) return "student_or_protocol_disabled";
    if (guard.occupied) return "another_support_cycle_active";
    if (Date.parse(cycle.expiresAt) <= clock()) return "expired";
    if (Date.parse(cycle.dueAt) > clock()) return "waiting_for_due_time";
    if (cycle.profile.boundaryOnly && !guard.boundary) return "waiting_for_boundary";
    return null;
  }
  async function advance(user, scope, generation, { guard, generate, memory = [] }) {
    const key = `${user}:${scope}:${generation}`;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      let cycle = current(user, scope, generation);
      if (!cycle || !["queued", "postponed"].includes(cycle.status)) return cycle;
      const reason = gateReason(cycle, guard());
      if (reason) {
        if (reason === "expired" || reason === "configuration_changed") cycle.status = "expired";
        if (cycle.lastGate !== reason) save(user, { ...cycle, lastGate: reason }, "decision_silent", { reason });
        return current(user, scope, generation);
      }
      cycle = save(user, { ...cycle, lastGate: "eligible", generationStartedAt: now() }, "decision_generate", {
        decisionSource: "confirmed_need_and_rule", plan: cycle.plan, evidence: cycle.need, memory,
        modelDoesNotChoosePermissions: true, calibratedPsychologicalInference: false
      });
      const version = cycle.revision;
      const content = await generate({ scope, need: cycle.need, plan: cycle.plan, memory,
        previous: cycle.content && { message: cycle.content.message, feedback: cycle.feedback } });
      const fresh = current(user, scope, generation);
      if (fresh?.id !== cycle.id || fresh.revision !== version) {
        audit(user, cycle, "generation_discarded", { reason: "cycle_changed", audit: content.audit }); db.saveNow(); return fresh;
      }
      const after = gateReason(fresh, guard());
      if (after) return save(user, { ...fresh, lastGate: after, status: ["expired", "configuration_changed"].includes(after) ? "expired" : fresh.status }, "generation_discarded", { reason: after, audit: content.audit });
      return save(user, { ...fresh, status: "offered", content, exposure:null, rounds: fresh.rounds + 1, offeredAt: now(), lastGate: "eligible" }, "offered", {
        plan: fresh.plan, content, decisionSource: "confirmed_need_and_rule", delivery: "offered_not_exposure"
      });
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  }
  function act(user, id, generation, input, { adapter }) {
    const c = checkOwner(user, id, generation, input.revision);
    const action = input.action;
    if (action === "exposed") {
      if(input.round!==undefined&&input.round!==c.rounds)throw Object.assign(new Error("提示轮次已更新"),{status:409});
      if (!["offered", "engaged"].includes(c.status) || c.exposure) return c;
      if (input.visibleMs < 1000 || input.visibleFraction < .5) throw new Error("尚未达到可见曝光标准");
      return save(user, { ...c, exposure: { at: now(), round:c.rounds, source: "client_visibility_receipt", visibleMs: 1000, minimumFraction: .5 } }, "exposed", { source: "client_visibility_receipt", round:c.rounds, notAttentionProof: true });
    }
    if (action === "close" || action === "decline") {
      if (!activeStatuses.includes(c.status)) return c;
      return save(user, { ...c, status: "closed", blockedUntil:new Date(clock()+c.profile.cooldownSeconds*1000).toISOString(), closeReason: action === "close" ? "student_closed" : "student_declined" }, "closed", { reason: action });
    }
    if (action === "postpone") {
      if (!["offered", "engaged", "queued"].includes(c.status)) throw new Error("当前状态不能暂缓");
      return save(user, { ...c, status: "postponed", dueAt: new Date(clock() + 300000).toISOString(), expiresAt: new Date(clock() + Math.max(600000, c.profile.ttlSeconds * 1000)).toISOString() }, "postponed", { delaySeconds: 300 });
    }
    if (action === "accept") {
      if (c.status !== "offered") throw new Error("当前没有可接受的帮助");
      return save(user, { ...c, status: "engaged", acceptedAt: now() }, "accepted");
    }
    if (action === "feedback") {
      if (!["offered", "engaged"].includes(c.status)) throw new Error("请先查看当前帮助");
      if (!["helped", "not_helped", "mismatch", "prefer_stop"].includes(input.result)) throw new Error("请选择反馈");
      const feedback = { result: input.result, ratings: goals.ratings(input.ratings), note: String(input.note || "").trim().slice(0, 600),
        perceivedGoal: Object.hasOwn(goals.GOALS, input.perceivedGoal) ? input.perceivedGoal : null, at: now(), selfReportNotLearningGain: true };
      const follow = input.requestMore === true && input.result !== "prefer_stop" && c.rounds <= c.profile.supportFollowups;
      return save(user, { ...c, feedback, status: follow ? "queued" : "engaged",
        dueAt: new Date(clock() + c.profile.cooldownSeconds * 1000).toISOString(),
        expiresAt: new Date(clock() + (c.profile.cooldownSeconds + c.profile.ttlSeconds) * 1000).toISOString(),
        closeReason: input.result === "prefer_stop" ? "student_stop" : null,
        ...(input.result === "prefer_stop" ? { status: "closed",blockedUntil:new Date(clock()+c.profile.cooldownSeconds*1000).toISOString() } : {}) }, "feedback", { feedback, followupQueued: follow, followupLimit: c.profile.supportFollowups });
    }
    if (action === "start_check") {
      if (!["offered", "engaged"].includes(c.status)) throw new Error("当前没有可检查的帮助");
      const check = adapter.nextVerificationCheck(c.scope, "L1", c.check?.id);
      if (!check) throw new Error("本知识点暂无可用独立检查");
      return save(user, { ...c, status: "awaiting_check", check, checkStartedAt: now() }, "check_started", { check, evidenceScope: "local_independent_probe_not_common_outcome" });
    }
    if (action === "submit_check" || action === "skip_check") {
      if (c.status !== "awaiting_check" || input.checkId !== c.check.id) throw Object.assign(new Error("独立检查已更新"), { status: 409 });
      const grade = action === "skip_check" ? null : adapter.gradeVerificationCheck({ knowledgePointId: c.scope, supportLevel: "L1", checkId: c.check.id, response: input.response });
      if (action !== "skip_check" && !grade) throw new Error("请选择有效答案");
      const result = { checkId: c.check.id, response: grade?.response ?? null, correct: grade?.correct ?? null,
        status: grade ? grade.correct ? "correct" : "incorrect" : "skipped", at: now(), evidenceScope: "local_independent_probe_not_mastery" };
      return save(user, { ...c, status: "closed",blockedUntil:new Date(clock()+c.profile.cooldownSeconds*1000).toISOString(), closeReason: "independent_check_finished", checkResult: result }, "check_result", { result });
    }
    throw new Error("不支持的学习帮助操作");
  }
  function state(user, generation) {
    return rows("SELECT * FROM learner_support_cycles WHERE user_id=? AND generation=? ORDER BY rowid DESC LIMIT 60", [user, generation]);
  }
  function cancel(user,generation,reason){for(const c of state(user,generation))if(activeStatuses.includes(c.status))save(user,{...c,status:"closed",closeReason:reason},"closed",{reason});}
  return { current, report, advance, act, state, cancel,
    protects: (user, generation) => state(user, generation).some(c => c.status === "awaiting_check"),
    active: (user, scope, generation) => activeStatuses.includes(current(user, scope, generation)?.status),
    blocksAutomatic(user,scope,generation){const c=current(user,scope,generation);return Boolean(c&&(activeStatuses.includes(c.status)||Date.parse(c.blockedUntil)>clock()));},
    cancelForConfiguration(user, generation) {cancel(user,generation,"configuration_changed");}
  };
}
module.exports = { createStore, activeStatuses };
