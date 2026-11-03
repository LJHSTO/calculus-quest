"use strict";
const fs = require("node:fs"), vm = require("node:vm"), assert = require("node:assert/strict");
const path = require("node:path"), root = path.resolve(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const core = read("app/main/core.js");
function section(source, from, to) {
  const a = source.indexOf(from), b = source.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, from); return source.slice(a, b);
}
const noop = () => {};
function deferred() { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; }
function context() {
  const b = { state: { participant: { participantId: "synthetic-a" }, authToken: "synthetic-a" },
    chapters: [{ id: "A" }], validViews: new Set(["home"]), logoutGeneration: 0, authTransitionInProgress: false,
    learningSnapshotReady: true, learningSnapshotSyncPaused: false, learningSnapshotGeneration: 1, learningSnapshotRevision: 1,
    learningSnapshotRetryAttempt: 0, learningSnapshotSyncError: "", learningSnapshotRetryTimer: null,
    learningSnapshotSyncChain: Promise.resolve(), lastSnapshotJson: "", syncTimer: null, onlinePeriodStart: null,
    currentChapterId: "A", currentUnitId: "", currentView: "home", AbortSignal,
    AUTH_TOKEN_KEY: "test-auth", STORAGE_KEY: "test-state", LAST_PARTICIPANT_KEY: "test-participant",
    sessionStorage: { removeItem: noop }, localStorage: { removeItem: noop }, setTimeout: noop, clearTimeout: noop,
    normalizeLearningStateCompatibility: noop, clearPreviewKnowledgeSceneSelections: noop, normalizeFailedQuizReviews: noop,
    persistStateLocally: noop, stopNarrationQueue: noop, switchView: noop, renderAuth: noop, showLogin: noop,
    snapshotContentJson: JSON.stringify, console: { warn: noop }, apiRequest: async () => ({ ok: true }) };
  b.isSignedIn = () => Boolean(b.state.participant && b.state.authToken);
  b.learningSnapshot = () => JSON.parse(JSON.stringify(b.state));
  b.setLearningSnapshotVersion = p => { b.learningSnapshotGeneration = p.generation; b.learningSnapshotRevision = p.revision; };
  vm.createContext(b);
  vm.runInContext(section(core, "function learningDefaults(", "\nfunction learningQuizUnitId(")
    + section(core, "function mergeClientRecords(", "\nfunction queueLearningSnapshot(")
    + section(core, "async function performLearningSnapshotSync(", "\nasync function pauseLearningSnapshotSync("), b);
  Object.assign(b.state, b.learningDefaults()); return b;
}
const row = { id: "synthetic-result", unit_id: "unit", question_id: "q", response: "original", is_correct: 1, score: 1, max_score: 1 };
const response = data => ({ ok: true, json: async () => data });
async function run() {
  for (const duringBody of [false, true]) {
    const b = context(), pending = deferred(), entered = deferred();
    b.fetch = async url => {
      if (url.endsWith("quiz-results")) {
        entered.resolve();
        if (duringBody) return { ok: true, json: () => pending.promise };
        return pending.promise;
      }
      return response({ ok: true, generation: 1, revision: 1, snapshot: {} });
    };
    vm.runInContext(section(core, "async function logoutParticipant(", "\nfunction quizDraftKey("), b);
    const loading = b.hydrateLearningState(); await entered.promise; await b.logoutParticipant();
    pending.resolve(duringBody ? { ok: true, data: [row] } : response({ ok: true, data: [row] })); await loading;
    assert.equal(b.state.quizResults.length, 0); assert.equal(b.learningSnapshotReady, false);
  }
  const switched = context(), body = deferred(), started = deferred();
  switched.fetch = async () => ({ ok: true, json: () => { started.resolve(); return body.promise; } });
  const pendingHydrate = switched.hydrateLearningState(); await started.promise;
  switched.state.participant = { participantId: "synthetic-b" }; switched.state.authToken = "synthetic-b";
  body.resolve({ ok: true, generation: 1, revision: 99, snapshot: { note: "old account" } }); await pendingHydrate;
  assert.notEqual(switched.state.note, "old account"); assert.equal(switched.learningSnapshotRevision, 1);
  console.log("通过：响应及响应体迟到、退出与换账号均不恢复旧状态");

  const b = context(); b.state.note = "未同步笔记"; b.state.quizDrafts = { "unit:q": "本页答案" };
  b.state.quizDraftRecovery = { "unit:q": { value: "本页答案", generation: 1, revision: 1 } };
  b.apiRequest = async () => { throw Object.assign(new Error("conflict"), { code: "snapshot_revision_conflict", status: 409 }); };
  b.fetch = async url => response(url.endsWith("quiz-results") ? { ok: true, data: [] }
    : { ok: true, generation: 1, revision: 2, snapshot: { note: "另一页笔记", quizDrafts: {}, submittedQuizzes: [] } });
  await b.performLearningSnapshotSync();
  assert.equal(b.state.note, "另一页笔记"); assert.equal(b.state.quizDrafts["unit:q"], undefined);
  assert.equal(b.state.learningConflicts[0].content.quizDrafts["unit:q"], "本页答案");
  assert.equal(b.state.learningConflicts[0].content.note, "未同步笔记");
  await b.hydrateLearningState(); assert.equal(b.state.learningConflicts.length, 1);
  console.log("通过：冲突副本保留且刷新恢复后仍可读取，不复活旧答案");

  const r = context(), timers = []; let attempts = 0;
  r.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return timers.length; };
  r.apiRequest = async () => { attempts++; throw new TypeError("simulated offline"); };
  await r.performLearningSnapshotSync();
  const delays = [];
  while (timers.length) { const timer = timers.shift(); delays.push(timer.delay); timer.fn(); await r.learningSnapshotSyncChain; }
  assert.equal(attempts, 6); assert.deepEqual(delays, [30000, 60000, 120000, 240000, 300000]);
  r.apiRequest = async () => ({ generation: 1, revision: 2 }); r.resumePendingLearningSync(); await r.learningSnapshotSyncChain;
  assert.equal(r.learningSnapshotSyncError, ""); assert.equal(r.learningSnapshotRetryAttempt, 0);
  console.log("通过：连续失败有界退避，恢复联网后成功补送");

  for (const rejected of [false, true]) {
    const finish = deferred(), chapters = { A: { loaded: true, units: [{ id: "A1" }] }, B: { loaded: false, units: [] }, C: { loaded: true, units: [{ id: "C1" }] } };
    const n = { navigationRevision: 0, state: { authToken: "test", returnToQuiz: null }, currentChapterId: "A", currentUnitId: "A1",
      getChapter: id => chapters[id], analyticsTrack: noop, retireQuizReturnContext: noop, trackLearningEvent: noop,
      renderAll: noop, preloadChapterResources: noop, document: { querySelector: () => null },
      ensureChapterLoaded: async () => { await finish.promise; if (rejected) throw Error("load failed"); chapters.B.units = [{ id: "B1" }]; return true; } };
    vm.createContext(n); vm.runInContext(section(read("app/main/navigation.js"), "async function selectChapter(", "\nfunction selectUnit("), n);
    const loading = n.selectChapter("B"); await n.selectChapter("C"); finish.resolve(); await loading;
    assert.equal(n.currentChapterId, "C"); assert.equal(n.currentUnitId, "C1");
  }
  console.log("通过：过期章节加载成功和失败都不会覆盖新选择");

  const q = context(); vm.runInContext(section(read("app/main/quiz.js"), "async function submitQuizWithRecovery(", "\nasync function submitQuiz("), q);
  for (const error of [new TypeError("lost response"), Object.assign(new Error("already saved"), { code: "quiz_already_submitted", status: 409 })]) {
    q.apiRequest = async () => { throw error; }; q.fetch = async () => response({ ok: true, data: [row] });
    const result = await q.submitQuizWithRecovery({ id: "unit", chapterId: "A", assessmentPhase: "pre" }, [{ questionId: "q", response: "changed retry" }]);
    assert.equal(result.results[0].response, "original"); assert.equal(result.recovered, true);
  }
  q.fetch = async () => response({ ok: true, data: [] });
  await assert.rejects(q.submitQuizWithRecovery({ id: "unit" }, [{ questionId: "q" }]));
  q.apiRequest = async () => ({}); q.fetch = async () => response({ ok: true, data: [row] });
  assert.equal((await q.submitQuizWithRecovery({ id: "unit" }, [{ questionId: "q" }])).recovered, true);
  console.log("通过：测验回执丢失读取首次权威成绩，未保存时不能伪报成功");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
