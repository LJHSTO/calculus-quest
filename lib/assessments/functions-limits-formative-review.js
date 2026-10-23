"use strict";
// Current six-point formative items. Archived module pre/post forms stay unchanged.
function revise(question) {
  const q = structuredClone(question);
  const id = q.id;
  if (id === "GH-01-K02-check-q1") q.question = "在平面直角坐标系中，点P的坐标为(4,2)。以下哪项正确说明了这两个坐标？";
  if (id === "GH-01-K03-check-q1") {
    q.question = "将点(1,4)、(2,6)、(3,8)按横坐标从小到大依次用直线段连接。所得折线的变化方向是什么？";
    q.options.find(o => o.value === "B").label = "从左向右持续上升";
    q.analysis = "两段直线的斜率都是2，因此这条明确指定的折线持续上升。有限观测点不能证明另一个未知函数在点间也持续上升。";
  }
  if (id === "GH-01-K03-check-q2") {
    q.question = "按横坐标从小到大比较函数值。下列哪些描述支持所描述范围内的下降判断？请选择所有正确说法。";
    q.options.find(o => o.value === "A").label = "在整个区间内，横坐标越大，纵坐标越小";
    q.options.find(o => o.value === "B").label = "在整个区间内，曲线从左上向右下延伸，途中没有回升或水平段";
    q.options.find(o => o.value === "D").label = "只比较两个观测点，后一个点的纵坐标较小，说明这两个观测值之间有下降；不据此判断整个区间";
    q.analysis = "A、B描述整个区间；D只比较两个观测值。两点之间仍可能有未观测到的起伏，不能把两点比较扩展为整个区间的严格单调性。";
  }
  if (id === "GH-02-K01-check-q2") q.question = "在定义域内点a的两侧讨论有限极限。以下哪些说法正确？请选择所有正确说法。";
  if (id === "GH-02-K03-check-q2") q.question = "判断函数在定义域内点a连续时，以下哪些条件需要同时满足？请选择所有正确说法。";
  q.instrumentVersion = "functions-limits-formative-r4";
  return q;
}
module.exports = { revise };
