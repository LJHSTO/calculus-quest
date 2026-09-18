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
const verification = {
  version,
  checks: Object.fromEntries(bank.ids.map((id, i) => [id, Object.fromEntries(
    ["L1", "L2", "L3", "L4", "L5"].map((level, j) => {
      const old = previous.publicVerificationCheck(id, level);
      const answer = old.options.find(option => previous.gradeVerificationCheck({
        knowledgePointId: id, supportLevel: level, checkId: old.id, response: option.value
      }).correct).value;
      return [level, { ...bank.withFourthOption(old, fourthChoices[i][j]),
        id: old.id.replace("-fl-r1", "-fl-r2"), instrumentVersion: version, answer }];
    })
  )]))
};

module.exports = previous.createAdapter({
  chapterId: previous.chapterId, version: "functions-limits-adapter-r2",
  knowledgePoints: previous.knowledgePoints, verification
});
