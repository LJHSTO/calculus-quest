"use strict";

const assert = require("node:assert/strict");
const legacy = require("./functions-limits-r1");
const version = "functions-limits-assessment-r2";
const fourthChoices = {
  pre: ["寄件重量", "9", "从2时刻到5时刻温度保持不变",
    "不在，因为 f(3)=7 与横坐标不相等", "5，2，4",
    "只有输入也为负时才可能", "6", "3",
    "双侧极限等于左右极限的平均值3.5", null,
    "该点函数值必须为0才能连续", null],
  post: ["1→4，2→4", "10", "(7,7)", "(4,2)",
    "温度上升时必须经过0", "无法判断，因为输出没有变成负数",
    "6", "极限等于10", "函数在该点一定连续", null,
    "把 g(b) 改成0就能使该点连续", null]
};

function withFourthOption(question, label) {
  const choices = question.options.filter(option => option.value !== "__unknown__");
  assert.deepEqual(choices.map(option => option.value), ["A", "B", "C"]);
  assert.ok(typeof label === "string" && label && !choices.some(option => option.label === label));
  return { ...question, options: [...choices, { value: "D", label }, { ...legacy.unknown }] };
}

function questions(phase) {
  assert.ok(phase === "pre" || phase === "post");
  return legacy.questions(phase).map((question, index) => ({
    ...(question.type === "short_answer" ? question : withFourthOption(question, fourthChoices[phase][index])),
    id: question.id.replace("-fl-r1-", "-fl-r2-"),
    instrumentVersion: version
  }));
}

module.exports = { ...legacy, version, questions, withFourthOption };
