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
const version = "functions-limits-verification-r2";
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
// 直接缺失。这里为每个 (知识点, 等级) 备三道同构念、同难度、不同数字的题，
// 发题时排除上一题即可。原 `checks` 结构保持不变，避免影响既有测试。
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
      const fourth = fourthOptionFor(i, j, optionLabels);
      if (!fourth) return;
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

// 平行题的第 4 个选项（干扰项）。`fourthChoices[i][j]` 是为原题写的，和变体的
// 前三个选项可能撞车（例如 K02-L1 的 "-2" 恰好是变体的一个选项）。这里从同一
// 知识点的干扰项池里挑第一个不重复的——第 4 个选项只是额外干扰项，取自同一
// 知识点的池子能保证它仍然是同话题的、看似合理的错误选项。
function fourthOptionFor(knowledgePointIndex, levelIndex, optionLabels) {
  const used = new Set(optionLabels);
  const pool = [
    fourthChoices[knowledgePointIndex]?.[levelIndex],
    ...(fourthChoices[knowledgePointIndex] || []),
    ...fourthChoices.map((row) => row?.[levelIndex]),
    ...fourthChoices.flat()
  ];
  return pool.find((label) => typeof label === "string" && label && !used.has(label)) || "";
}

const verification = {
  version,
  checks: PRIMARY_CHECKS,
  checkForms: CHECK_FORMS
};

module.exports = previous.createAdapter({
  chapterId: previous.chapterId, version: "functions-limits-adapter-r2",
  knowledgePoints: previous.knowledgePoints, verification
});
