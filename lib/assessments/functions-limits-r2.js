"use strict";

const assert = require("node:assert/strict");
const legacy = require("./functions-limits-r1");
const version = "functions-limits-assessment-r4";
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
  })).map((q, index) => {
    // Preserve the legacy bank; revise the current forms against a shared blueprint.
    if (phase === "pre" && index === 2) q.question = "在横轴表示时间、纵轴表示温度的坐标系中，点(2,5)表示什么？";
    if (phase === "pre" && index === 0) {
      q.question = "一条固定规则把输入数对应到输出数。下列哪组记录违反函数的唯一性要求？";
      ["2→5，2→6", "2→5，3→5", "2→5，3→6", "2→6，3→6"].forEach((label, i) => { q.options[i].label = label; });
      q.analysis = "同一个输入2同时对应5和6，违反唯一性；不同输入允许对应同一输出。";
    }
    if (phase === "pre" && index === 11) {
      q.question = "在点 a 的左右两侧，函数在足够接近 a 的位置均有定义。当 x 从两侧趋近 a 时，f(x) 都趋近4，但 f(a) 未定义。当前是否满足在 a 连续的条件？只补这个点的函数值，应补多少？说明理由。";
      q.referenceAnswer = "当前不满足连续条件，因为 f(a) 未定义。应补定义 f(a)=4，使该点函数值存在且等于两侧共同的极限。";
      q.analysis = q.referenceAnswer;
    }
    if (index < 8) {
      const choices = q.options.filter(o => o.value !== "__unknown__");
      const correct = choices.find(o => o.value === q.answer[0]);
      const target = (index + (phase === "post" ? 1 : 0)) % 4;
      const labels = choices.filter(o => o !== correct).map(o => o.label);
      labels.splice(target, 0, correct.label);
      q.options = [...labels.map((label, i) => ({ value: String.fromCharCode(65 + i), label })), { ...legacy.unknown }];
      q.answer = [String.fromCharCode(65 + target)];
    }
    q.equivalence.validationStatus = "content-aligned-not-empirically-equated";
    return q;
  });
}

module.exports = { ...legacy, version, questions, withFourthOption };
