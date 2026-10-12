"use strict";
// 体验层量表的定义与计分。
//
// 这一层回答的是论文的核心 RQ2：「自适应档是否更好地平衡信任与专注」。
// 现有问卷（问卷星）在操纵检验与功能验收上做得比文献更细，但**完全没有测信任和专注**
// —— 而那是权衡的两端。本模块把这三个验证量表的结构固定下来，并统一计分规则，
// 避免"问卷星按一种规则算、分析脚本按另一种算"这种查不出来的错误。
const assert = require("node:assert/strict");
const scales = require("../lib/research/experience-scales");

// --- 1. 三个验证量表的题量与分量表结构 --------------------------------------
{
  const trust = scales.SCALES.trust;
  assert.equal(trust.itemCount, 12, "Jian 信任清单应为 12 题");
  assert.equal(trust.points, 7, "Jian 量表为 7 点");
  assert.equal(
    trust.subscales.cognitive.length + trust.subscales.affective.length, 12,
    "认知与情感两个分量表应覆盖全部 12 题"
  );
  assert.match(trust.source, /Jian/, "必须标明出处");

  const gcl = scales.SCALES.germaneLoad;
  assert.equal(gcl.itemCount, 3, "GCL 分量表为 3 题");
  assert.equal(gcl.points, 7, "Klepsch 认知负荷问卷为 7 点");
  // GCL 与"脑力努力"不是一回事——这个区分写进了 purpose，必须留住
  assert.match(gcl.purpose, /努力/, "应说明 GCL 与脑力努力的区别");

  const acceptance = scales.SCALES.acceptance;
  assert.equal(acceptance.itemCount, 9, "Van der Laan 接受度应为 9 题");
  assert.equal(acceptance.points, 5, "接受度为 5 点");
  assert.equal(
    acceptance.subscales.usefulness.length + acceptance.subscales.satisfaction.length, 9
  );
}

// --- 2. 缺失值不能补成最低分 -------------------------------------------------
{
  assert.equal(scales.normalizeResponse("", 5), scales.MISSING);
  assert.equal(scales.normalizeResponse(null, 5), scales.MISSING);
  assert.equal(scales.normalizeResponse("无法判断", 5), scales.CANNOT_JUDGE);
  assert.equal(scales.normalizeResponse("不适用", 5), scales.NOT_APPLICABLE);
  assert.equal(scales.normalizeResponse("0", 5), scales.MISSING, "越界值应作缺失");
  assert.equal(scales.normalizeResponse("6", 5), scales.MISSING, "超出量表范围应作缺失");
  assert.equal(scales.normalizeResponse("3", 5), 3);
  // "无法判断" 与 "不适用" 必须可区分：文档明确说"没有打扰"与"无法评价打扰"是两回事
  assert.notEqual(scales.normalizeResponse("无法判断", 5), scales.normalizeResponse("不适用", 5));
}

// --- 3. 分量表计分：缺失不进分母 --------------------------------------------
{
  const scored = scales.scoreSubscale({ C1: 5, C2: "", C3: 3 }, ["C1", "C2", "C3"], 5);
  assert.equal(scored.answered, 2, "只应计两题");
  assert.equal(scored.mean, 4, "(5+3)/2，缺失的 C2 不进分母也不补 0");
  assert.equal(scored.missing, 1);

  // 若把缺失当 0，均值会变成 8/3≈2.67 —— 这会系统性低估体验评分
  assert.notEqual(scored.mean, (5 + 0 + 3) / 3);

  // 有效作答不足一半 → 不给均值，而不是用少数题撑出一个数
  const tooFew = scales.scoreSubscale({ GCL1: 6 }, ["GCL1", "GCL2", "GCL3"], 7);
  assert.equal(tooFew.mean, null);
  assert.equal(tooFew.reason, "too_few_valid_responses");

  const none = scales.scoreSubscale({}, ["GCL1", "GCL2", "GCL3"], 7);
  assert.equal(none.mean, null);
  assert.equal(none.reason, "no_valid_response");
}

// --- 4. 完整量表计分 --------------------------------------------------------
{
  const responses = {
    "T-C1": 6, "T-C2": 5, "T-C3": 6, "T-C4": 5, "T-C5": 6, "T-C6": 5,
    "T-A1": 4, "T-A2": 4, "T-A3": 5, "T-A4": 4, "T-A5": 4, "T-A6": 5
  };
  const scored = scales.scoreScale("trust", responses);
  assert.equal(scored.complete, true, "12 题全答应标为完整");
  assert.ok(scored.overall > 4 && scored.overall < 6);
  assert.ok(scored.subscales.cognitive.mean > scored.subscales.affective.mean,
    "认知分量表均值应更高（与输入的构造一致）");

  // 对照组常见的真实情况：没收到任何建议 → D 题选"不适用"
  const noSuggestion = scales.scoreScale("interruption", {
    D1: "不适用", D2: "不适用", D3: "不适用"
  });
  assert.equal(noSuggestion.overall, null,
    "全部不适用时不应给出打扰感均值——「没有打扰」不等于「打扰感为最低」");
  assert.equal(noSuggestion.complete, false);
}

// --- 5. 操纵检验量表必须存在 -------------------------------------------------
// 没有它就无法回答"被试是否真的感知到主动"，而文献在这栽过（p=.296 的阴性结果）。
{
  assert.ok(scales.SCALES.perceivedActiveness, "必须有感知主动性量表作为操纵检验");
  assert.equal(scales.SCALES.perceivedActiveness.itemCount, 3);
  assert.match(scales.SCALES.perceivedActiveness.purpose, /阴性/, "应提醒阴性结果也要报告");
}

// --- 6. 一次算完 + 未知量表要报错 -------------------------------------------
{
  const all = scales.scoreAll({ P1: 4, P2: 4, P3: 5 });
  assert.ok(all.trust && all.germaneLoad && all.acceptance, "应一次算出所有量表");
  assert.equal(all.perceivedActiveness.overall, (4 + 4 + 5) / 3);
  assert.throws(() => scales.scoreScale("nonexistent", {}), /未知量表/);
}

console.log(
  "体验层量表通过：信任 12 题/7 点（认知+情感两分量表）、GCL 3 题/7 点、Van der Laan 9 题/5 点结构正确；"
  + "「无法判断」与「不适用」可区分且都不补成最低分；缺失不进分母、有效作答不足一半时不给均值；"
  + "感知主动性操纵检验存在且提醒阴性结果也要报告。"
);
