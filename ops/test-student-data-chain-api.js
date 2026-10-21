"use strict";
// A synthetic integration fixture; never uses or changes the normal entry DB.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), net = require("node:net");
const crypto = require("node:crypto"), { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const { points } = require("../lib/study-workbench");
async function main() {
  const dir = fs.mkdtempSync(path.join(root, "output", "student-data-api-fixture-"));
  const publicPointer = path.join(root, "output", "函数极限预览.json");
  const pointerBefore = fs.existsSync(publicPointer) ? fs.readFileSync(publicPointer, "utf8") : null;
  const port = await new Promise(resolve => {
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1", () => { const port = socket.address().port; socket.close(() => resolve(port)); });
  });
  const adminToken = crypto.randomBytes(32).toString("hex");
  const env = { ...process.env, DB_PATH: path.join(dir, "synthetic.db"), HOST: "127.0.0.1",
    ADMIN_TOKEN: adminToken, LOCAL_ADMIN_AUTH_BYPASS: "false", NODE_ENV: "test",
    LLM_PROVIDER: "mock", GRADING_LLM_PROVIDER: "mock", PROACTIVE_POLICY_MODE: "off",
    RATE_LIMIT_MAX: "5000" };
  delete env.MAIN_LEARNING_PROTOCOL_FILE;
  delete env.PROACTIVE_STUDY_WORKBENCH;
  const log = fs.openSync(path.join(dir, "服务日志.txt"), "a");
  const child = spawn(process.execPath, ["server.js", String(port)],
    { cwd: root, env, windowsHide: true, stdio: ["ignore", log, log] });
  fs.closeSync(log);
  const base = `http://127.0.0.1:${port}`;
  async function request(route, body, token, status = 200) {
    const response = await fetch(base + route, { method: body === undefined ? "GET" : "POST",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(response.status, status, `${route} 状态码`);
    return response.json();
  }
  try {
    let ready = false;
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null) throw new Error("隔离服务提前退出，请检查合成测试目录");
      try { if ((await fetch(base + "/api/health")).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, "隔离服务应就绪");
    await request("/api/learning/common-tasks", undefined, undefined, 401);
    await request("/api/admin/research/common-tasks", undefined, undefined, 403);
    const user = await request("/api/auth/register",
      { nickname: "合成数据链路", email: "", password: crypto.randomBytes(24).toString("base64url") });
    const token = user.token;
    let state = (await request("/api/learning/common-tasks/start", { acknowledged: true }, token)).data;
    const action = async (name, extra = {}) => {
      state = (await request("/api/learning/common-tasks/action", {
        action: name, revision: state.session.revision, fingerprint: state.protocol.fingerprint, ...extra
      }, token)).data;
    };
    for (let i = 0; i < points.length; i++) {
      if (i) await action("select_unit", { knowledgePointId: points[i] });
      assert.equal(state.session.knowledgePointId, points[i]);
      assert.equal(state.session.stage, "t0");
      assert.equal(JSON.stringify(state).includes("answerKey"), false);
      await action("answer", { probeId: state.session.probe.id, response: "unknown",
        explanation: `合成理由${i}`, confidence: 0 });
      const context = { protocolId: state.protocol.id, opportunityId: state.session.opportunityId,
        knowledgePointId: points[i], stage: state.session.stage, revision: state.session.revision };
      const event = { eventId: `synthetic-session:${i}`, sessionId: "synthetic-session",
        sequenceIndex: i, type: "parameter_commit", clientAt: new Date().toISOString(),
        data: { parameter: "input", value: i, resource_revision: "synthetic-v1" } };
      const process = { fingerprint: state.protocol.fingerprint, opportunityId: state.session.opportunityId,
        knowledgePointId: points[i], observedStage: "explore", event };
      assert.equal((await request("/api/learning/common-tasks/process", process, token)).data.duplicate, false);
      assert.equal((await request("/api/learning/common-tasks/process", process, token)).data.duplicate, true);
      await request("/api/learning/events", { events: [{ eventId: event.eventId, type: "interaction",
        payload: { eventType: event.type, context: { commonLearning: context },
          timing: { clientAt: event.clientAt }, data: event.data } }] }, token);
      const wait = Math.max(0, Date.parse(state.session.exploreReadyAt) - Date.now()) + 30;
      await new Promise(resolve => setTimeout(resolve, wait));
      await action("continue");
      await action("answer", { probeId: state.session.probe.id, response: "unknown", explanation: "", explanationMissingReason: "cannot_explain", confidence: null });
      assert.equal(state.session.stage, "support");
      await action("exposure", { fraction: 0.5, visibleDurationMs: 1000 });
      await action("close");
      assert.equal(state.session.help, null);
      await action("answer", { probeId: state.session.probe.id, response: "skip", explanation: "", explanationMissingReason: "prefer_not_to_answer", confidence: null });
      await action("survey", { answers: { interruption: null, control: 5, effort: 4 } });
    }
    const exportData = (await request("/api/admin/research/common-tasks", undefined, adminToken)).data;
    assert.equal(exportData.sessions.length, 1);
    const learner = exportData.sessions[0];
    assert.equal(learner.units.filter(unit => unit.status === "complete").length, 6);
    assert.equal(exportData.processEvents.length, 6);
    for (const unit of learner.units) {
      assert.equal(unit.probes.t0.responseKind, "dont_know");
      assert.equal(unit.probes.t0.explanationStatus, "provided");
      assert.equal(unit.probes.t1.explanationStatus, "cannot_explain");
      assert.equal(unit.probes.outcome.explanationStatus, "prefer_not_to_answer");
      assert.equal(unit.probes.outcome.correct, null);
      assert.equal(unit.probes.outcome.responseKind, "skipped");
      assert.equal(unit.exposure.readingEstablished, false);
      assert.equal(unit.survey.interruption, null);
    }
    const all = (await request("/api/admin/research/selected-participants", { userIds: [learner.userId] }, adminToken)).data;
    assert.equal(all.tables.study_workbench_process.length, 6);
    assert.equal(all.tables.study_workbench_protocols.length, 1);
    const raw = all.tables.events.map(row => JSON.parse(row.payload || "{}"));
    for (const row of exportData.processEvents) {
      assert.ok(raw.some(event => event.context?.commonLearning?.opportunityId === row.event.opportunityId));
    }
    assert.equal(JSON.stringify(all).includes(token), false);
    const after = (await request("/api/learning/common-tasks", undefined, token)).data;
    assert.deepEqual(after, state);
    assert.equal(fs.existsSync(publicPointer) ? fs.readFileSync(publicPointer, "utf8") : null, pointerBefore);
    console.log("通过：六知识点 HTTP 全流程、18 次作答、理由/信心/跳过、曝光非阅读、双路事件关联、去重、管理员导出、权限与常规数据库隔离。");
  } finally {
    if (child.exitCode === null) {
      await request("/api/admin/shutdown", {}, adminToken).catch(() => {});
      await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
      if (child.exitCode === null) child.kill();
    }
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
