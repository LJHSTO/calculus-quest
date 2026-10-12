"use strict";

/**
 * 决策点产出量干跑的行为测试。
 *
 * 这个脚本是"20 人一小时到底能产出多少决策点"的唯一测量工具，而它曾经**静默失效**过：
 * 报告人均 0 个决策点，看上去像"实验设计不可行"，其实是模拟器漏掉了整个静坐信号源、
 * 没有模拟支架回合生命周期、又把注定被拒的提问算进了学生冷却。**验证工具静默失效比
 * 功能坏掉更危险**，因为它会把人引向错误的结论。所以这些行为必须被钉死。
 *
 * 本测试覆盖三层：
 *   1. 干跑本身：事件流合理、产出量随"有多卡"单调、决策来自设计好的入口信号；
 *   2. 两个根因修复：`not-shown` 不留冷却；换表征必须有真实的支架历史；
 *   3. 客户端守卫：没有开着的支架回合时，不去问服务端要"独立尝试结果"的判定。
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sim = require("./simulate-decision-yield.js");
const { createProactiveCoach } = require("../app/main/proactive-learning");

// ------------------------------------------------ 1. 干跑本身

{
  const events = sim.buildSession(sim.PROFILES.struggle, 1000);
  const kinds = events.reduce((accumulator, event) => {
    accumulator[event.eventType] = (accumulator[event.eventType] || 0) + 1;
    return accumulator;
  }, {});
  assert.ok(kinds.unit_enter >= 6, "一节课要覆盖 6 个知识点");
  assert.ok(kinds.parameter_commit > 20, "挣扎型画像必须有大量参数提交");
  assert.ok(kinds.courseware_challenge_result > 10, "必须有课件判定结果");
  assert.ok(kinds.quiz_submit_success >= 1, "必须有形成性测验（支架阶梯的入口信号）");
  console.log("事件流通过：6 个知识点、参数提交、课件判定、形成性测验都在。");
}

{
  // 产出量必须随"有多卡"单调上升，否则这个测量工具没有区分力
  const fluent = sim.runSession("fluent", 1000);
  const typical = sim.runSession("typical", 1000);
  const struggle = sim.runSession("struggle", 1000);
  assert.ok(
    fluent.total <= typical.total && typical.total <= struggle.total,
    `产出量应随挣扎程度单调：fluent=${fluent.total} typical=${typical.total} struggle=${struggle.total}`
  );
  assert.ok(struggle.total > 0, "挣扎型必须真的产出决策点（曾经静默为 0）");
  assert.ok(struggle.total <= 6 * 3, `单人产出不应离谱：${struggle.total}`);

  // 决策必须来自**设计好的入口信号**，而不是全被"换一种方式看"占掉。
  // 全被换表征占掉时，主动水平（本实验的主因子）只有一个水平，主分析没有变异。
  const kindsUsed = [...struggle.decisionCounts.keys()];
  assert.ok(
    kindsUsed.some((kind) => ["quiet_dwell", "repeated_parameter", "formative_outcome", "quiz_review"].includes(kind)),
    `决策必须来自设计的入口信号，实际 ${kindsUsed.join("/")}`
  );
  const switchShare = (struggle.decisionCounts.get("representation_switch") || 0) / struggle.total;
  assert.ok(
    switchShare <= 0.5,
    `换表征不得占据多数决策（实际 ${(switchShare * 100).toFixed(0)}%）——`
    + "它应该是「支架没解决之后」的选项，不是先手"
  );
  console.log(
    `产出量通过：fluent=${fluent.total} ≤ typical=${typical.total} ≤ struggle=${struggle.total}；`
    + `决策来源 ${kindsUsed.join("/")}。`
  );
}

// ------------------------------------------------ 2. 根因修复之一：not-shown 不留冷却

{
  // 「反复调参」要三次提交才成立，所以每个 coach 都要喂三次
  const feedThreeCommits = (coach) => {
    coach.consume({
      eventType: "unit_enter", unitId: "GH-01-K01", unitType: "knowledge",
      sceneType: "simulation", timing: { clientAt: 0 }
    });
    for (let index = 1; index <= 3; index += 1) {
      coach.consume({
        eventType: "parameter_commit", unitId: "GH-01-K01", unitType: "knowledge",
        sceneType: "simulation", timing: { clientAt: index * 10_000 },
        data: { state: { parameter: "p", oldValue: String(index), newValue: String(index + 1) } }
      });
    }
  };

  const coach = createProactiveCoach({ sceneTypesFor: () => sim.ACTIVITY_TYPES });
  feedThreeCommits(coach);
  const suggestion = coach.getSuggestion();
  assert.ok(suggestion, "三次连续调参之后应当有一个活跃建议");
  const notShown = coach.resolve("not-shown", 40_000);
  assert.equal(notShown.cooldownUntil, 0, "not-shown 不得留下客户端冷却：根本没走到学生面前");
  assert.equal(notShown.dismissStreak, 0, "not-shown 不是学生的拒绝，不该累计连续拒绝");

  // 对照：真正的拒绝必须留冷却。冷却的语义是"学生刚拒绝过，先别再来"。
  const coach2 = createProactiveCoach({ sceneTypesFor: () => sim.ACTIVITY_TYPES });
  feedThreeCommits(coach2);
  assert.ok(coach2.getSuggestion());
  const ignored = coach2.resolve("ignore", 40_000);
  assert.ok(ignored.cooldownUntil > 40_000, "学生的拒绝必须留下冷却");
  console.log("not-shown 语义通过：没有展示给学生就不留冷却；学生的拒绝照旧留冷却。");
}

// ------------------------------------------------ 3. 根因修复之二：换表征必须先试过支架

{
  // 没有支架历史时，"换一种方式看"候选必须被 history 证据族拦下。
  // history 白送的话，换表征会在每个知识点抢先占掉唯一的机会，L1–L5 永远进不去。
  const policy = require("../lib/proactive-policy");
  const config = sim.defaultConfig();
  const baseEvidence = {
    families: ["process"],
    sceneAttemptFailures: 3,
    sceneAttemptCount: 4,
    parameterCommitCount: 5,
    confirmedGapCount: 0,
    representationChoice: {
      selectionId: "sim-choice",
      targetTypeId: "mindMap",
      targetTitle: "关系图",
      targetReasonCode: "unseen_type_highest_score",
      available: ["simulation", "mindMap"],
      experienced: ["simulation"],
      unseen: ["mindMap"],
      candidates: [{ typeId: "mindMap", score: 1 }],
      choiceVersion: "sim"
    }
  };
  const evaluate = (families) => policy.evaluate({
    config,
    assignment: {
      experiment_id: "yield-simulation", condition: "treatment_full",
      cohort: "pilot", stratum: "sim", assignment_version: "yield-hash-v1"
    },
    context: {
      chapterId: "V14-C1", unitId: "GH-01-K01", knowledgePointId: "GH-01-K01",
      sceneType: "simulation", isQuiz: false, quizSubmitted: false, phase: "learning"
    },
    signal: { kind: "representation_switch" },
    evidence: { ...baseEvidence, families },
    policyState: {},
    budget: { remaining: 5 },
    now: Date.UTC(2026, 8, 22, 10, 0, 0)
  });

  const withoutHistory = evaluate(["process"]);
  assert.equal(withoutHistory.displayAllowed, false, "没试过支架就不能提议换活动");
  assert.ok(
    withoutHistory.reasonCodes.includes("missing_history_evidence"),
    `理由码应指向缺 history，实际 ${withoutHistory.reasonCodes.join("/")}`
  );
  const withHistory = evaluate(["process", "history"]);
  assert.equal(
    withHistory.displayAllowed, true,
    `试过支架之后换表征应当放行，实际理由 ${withHistory.reasonCodes.join("/")}`
  );
  console.log("换表征门槛通过：没有支架历史时被拦下，有历史时放行。");
}

// ------------------------------------------------ 4. 客户端守卫：没有支架回合就不问

{
  const assistantSource = fs.readFileSync(
    path.join(root, "app/main/knowledge-assistant.js"), "utf8"
  );
  assert.match(
    assistantSource,
    /candidate\?\.kind === "independent_attempt_outcome" && !awaitingFollowup[\s\S]*?proactiveCoach\.resolve\("not-shown"/,
    "没有开着的支架回合时，独立尝试结果既不该问服务端，也不该留下冷却"
  );
  assert.match(
    assistantSource,
    /if \(!decision\.intervene \|\| decision\.action === "stay_silent"\)[\s\S]*?proactiveCoach\.resolve\("not-shown"/,
    "服务端判定不打扰时，结算必须用 not-shown（否则一个知识点只剩一次机会）"
  );
  const coachSource = fs.readFileSync(
    path.join(root, "app/main/proactive-learning.js"), "utf8"
  );
  assert.match(
    coachSource,
    /noClientCooldown = reason === "outcome-recorded" \|\| reason === "not-shown"/,
    "coach 必须把 not-shown 当作不留冷却的结算"
  );
  console.log("客户端守卫通过：两处 not-shown 结算与 coach 的无冷却语义都在。");
}

console.log("决策点干跑通过：事件流合理、产出随挣扎单调、入口信号有效、两处根因修复都在。");
