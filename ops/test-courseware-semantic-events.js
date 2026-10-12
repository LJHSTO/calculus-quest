const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const bridgeSource = fs.readFileSync(
  path.join(root, "app", "main", "courseware-bridge.js"),
  "utf8"
);
const route = JSON.parse(
  fs.readFileSync(path.join(root, "data", "multi-scene-learning-route.json"), "utf8")
);
const chapter = route.chapters.find((item) => item.id === "V14-C3");

assert.ok(chapter, "V14-C3 chapter must exist");

const gameSources = [];
(chapter.modules || []).forEach((module) => {
  (module.knowledgePoints || []).forEach((knowledgePoint) => {
    (knowledgePoint.resourceCandidates || []).forEach((candidate) => {
      if (candidate.type !== "game") return;
      const file = path.join(root, "resources", candidate.root, candidate.file);
      gameSources.push({ file, source: fs.readFileSync(file, "utf8") });
    });
  });
});

assert.equal(gameSources.length, 7, "V14-C3 must keep seven game scenes");
gameSources.forEach(({ file, source }) => {
  assert.match(
    source,
    /OpenMaicLearningEvidence\?\.recordChallenge\s*\(/,
    `${file} must report challenges through the learning-evidence runtime`
  );
  assert.doesNotMatch(
    source,
    /__calculusQuestReportChallengeResult/,
    `${file} must not report the same challenge through the legacy bridge`
  );
});

function createBridgeSandbox(recordChallenge) {
  const messages = [];
  const documentElement = {
    appendChild() {},
    classList: { add() {}, remove() {} }
  };
  const document = {
    readyState: "loading",
    head: { appendChild() {} },
    body: { appendChild() {} },
    documentElement,
    addEventListener() {},
    removeEventListener() {},
    createElement() {
      return { id: "", textContent: "" };
    },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    title: "Bridge test"
  };
  const parent = {
    postMessage(message) {
      messages.push(message);
    }
  };
  const window = {
    top: {},
    self: {},
    parent,
    document,
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    requestAnimationFrame() {
      return 1;
    },
    setTimeout() {
      return 1;
    },
    clearTimeout() {}
  };
  if (recordChallenge) {
    window.OpenMaicLearningEvidence = { recordChallenge };
  }
  const context = vm.createContext({
    console,
    document,
    Event: class Event {},
    CustomEvent: class CustomEvent {},
    Map,
    Math,
    Date,
    Set,
    WeakMap,
    window
  });
  vm.runInContext(bridgeSource, context, { filename: "app/main/courseware-bridge.js" });
  return { messages, window };
}

const delegated = [];
const delegatedBridge = createBridgeSandbox((payload) => delegated.push(payload));
delegatedBridge.window.__calculusQuestReportChallengeResult({
  challengeId: "legacy-delegated",
  questionId: "legacy-question",
  isCorrect: true,
  score: 2,
  maxScore: 3
});
assert.deepEqual(JSON.parse(JSON.stringify(delegated)), [{
  challenge_id: "legacy-delegated",
  question_id: "legacy-question",
  is_correct: true,
  score: 2,
  max_score: 3,
  result: "correct"
}]);
assert.equal(
  delegatedBridge.messages.filter((message) => message.type === "maic_learning_event").length,
  0,
  "the bridge must not post a duplicate event after delegating to the new runtime"
);

const fallbackBridge = createBridgeSandbox();
fallbackBridge.window.__calculusQuestReportChallengeResult({
  challengeId: "legacy-fallback",
  isCorrect: false
});
fallbackBridge.window.__calculusQuestReportChallengeResult({
  challengeId: "legacy-fallback",
  isCorrect: true
});
const fallbackEvents = fallbackBridge.messages
  .filter((message) => message.type === "maic_learning_event")
  .map((message) => message.payload);

assert.equal(fallbackEvents.length, 2);
assert.deepEqual(fallbackEvents.map((event) => event.attempt_number), [1, 2]);
assert.deepEqual(fallbackEvents.map((event) => event.is_correct), [false, true]);
assert.deepEqual(fallbackEvents.map((event) => event.score), [0, 1]);
assert.ok(fallbackEvents.every((event) => event.event_type === "challenge_result"));

console.log(JSON.stringify({
  ok: true,
  challengeCourseware: gameSources.length,
  normalizedAttempts: fallbackEvents.length
}));
