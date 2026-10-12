"use strict";

const version = "v14-c3-verification-v2";

function check(knowledgePointId, level, subSkill, prompt, labels, answer) {
  return Object.freeze({
    id: `${knowledgePointId}-probe-l${level}-v2`,
    stage: `after_l${level}`,
    instrumentVersion: version,
    evidenceScope: "post_support_local_check",
    subSkill,
    prompt,
    options: Object.freeze(labels.map((label, i) => Object.freeze({
      value: ["a", "b", "c"][i], label
    }))),
    answer
  });
}

const rows = {
  "GH-06-K01": [
    ["refinement_conditions", "函数f在闭区间 [a,b] 上连续，用矩形和近似积分。当分割的最大宽度趋于0时，哪种说法正确？",
      ["矩形和一定单调增加", "无论在每个小区间内怎样取样，矩形和都趋于该定积分", "矩形高度的选择从一开始就不影响近似值"], "b"],
    ["upper_lower_bounds", "函数f在闭区间 [a,b] 上连续且非负，用同一分割的上和与下和夹住面积。不断细分并使最大宽度趋于0时，上下和之差怎样变化？",
      ["趋于0，但不保证每次细分后都严格变小", "首次细分后就必定等于0", "必定保持不变"], "a"],
    ["rectangle_bias", "连续函数在某小区间内的最小值是2、最大值是5。用高度5的矩形近似这一段有向面积，这个矩形给出什么？",
      ["下界", "无法判断任何界", "上界"], "c"],
    ["partition_width", "区间 [1,4] 等分为6份，每个小矩形的宽度 Δx 是多少？",
      ["3", "0.5", "2"], "b"],
    ["signed_rectangle_sum", "四个小区间的宽度均为0.5，取样高度依次为2、4、3、1。矩形和是多少？",
      ["10", "2.5", "5"], "c"]
  ],
  "GH-06-K02": [
    ["negative_velocity", "一维运动的速度在一小段非零时长内恒为负。累计位移与累计路程怎样变化？",
      ["累计位移减小，累计路程增加", "累计位移和累计路程都减小", "累计位移不变，只有路程增加"], "a"],
    ["signed_vs_absolute_area", "一维运动的速度图像在横轴上方的几何面积为6m、下方的几何面积为2m。净位移与路程分别是多少？",
      ["8m，4m", "4m，8m", "6m，2m"], "b"],
    ["segment_sign", "一段运动的速度为 -2m/s、持续3s。该段位移与路程分别是多少？",
      ["-6m，-6m", "6m，-6m", "-6m，6m"], "c"],
    ["rate_duration", "变化率在4分钟内恒为 -3单位/分钟，这一段对净变化的贡献是多少？",
      ["-12", "12", "-3"], "a"],
    ["net_and_distance", "速度先为2m/s持续3s，再为 -4m/s持续1s。净位移与路程分别是多少？",
      ["10m，2m", "2m，10m", "6m，4m"], "b"]
  ],
  "GH-06-K03": [
    ["integration_constant", "不定积分 ∫8x dx 的完整结果是什么？",
      ["4x²", "8x²+C", "4x²+C"], "c"],
    ["constant_difference", "F与G在同一个区间上可导，且F'(x)=G'(x)处处成立。可以确定什么？",
      ["F与G必须完全相同", "F-G在该区间上为常数", "F+G在该区间上为常数"], "b"],
    ["verify_antiderivative", "要验证一个函数是不是f的原函数，最直接的操作是什么？",
      ["对它求导并检查是否得到f", "只计算它在一个端点的值", "把它乘以任意常数"], "a"],
    ["power_rule", "不定积分 ∫12x³dx 的完整结果是什么？",
      ["12x⁴+C", "3x⁴+C", "4x³+C"], "b"],
    ["family_example", "在实数范围内，H(x)=x³+2，J(x)=x³-4。关于它们与函数3x²的关系，哪个判断正确？",
      ["两者函数值处处相同", "两者导数互为相反数", "两者都是3x²的原函数，相差常数6"], "c"]
  ],
  "GH-07-K01": [
    ["local_increment", "f在x附近连续，F(x)=∫ₐˣf(t)dt。对趋近0的正增量h，F(x+h)-F(x)的一阶近似是什么？",
      ["f(a)h", "f(x)h", "F(x)h"], "b"],
    ["derivative_sign", "连续函数f在某点附近恒为正，F(x)=∫ₐˣf(t)dt。F在该邻域内怎样变化？",
      ["严格增加", "严格减少", "必定等于0"], "a"],
    ["increment_interval", "f连续且F(x)=∫ₐˣf(t)dt，则F(x+h)-F(x)等于什么？",
      ["∫ₐʰf(t)dt", "∫ₐˣf(t)dt", "∫ₓˣ⁺ʰf(t)dt"], "c"],
    ["constant_increment", "函数f在区间 [2,2.03] 上恒为 -2。这段区间对变上限积分的增量是多少？",
      ["0.06", "-0.06", "-2.03"], "b"],
    ["fundamental_derivative", "F(x)=∫₀ˣ(2t+1)dt，则F'(3)是多少？",
      ["7", "3", "12"], "a"]
  ],
  "GH-07-K02": [
    ["endpoint_order", "f在 [a,b] 上连续，F是f的一个原函数，则∫ₐᵇf(x)dx等于什么？",
      ["f(b)-f(a)", "F(a)-F(b)", "F(b)-F(a)"], "c"],
    ["rate_vs_accumulation", "连续的变化率为f，累计量F满足F'=f。为什么区间净变化用F的端点差计算？",
      ["比较累计量的终值和初值可得到净变化", "f的端点值在任何题目里都相等", "F的数值总比f大"], "a"],
    ["select_antiderivative", "用牛顿-莱布尼茨公式求连续函数f的定积分，首先需要找到什么？",
      ["f在上限处的导数", "满足F'=f的原函数F", "积分上下限的和"], "b"],
    ["evaluate_endpoints", "计算∫₁²6x²dx，使用原函数F(x)=2x³，结果是多少？",
      ["14", "18", "12"], "a"],
    ["endpoint_application", "q在 [1,5] 上连续，H'=q，且H(1)=-2、H(5)=4。∫₁⁵q(x)dx是多少？",
      ["-6", "2", "6"], "c"]
  ],
  "GH-07-K03": [
    ["variable_system", "定积分换元时，除了替换被积表达式，还必须同步处理什么？",
      ["只处理积分号形状", "微分元和积分上下限", "只删除被积函数前的常数"], "b"],
    ["bounds_substitution", "对∫₁²2x cos(x²)dx令u=x²，新的积分上下限是什么？",
      ["1到4", "1到2", "0到4"], "a"],
    ["differential_factor", "令u=x³，则表达式3x² dx应如何改写？",
      ["3du", "x du", "du"], "c"],
    ["all_parts_consistent", "对∫₀¹3x²e^{x^3}dx令u=x³，下面哪个改写保持变量和上下限一致？",
      ["∫₀¹3x²eᵘdu", "∫₀¹eᵘdu", "∫₀³eᵘdu"], "b"],
    ["substitution_evaluation", "计算∫₀¹2x(1+x²)dx，令u=1+x²。积分值是多少？",
      ["1.5", "1", "2"], "a"]
  ],
  "GH-07-K04": [
    ["factor_choice", "对∫x cos(x)dx使用分部积分，希望新积分更简单，应优先选择哪组？",
      ["u=x，dv=cos(x)dx", "u=cos(x)，dv=x dx", "u=1，dv=x cos(x)dx"], "a"],
    ["parts_structure", "分部积分公式的正确结构是什么？",
      ["∫u dv = uv + ∫u du", "∫u dv = u/v", "∫u dv = uv - ∫v du"], "c"],
    ["complexity_check", "选择u与dv后，判断分部积分是否有帮助，最重要的是检查什么？",
      ["u是否总是写在原式最前面", "v是否容易求出，以及新积分是否更容易处理", "两个因子是否都含x"], "b"],
    ["logarithm_split", "在x>0时计算∫ln(x)dx，哪种拆分更合适？",
      ["u=ln(x)，dv=dx", "u=1，dv=ln(x)dx", "u=x，dv=ln(x)dx"], "a"],
    ["complete_new_example", "对∫x e^{2x}dx取u=x、dv=e^{2x}dx，完整结果是什么？",
      ["x e^{2x}-e^{2x}+C", "(x/2+1/4)e^{2x}+C", "(x/2-1/4)e^{2x}+C"], "c"]
  ]
};

const checks = Object.freeze(Object.fromEntries(Object.entries(rows).map(([knowledgePointId, items]) => [
  knowledgePointId,
  Object.freeze(Object.fromEntries(items.map((item, index) => [
    `L${index + 1}`, check(knowledgePointId, index + 1, ...item)
  ])))
])));

module.exports = Object.freeze({ version, checks });
