"use strict";
// Trigger design for the representation switch: struggle first, boundary second.
//
// Getting this wrong is expensive in both directions. Proposing the moment
// struggle is detected interrupts a learner mid-drag; proposing on a timer alone
// nags learners who are doing fine; proposing when everything has been tried is
// pointless. These assertions pin all three.
const assert = require("node:assert/strict");
const { createProactiveCoach } = require("../app/main/proactive-learning");

const AVAILABLE = [
  { typeId: "simulation", title: "拖动实验" },
  { typeId: "mindMap", title: "关系图" },
  { typeId: "game", title: "误解修复挑战" },
  { typeId: "visualization3d", title: "空间视角" }
];

function makeCoach(available = AVAILABLE) {
  return createProactiveCoach({
    sceneTypesFor: () => available
  });
}

function enter(coach, sceneType = "simulation", at = 1000) {
  coach.consume({
    eventType: "unit_enter",
    unitId: "GH-01-K01",
    unitLabel: "输入、输出和函数规则",
    unitType: "knowledge",
    sceneType,
    timing: { clientAt: at }
  });
}

function parameterCommit(coach, at, value = 1) {
  return coach.consume({
    eventType: "parameter_commit",
    unitId: "GH-01-K01",
    sceneType: "simulation",
    data: { state: { parameter: "输入 x", oldValue: String(value - 1), newValue: String(value) } },
    timing: { clientAt: at }
  });
}

function boundary(coach, at, eventType = "interactive_submit") {
  return coach.consume({
    eventType,
    unitId: "GH-01-K01",
    sceneType: "simulation",
    timing: { clientAt: at }
  });
}

function failedAttempt(coach, at) {
  return coach.consume({
    eventType: "courseware_challenge_result",
    unitId: "GH-01-K01",
    sceneType: "simulation",
    data: { is_correct: false, independent: true },
    timing: { clientAt: at }
  });
}

// --- 1. one failure alone, with no boundary, does not interrupt -------------
// A single mistake is what the scaffold ladder is for; it escalates one level.
// The switch is a bigger claim and needs more evidence.
{
  const coach = makeCoach();
  enter(coach);
  failedAttempt(coach, 2000);
  const suggestion = coach.getSuggestion();
  assert.notEqual(suggestion?.kind, "representation_switch",
    "a single failed attempt must not propose changing the whole activity type");
}

// --- 2. sustained struggle plus a natural boundary proposes the switch ------
{
  const coach = makeCoach();
  enter(coach);
  failedAttempt(coach, 2000);
  coach.resolve("outcome-recorded", 0);
  failedAttempt(coach, 2500);
  coach.resolve("outcome-recorded", 0);
  const proposed = boundary(coach, 3000);
  assert.equal(proposed?.kind, "representation_switch",
    `a boundary after sustained struggle must propose a switch, got ${proposed?.kind || "none"}`);
  assert.equal(proposed.targetTypeId, "mindMap", "the target must be an unseen activity type");
  assert.ok(proposed.availableTypes.includes("simulation"));
  assert.ok(proposed.experiencedTypes.includes("simulation"), "the current scene counts as experienced");
  assert.ok(!proposed.experiencedTypes.includes("mindMap"), "the target must not already be experienced");
  assert.ok(proposed.title && proposed.body && proposed.actionLabel, "the suggestion needs learner-facing text");
}

// --- 3. nothing unseen means no proposal ------------------------------------
{
  const coach = makeCoach([{ typeId: "simulation", title: "拖动实验" }]);
  enter(coach);
  failedAttempt(coach, 2000);
  coach.resolve("outcome-recorded", 0);
  failedAttempt(coach, 2500);
  coach.resolve("outcome-recorded", 0);
  const proposed = boundary(coach, 3000);
  assert.notEqual(proposed?.kind, "representation_switch",
    "with every activity type experienced there is nothing to switch to");
}

// --- 4. a quiz unit is never offered a scene switch -------------------------
{
  const coach = makeCoach();
  coach.consume({
    eventType: "unit_enter",
    unitId: "V14-C1-pre",
    unitLabel: "前测",
    unitType: "quiz",
    sceneType: "",
    timing: { clientAt: 1000 }
  });
  const proposed = coach.consume({
    eventType: "interactive_submit",
    unitId: "V14-C1-pre",
    timing: { clientAt: 2000 }
  });
  assert.notEqual(proposed?.kind, "representation_switch", "a quiz has no activity types to switch between");
}

// --- 5. the proposal is not repeated without new evidence -------------------
{
  const coach = makeCoach();
  enter(coach);
  failedAttempt(coach, 2000);
  coach.resolve("outcome-recorded", 0);
  failedAttempt(coach, 2500);
  coach.resolve("outcome-recorded", 0);
  const first = boundary(coach, 3000);
  assert.equal(first?.kind, "representation_switch");
  coach.resolve("outcome-recorded", 0);
  const second = boundary(coach, 4000);
  assert.notEqual(second?.kind, "representation_switch",
    "the same struggle must not raise the same proposal twice");
}

// --- 6. switching scenes clears the struggle ---------------------------------
// The struggle belonged to the previous activity type; carrying it over would let
// an old failure justify a switch away from a scene the learner just opened.
{
  const coach = makeCoach();
  enter(coach);
  failedAttempt(coach, 2000);
  coach.resolve("outcome-recorded", 0);
  failedAttempt(coach, 2500);
  coach.resolve("outcome-recorded", 0);
  coach.consume({
    eventType: "knowledge_scene_select",
    unitId: "GH-01-K01",
    sceneType: "mindMap",
    timing: { clientAt: 2500 }
  });
  const proposed = coach.consume({
    eventType: "interactive_submit",
    unitId: "GH-01-K01",
    sceneType: "mindMap",
    timing: { clientAt: 3000 }
  });
  assert.notEqual(proposed?.kind, "representation_switch",
    "opening a new scene must reset the accumulated struggle");
}

// --- 7. the current scene is never proposed as the target -------------------
{
  const coach = makeCoach();
  enter(coach, "game");
  coach.consume({
    eventType: "courseware_challenge_result",
    unitId: "GH-01-K01",
    sceneType: "game",
    data: { is_correct: false, independent: true },
    timing: { clientAt: 2000 }
  });
  coach.resolve("outcome-recorded", 0);
  coach.consume({
    eventType: "courseware_challenge_result",
    unitId: "GH-01-K01",
    sceneType: "game",
    data: { is_correct: false, independent: true },
    timing: { clientAt: 2500 }
  });
  coach.resolve("outcome-recorded", 0);
  const proposed = coach.consume({
    eventType: "courseware_interaction_complete",
    unitId: "GH-01-K01",
    sceneType: "game",
    timing: { clientAt: 3000 }
  });
  assert.notEqual(proposed?.targetTypeId, "game", "the target must differ from the current activity type");
}

console.log("表征切换触发通过：挣扎+自然边界才提议、无未体验类型不提议、测验不提议、同证据不重复、切场景清空、目标不等于当前。");
