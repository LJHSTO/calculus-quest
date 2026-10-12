"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../app/main/core.js"), "utf8");
const start = source.indexOf("async function hydrateLearningState(");
const end = source.indexOf("\nfunction queueLearningSnapshot", start);
assert.ok(start >= 0 && end > start);
async function run({ draftGeneration = 1, draftRevision = 2, submitted = false, replace = false,
  fingerprint = "v1", draftFingerprint = "v1" } = {}) {
  const key = "unit:question";
  const state = { authToken: "test", quizDraftRecovery: {
    [key]: { unitId: "unit", questionId: "question", value: "__unknown__",
      generation: draftGeneration, revision: draftRevision, courseAssessmentFingerprint: draftFingerprint }
  } };
  const box = {
    state, learningSnapshotGeneration: 0, learningSnapshotRevision: 0,
    learningSnapshotReady: false, lastSnapshotJson: "", logoutGeneration: 0,
    AbortSignal: globalThis.AbortSignal,
    isSignedIn: () => true,
    fetch: async () => ({ ok: true, json: async () => ({
      ok: true, generation: 1, revision: 2,
      snapshot: { quizDrafts: {}, submittedQuizzes: submitted ? ["unit"] : [], quizResults: [],
        courseAssessmentFingerprint: fingerprint }
    }) }),
    applyServerLearningSnapshot: incoming => Object.assign(state, incoming, { quizDraftRecovery: {} }),
    loadAuthoritativeQuizResults: async () => {},
    normalizeFailedQuizReviews() {}, persistStateLocally() {},
    learningSnapshot: () => state, snapshotContentJson: JSON.stringify,
    setLearningSnapshotVersion(payload) {
      box.learningSnapshotGeneration = payload.generation;
      box.learningSnapshotRevision = payload.revision;
    }
  };
  vm.createContext(box);
  vm.runInContext(source.slice(start, end), box);
  await box.hydrateLearningState({ replace });
  return state.quizDrafts[key];
}
(async () => {
  assert.equal(await run(), "__unknown__");
  assert.equal(await run({ draftGeneration: 2 }), undefined);
  assert.equal(await run({ draftRevision: 1 }), undefined);
  assert.equal(await run({ submitted: true }), undefined);
  assert.equal(await run({ replace: true }), undefined);
  assert.equal(await run({ draftFingerprint: "old" }), undefined);
  console.log("草稿恢复回归通过：同代次同版本恢复，重置/版本冲突/已提交/显式替换不复活旧答案。");
})().catch(error => { console.error(error); process.exitCode = 1; });
