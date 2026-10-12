"use strict";

const VERSION = "v14-c3-assessments-r3";
const CHAPTER = "V14-C3";
const letters = ["A", "B", "C", "D"];
const optionList = (labels) => labels.map((label, index) => ({ value: letters[index], label }));
const specs = [
  {
    kp: "GH-06-K01", process: "understand", steps: 1, construct: "riemann_limit",
    pre: ["连续非负函数 f 在 [1,5] 上的图像与横轴围成一个区域。把区间等分为 n 份，取各小区间右端点函数值为矩形高度。当 n 趋于无穷时，矩形面积之和的极限表示什么？",
      ["该区域的面积", "函数在两个端点的值之差", "所有矩形顶边的总长度", "区间长度与函数最大值的乘积"], ["A"]],
    post: ["连续非负函数 g 在 [2,6] 上的图像与横轴围成一个区域。把区间等分为 n 份，取各小区间右端点函数值为矩形高度。当 n 趋于无穷时，矩形面积之和的极限表示什么？",
      ["区间长度与函数最大值的乘积", "函数在两个端点的值之差", "所有矩形顶边的总长度", "该区域的面积"], ["D"]],
    analysis: "连续非负函数的黎曼和在分割无限加细时收敛到定积分，其值就是所述区域的面积，不是端点差、线段长度或外接矩形面积。"
  },
  {
    kp: "GH-06-K02", process: "apply", steps: 1, construct: "signed_net_change",
    pre: ["某水箱先净流入12升水，随后净流出4升水。把净流入速率记为r(t)，流入为正、流出为负。开始时刻为0，结束时刻为T，定积分∫₀ᵀr(t)dt表示的水量净变化是多少？",
      ["增加16升", "增加8升", "减少8升", "增加4升"], ["B"]],
    post: ["某水箱先净流入15升水，随后净流出6升水。把净流入速率记为s(t)，流入为正、流出为负。开始时刻为0，结束时刻为T，定积分∫₀ᵀs(t)dt表示的水量净变化是多少？",
      ["增加21升", "减少9升", "增加9升", "增加6升"], ["C"]],
    preAnalysis: "净变化为12-4=8升。有向变化率的定积分计算净累积，不能把流入和流出的大小直接相加。",
    postAnalysis: "净变化为15-6=9升。有向变化率的定积分计算净累积，不能把流入和流出的大小直接相加。"
  },
  {
    kp: "GH-07-K01", process: "understand", steps: 1, construct: "derivative_of_integral",
    pre: ["函数 f 在 [0,4] 上连续，定义 F(x)=∫₀ˣf(t)dt。对 0<x<4，F'(x) 等于什么？",
      ["f(0)", "F(x)", "f(x)", "x f(x)"], ["C"]],
    post: ["函数 g 在 [1,5] 上连续，定义 G(x)=∫₁ˣg(t)dt。对 1<x<5，G'(x) 等于什么？",
      ["g(x)", "g(1)", "G(x)", "x g(x)"], ["A"]],
    analysis: "由微积分基本定理，变上限积分的导数等于被积函数在上限处的值；不需要乘以x，也不是积分函数本身。"
  },
  {
    kp: "GH-07-K02", process: "apply", steps: 1, construct: "endpoint_difference",
    pre: ["连续函数 f 的一个原函数为 F，且 F(1)=2、F(4)=9。定积分 ∫₁⁴f(x)dx 等于多少？",
      ["11", "-7", "3", "7"], ["D"]],
    post: ["连续函数 g 的一个原函数为 G，且 G(2)=3、G(5)=11。定积分 ∫₂⁵g(x)dx 等于多少？",
      ["14", "8", "-8", "3"], ["B"]],
    preAnalysis: "原函数在积分端点的值作差：F(4)-F(1)=9-2=7。",
    postAnalysis: "原函数在积分端点的值作差：G(5)-G(2)=11-3=8。"
  },
  {
    kp: "GH-07-K03", process: "apply", steps: 3, construct: "substitution_consistency",
    pre: ["计算 ∫₀¹ 2x/(1+x²) dx 时，令 u=1+x²，已知 du=2x dx。把被积表达式、微分和上下限一起换为新变量后，应得到哪个积分？",
      ["∫₁² (1/u) du", "∫₀¹ (1/u) du", "∫₁² (2x/u) du", "∫₁² u du"], ["A"]],
    post: ["计算 ∫₀¹ 2x/(2+x²) dx 时，令 u=2+x²，已知 du=2x dx。把被积表达式、微分和上下限一起换为新变量后，应得到哪个积分？",
      ["∫₀¹ (1/u) du", "∫₂³ (2x/u) du", "∫₂³ u du", "∫₂³ (1/u) du"], ["D"]],
    preAnalysis: "2x dx整体替换为du，分母替换为u；x从0到1时，u从1到2，所以得到∫₁²(1/u)du。",
    postAnalysis: "2x dx整体替换为du，分母替换为u；x从0到1时，u从2到3，所以得到∫₂³(1/u)du。"
  },
  {
    kp: "GH-07-K04", process: "apply", steps: 2, construct: "integration_by_parts_choice",
    pre: ["对 ∫x cos(x)dx 使用分部积分，希望u求导后简化、dv容易积分。下列哪种分配最符合这个目标？",
      ["u=cos(x)，dv=x dx", "u=x，dv=cos(x)dx", "u=x cos(x)，dv=dx", "u=x²，dv=cos(x)dx"], ["B"]],
    post: ["对 ∫t sin(t)dt 使用分部积分，希望u求导后简化、dv容易积分。下列哪种分配最符合这个目标？",
      ["u=t，dv=sin(t)dt", "u=sin(t)，dv=t dt", "u=t sin(t)，dv=dt", "u=t²，dv=sin(t)dt"], ["A"]],
    analysis: "选择一次多项式作为u，求导后变为常数；把三角函数与微分组成dv，易于积分。这样比保留原乘积更有利于简化后续积分。"
  },
  {
    kp: "GH-07-K01", process: "understand", steps: 2, construct: "negative_accumulation_monotonicity",
    pre: ["函数 f 在 [0,6] 上连续且处处小于0，定义 A(x)=∫₀ˣf(t)dt。当x从2增加到4时，A(x)如何变化？",
      ["一直增大", "保持不变", "一直减小", "不能判断，必须先知道f的解析式"], ["C"]],
    post: ["函数 g 在 [1,7] 上连续且处处小于0，定义 B(x)=∫₁ˣg(t)dt。当x从3增加到5时，B(x)如何变化？",
      ["保持不变", "一直减小", "一直增大", "不能判断，必须先知道g的解析式"], ["B"]],
    analysis: "变上限积分的导数等于被积函数在上限处的值。该值处处为负，因此累积函数随x增加而严格减小。"
  },
  {
    kp: "GH-06-K03", process: "analyze", steps: 4, construct: "antiderivative_family",
    pre: ["在同一个区间上，F是f的一个原函数。下列哪些说法正确？请选择所有正确说法。",
      ["F(x)+3也是f的一个原函数", "f的不定积分只表示F这一个函数", "f的任意两个原函数相差一个常数", "f的所有原函数在每个x处的值都相同"], ["A", "C"]],
    post: ["在同一个区间上，G是g的一个原函数。下列哪些说法正确？请选择所有正确说法。",
      ["g的不定积分只表示G这一个函数", "g的任意两个原函数相差一个常数", "g的所有原函数在每个x处的值都相同", "G(x)-2也是g的一个原函数"], ["B", "D"]],
    analysis: "加减常数不改变导数；同一区间上任意两个原函数的差的导数为0，故相差常数。不定积分表示全体原函数，而它们的函数值不必相同。"
  },
  {
    kp: "GH-07-K04", process: "analyze", steps: 4, construct: "product_rule_to_parts",
    pre: ["由乘积微分关系 d(uv)=u dv+v du 出发，下列哪些式子正确？请选择所有正确说法。不定积分等式按相差一个常数的意义理解。",
      ["u dv=d(uv)+v du", "u dv=d(uv)-v du", "∫u dv=uv+∫v du", "∫u dv=uv-∫v du"], ["B", "D"]],
    post: ["由乘积微分关系 d(pq)=p dq+q dp 出发，下列哪些式子正确？请选择所有正确说法。不定积分等式按相差一个常数的意义理解。",
      ["p dq=d(pq)-q dp", "p dq=d(pq)+q dp", "∫p dq=pq-∫q dp", "∫p dq=pq+∫q dp"], ["A", "C"]],
    analysis: "从乘积微分关系中移去另一项时应减去它。积分后仍保留减号；v du对应u的变化，q dp对应p的变化。"
  },
  {
    kp: "GH-06-K03", process: "explain", steps: 4, construct: "antiderivative_explanation",
    pre: ["已知f(x)=4x³。甲说：“x⁴是f的一个原函数。”乙说：“f的不定积分只有x⁴，不需要加任意常数。”请分别判断两人的说法，用求导关系说明理由，并写出完整的不定积分。",
      null, "甲正确，乙错误。(x⁴)'=4x³，所以x⁴是一个原函数；不定积分表示同一区间上的全体原函数，完整结果为x⁴+C，C为任意常数。"],
    post: ["已知g(x)=3x²。丙说：“x³是g的一个原函数。”丁说：“g的不定积分只有x³，不需要加任意常数。”请分别判断两人的说法，用求导关系说明理由，并写出完整的不定积分。",
      null, "丙正确，丁错误。(x³)'=3x²，所以x³是一个原函数；不定积分表示同一区间上的全体原函数，完整结果为x³+C，C为任意常数。"],
    rubric: [
      { criterion: "正确计算所给幂函数的导数并与被积函数对应", points: 5 },
      { criterion: "判断第一人的说法正确，并说明一个原函数的含义", points: 5 },
      { criterion: "判断第二人的说法错误，并说明不定积分表示全体原函数", points: 5 },
      { criterion: "写出含任意常数C的完整结果", points: 5 }
    ]
  }
];

function revisedId(id) {
  return id.replace(/-(pre|post|check)-q(\d+)$/, "-r3-$1-q$2");
}

function buildQuestion(original, spec, phase, index) {
  const [question, labels, answer] = spec[phase];
  const legacyId = original.legacyQuestionId || original.id;
  const entry = {
    ...original,
    id: revisedId(legacyId), sourceId: revisedId(legacyId), legacyQuestionId: legacyId,
    contentOrigin: "authored-revision", instrumentVersion: VERSION,
    question, type: index === 9 ? "short_answer" : index >= 7 ? "multiple" : "single",
    points: index === 9 ? 20 : index >= 7 ? 12 : 8,
    answer, analysis: spec[`${phase}Analysis`] || spec.analysis || answer,
    knowledgePointIds: [spec.kp], cognitiveLevel: spec.process, estimatedSteps: spec.steps,
    pairId: `R3-P${String(index + 1).padStart(2, "0")}`,
    equivalence: { presentationMode: "text", cognitiveProcess: spec.process,
      taskStepCount: spec.steps, conclusionClass: spec.construct,
      calibrationStatus: "not_empirically_calibrated" },
    commentPrompt: spec.rubric?.map((item) => `${item.criterion}（${item.points}分）`).join("；") || ""
  };
  delete entry.options;
  delete entry.rubric;
  if (labels) entry.options = optionList(labels);
  if (spec.rubric) entry.rubric = spec.rubric.map((item) => ({ ...item }));
  return entry;
}

const formativeChanges = {
  "GH-06-K01-check-q1": {
    question: "连续非负函数f在区间[0,4]上。将区间等分为4份，取各小区间左端点函数值作为矩形高度。已知f(0)=1，f(1)=2，f(2)=3，f(3)=4，按此规则得到的4个矩形面积之和是多少？"
  },
  "GH-06-K01-check-q2": {
    question: "连续非负函数f在有限区间[a,b]上，a<b。关于用小矩形逼近曲线下方面积，下列哪些说法错误？请选择所有错误说法。",
    options: optionList([
      "当等分数趋于无穷时，矩形面积之和趋于曲线下方区域的面积。",
      "只要写出求和符号就已经完成逼近，不需要确定区间、宽度和取样点。",
      "在固定的有限分割下，左端点、右端点和中点取样所得的矩形面积之和一定相同。",
      "面积逼近需要联系区间分割、函数高度、矩形宽度和求和过程。"
    ])
  },
  "GH-06-K02-check-q1": {
    question: "某水箱持续注水，注水速率r(t)连续且非负，单位为升/分钟。对a<b，定积分∫ₐᵇr(t)dt表示什么？"
  },
  "GH-06-K02-check-q2": {
    options: optionList([
      "把变化率与自变量微元相乘，再在整个区间上累加，可以得到净累积量。",
      "在时间正向增加且速度始终为正时，速度的定积分既等于位移，也等于路程。",
      "定积分的值只取决于被积函数在端点的取值，与区间内部的变化无关。",
      "若被积函数是某个量的变化率，定积分表示该量在区间内的净改变量。"
    ]),
    analysis: "A、B、D正确。变化率乘以时间微元并作有向累积得到净改变量；速度全正时位移与路程相同。C混淆了被积函数与原函数的端点值。"
  },
  "GH-06-K03-check-q1": {
    question: "在同一个区间上，f(x)=2x，F是f的一个原函数，且F(0)=1。下列哪一项同时正确描述F与f的不定积分？",
    options: optionList([
      "由F(0)=1可知，f的所有原函数都只能是x²+1",
      "F(x)=x²+1，而f的不定积分为x²+C，C是任意常数",
      "F是原函数，因此F(x)只能是x²，不能加常数",
      "由F(0)=1可知，f的不定积分是常数1"
    ]),
    analysis: "由F'=2x得F=x²+C，再由F(0)=1得到该特定F=x²+1。但不定积分表示全体原函数x²+C，初值不能限制全体原函数中的常数，所以只有B正确。"
  },
  "GH-06-K03-check-q2": {
    question: "在同一个区间上讨论函数f的原函数与不定积分，下列哪些说法正确？请选择所有正确说法。"
  },
  "GH-07-K01-check-q2": {
    options: optionList([
      "F是以x为自变量的函数；在某些情况下，它可以是常函数。",
      "F(x)表示从a到x对f(t)作有向累积，必须考虑函数正负以及积分方向。",
      "只要f(t)不恒为0，F(x)就一定随x增加而增加。",
      "F(x)只是一个固定数值，没有以x为自变量的函数意义。"
    ]),
    analysis: "A、B正确。变上限积分定义一个函数，是否增减取决于f的符号；f恒为0时F可以为常数。它表示有向累积，不能在没有非负条件时直接等同于几何面积。"
  }
};

function applyToChapter(chapter) {
  if (chapter.id !== CHAPTER) throw new Error("修订只能用于V14-C3");
  const labels = new Map(chapter.modules.flatMap((module) => module.knowledgePoints
    .map((point) => [point.id, point.name])));
  for (const phase of ["pre", "post"]) {
    const quiz = chapter.flow[`${phase}Quiz`];
    if (quiz.questions.length !== specs.length) throw new Error("原题库数量变化，须重新审校");
    quiz.questions = specs.map((spec, index) => {
      const question = buildQuestion(quiz.questions[index], spec, phase, index);
      question.knowledgePointNames = [labels.get(spec.kp)];
      question.concepts = [labels.get(spec.kp)];
      question.moduleId = spec.kp.startsWith("GH-06") ? "GH-06" : "GH-07";
      return question;
    });
    quiz.instrumentVersion = VERSION;
    quiz.difficulty = "pending-calibration";
  }
  for (const point of chapter.modules.flatMap((module) => module.knowledgePoints)) {
    point.formativeQuiz.questions = point.formativeQuiz.questions.map((original) => {
      const legacyId = original.legacyQuestionId || original.id;
      return { ...original, ...formativeChanges[legacyId], id: revisedId(legacyId),
        legacyQuestionId: legacyId, instrumentVersion: VERSION };
    });
    point.formativeQuiz.instrumentVersion = VERSION;
  }
  chapter.assessmentRevision = { version: VERSION, date: "2026-09-09",
    contentReview: "AI-reviewed-awaiting-independent-review",
    empiricalEquivalence: "not-established", historicalResponsesMayBeRegraded: false };
  return chapter;
}

module.exports = { version: VERSION, applyToChapter, revisedId };
