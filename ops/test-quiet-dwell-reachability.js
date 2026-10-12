"use strict";
// B6b: the quiet_dwell path used to be unreachable for any learner without a
// confirmed quiz error.
//
// Two independent blocks made it so:
//   1. need  — the profile default is helpNeedScore 0.45, below the 0.70 gate, and
//              only a confirmed quiz gap raised it. A learner stuck in a courseware
//              scene without ever submitting a quiz therefore never got past the gate.
//   2. timing — `naturalBoundary` requires the last event to be <=12s old, while
//              `dwellSeconds >= 90` requires it to be >=90s old. Those are mutually
//              exclusive, so the plain path could never set interruptibility either.
//
// The policy now also reads courseware-side struggle (failed judged attempts and
// repeated parameter commits) as need, and defers to the next natural boundary
// instead of requiring one to already have happened.

const assert = require("node:assert/strict");
const policy = require("../lib/proactive-policy");

function config(overrides = {}) {
  return policy.configFromEnv({
    PROACTIVE_POLICY_MODE: "active",
    PROACTIVE_EXPERIMENT_ID: "test-quiet-dwell",
    PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C1",
    PROACTIVE_ASSIGNMENT_VERSION: "test-hash-v1",
    PROACTIVE_ASSIGNMENT_SALT: "test-only-salt",
    PROACTIVE_PUBLIC_CHAPTER_ONLY: "true",
    // Mirror the deployed arm configuration, not the built-in default.
    PROACTIVE_EXPERIMENT_ARMS: "control,treatment_full",
    PROACTIVE_DISPLAY_ARMS: "treatment_full",
    PROACTIVE_ARM_PROFILES_JSON: JSON.stringify({
      control: { display: false, maxSupportLevel: "L0", allowRepresentationSwitch: false },
      treatment_full: { display: true, maxSupportLevel: "L5", allowRepresentationSwitch: true }
    }),
    ...overrides
  });
}

const assignment = {
  experiment_id: "test-quiet-dwell",
  condition: "treatment_full",
  cohort: "pilot",
  stratum: "high",
  assignment_version: "test-hash-v1"
};

const context = {
  chapterId: "V14-C1",
  unitId: "GH-01-K01",
  knowledgePointId: "GH-01-K01",
  sceneType: "simulation",
  isQuiz: false,
  quizSubmitted: false,
  phase: "learning"
};

function decide(evidence, signal = { kind: "quiet_dwell", dwellSeconds: 120 }) {
  return policy.evaluate({
    config: config(),
    assignment,
    context,
    signal,
    evidence,
    policyState: {},
    budget: { remaining: 10 },
    now: Date.parse("2026-09-21T12:10:00.000Z")
  });
}

// --- 1. A learner stuck in a scene, with no quiz error at all ---------------
const stuckInScene = decide({
  families: ["time", "process"],
  dwellSeconds: 120,
  confirmedGapCount: 0,
  sceneAttemptFailures: 2,
  sceneAttemptCount: 4,
  parameterCommitCount: 0,
  naturalBoundary: false
});
assert.ok(
  stuckInScene.reasonCodes.includes("quiet_dwell_with_scene_failures"),
  `scene failures must raise need, got ${stuckInScene.reasonCodes.join(",")}`
);
assert.equal(
  stuckInScene.reasonCodes.includes("help_need_below_threshold"),
  false,
  "need must clear the gate"
);
// It still defers rather than interrupting mid-task, and that deferral is what
// stores the pending candidate the boundary re-check later re-evaluates.
assert.equal(stuckInScene.decision, "stay_silent");
assert.ok(
  stuckInScene.reasonCodes.includes("quiet_dwell_waiting_for_boundary"),
  "a reachable need must be deferred, not dropped"
);

// --- 2. Repeated parameter commits count as struggle too --------------------
const repeatedParameter = decide({
  families: ["time", "process"],
  dwellSeconds: 120,
  confirmedGapCount: 0,
  sceneAttemptFailures: 0,
  parameterCommitCount: 3,
  naturalBoundary: false
});
assert.ok(repeatedParameter.reasonCodes.includes("quiet_dwell_with_repeated_parameter"));

// --- 3. Once a natural boundary arrives it actually displays ----------------
const atBoundary = decide({
  families: ["time", "process"],
  dwellSeconds: 120,
  confirmedGapCount: 0,
  sceneAttemptFailures: 2,
  naturalBoundary: true
});
assert.equal(atBoundary.decision, "intervene");
assert.equal(atBoundary.displayAllowed, true, "a deferred need plus a boundary must display");
assert.ok(atBoundary.reasonCodes.includes("natural_task_boundary"));

// --- 4. Time alone still does not interrupt ---------------------------------
// The point is to reach learners who are stuck, not to nag idle ones.
const idleOnly = decide({
  families: ["time"],
  dwellSeconds: 120,
  confirmedGapCount: 0,
  sceneAttemptFailures: 0,
  parameterCommitCount: 0,
  naturalBoundary: false
});
assert.equal(idleOnly.decision, "stay_silent");
assert.ok(idleOnly.reasonCodes.includes("quiet_dwell_time_only"));
assert.ok(
  idleOnly.reasonCodes.includes("help_need_below_threshold")
    || idleOnly.reasonCodes.includes("interruptibility_below_threshold"),
  `time-only dwell must stay silent, got ${idleOnly.reasonCodes.join(",")}`
);

// --- 5. The pre-existing confirmed-gap route still works --------------------
const confirmedGap = decide({
  families: ["time", "result"],
  dwellSeconds: 120,
  confirmedGapCount: 2,
  naturalBoundary: true
});
assert.equal(confirmedGap.decision, "intervene");
assert.ok(confirmedGap.reasonCodes.includes("quiet_dwell_with_confirmed_gap"));

console.log("quiet_dwell 可达性通过：场景失败/重复参数可作为需求证据、延后到自然边界后展示、纯发呆仍不打扰、原确认缺口路径不变。");
