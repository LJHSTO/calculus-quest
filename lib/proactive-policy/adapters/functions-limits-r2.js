"use strict";

const previous = require("./functions-limits");
const bank = require("../../assessments/functions-limits-r2");
const fourthChoices = [
  ["满足，因为同一输入可以同时使用两套输出", "一定违反，因为输出必须等于输入", "10", "4除以3", "14"],
  ["-2", "4时刻的速度为9", "f(3)与3", "7", "(2,2)"],
  ["先降后升", "能，因为函数值不可能再减小", "保持不变", "大7", "能，只要三个输出都为正"],
  ["-1", "能，只要这三个输出都为正", "3和3", "10", "3"],
  ["函数值必须从小于0的一侧靠近", "2.5", "3", "左右极限的平均值是否为8", "存在，因为右侧趋近0"],
  ["只要函数值大于极限就连续", "因为连续函数的值必须为0", "左右极限存在且相等", "不连续，因为函数值必须为0", "该点不能补值"]
];
const version = "functions-limits-verification-r3";
const checkBank = require("./functions-limits-check-bank");
const LEVELS = ["L1", "L2", "L3", "L4", "L5"];
const PRIMARY_CHECKS = Object.fromEntries(bank.ids.map((id, i) => [id, Object.fromEntries(
  LEVELS.map((level, j) => {
    const old = previous.publicVerificationCheck(id, level);
    const answer = old.options.find(option => previous.gradeVerificationCheck({
      knowledgePointId: id, supportLevel: level, checkId: old.id, response: option.value
    }).correct).value;
    return [level, { ...bank.withFourthOption(old, fourthChoices[i][j]),
      id: old.id.replace("-fl-r1", "-fl-r2"), instrumentVersion: version, answer }];
  })
)]));

// 平行题库。`checks` 里每个 (知识点, 等级) 只有一道题，而服务端"与上一题同 id
// 就不发"的逻辑会让同一 (知识点, 等级) 的第二次支架回合拿不到检查题——近端结果
// 直接缺失。这里为每个 (知识点, 等级) 备三道候选替代题；尚未验证等难性，
// 发题时排除上一题即可。原 `checks` 结构保持不变，避免影响既有测试。
// Each distractor belongs to this exact item. Text uniqueness alone cannot ensure
// mathematical falsity, relevance, or diagnostic value.
const variantFourthChoices = [
  [["满足，因为输入为正", "不满足，因为输出必须等于输入"], ["只有输入相同才允许输出相同", "输出为0不能作为函数值"], ["-5", "6"], ["5除以2", "8乘以2"], ["19", "6"]],
  [["-5", "-7"], ["6个月的总销量一定是120", "3时的升温速度一定是18"], ["f(2)与2", "f(4)与4"], ["21", "-2"], ["(2,2)", "(2,2)"]],
  [["先升后降", "先升后降"], ["只要没有经过0就一定下降", "只要没有经过0就一定下降"], ["保持不变", "保持不变"], ["小11", "大15"], ["能，只要五个输出都为负", "能，只要两个输出都为正"]],
  [["2", "0"], ["能，只要四个输出都为正", "能，只要两个输出都为正"], ["8和8", "0和0"], ["不存在，因为4不等于7", "不存在，因为2不等于9"], ["0", "9"]],
  [["只要求函数值从下方靠近", "只要求函数值从上方靠近"], ["5", "-1.5"], ["不存在，因为点值不同", "不存在，因为点值不同"], ["左右极限的平均值是否为-2", "左右极限的平均值是否为5"], ["存在，因为一侧有有限极限就足够", "存在，因为一侧有有限极限就足够"]],
  [["只要函数值大于极限就连续", "只要函数值为正就连续"], ["连续函数的值必须为正", "连续函数的值必须为负"], ["函数值有定义", "双侧极限存在"], ["不连续，因为极限为负", "不连续，因为极限不为0"], ["该点不能补值", "该点不能补值"]]
];
const CHECK_FORMS = Object.fromEntries(bank.ids.map((id, i) => [id, Object.fromEntries(
  LEVELS.map((level, j) => {
    const forms = [PRIMARY_CHECKS[id][level]];
    checkBank.variantsFor(i, j).forEach((variantRow, k) => {
      const q = bank.question(
        [...variantRow, ""],
        `${id}-probe-${level.toLowerCase()}-fl-r2-v${k + 2}`,
        id
      );
      const optionLabels = q.options
        .filter((option) => option.value !== "__unknown__")
        .map((option) => option.label);
      const fourth = variantFourthChoices[i]?.[j]?.[k];
      if (!fourth || optionLabels.includes(fourth)) throw new Error(`${id}/${level}/${k + 2} 缺少独立审校的第四选项`);
      // 答案键按"正确选项的文字"反查选项值。原题的 answer 是靠逐项评分推出来的；
      // 直接取 q.answer[0] 会拿到下标而不是 A/B/C，导致该题无任何选项被判对
      // （实测踩过：GH-01-K01 L1 的变体正确选项数为 0）。
      const correctLabel = variantRow[1][variantRow[2]];
      const correctOption = q.options.find((option) => option.value !== "__unknown__"
        && option.label === correctLabel);
      if (!correctOption) {
        throw new Error(`${id}/${level} 变体的正确选项文字未出现在选项中`);
      }
      forms.push({
        ...bank.withFourthOption({
          id: q.id,
          stage: `after_${level.toLowerCase()}`,
          supportLevel: level,
          prompt: q.question,
          options: q.options,
          instrumentVersion: version,
          subSkill: `${id}-${level}`
        }, fourth),
        answer: correctOption.value
      });
    });
    return [level, forms];
  })
)]));

const verification = {
  version,
  checks: PRIMARY_CHECKS,
  checkForms: CHECK_FORMS
};

module.exports = previous.createAdapter({
  chapterId: previous.chapterId, version: "functions-limits-adapter-r2",
  knowledgePoints: previous.knowledgePoints, verification
});
