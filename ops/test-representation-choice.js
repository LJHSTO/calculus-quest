"use strict";
// Representation choice as a first-class agent decision.
//
// Before this, the platform ranked activity types for the UI but the ranking was
// never part of the proactive agent's decision loop: it was not a candidate kind,
// not gated by the policy thresholds, and its recommendation was never paired with
// a proximal outcome. These assertions pin the four properties that make the
// choice a real, measurable agent action.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const policy = require("../lib/proactive-policy");
const adapter = require("../lib/proactive-policy/adapters/functions-limits-r2");
const { chooseRepresentation, experiencedTypesFor } = require("../lib/proactive-policy/representation-choice");

const root = path.join(__dirname, "..");
const route = JSON.parse(fs.readFileSync(path.join(root, "data", "multi-scene-learning-route.json"), "utf8"));
const chapter = route.chapters.find((entry) => entry.id === "V14-C1");
const points = chapter.modules.flatMap((module) => module.knowledgePoints);

// --- 1. every knowledge point offers a real, heterogeneous choice -----------
for (const point of points) {
  const choice = chooseRepresentation({ knowledgePoint: point });
  assert.ok(choice, `${point.id} produced no representation choice`);
  assert.ok(choice.available.length >= 2, `${point.id} needs at least two activity types to choose between`);
  assert.equal(
    new Set(choice.available).size,
    choice.available.length,
    `${point.id} lists a duplicate activity type`
  );
  assert.ok(choice.targetTypeId, `${point.id} chose no target`);
  assert.ok(choice.available.includes(choice.targetTypeId), `${point.id} chose a type it did not offer`);
  assert.ok(choice.selectionId.includes(point.id), `${point.id} selection id must be attributable`);
}

// --- 2. an unseen activity type is preferred, and the reason says so --------
const first = points[0];
const baseline = chooseRepresentation({ knowledgePoint: first });
assert.ok(baseline.unseen.length === baseline.available.length, "nothing is experienced yet");
const afterOne = chooseRepresentation({ knowledgePoint: first, experiencedTypes: [baseline.targetTypeId] });
assert.equal(afterOne.experienced.length, 1);
assert.ok(
  afterOne.targetTypeId !== baseline.targetTypeId,
  `after experiencing ${baseline.targetTypeId} the agent must move on, still chose it`
);
assert.ok(afterOne.unseen.includes(afterOne.targetTypeId), "the target must be an unseen type");
assert.equal(
  afterOne.targetReasonCode,
  "unseen_representation",
  "the logged reason must be the one that decided the choice, not a base-score reason"
);
const exhausted = chooseRepresentation({ knowledgePoint: first, experiencedTypes: baseline.available });
assert.equal(exhausted.unseen.length, 0);
assert.equal(exhausted.targetReasonCode, "all_representations_experienced");

// --- 3. the policy only proposes a switch when the learner is struggling -----
function config(overrides = {}) {
  return policy.configFromEnv({
    PROACTIVE_POLICY_MODE: "active",
    PROACTIVE_EXPERIMENT_ID: "test-representation-choice",
    PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C1",
    PROACTIVE_ASSIGNMENT_VERSION: "test-hash-v1",
    PROACTIVE_ASSIGNMENT_SALT: "test-only-salt",
    PROACTIVE_PUBLIC_CHAPTER_ONLY: "true",
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
  experiment_id: "test-representation-choice",
  condition: "treatment_full",
  cohort: "pilot",
  stratum: "high",
  assignment_version: "test-hash-v1"
};
const context = {
  chapterId: "V14-C1",
  unitId: first.id,
  knowledgePointId: first.id,
  sceneType: baseline.targetTypeId,
  isQuiz: false,
  quizSubmitted: false,
  phase: "learning"
};
function decide(evidence, { configOverrides = {}, assignmentOverride = assignment, sceneType } = {}) {
  return policy.evaluate({
    config: config(configOverrides),
    assignment: assignmentOverride,
    context: { ...context, ...(sceneType ? { sceneType } : {}) },
    signal: { kind: "representation_switch" },
    evidence,
    policyState: {},
    budget: { remaining: 10 },
    now: Date.parse("2026-09-22T12:00:00.000Z")
  });
}
const choiceEvidence = {
  families: ["history", "process"],
  representationChoice: afterOne,
  sceneAttemptFailures: 2
};

const struggling = decide(choiceEvidence);
assert.equal(struggling.decision, "intervene", "a struggling learner should be offered a different activity");
assert.equal(struggling.displayAllowed, true);
assert.equal(struggling.action, "switch_representation");
assert.ok(struggling.reasonCodes.includes("representation_switch_after_scene_failure"));

// The decision must carry what was chosen, so it can be logged and joined to its
// outcome — this is the difference between a recommendation and an agent action.
assert.ok(struggling.representationChoice, "the decision must carry the representation choice");
assert.equal(struggling.representationChoice.targetTypeId, afterOne.targetTypeId);
assert.equal(struggling.representationChoice.reasonCode, "unseen_representation");
assert.ok(struggling.representationChoice.selectionId, "the choice needs a stable id for outcome pairing");
assert.ok(
  struggling.representationChoice.scores.length >= 2,
  "the choice must record how the alternatives scored, for offline policy evaluation"
);
assert.ok(struggling.reasonCodes.includes(`representation_target_${afterOne.targetTypeId}`));

// A learner who is doing fine is not nagged.
const content = decide({ families: ["history", "process"], representationChoice: afterOne });
assert.equal(content.decision, "stay_silent");
assert.ok(content.reasonCodes.includes("representation_switch_time_only"));
assert.ok(content.reasonCodes.includes("help_need_below_threshold"));

// --- 4. the arm lever actually controls the factor --------------------------
const controlArm = decide(choiceEvidence, {
  assignmentOverride: { ...assignment, condition: "control" }
});
assert.equal(controlArm.displayAllowed, false, "the control arm must never be shown a switch");
assert.ok(controlArm.reasonCodes.includes("control_condition_suppressed"));

const switchDisabled = decide(choiceEvidence, {
  configOverrides: {
    PROACTIVE_ARM_PROFILES_JSON: JSON.stringify({
      control: { display: false, maxSupportLevel: "L0", allowRepresentationSwitch: false },
      treatment_full: { display: true, maxSupportLevel: "L5", allowRepresentationSwitch: false }
    })
  }
});
assert.equal(switchDisabled.displayAllowed, false, "allowRepresentationSwitch:false must suppress the switch");
assert.ok(switchDisabled.reasonCodes.includes("arm_representation_switch_disabled"));

// --- 5. degenerate cases stay silent rather than guessing -------------------
assert.equal(
  decide({ families: ["history", "process"] }).reasonCodes.includes("representation_candidates_absent"),
  true,
  "no candidates must not invent a target"
);
assert.ok(
  decide({ families: ["history", "process"], representationChoice: exhausted, sceneAttemptFailures: 1 })
    .reasonCodes.includes("all_representations_experienced"),
  "with everything experienced the agent must say so instead of repeating a type"
);
assert.ok(
  decide({ families: ["history", "process"], representationChoice: afterOne, sceneAttemptFailures: 1 },
    { sceneType: afterOne.targetTypeId }).reasonCodes.includes("representation_target_is_current"),
  "suggesting the activity the learner is already in is not a switch"
);

// --- 6. history is read per knowledge point ---------------------------------
const history = [
  { knowledgePointId: first.id, sceneType: "simulation" },
  { knowledgePointId: first.id, sceneType: "game" },
  { knowledgePointId: "GH-02-K01", sceneType: "mindMap" }
];
assert.deepEqual(
  experiencedTypesFor({ history, knowledgePointId: first.id }).sort(),
  ["game", "simulation"],
  "only this knowledge point's history may count"
);

console.log("表征选择通过：6 个知识点各有异质选择集、未体验类型优先且理由准确、仅在挣扎时提议、决策携带目标与备选得分、臂杠杆可控、退化情形不猜测。");
