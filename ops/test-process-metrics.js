"use strict";
// 过程层因变量。
//
// 三层因变量缺一层就会被审稿人挑。过程层最敏感，也最容易实现错：
// 把"没记录时间戳"当成"零打断成本"会系统性低估打扰。
const assert = require("node:assert/strict");
const { computeProcessMetrics, computeHintJustification } = require("../lib/research/process-metrics");

// --- 1. 接受/拒绝/忽略三个比例 ----------------------------------------------
{
  const metrics = computeProcessMetrics([
    { offered: true, resolution: "accepted", proactivityLevel: "suggestion", condition: "adaptive", offeredAt: 1000, nextActionAt: 4000 },
    { offered: true, resolution: "accepted", proactivityLevel: "suggestion", condition: "rule", offeredAt: 1000, nextActionAt: 2000 },
    { offered: true, resolution: "dismissed", proactivityLevel: "intervention", condition: "adaptive", offeredAt: 1000, nextActionAt: 9000 },
    { offered: true, resolution: "ignored", proactivityLevel: "notification", condition: "rule", offeredAt: 1000 }
  ]);
  assert.equal(metrics.offered, 4);
  assert.equal(metrics.accepted, 2);
  assert.equal(metrics.declined, 1);
  assert.equal(metrics.ignored, 1);
  assert.equal(metrics.helpAppropriateness, 0.5, "Help Appropriateness = 接受 / 展示");
  assert.equal(metrics.acceptRate + metrics.declineRate + metrics.ignoreRate, 1, "三个比例应加起来为 1");
}

// --- 2. 打断成本：缺失时间戳不能算成 0 --------------------------------------
{
  const metrics = computeProcessMetrics([
    { offered: true, resolution: "accepted", offeredAt: 1000, nextActionAt: 3000 },
    { offered: true, resolution: "accepted", offeredAt: 1000, nextActionAt: 5000 },
    // 这一行没有 nextActionAt——必须被排除，而不是当成 0 拉低均值
    { offered: true, resolution: "ignored", offeredAt: 1000 }
  ]);
  assert.equal(metrics.interruptionCostMs.samples, 2, "只有两行有完整时间戳");
  assert.equal(metrics.interruptionCostMs.meanMs, 3000, "均值应为 (2000+4000)/2");
  assert.equal(metrics.interruptionCostMs.medianMs, 4000);
  // 反例：如果缺失被当成 0，均值会变成 (2000+4000+0)/3 ≈ 2000
  assert.notEqual(metrics.interruptionCostMs.meanMs, 2000);
}

// --- 3. 按主动档位分组：回答"多主动才不被反感" ------------------------------
{
  const metrics = computeProcessMetrics([
    { offered: true, resolution: "accepted", proactivityLevel: "suggestion" },
    { offered: true, resolution: "accepted", proactivityLevel: "suggestion" },
    { offered: true, resolution: "accepted", proactivityLevel: "intervention" },
    { offered: true, resolution: "dismissed", proactivityLevel: "intervention" }
  ]);
  assert.equal(metrics.byProactivityLevel.suggestion.acceptRate, 1);
  assert.equal(metrics.byProactivityLevel.intervention.acceptRate, 0.5);
  assert.ok(
    metrics.byProactivityLevel.suggestion.acceptRate > metrics.byProactivityLevel.intervention.acceptRate,
    "高主动档位的接受率应更低（文献里的权衡）"
  );
}

// --- 4. 按条件分组 ----------------------------------------------------------
{
  const metrics = computeProcessMetrics([
    { offered: true, resolution: "accepted", condition: "adaptive" },
    { offered: true, resolution: "dismissed", condition: "rule" },
    { offered: true, resolution: "accepted", condition: "rule" }
  ]);
  assert.equal(metrics.byCondition.adaptive.acceptRate, 1);
  assert.equal(metrics.byCondition.rule.acceptRate, 0.5);
}

// --- 5. 算不出来的部分要明说，不能编近似值 ----------------------------------
{
  const metrics = computeProcessMetrics([
    { offered: true, resolution: "accepted" }
  ]);
  assert.ok(metrics.unavailable.hintJustificationScoring,
    "「理由内容是否正确」需要判分，必须明确标出");
  assert.match(metrics.unavailable.hintJustificationScoring, /判分|量规/,
    "应说明为什么还需要判分");
  assert.equal(metrics.hintJustificationRate, undefined,
    "顶层不能再有一个编造的 Hint Justification Rate");
}

// --- 5b. Hint Justification 采集完备度 --------------------------------------
// 防 gaming 的关键指标：只统计"接受且说明了理由"的提示。
// 注意它分两层口径——"给了理由"和"理由够长"是两件事。
{
  const metrics = computeHintJustification([
    { resolution: "accepted", justification: "因为把输入代入规则后得到的输出与纵坐标一致" },
    { resolution: "accepted", justification: "随便" },
    { resolution: "accepted", justification: "" },
    { resolution: "accepted" },
    // 拒绝的不该进分母
    { resolution: "dismissed", justification: "不该算进来" }
  ]);
  assert.equal(metrics.accepted, 4, "只有 accepted 进分母");
  assert.equal(metrics.provided, 2, "空串与缺失都不算给了理由");
  assert.equal(metrics.substantive, 1, "「随便」太短，不算实质理由");
  assert.equal(metrics.providedRate, 0.5);
  assert.equal(metrics.substantiveRate, 0.25);
  assert.equal(metrics.needsRubricScoring, 1, "实质理由还需要判分才知道对不对");

  const empty = computeHintJustification([
    { resolution: "dismissed", justification: "x" }
  ]);
  assert.equal(empty.accepted, 0);
  assert.equal(empty.providedRate, null, "零分母应为 null 而不是 0");
  assert.equal(computeHintJustification().accepted, 0, "不传参数不应崩");
}

// --- 6. 空数据与退化输入 ----------------------------------------------------
{
  const empty = computeProcessMetrics([]);
  assert.equal(empty.offered, 0);
  assert.equal(empty.helpAppropriateness, null, "零分母应为 null 而不是 0");
  assert.equal(empty.interruptionCostMs.meanMs, null);
  assert.equal(computeProcessMetrics().offered, 0, "不传参数不应崩");
}

console.log(
  "过程层因变量通过：三比例相加为 1；缺失时间戳的行被排除而不是当成零打断成本；"
  + "按主动档位与按条件分组的接受率可用（高主动档更低）；"
  + "Hint Justification 采集完备度分两层口径（给了理由 / 理由够长），判分需求被明确标出；空数据与零分母返回 null。"
);
