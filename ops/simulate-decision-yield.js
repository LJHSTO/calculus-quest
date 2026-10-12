"use strict";

/**
 * 决策点产出量干跑测量。
 *
 * 这是实验能否做成的唯一未知量：20 人 × 一小时到底能产出多少决策点？如果每人只有
 * 3–5 个，480 个观测的功率估算就是空的。
 *
 * 做法：不使用真人，而是把一个"一小时学习 6 个知识点"的真实事件流，喂给**真实的
 * 客户端 coach**（app/main/proactive-learning.js）产生候选，再过**真实的策略门槛**
 * （lib/proactive-policy）判定是否真的成为决策点。两边都是生产代码，不是重写的近似。
 *
 * 学员画像分三档，因为产出量高度依赖学生有多"卡"：
 *   fluent  顺畅型：很少反复调参、很少失败
 *   typical 常见型：偶尔卡住
 *   struggle 挣扎型：频繁反复与失败
 *
 * 用法：node ops/simulate-decision-yield.js [--rounds 200]
 */

const { createProactiveCoach } = require("../app/main/proactive-learning");
const policy = require("../lib/proactive-policy");
const representationChoice = require("../lib/proactive-policy/representation-choice");

/**
 * 把路由里的知识点还原成 `chooseRepresentation` 要的形状。
 *
 * 模拟器必须走**生产代码**来选择换哪种表征。早先这里直接写
 * `representationChoice: null`，于是换表征候选一律被 `representation_candidates_absent`
 * 拦下——报告看上去像"这条路径没价值"，其实是模拟器没给证据。
 */
function knowledgePointFor(unitId) {
  const route = require("../data/multi-scene-learning-route.json");
  const chapter = route.chapters.find((item) => item.id === "V14-C1");
  const point = chapter.modules
    .flatMap((module) => module.knowledgePoints || [])
    .find((item) => item.id === unitId);
  if (!point) return null;
  return {
    id: point.id,
    name: point.name || point.title || point.id,
    goal: point.scopeGoal || "",
    misconception: point.misconception || "",
    // 生产里 resourceCandidates 的 widgetType/type 经过归一化，这里照做
    resourceCandidates: (point.resourceCandidates || []).map((candidate) => ({
      ...candidate,
      widgetType: candidate.widgetType || candidate.type,
      type: candidate.type || candidate.widgetType
    }))
  };
}

const roundsIndex = process.argv.indexOf("--rounds");
const ROUNDS = roundsIndex >= 0 ? Math.max(1, Number(process.argv[roundsIndex + 1]) || 200) : 200;

const KNOWLEDGE_POINTS = ["GH-01-K01", "GH-01-K02", "GH-01-K03", "GH-02-K01", "GH-02-K02", "GH-02-K03"];
const ACTIVITY_TYPES = [
  { typeId: "simulation", title: "拖动实验" },
  { typeId: "mindMap", title: "关系图" },
  { typeId: "game", title: "误解修复挑战" },
  { typeId: "visualization3d", title: "空间视角" }
];
const MINUTES_PER_KNOWLEDGE_POINT = 5;
const SESSION_MINUTES = KNOWLEDGE_POINTS.length * MINUTES_PER_KNOWLEDGE_POINT;

// 三档学员画像。数字是"每分钟发生多少次"或"多少概率"，按经验设定，
// 目的是给出产出量的量级而不是精确预测。
const PROFILES = {
  fluent: { commitEverySec: 40, submitEverySec: 75, failureRate: 0.15, sceneSwitchPerKp: 1, quizErrors: 0 },
  typical: { commitEverySec: 22, submitEverySec: 45, failureRate: 0.35, sceneSwitchPerKp: 2, quizErrors: 1 },
  struggle: { commitEverySec: 12, submitEverySec: 30, failureRate: 0.60, sceneSwitchPerKp: 3, quizErrors: 2 }
};

function localRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** 生成一名学员一小时的事件流。时间单位：毫秒，从 0 开始。 */
function buildSession(profile, seed) {
  const random = localRandom(seed);
  const events = [];
  const msPerKp = MINUTES_PER_KNOWLEDGE_POINT * 60 * 1000;
  KNOWLEDGE_POINTS.forEach((unitId, kpIndex) => {
    const base = kpIndex * msPerKp;
    let sceneType = ACTIVITY_TYPES[0].typeId;
    events.push({ at: base, eventType: "unit_enter", unitId, unitType: "knowledge", sceneType });
    let switched = 0;
    let nextSwitch = base + Math.floor(msPerKp / (profile.sceneSwitchPerKp + 1));
    for (let t = base + 5000; t < base + msPerKp; t += 1000) {
      // 换场景
      if (switched < profile.sceneSwitchPerKp && t >= nextSwitch) {
        switched += 1;
        sceneType = ACTIVITY_TYPES[switched % ACTIVITY_TYPES.length].typeId;
        events.push({ at: t, eventType: "knowledge_scene_select", unitId, sceneType });
        nextSwitch += Math.floor(msPerKp / (profile.sceneSwitchPerKp + 1));
        continue;
      }
      const sinceBase = t - base;
      if (sinceBase % (profile.commitEverySec * 1000) < 1000) {
        events.push({
          at: t, eventType: "parameter_commit", unitId, sceneType,
          data: { state: { parameter: "输入 x", oldValue: String(sinceBase / 1000), newValue: String(sinceBase / 1000 + 1) } }
        });
      }
      if (sinceBase % (profile.submitEverySec * 1000) < 1000) {
        const failed = random() < profile.failureRate;
        events.push({
          at: t, eventType: "courseware_challenge_result", unitId, sceneType,
          data: { is_correct: !failed, independent: true }
        });
      }
      // 偶尔出现长时间停顿（学生会停住思考）
      if (sinceBase % 95000 < 1000 && random() < 0.5) {
        t += 100000;
      }
    }
    // 该知识点的形成性测验（部分知识点有）
    if (profile.quizErrors > 0 && kpIndex % 2 === 1) {
      events.push({
        at: base + msPerKp - 2000, eventType: "quiz_submit_success", unitId: `${unitId}-formative`,
        unitType: "quiz", data: { phase: "formative", incorrect: profile.quizErrors, correct: 3, pendingReview: 0 }
      });
    }
  });
  return events.sort((a, b) => a.at - b.at);
}

function defaultConfig() {
  return policy.configFromEnv({
    PROACTIVE_POLICY_MODE: "active",
    PROACTIVE_EXPERIMENT_ID: "yield-simulation",
    PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C1",
    PROACTIVE_ASSIGNMENT_VERSION: "yield-hash-v1",
    PROACTIVE_ASSIGNMENT_SALT: "yield-simulation-salt",
    PROACTIVE_PUBLIC_CHAPTER_ONLY: "true",
    PROACTIVE_EXPERIMENT_ARMS: "control,treatment_full",
    PROACTIVE_DISPLAY_ARMS: "treatment_full",
    PROACTIVE_ARM_PROFILES_JSON: JSON.stringify({
      control: { display: false, maxSupportLevel: "L0", allowRepresentationSwitch: false },
      treatment_full: { display: true, maxSupportLevel: "L5", allowRepresentationSwitch: true }
    })
  });
}

const ASSIGNMENT = {
  experiment_id: "yield-simulation",
  condition: "treatment_full",
  cohort: "pilot",
  stratum: "sim",
  assignment_version: "yield-hash-v1"
};

/** 跑一名学员，返回该学员产生的决策点（按类型分组）。 */
function runSession(profileName, seed) {
  const profile = PROFILES[profileName];
  const coach = createProactiveCoach({ sceneTypesFor: () => ACTIVITY_TYPES });
  const config = defaultConfig();
  const decisionCounts = new Map();
  const candidateCounts = new Map();
  const reasonCounts = new Map();
  let budgetRemaining = 10;
  // 每个知识点一条**真实的策略状态**（生命周期 + 冷却 + 当前档位）。
  //
  // 为什么必须维护它：`independent_attempt_outcome` 只在生命周期进入
  // `awaiting_independent_attempt` 时才被接受，否则策略回
  // `independent_attempt_not_expected` 而静默。早先的版本传 `policyState: {}`，
  // 于是每一条独立结果都被拦下，干跑报告"人均 0 个决策点"，看上去像设计有问题——
  // 其实是模拟器没有模拟支架回合。**验证工具静默失效比功能坏掉更危险**，
  // 因为它会把人引向错误的结论。
  const policyStateByScope = new Map();
  const SIM_INTERVENTION = (scopeKey, at) => `sim-${scopeKey}-${at}`;

  const stateFor = (scopeKey) => policyStateByScope.get(scopeKey) || {};

  /** 学生接受了这次建议：生命周期进入"等学生回应"。 */
  function acceptIntervention(scopeKey, decision, at) {
    const prior = stateFor(scopeKey);
    const next = policy.lifecycle.afterResolution({
      lifecycle: prior.lifecycle || {},
      decision: {
        id: `sim-decision-${at}`,
        action: decision.action,
        support_level: decision.supportLevel
      },
      interventionId: SIM_INTERVENTION(scopeKey, at),
      resolution: "accepted",
      resolvedAt: new Date(at).toISOString()
    });
    policyStateByScope.set(scopeKey, {
      ...prior,
      lifecycle: next,
      // 冷却只挡非生命周期信号；升级链由 lifecycleOutcomeProbe 放行，
      // 所以这里照实写上限，由策略自己决定要不要静默。
      cooldown_until: new Date(at + 10 * 60 * 1000).toISOString()
    });
  }

  /** 学生回复了支架提问：进入"等独立尝试结果"。 */
  function studentReplies(scopeKey, at) {
    const prior = stateFor(scopeKey);
    const next = policy.lifecycle.afterStudentResponse({
      lifecycle: prior.lifecycle || {},
      interventionId: prior.lifecycle?.activeInterventionId || "",
      respondedAt: new Date(at).toISOString()
    });
    policyStateByScope.set(scopeKey, { ...prior, lifecycle: next });
  }

  /** 收到独立尝试结果：结束本轮（通过）或进入下一级（未通过）。 */
  function resolveIndependentAttempt(scopeKey, success, at) {
    const prior = stateFor(scopeKey);
    const outcome = policy.lifecycle.independentAttemptOutcome({
      lifecycle: prior.lifecycle || {},
      currentLevel: prior.lifecycle?.supportLevel || "L1",
      fadeLevel: prior.fadeLevel || 0,
      evidence: {
        independentAttemptVerified: true,
        independentAttemptSuccess: success,
        confirmedIncorrect: success ? 0 : 1,
        confirmedCorrect: success ? 1 : 0,
        questionCount: 1,
        verificationCheckId: `sim-check-${at}`
      }
    });
    if (!outcome.transition) return;
    policyStateByScope.set(scopeKey, {
      ...prior,
      current_level: outcome.transition.currentLevel || prior.current_level || "L0",
      fade_level: outcome.transition.fadeLevel ?? prior.fade_level ?? 0,
      lifecycle: outcome.transition.lifecycle || prior.lifecycle || {}
    });
  }

  const session = buildSession(profile, seed);
  // 客户端在不同事件之间还会跑一个**定时器**（真实前端里是 `proactiveTickTimer`，
  // 每秒一次）。静坐候选（quiet_dwell）只从这个定时器产生，不来自任何事件。
  //
  // 早先的模拟器只喂事件、从不调用 `tick`，于是**最大的候选来源整条缺失**：
  // 剩下的只有"独立尝试结果"，而那一种在生命周期没进入等待态时必然被拒。
  // 结果是干跑报告人均 0 个决策点——不是设计不行，是模拟器漏了一整个信号源。
  const events = [];
  let previous = session.length ? session[0].at : 0;
  for (const event of session) {
    for (let at = previous + 1000; at < event.at; at += 1000) {
      events.push({ at, eventType: "__tick__" });
    }
    events.push(event);
    previous = event.at;
  }
  events.sort((left, right) => left.at - right.at);

  let lastCandidateId = "";
  // 按知识点累计"学生真的做了什么"：失败次数、参数提交、体验过的活动类型。
  // 这些正是策略层判定"要不要帮"所依据的证据；模拟器自己造出事件流，就该自己
  // 把证据算出来，而不是给一堆 0——给 0 会让每一条候选都被门槛拦下。
  const observed = new Map();
  const observe = (unitId) => {
    const entry = observed.get(unitId) || {
      failures: 0, attempts: 0, commits: [], experiencedTypes: []
    };
    observed.set(unitId, entry);
    return entry;
  };
  for (const event of events) {
    const isTick = event.eventType === "__tick__";
    if (!isTick && event.unitId) {
      const entry = observe(event.unitId);
      if (event.eventType === "parameter_commit") entry.commits.push(event.at);
      if (event.eventType === "courseware_challenge_result") {
        entry.attempts += 1;
        if (event.data?.is_correct === false) entry.failures += 1;
      }
      if (["unit_enter", "knowledge_scene_select"].includes(event.eventType) && event.sceneType) {
        if (!entry.experiencedTypes.includes(event.sceneType)) {
          entry.experiencedTypes.push(event.sceneType);
        }
      }
    }
    const candidate = isTick
      ? coach.tick(event.at)
      : coach.consume({
          ...event,
          unitLabel: event.unitId,
          timing: { clientAt: event.at }
        });
    if (!candidate?.kind) continue;
    // `tick` 会把**同一个**活跃建议每秒再返回一次（真实前端靠 id 去重，
    // 只有新建议才展示）。不去重就会把一条建议数成几百条候选。
    if (candidate.id && candidate.id === lastCandidateId) continue;
    lastCandidateId = candidate.id || candidate.kind;
    // 与客户端同一条守卫：没有开着的支架回合时，「独立尝试结果」不问服务端
    // （服务端必定回 independent_attempt_not_expected）。见
    // app/main/knowledge-assistant.js 的 requestProactiveDecision。
    // 模拟器必须复制这条规则，否则它测的是一个已经被修掉的世界。
    if (
      candidate.kind === "independent_attempt_outcome"
      && stateFor(candidate.unitId).lifecycle?.phase !== "awaiting_independent_attempt"
    ) {
      coach.resolve("not-shown", event.at);
      continue;
    }
    candidateCounts.set(candidate.kind, (candidateCounts.get(candidate.kind) || 0) + 1);
    const scopeKey = candidate.unitId;
    const now = event.at;
    const scopeState = stateFor(scopeKey);
    const seen = observed.get(scopeKey) || { failures: 0, attempts: 0, commits: [], experiencedTypes: [] };
    const commitsInWindow = seen.commits.filter((at) => now - at <= 5 * 60 * 1000).length;
    // 换表征候选必须有真实候选集：走生产的 chooseRepresentation
    const point = knowledgePointFor(scopeKey);
    const choice = point
      ? representationChoice.chooseRepresentation({
          knowledgePoint: point,
          experiencedTypes: seen.experiencedTypes,
          masteryLevel: null,
          reviewMode: false
        })
      : null;
    // 冷却与生命周期状态都交给真实的策略层判断，模拟器不再自己复制一份门槛逻辑——
    // 复制的门槛会与生产代码漂移，而这正是本次修掉的那个坑。
    const evidence = {
      families: [],
      parameterCommitCount: candidate.kind === "repeated_parameter" ? 3 : commitsInWindow,
      taskProgressSinceFirstCommit: 0,
      confirmedIncorrect: Number(candidate.incorrect || 0),
      confirmedCorrect: Number(candidate.correct || 0),
      pendingReview: Number(candidate.pendingReview || 0),
      questionCount: Number(candidate.questionCount || 0),
      // 课程件里的失败就是"已确认的卡点"——课件语义事件已经判过对错
      confirmedGapCount: seen.failures,
      sceneAttemptCount: seen.attempts,
      sceneAttemptFailures: seen.failures,
      dwellSeconds: Number(candidate.dwellSeconds || 0),
      naturalBoundary: true,
      representationChoice: choice
    };
    // families 按触发源给最小充分集合（模拟器无法复现服务端的完整证据采集，
    // 这里给每个触发源它必需的那一族，以便门槛能真的通过/拦下）
    const familyByKind = {
      repeated_parameter: ["process", "task"],
      quiet_dwell: ["time"],
      quiz_review: ["result"],
      formative_outcome: ["result"],
      independent_attempt_outcome: ["history"],
      student_requested_alternative: ["history", "preference"],
      representation_switch: ["history", "process"]
    };
    // 「换一种方式看」的 history 必须**真的**来自一次试过的支架，不能白送——
    // 与 server.js 的 representation_switch 分支同一条规则。白送会让换表征在每个
    // 知识点抢先占掉唯一的机会，L1–L5 阶梯永远进不去。
    const supportTried = Number(scopeState.lifecycle?.attemptCount || 0) > 0
      || Number(scopeState.lifecycle?.frictionEvidenceCount || 0) > 0
      || Number(scopeState.lifecycle?.successEvidenceCount || 0) > 0;
    evidence.families = candidate.kind === "representation_switch" && !supportTried
      ? ["process"]
      : (familyByKind[candidate.kind] || []);
    if (seen.failures > 0 || commitsInWindow >= 3) evidence.families.push("process");
    if (seen.failures > 0) evidence.families.push("result");
    evidence.families = Array.from(new Set(evidence.families));
    // 独立的判定结果：模拟器按画像的失败率决定这次是否通过
    const independentSuccess = event.data?.is_correct !== false;

    const decision = policy.evaluate({
      config,
      assignment: ASSIGNMENT,
      context: {
        chapterId: "V14-C1",
        unitId: scopeKey,
        knowledgePointId: scopeKey,
        sceneType: event.sceneType || "",
        isQuiz: String(event.unitType || "") === "quiz",
        quizSubmitted: candidate.kind === "quiz_review" || candidate.kind === "formative_outcome",
        phase: candidate.phase || "learning"
      },
      signal: { kind: candidate.kind, dwellSeconds: candidate.dwellSeconds },
      evidence,
      policyState: scopeState,
      budget: { remaining: budgetRemaining },
      now
    });

    if (decision.decision === "intervene" && decision.displayAllowed) {
      decisionCounts.set(candidate.kind, (decisionCounts.get(candidate.kind) || 0) + 1);
      budgetRemaining = Math.max(0, budgetRemaining - 1);
      // 学生接受：清掉客户端建议（并重置客户端的 dismissStreak）
      coach.resolve("accept", now);
      // 模拟学生接受 + 回复 + 支架后检查这一整轮，让升级链真的跑起来
      acceptIntervention(scopeKey, decision, now);
      studentReplies(scopeKey, now + 15_000);
      if (candidate.kind === "independent_attempt_outcome") {
        resolveIndependentAttempt(scopeKey, independentSuccess, now + 20_000);
      }
    } else {
      // 取**最后一个**理由码：`silentResult` 把真正触发静默的那一条追加在末尾，
      // 而前面那些是"走到这一步为止已经成立的事实"（例如
      // `representation_switch_after_scene_failure`）。取第一个会把"因为缺 history
      // 证据而被拦"误报成"因为场景失败而拦"。
      const codes = decision.reasonCodes || [];
      const reason = codes.filter((code) => code !== "policy_thresholds_met").at(-1) || "unknown";
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
      // 服务端没投递：按 `not-shown` 结算（**不留冷却**），与客户端一致。
      // 用 `ignore` 会留下 10 分钟冷却，把这个知识点后面所有候选都挡掉。
      coach.resolve("not-shown", now);
    }
  }
  const total = [...decisionCounts.values()].reduce((sum, n) => sum + n, 0);
  return { total, decisionCounts, candidateCounts, reasonCounts };
}

/** 跑完全部画像并打印报告。返回汇总，便于测试直接断言。 */
function runAll(rounds = ROUNDS) {
  // --- 跑模拟 -------------------------------------------------------------
  console.log(`模拟：${rounds} 名学员 × ${SESSION_MINUTES} 分钟 × ${KNOWLEDGE_POINTS.length} 个知识点\n`);
  const summary = {};
  for (const profileName of Object.keys(PROFILES)) {
    const totals = [];
    const byKind = new Map();
    const byCandidate = new Map();
    const byReason = new Map();
    for (let round = 0; round < rounds; round += 1) {
      const result = runSession(profileName, 1000 + round * 7919);
      totals.push(result.total);
      for (const [kind, count] of result.decisionCounts) {
        byKind.set(kind, (byKind.get(kind) || 0) + count);
      }
      for (const [kind, count] of result.candidateCounts) {
        byCandidate.set(kind, (byCandidate.get(kind) || 0) + count);
      }
      for (const [reason, count] of result.reasonCounts) {
        byReason.set(reason, (byReason.get(reason) || 0) + count);
      }
    }
    totals.sort((a, b) => a - b);
    const mean = totals.reduce((sum, n) => sum + n, 0) / totals.length;
    summary[profileName] = {
      mean,
      median: totals[Math.floor(totals.length / 2)],
      min: totals[0],
      max: totals.at(-1),
      byKind,
      byCandidate,
      byReason
    };
    console.log(`【${profileName}】人均决策点 ${mean.toFixed(1)}（中位 ${summary[profileName].median}，范围 ${totals[0]}–${totals.at(-1)}）`);
    console.log(`  按触发源：${[...byKind].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${(v / rounds).toFixed(1)}`).join("  ")}`);
    const topReasons = [...byReason].sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, v]) => `${k}=${(v / rounds).toFixed(1)}`).join("  ");
    console.log(`  候选（过门槛前）：${[...byCandidate].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${(v / rounds).toFixed(1)}`).join("  ") || "（无）"}`);
    console.log(`  被拦下的主要原因：${topReasons || "（无）"}`);
    console.log("");
  }

  // --- 与实验设计对照 -----------------------------------------------------
  // 注意：随机化单位是**知识点**、只有两个条件（规则档 / 自适应档）。
  // 早先这里按 2×2 四格算，是旧设计的残留；按四格算会把每格观测数低估一半，
  // 从而得出"设计不可行"的错误结论。
  const perPerson = summary.typical.mean;
  const totalDecisionPoints = perPerson * 20;
  const CONDITIONS = 2;
  console.log("=== 与 20 人实验设计对照 ===");
  console.log(`  按"常见型"画像：人均 ${perPerson.toFixed(1)} 个 → 20 人合计 ${totalDecisionPoints.toFixed(0)} 个决策点`);
  console.log(`  两个条件（规则档 / 自适应档）每条件约 ${(totalDecisionPoints / CONDITIONS).toFixed(0)} 个`);
  const need = 60; // 设计文档：20 人 × 3 知识点/条件 = 每条件约 60 个观测
  if (totalDecisionPoints / CONDITIONS >= need) {
    console.log(`  → 达到每条件 ${need} 的目标，设计可行`);
  } else {
    console.log(`  → 低于每条件 ${need} 的目标（差 ${(need - totalDecisionPoints / CONDITIONS).toFixed(0)} 个）；`
      + "先看是不是冷却时长或知识点时长变了，再考虑放宽触发条件");
  }
  console.log("");
  console.log(`  若按"挣扎型"画像：人均 ${summary.struggle.mean.toFixed(1)} → 合计 ${(summary.struggle.mean * 20).toFixed(0)} 个，每条件约 ${(summary.struggle.mean * 20 / CONDITIONS).toFixed(0)} 个`);
  console.log(`  若按"顺畅型"画像：人均 ${summary.fluent.mean.toFixed(1)} → 合计 ${(summary.fluent.mean * 20).toFixed(0)} 个，每条件约 ${(summary.fluent.mean * 20 / CONDITIONS).toFixed(0)} 个`);
  return summary;
}

module.exports = {
  PROFILES,
  KNOWLEDGE_POINTS,
  ACTIVITY_TYPES,
  SESSION_MINUTES,
  buildSession,
  defaultConfig,
  runSession,
  runAll
};

if (require.main === module) {
  runAll(ROUNDS);
}
