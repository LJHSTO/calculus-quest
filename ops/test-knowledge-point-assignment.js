"use strict";
// 知识点层面的条件分配。
//
// 为什么不用决策点层面：干跑实测（ops/simulate-decision-yield.js）显示，
// `cooldownMs = 10 分钟` 而每个知识点只学约 5 分钟，所以一个知识点内通常只有
// 1–2 次干预机会，20 人一小时每格只有 30–90 个观测。决策点不是独立同分布的观测，
// 而是被"知识点"这个单位结构化的，所以随机化单位必须提到知识点层面。
const assert = require("node:assert/strict");
const proactivity = require("../lib/proactive-policy/proactivity");

const SALT = "adaptive-proactivity-2026";
const KP_COUNT = 6;
const PARTICIPANTS = 20;

// --- 1. 每个参与者在两个条件上各拿一半知识点 --------------------------------
const perKnowledgePoint = Array.from({ length: KP_COUNT }, () => ({ rule: 0, adaptive: 0 }));
for (let p = 1; p <= PARTICIPANTS; p += 1) {
  const participantId = `p${String(p).padStart(2, "0")}`;
  const counts = { rule: 0, adaptive: 0 };
  for (let index = 0; index < KP_COUNT; index += 1) {
    const assignment = proactivity.assignKnowledgePointCondition({
      participantId, knowledgePointIndex: index, knowledgePointCount: KP_COUNT, salt: SALT
    });
    assert.ok(["rule", "adaptive"].includes(assignment.condition),
      `未知条件 ${assignment.condition}`);
    counts[assignment.condition] += 1;
    perKnowledgePoint[index][assignment.condition] += 1;
  }
  assert.equal(counts.rule, KP_COUNT / 2,
    `${participantId} 的 rule 知识点应为 ${KP_COUNT / 2}，实际 ${counts.rule}`);
  assert.equal(counts.adaptive, KP_COUNT / 2,
    `${participantId} 的 adaptive 知识点应为 ${KP_COUNT / 2}，实际 ${counts.adaptive}`);
}

// --- 2. 每个知识点被分到两个条件的次数接近相等 ------------------------------
// 拉丁方轮转让每个知识点在 6 个偏移里恰好有 3 个落在 rule。20 人不是 6 的整数倍，
// 所以会有 9/11 这样的小偏差；分析时知识点作固定效应会吸收它。
for (let index = 0; index < KP_COUNT; index += 1) {
  const { rule, adaptive } = perKnowledgePoint[index];
  assert.equal(rule + adaptive, PARTICIPANTS, `KP${index} 总数不对`);
  assert.ok(
    Math.abs(rule - adaptive) <= 2,
    `KP${index} 条件分配偏差过大：rule=${rule} adaptive=${adaptive}`
  );
}

// --- 3. 条件不能与会话位置完全混淆 ------------------------------------------
// 如果前三个知识点永远是同一条件，疲劳/学习效应就会和条件效应混在一起。
// 轮转的作用正是让"哪些知识点拿 rule"随参与者变化。
const ruleSets = new Set();
for (let p = 1; p <= PARTICIPANTS; p += 1) {
  const participantId = `p${String(p).padStart(2, "0")}`;
  const ruleIndices = [];
  for (let index = 0; index < KP_COUNT; index += 1) {
    const { condition } = proactivity.assignKnowledgePointCondition({
      participantId, knowledgePointIndex: index, knowledgePointCount: KP_COUNT, salt: SALT
    });
    if (condition === "rule") ruleIndices.push(index);
  }
  ruleSets.add(ruleIndices.join(","));
}
assert.ok(
  ruleSets.size >= 3,
  `rule 所在的知识点组合应随参与者变化，实际只有 ${ruleSets.size} 种`
);

// --- 4. 可复现 --------------------------------------------------------------
const first = proactivity.assignKnowledgePointCondition({
  participantId: "p07", knowledgePointIndex: 2, knowledgePointCount: KP_COUNT, salt: SALT
});
const second = proactivity.assignKnowledgePointCondition({
  participantId: "p07", knowledgePointIndex: 2, knowledgePointCount: KP_COUNT, salt: SALT
});
assert.deepEqual(first, second, "知识点条件分配必须可复现");
const otherSalt = proactivity.assignKnowledgePointCondition({
  participantId: "p07", knowledgePointIndex: 2, knowledgePointCount: KP_COUNT, salt: `${SALT}-x`
});
assert.notEqual(
  otherSalt.assignmentDigest, first.assignmentDigest,
  "换盐之后分配材料必须改变"
);

// --- 5. 条件到主动水平策略的映射 --------------------------------------------
assert.equal(proactivity.proactivityPolicyForCondition("rule"), "fixed",
  "规则条件对应固定档");
assert.equal(proactivity.proactivityPolicyForCondition("adaptive"), "adaptive");
assert.equal(proactivity.proactivityPolicyForCondition(""), "adaptive",
  "未知条件按自适应处理（更保守的默认）");
// 两个条件必须真的映射到不同的策略，否则实验没有对照
assert.notEqual(
  proactivity.proactivityPolicyForCondition("rule"),
  proactivity.proactivityPolicyForCondition("adaptive")
);

// --- 6. 越界与退化输入 ------------------------------------------------------
assert.ok(
  proactivity.assignKnowledgePointCondition({
    participantId: "p01", knowledgePointIndex: 99, knowledgePointCount: KP_COUNT, salt: SALT
  }).condition,
  "知识点下标越界时仍应给出一个条件（取模）"
);
assert.ok(
  proactivity.assignKnowledgePointCondition({}).condition,
  "空输入不应抛异常"
);

console.log(
  `知识点条件分配通过：${PARTICIPANTS} 人每人 rule/adaptive 各 ${KP_COUNT / 2} 个知识点；`
  + `每个知识点的两条件分配偏差 ≤2；rule 所在知识点组合有 ${ruleSets.size} 种（不与会话位置混淆）；`
  + `分配可复现，条件到策略的映射两两不同。`
);
