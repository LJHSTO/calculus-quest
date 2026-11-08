"use strict";

const VERSION = "support-activity-r10-v1";
const lessons = {
  "GH-01-K01": { title:"固定规则，再看对应关系", kind:"compare", items:[
    ["same", "同一个输入", "固定一条规则后，同一个允许输入必须有、而且只能有一个输出。先检查定义域，再检查是否出现两个不同结果。"],
    ["different", "两个不同输入", "不同输入可以得到相同输出。例如平方规则把−3和3都对应到9，这不违反函数要求。"]], steps:["先指出规则允许哪些输入。", "选定同一个输入，检查它有几个输出。", "把不同输入同值与同一个输入多值分开。"] },
  "GH-01-K02": { title:"把一个点读完整", kind:"steps", items:[
    ["x", "横坐标", "有序对的第一个数是输入。读坐标前先看横轴一格表示多少。"],
    ["y", "纵坐标", "第二个数是这个点标出的输出。它不一定等于横坐标。"],
    ["domain", "空点与实点", "空心点表示这个位置没有取该值；实心点才记录实际点值。约分只在原式有定义的输入上成立。"]], steps:["读出横坐标及横轴刻度。", "把横坐标代入规则，并保留定义域限制。", "比较计算输出与点的纵坐标；空点与实际点值分开。"] },
  "GH-01-K03": { title:"这份证据能说明多大范围", kind:"cases", items:[
    ["rise", "两个样本上升", "只知道一对x₁<x₂且f(x₁)<f(x₂)，还没有检查区间里其他输入对。它不能证明全程上升。"],
    ["counter", "找到一对反例", "若x₁<x₂却有f(x₁)≥f(x₂)，这一对就足以否定整个区间严格上升。"],
    ["negative", "输出都是负数", "负数也可以增大。例如从−8到−3，仍然在增大。位置正负与变化方向是两个问题。"]], steps:["先按输入从小到大排列两点。", "比较对应输出的大小。", "说明证据仅针对两点，还是能够支持整个区间的结论。"] },
  "GH-02-K01": { title:"同样的输入变化，输出会怎样", kind:"compare", items:[
    ["twice", "输出误差是输入的2倍", "输入误差为0.1时，输出误差为0.2。要保证一个范围内全部输入合格，需要依据这种关系，不能只测几个点。"],
    ["four", "输出误差是输入的4倍", "同样输入误差0.1，现在输出误差为0.4。输出允许误差不变时，放大倍率越大，输入范围就需要越窄。"]], steps:["先分清输入靠近的位置、输出趋近值与点值。", "写出输出误差和输入误差的关系。", "选择能让整个邻近范围满足要求的正半径，而不只检查一个样本。"] },
  "GH-02-K02": { title:"把两侧和单点分开看", kind:"cases", items:[
    ["equal", "两侧趋近同一个有限数", "两侧分别存在有限极限，并且相等，才有双侧有限极限。单点可以另外取值。"],
    ["jump", "两侧趋近两个不同数", "这是有限跳跃。左右的平均值不是共同极限，只修改单点也不会改变两侧。"],
    ["unbounded", "靠近时输出趋于正无穷", "如果越靠近所考察的位置，输出最终可以超过任意给定的数，就不是趋近一个有限数。先分别判断左右两侧，再谈两侧是否有相同的有限极限。"],
    ["oscillating", "越来越近，输出仍在振荡", "如果两列输入都趋近同一位置，但一列的输出始终为1，另一列始终为−1，就不可能有共同有限极限。这种问题不需要出现很大的函数值。"]], steps:["分别找到左侧、右侧适用的规则。", "分别判断它们是否趋近有限数。", "比较这两个数；点上的值另作记录。"] },
  "GH-02-K03": { title:"逐项检查连续条件", kind:"checklist", items:[
    ["value", "我已查清点值", "先确认f(a)有没有定义，以及实际取什么值。"],
    ["limit", "我已查清趋近趋势", "在定义域内点，左右都要有有限极限，而且相等；端点只看定义域允许的一侧。仅画出两条曲线还不足以判断。"],
    ["equal", "我已比较点值与共同极限", "共同极限还要等于f(a)。有尖角并不自动破坏连续性。"]], steps:["查点值是否存在。", "查左右是否存在同一个有限极限。", "比较点值与极限，再决定只改点值能否修复。"] }
};

function create({ scope, plan = {} }) {
  const lesson = lessons[scope];
  if (!lesson) return null;
  const goal=plan.primaryGoal||"cognitive";
  const level = /^L[1-5]$/.test(plan.knowledgeScaffoldLevel || "") ? plan.knowledgeScaffoldLevel : "L2";
  let kind = lesson.kind, title = lesson.title, intro = "选择一项展开，帮助只围绕眼前这一步。", items = lesson.items;
  if (goal !== "cognitive") {
    kind = "plan"; title = "选一个现在愿意做的小步骤";
    intro = "这是你的选择，不计分，也不会自动替你切换页面或提交答案。";
    items = [["try", "回到课件试一小步", lesson.steps[0]], ["explain", "先说清自己的疑问", "用一句话记下：我已知道什么，还缺哪一步依据。可以在对话中发给老师。"], ["pause", "暂时停一下", "可以结束本轮帮助，按自己的节奏返回学习。暂停不代表能力不足。"]];
  } else if (level === "L1" || level === "L3") {
    kind = "steps"; title = level === "L1" ? "先整理自己的判断" : "按步骤推进，不必一次做完";
    intro = level === "L1" ? "先用自己的话想一想；这里不会显示当前题的答案。" : "点选你正在处理的步骤，完成后再决定是否继续。";
    items = lesson.steps.map((text, i) => ["step" + i, "第" + (i + 1) + "步", text]);
  } else if (level === "L4") {
    kind = "steps"; title = "先做下一小步"; intro = "先定位一个条件，后面的判断留给你完成。";
    items = lesson.steps.slice(0, 2).map((text, i) => ["step" + i, i ? "接下来检查" : "先处理这里", text]);
  } else if (level === "L5" && scope === "GH-02-K01") {
    kind = "range"; title = "用另一个例子试误差范围";
    intro = "本例g(x)=3x+1，x靠近2时趋近7。输出误差=3|x−2|。要求输出误差小于0.3，试着选择正半径δ。这个练习有帮助，不作为独立检查。";
    items = [];
  }
  return { version: VERSION, id: `${VERSION}:${scope}:${plan.primaryGoal || "cognitive"}:${level}`, scope, level, kind, title, intro,
    items: items.map(([id, label, body]) => ({ id, label, body })), evidenceScope: "assisted_support_interaction", independent: false,
    ...(kind === "range" ? { range: { min: .01, max: .3, step: .01, initial: .15, multiplier: 3, epsilon: .3 } } : {}) };
}

function apply(activity, previous, input) {
  if (!activity || activity.version !== VERSION || input.activityId !== activity.id) throw new Error("本轮操作内容已更新，请重新打开帮助");
  const old = previous?.activityId === activity.id ? previous : { activityId: activity.id, viewed: [], checked: [], selected: null, delta: null, skipped: false };
  const state = structuredClone(old);
  if (input.operation === "skip") state.skipped = true;
  else if (input.operation === "range" && activity.kind === "range") {
    const n = input.value, r = activity.range;
    if (typeof n !== "number" || !Number.isFinite(n) || n < r.min || n > r.max || Math.abs(n * 100 - Math.round(n * 100)) > 1e-8) throw new Error("请选择范围内的有效半径");
    state.delta = n; state.skipped = false;
  } else if (["select", "toggle"].includes(input.operation)) {
    if (!activity.items.some(i => i.id === input.itemId) || (input.operation === "toggle") !== (activity.kind === "checklist")) throw new Error("当前帮助没有这个操作选项");
    state.viewed = [...new Set([...state.viewed, input.itemId])]; state.selected = input.itemId; state.skipped = false;
    if (input.operation === "toggle") state.checked = state.checked.includes(input.itemId) ? state.checked.filter(i => i !== input.itemId) : [...state.checked, input.itemId];
  } else throw new Error("当前帮助不支持这个操作");
  return { state, changed: JSON.stringify(state) !== JSON.stringify(old), evidenceScope: "assisted_support_interaction", independent: false };
}

function rangeFeedback(delta) {
  return delta <= .1 + 1e-12
    ? "对所有0<|x−2|<δ，都有3|x−2|<3δ≤0.3，因此这个正范围能保证要求。更小的正范围也可以。"
    : "这个范围仍太宽：在0.1与δ之间选一个输入距离，输出误差就会超过0.3。请缩小范围，再用3|x−2|说明理由。";
}

module.exports = { VERSION, create, apply, rangeFeedback };
