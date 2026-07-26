const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = path.resolve(__dirname, "../app/main/proactive-learning.js");
assert.ok(fs.existsSync(modulePath), "主动伴学策略模块尚未实现");

const { createProactiveCoach } = require(modulePath);

function unitEvent(unitId = "KP1", overrides = {}) {
  return {
    eventType: "unit_enter",
    unitId,
    unitLabel: "导数的局部变化",
    unitType: "knowledge",
    sceneType: "simulation",
    data: {},
    ...overrides
  };
}

function parameterEvent(at, {
  unitId = "KP1",
  parameter = "步长 h",
  oldValue = "0.5",
  newValue = "0.1"
} = {}) {
  return {
    eventType: "parameter_commit",
    unitId,
    unitType: "knowledge",
    sceneType: "simulation",
    value: { parameter, oldValue, newValue },
    timing: { clientAt: new Date(at).toISOString() },
    data: {}
  };
}

{
  const coach = createProactiveCoach({
    repeatCount: 3,
    repeatWindowMs: 45_000,
    dwellThresholdMs: 90_000,
    cooldownMs: 10 * 60_000
  });
  coach.consume(unitEvent(), 0);
  assert.equal(coach.consume(parameterEvent(1_000, { oldValue: "1", newValue: "0.5" }), 1_000), null);
  assert.equal(coach.consume(parameterEvent(12_000, { oldValue: "0.5", newValue: "0.2" }), 12_000), null);
  const suggestion = coach.consume(parameterEvent(30_000, { oldValue: "0.2", newValue: "0.1" }), 30_000);
  assert.equal(suggestion.kind, "repeated_parameter");
  assert.match(suggestion.title, /步长 h/);
  assert.match(suggestion.question, /重点观察/);
  assert.equal(coach.getSuggestion()?.id, suggestion.id);

  coach.resolve("dismiss", 31_000);
  assert.equal(coach.getSuggestion(), null);
  coach.consume(parameterEvent(40_000, { oldValue: "0.1", newValue: "0.2" }), 40_000);
  coach.consume(parameterEvent(50_000, { oldValue: "0.2", newValue: "0.3" }), 50_000);
  assert.equal(
    coach.consume(parameterEvent(60_000, { oldValue: "0.3", newValue: "0.4" }), 60_000),
    null,
    "同一单元冷却期间不应再次打扰"
  );
}

{
  const coach = createProactiveCoach({ repeatCount: 3, repeatWindowMs: 45_000 });
  coach.consume(unitEvent(), 0);
  coach.consume(parameterEvent(1_000, { newValue: "0.4" }), 1_000);
  coach.consume(parameterEvent(1_300, { newValue: "0.4" }), 1_300);
  coach.consume(parameterEvent(10_000, { parameter: "观察角度", newValue: "30" }), 10_000);
  assert.equal(
    coach.consume(parameterEvent(20_000, { oldValue: "0.4", newValue: "0.4" }), 20_000),
    null,
    "重复上报、不同参数和没有实际变化的提交不应凑成三次"
  );
}

{
  const coach = createProactiveCoach({ dwellThresholdMs: 90_000 });
  coach.consume(unitEvent(), 0);
  assert.equal(coach.tick(89_999), null);
  const suggestion = coach.tick(90_000);
  assert.equal(suggestion.kind, "quiet_dwell");
  assert.match(suggestion.question, /应该先观察哪里/);
}

{
  const coach = createProactiveCoach({ dwellThresholdMs: 90_000 });
  coach.consume(unitEvent(), 0);
  coach.consume({ eventType: "interactive_click", unitId: "KP1" }, 30_000);
  assert.equal(coach.tick(119_999), null);
  assert.equal(coach.tick(120_000).kind, "quiet_dwell");
}

{
  const coach = createProactiveCoach();
  coach.consume(unitEvent("Q1", { unitType: "quiz", unitLabel: "函数小测" }), 0);
  assert.equal(coach.tick(10 * 60_000), null, "未提交 Quiz 不应主动介入");
  coach.consume(parameterEvent(1_000, { unitId: "Q1", oldValue: "1", newValue: "0.5" }), 1_000);
  coach.consume(parameterEvent(2_000, { unitId: "Q1", oldValue: "0.5", newValue: "0.2" }), 2_000);
  assert.equal(
    coach.consume(parameterEvent(3_000, { unitId: "Q1", oldValue: "0.2", newValue: "0.1" }), 3_000),
    null,
    "未提交 Quiz 的杂散互动信号不能污染提交后的主动决策"
  );
  assert.equal(coach.getSuggestion(), null);
  assert.equal(
    coach.consume({
      eventType: "quiz_submit_success",
      unitId: "Q1",
      unitLabel: "函数小测",
      unitType: "quiz",
      data: { incorrect: 0, correct: 4, questionCount: 4 }
    }, 20_000),
    null,
    "全对时不应制造额外复盘负担"
  );
  const suggestion = coach.consume({
    eventType: "quiz_submit_success",
    unitId: "Q1",
    unitLabel: "函数小测",
    unitType: "quiz",
    data: { incorrect: 2, correct: 2, questionCount: 4 }
  }, 30_000);
  assert.equal(suggestion.kind, "quiz_review");
  assert.match(suggestion.title, /2 道题/);
  assert.match(suggestion.question, /如何判断先看哪一题/);
  assert.doesNotMatch(suggestion.question, /最值得检查的思路环节/);
}

{
  const coach = createProactiveCoach({ dwellThresholdMs: 90_000 });
  coach.consume(unitEvent("KP1"), 0);
  coach.consume(unitEvent("KP2", { unitLabel: "函数图像" }), 30_000);
  assert.equal(coach.tick(90_000), null, "切换单元后停留计时必须重新开始");
  assert.equal(coach.tick(120_000).unitId, "KP2");
}

{
  const coach = createProactiveCoach({ repeatCount: 3, dwellThresholdMs: 90_000 });
  coach.consume(unitEvent("KP1", { sceneType: "simulation" }), 0);
  coach.consume(parameterEvent(1_000, { oldValue: "1", newValue: "0.5" }), 1_000);
  coach.consume(parameterEvent(2_000, { oldValue: "0.5", newValue: "0.2" }), 2_000);
  coach.consume({
    eventType: "knowledge_scene_select",
    unitId: "KP1",
    unitType: "knowledge",
    sceneType: "game",
    data: { sceneType: "game" }
  }, 30_000);
  assert.equal(
    coach.consume(parameterEvent(31_000, { oldValue: "0.2", newValue: "0.1" }), 31_000),
    null,
    "不同互动场景的参数次数不能合并"
  );
  assert.equal(coach.tick(120_999), null, "切换互动场景后的有效操作应重新开始停留计时");
  assert.equal(coach.tick(121_000).kind, "quiet_dwell");
}

{
  const coach = createProactiveCoach({ dwellThresholdMs: 90_000 });
  coach.consume(unitEvent(), 0);
  coach.consume({ eventType: "visibility", unitId: "KP1", data: { hidden: true } }, 30_000);
  coach.consume({ eventType: "visibility", unitId: "KP1", data: { hidden: false } }, 300_000);
  assert.equal(coach.tick(389_999), null, "后台停留时间不能计入卡点判断");
  assert.equal(coach.tick(390_000).kind, "quiet_dwell");
}

{
  const coach = createProactiveCoach({ dwellThresholdMs: 90_000 });
  coach.consume(unitEvent(), 0);
  coach.consume({ eventType: "view_change", unitId: "KP1", data: { view: "home", prev: "learn" } }, 20_000);
  coach.consume({ eventType: "view_change", unitId: "KP1", data: { view: "learn", prev: "home" } }, 200_000);
  assert.equal(coach.tick(289_999), null, "离开学习页的时间不能计入卡点判断");
  assert.equal(coach.tick(290_000).kind, "quiet_dwell");
}

{
  const coach = createProactiveCoach({ dwellThresholdMs: 90_000, cooldownMs: 10 * 60_000 });
  coach.consume(unitEvent(), 0);
  assert.equal(coach.tick(90_000).kind, "quiet_dwell");
  coach.resolve("dismiss", 90_000);
  coach.reset({ clearCooldowns: true });
  coach.consume(unitEvent(), 100_000);
  assert.equal(coach.tick(190_000).kind, "quiet_dwell", "切换账号后不能继承上一位学生的单元冷却");
}

{
  const coach = createProactiveCoach({ dwellThresholdMs: 90_000, cooldownMs: 10 * 60_000 });
  coach.consume(unitEvent(), 0);
  const first = coach.tick(90_000);
  assert.equal(first.dismissStreak, 0);
  coach.resolve("dismiss", 90_000);
  const second = coach.tick(690_000);
  assert.equal(second.dismissStreak, 1);
  const secondResolution = coach.resolve("dismiss", 690_000);
  assert.equal(secondResolution.cooldownUntil, 1_890_000, "a second dismissal should extend cooldown to twenty minutes");
  assert.equal(coach.tick(1_889_999), null);
  const third = coach.tick(1_890_000);
  assert.equal(third.dismissStreak, 2);
  coach.resolve("accept", 1_890_000);
  assert.equal(coach.getPreference().dismissStreak, 0, "accepting help should reset the dismissal streak");
}

console.log("proactive learning policy tests passed");
