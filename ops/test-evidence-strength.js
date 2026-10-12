"use strict";
// 证据结构化：证据族带强度、去掉绕过门槛的特例。
//
// 原来的 `families` 只是字符串集合——只有"有没有"，没有"多强"。于是
// "有一点点过程证据"和"大量过程证据"无法区分，而且必须靠一个特例绕过门槛：
//
//     const singleConfirmedResult = evidenceFamilies.includes("result")
//       && Number(evidence.confirmedIncorrect || evidence.confirmedGapCount || 0) > 0;
//     if (missingFamilies.length && !singleConfirmedResult) { ... 静默 ... }
//
// 那个特例让"存在一个已确认的测验错误"绕过**所有** profile 的证据族要求。
const assert = require("node:assert/strict");
const policy = require("../lib/proactive-policy");

function config() {
  return policy.configFromEnv({
    PROACTIVE_POLICY_MODE: "active",
    PROACTIVE_EXPERIMENT_ID: "evidence-strength-test",
    PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C1",
    PROACTIVE_ASSIGNMENT_VERSION: "test-hash-v1",
    PROACTIVE_ASSIGNMENT_SALT: "test-only-salt",
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
  experiment_id: "evidence-strength-test",
  condition: "treatment_full",
  cohort: "pilot",
  stratum: "high",
  assignment_version: "test-hash-v1"
};
const CONTEXT = {
  chapterId: "V14-C1",
  unitId: "GH-01-K01",
  knowledgePointId: "GH-01-K01",
  sceneType: "simulation",
  isQuiz: false,
  quizSubmitted: false,
  phase: "learning"
};
function evaluate(signal, evidence) {
  return policy.evaluate({
    config: config(),
    assignment: ASSIGNMENT,
    context: CONTEXT,
    signal,
    evidence,
    policyState: {},
    budget: { remaining: 10 },
    now: Date.parse("2026-09-22T12:00:00.000Z")
  });
}

// --- 1. 向后兼容：只给 families 不给强度时，存在即通过门槛 -------------------
// 调用方不必一次性全改。
{
  const decision = evaluate({ kind: "repeated_parameter" }, {
    families: ["process", "task"],
    parameterCommitCount: 3,
    taskProgressSinceFirstCommit: 0
  });
  assert.equal(decision.decision, "intervene",
    "只声明 families 不声明强度时应按默认强度通过");
}

// --- 2. 强度足够才能通过 ----------------------------------------------------
{
  // 强度偏低（0.2 < 门槛 0.4）应被拦下。
  // 注意 parameterCommitCount 要给到 3：分支级的 `repeated_parameter_not_verified`
  // 检查先于族门槛，提交数不够根本走不到族门槛这一步，测的就不是本模块了。
  const weak = evaluate({ kind: "repeated_parameter" }, {
    families: ["process", "task"],
    familyStrength: { process: 0.2, task: 0.2 },
    parameterCommitCount: 3,
    taskProgressSinceFirstCommit: 0
  });
  assert.equal(weak.decision, "stay_silent", "强度不足应静默");
  assert.ok(weak.reasonCodes.includes("evidence_families_insufficient"));
  assert.ok(weak.reasonCodes.includes("missing_process_evidence"));

  // 强度足够则应通过
  const strong = evaluate({ kind: "repeated_parameter" }, {
    families: ["process", "task"],
    familyStrength: { process: 0.9, task: 0.9 },
    parameterCommitCount: 3,
    taskProgressSinceFirstCommit: 0
  });
  assert.equal(strong.decision, "intervene", "强度足够应通过");
}

// --- 3. 已删除的特例：一个错题不能绕过其他族的要求 --------------------------
// 这是本次改动最实质的行为变化。特例在时，`confirmedIncorrect > 0` 会让
// repeated_parameter 在**没有任何过程证据**的情况下触发——但它断言的是
// "学生在反复调参"，那必须由过程证据支撑。
{
  const decision = evaluate({ kind: "repeated_parameter" }, {
    families: ["result"],
    familyStrength: { result: 1 },
    confirmedIncorrect: 2,
    confirmedGapCount: 0,
    // 分支检查要能通过（提交数够、没有进展），才轮得到族门槛来判断
    parameterCommitCount: 3,
    taskProgressSinceFirstCommit: 0
    // 但**没有声明** process / task 族
  });
  assert.equal(decision.decision, "stay_silent",
    "一个已确认的错题不应让 repeated_parameter 在没有过程证据时触发");
  assert.ok(decision.reasonCodes.includes("missing_process_evidence"));
  assert.ok(decision.reasonCodes.includes("missing_task_evidence"));
}

// --- 4. 需要 result 的 profile 不受影响 -------------------------------------
// quiz_review 只要求 result，所以删掉特例对它是透明的。
{
  const decision = evaluate({ kind: "quiz_review" }, {
    families: ["result"],
    familyStrength: { result: 1 },
    confirmedIncorrect: 2,
    pendingReview: 0
  });
  assert.equal(decision.decision, "intervene", "quiz_review 本来就只要求 result");
}

// --- 5. 强度被限制在 0–1 ----------------------------------------------------
{
  const clamped = evaluate({ kind: "repeated_parameter" }, {
    families: ["process", "task"],
    familyStrength: { process: 99, task: -5 },
    parameterCommitCount: 3,
    taskProgressSinceFirstCommit: 0
  });
  // process 被夹到 1（通过），task 被夹到 0（不通过）→ 应静默
  assert.equal(clamped.decision, "stay_silent", "超范围强度应被夹到 0–1 而不是直接算数");
}

// --- 6. 未知族名的强度应按 0 处理 -------------------------------------------
{
  const decision = evaluate({ kind: "repeated_parameter" }, {
    families: ["process", "task"],
    familyStrength: { somethingElse: 1 },
    parameterCommitCount: 3,
    taskProgressSinceFirstCommit: 0
  });
  // 没有给 process/task 强度 → 落到默认 0.5 → 通过（这是向后兼容的行为）
  assert.equal(decision.decision, "intervene",
    "未提供该族强度时应落到默认值，而不是被无关族的强度影响");
}

console.log(
  "证据结构化通过：未给强度时按默认值向后兼容；强度不足被拦下且理由码指出缺哪一族；"
  + "**已确认的错题不再绕过其他族的要求**（特例已删）；只要求 result 的 profile 不受影响；"
  + "强度被夹到 0–1；无关族不影响判定。"
);
