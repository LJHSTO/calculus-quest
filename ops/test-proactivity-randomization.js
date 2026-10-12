"use strict";
// 主动水平与决策点随机化。
//
// 本模块支撑论文的核心主张：现有工作把"主动水平"当固定条件比较，发现了
// "越主动越专注但信任越低"的权衡；我们把它当**策略**，用校准置信度决定该多主动。
// 这三件事必须同时成立，实验才立得住：
//   1. 四个档位的行为真的不同（否则操纵没发生）
//   2. 自适应档真的随置信度变化（否则等于固定档）
//   3. 决策点分配在参与者内完全均衡且可复现（否则功效和可复核性都没了）
const assert = require("node:assert/strict");
const proactivity = require("../lib/proactive-policy/proactivity");

// --- 1. 四个档位行为互不相同 ------------------------------------------------
assert.deepEqual(
  [...proactivity.PROACTIVITY_LEVELS],
  ["none", "notification", "suggestion", "intervention"]
);
const behaviors = proactivity.PROACTIVITY_LEVELS.map((level) => proactivity.behaviorFor(level));
assert.ok(behaviors.every(Boolean), "每个档位都要有行为定义");
// none 不展示
assert.equal(proactivity.behaviorFor("none").display, false);
// 其余三个都展示，但"含不含内容"和"自不自动执行"把三者区分开
assert.equal(proactivity.behaviorFor("notification").includeContent, false);
assert.equal(proactivity.behaviorFor("suggestion").includeContent, true);
assert.equal(proactivity.behaviorFor("suggestion").autoExecute, false);
assert.equal(proactivity.behaviorFor("intervention").autoExecute, true);
// 三者的签名 (display, includeContent, autoExecute) 必须两两不同
const signatures = ["notification", "suggestion", "intervention"].map((level) => {
  const b = proactivity.behaviorFor(level);
  return `${b.display}|${b.includeContent}|${b.autoExecute}`;
});
assert.equal(new Set(signatures).size, 3, `三个展示档位的行为必须互不相同，实际 ${signatures.join(" / ")}`);
assert.equal(proactivity.behaviorFor("nonexistent"), null, "未知档位应返回 null");

// --- 2. 固定档恒为 Suggestion ----------------------------------------------
// 选 Suggestion 作对照，是因为文献里它是唯一显著提升信任的档位；拿它当基线，
// 自适应档若想在信任上取胜就必须真的更好，而不是靠"少打扰"取胜。
for (const confidence of [0, 0.3, 0.5, 0.7, 0.9, 1]) {
  assert.equal(
    proactivity.proactivityBehavior({ policy: "fixed", confidence, needsHelp: 0.95 }).level,
    "suggestion",
    `固定档在置信度 ${confidence} 下必须仍是 suggestion`
  );
}

// --- 3. 自适应档随置信度变化，且"判断不准就不替学生做主" -------------------
assert.equal(
  proactivity.adaptiveLevel({ confidence: 0.95, needsHelp: 0.9 }),
  "intervention",
  "高置信 + 高需求才可以直接执行"
);
assert.equal(
  proactivity.adaptiveLevel({ confidence: 0.95, needsHelp: 0.5 }),
  "suggestion",
  "需求不够明确时不应自动执行"
);
assert.equal(proactivity.adaptiveLevel({ confidence: 0.70, needsHelp: 0.9 }), "suggestion");
assert.equal(
  proactivity.adaptiveLevel({ confidence: 0.45, needsHelp: 0.95 }),
  "notification",
  "低置信度时必须降档为告知式，把决定权留给学生"
);
assert.equal(proactivity.adaptiveLevel({ confidence: 0, needsHelp: 1 }), "notification");
assert.equal(proactivity.adaptiveLevel({}), "notification", "置信度未知时按最低信息处理");
// 自适应档必须真的会产出不同档位，否则等于固定档
const adaptiveLevels = new Set([
  proactivity.adaptiveLevel({ confidence: 0.95, needsHelp: 0.9 }),
  proactivity.adaptiveLevel({ confidence: 0.70, needsHelp: 0.9 }),
  proactivity.adaptiveLevel({ confidence: 0.45, needsHelp: 0.9 })
]);
assert.ok(adaptiveLevels.size >= 3, `自适应档应至少产出三种档位，实际 ${[...adaptiveLevels].join(",")}`);

// --- 4. 决策点分配：参与者内完全均衡 ---------------------------------------
const CELLS = ["fixed|agent", "fixed|random", "adaptive|agent", "adaptive|random"];
const PARTICIPANTS = 20;
const DECISIONS_PER_PERSON = 24;
const tally = Object.fromEntries(CELLS.map((cell) => [cell, 0]));
for (let p = 1; p <= PARTICIPANTS; p += 1) {
  const participantId = `p${String(p).padStart(2, "0")}`;
  const perPerson = Object.fromEntries(CELLS.map((cell) => [cell, 0]));
  for (let d = 1; d <= DECISIONS_PER_PERSON; d += 1) {
    const assignment = proactivity.assignDecisionCondition({
      participantId, decisionSequence: d, salt: "adaptive-proactivity-2026"
    });
    const cell = `${assignment.proactivityPolicy}|${assignment.triggerTiming}`;
    assert.ok(CELLS.includes(cell), `未知条件 ${cell}`);
    tally[cell] += 1;
    perPerson[cell] += 1;
  }
  // 24 是 4 的整数倍，所以每人每格应恰好 6 次
  for (const cell of CELLS) {
    assert.equal(
      perPerson[cell], DECISIONS_PER_PERSON / 4,
      `${participantId} 在 ${cell} 上有 ${perPerson[cell]} 次，应为 ${DECISIONS_PER_PERSON / 4}`
    );
  }
}
const counts = CELLS.map((cell) => tally[cell]);
assert.equal(
  new Set(counts).size, 1,
  `四格总数应完全相等，实际 ${CELLS.map((c, i) => `${c}=${counts[i]}`).join(" ")}`
);
assert.equal(counts[0], (PARTICIPANTS * DECISIONS_PER_PERSON) / 4);

// --- 5. 可复现：同输入必须同输出 -------------------------------------------
const first = proactivity.assignDecisionCondition({ participantId: "p07", decisionSequence: 13, salt: "s" });
const second = proactivity.assignDecisionCondition({ participantId: "p07", decisionSequence: 13, salt: "s" });
assert.deepEqual(first, second, "哈希分配必须可复现");
const other = proactivity.assignDecisionCondition({ participantId: "p08", decisionSequence: 13, salt: "s" });
assert.notDeepEqual(first, other, "不同参与者应得到不同分配（至少区块序号不同）");
const otherSalt = proactivity.assignDecisionCondition({ participantId: "p07", decisionSequence: 13, salt: "s2" });
assert.ok(
  first.conditionDigest !== otherSalt.conditionDigest,
  "换盐之后分配材料必须改变，否则盐形同虚设"
);
assert.equal(first.blockIndex, 3, "第 13 个决策点属于第 4 个区块（从 0 开始）");
assert.equal(first.blockPosition, 0, "第 13 个决策点是区块内第 1 个位置");

// --- 6. 随机时刻的延迟在窗口内且可复现 -------------------------------------
const WINDOW = 45000;
const delays = [];
for (let d = 1; d <= 200; d += 1) {
  const delay = proactivity.randomTimingDelayMs({
    participantId: "p03", decisionSequence: d, salt: "s", windowMs: WINDOW
  });
  assert.ok(delay >= 0 && delay <= WINDOW, `延迟 ${delay} 超出窗口`);
  delays.push(delay);
}
assert.ok(new Set(delays).size > 100, "随机时刻的延迟应足够分散，不能挤在几个值上");
const repeat = proactivity.randomTimingDelayMs({ participantId: "p03", decisionSequence: 7, salt: "s", windowMs: WINDOW });
assert.equal(
  repeat,
  proactivity.randomTimingDelayMs({ participantId: "p03", decisionSequence: 7, salt: "s", windowMs: WINDOW }),
  "随机时刻延迟必须可复现"
);

console.log(
  `主动水平与随机化通过：四档行为两两不同、固定档恒为建议式、自适应档随置信度在 `
  + `干预/建议/告知之间变化（低置信度不替学生做主）；`
  + `${PARTICIPANTS} 人 × ${DECISIONS_PER_PERSON} 决策点的四格分配完全均衡（各 ${counts[0]}）；`
  + `分配与随机时刻延迟均可复现，延迟覆盖 ${WINDOW / 1000} 秒窗口。`
);
