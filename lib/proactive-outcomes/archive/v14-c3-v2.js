"use strict";

const CHAPTER_ID = "V14-C3";
const VERSION = "v14-c3-outcomes-v2";

function option(value, label) {
  return Object.freeze({ value, label });
}

function item({
  id,
  constructId,
  knowledgePointId,
  cognitiveProcess,
  prompt,
  options,
  answer
}) {
  return Object.freeze({
    id,
    constructId,
    knowledgePointId,
    cognitiveProcess,
    prompt,
    options: Object.freeze(options),
    answer
  });
}

const STAGES = Object.freeze({
  near_transfer: Object.freeze({
    id: "near_transfer",
    label: "近迁移测量",
    purpose: "在新情境中应用本章核心关系。",
    items: Object.freeze([
      item({
        id: "V14-C3-NT-01",
        constructId: "signed_accumulation",
        knowledgePointId: "GH-06-K02",
        cognitiveProcess: "情境应用",
        prompt: "某水箱前 4 分钟净流入 12 L，随后 2 分钟净流出 5 L。把流量视为有向变化率，这 6 分钟的净水量变化是多少？",
        options: [
          option("a", "增加 7 L"),
          option("b", "增加 17 L"),
          option("c", "减少 7 L")
        ],
        answer: "a"
      }),
      item({
        id: "V14-C3-NT-02",
        constructId: "fundamental_theorem",
        knowledgePointId: "GH-07-K02",
        cognitiveProcess: "错误诊断",
        prompt: "一名学生计算 ∫₁³2x dx 时写成 2×3-2×1。最关键的修正是什么？",
        options: [
          option("a", "先找满足 F'(x)=2x 的原函数，再计算 F(3)-F(1)"),
          option("b", "把上下限相加后乘以 2"),
          option("c", "把被积函数改成绝对值")
        ],
        answer: "a"
      }),
      item({
        id: "V14-C3-NT-03",
        constructId: "substitution_consistency",
        knowledgePointId: "GH-07-K03",
        cognitiveProcess: "变量转换",
        prompt: "对 ∫₀² 2x/(1+x²) dx 令 u=1+x²，新的积分上下限应是什么？",
        options: [
          option("a", "0 到 2"),
          option("b", "1 到 4"),
          option("c", "1 到 5")
        ],
        answer: "c"
      }),
      item({
        id: "V14-C3-NT-04",
        constructId: "riemann_refinement",
        knowledgePointId: "GH-06-K01",
        cognitiveProcess: "近似判断",
        prompt: "用同一种取样方法估算一段连续曲线下的面积时，把区间从等分为 4 份改为等分为 8 份。最合理的判断是什么？",
        options: [
          option("a", "小矩形通常能更细致地贴合曲线，面积近似有机会更准确"),
          option("b", "矩形数量翻倍，所以面积估计一定也翻倍"),
          option("c", "只要矩形变窄，估计值就一定严格小于真实面积")
        ],
        answer: "a"
      }),
      item({
        id: "V14-C3-NT-05",
        constructId: "integration_by_parts_setup",
        knowledgePointId: "GH-07-K04",
        cognitiveProcess: "方法执行",
        prompt: "计算 ∫₀¹x cos(x) dx 时，取 u=x、dv=cos(x)dx。分部积分后的第一步应写成什么？",
        options: [
          option("a", "[x sin(x)]₀¹-∫₀¹sin(x)dx"),
          option("b", "[x cos(x)]₀¹+∫₀¹sin(x)dx"),
          option("c", "∫₀¹x sin(x)dx")
        ],
        answer: "a"
      })
    ])
  }),
  representation_transfer: Object.freeze({
    id: "representation_transfer",
    label: "跨表征迁移测量",
    purpose: "在图像、语言和符号之间转换同一数学关系。",
    items: Object.freeze([
      item({
        id: "V14-C3-RT-01",
        constructId: "accumulation_graph",
        knowledgePointId: "GH-07-K01",
        cognitiveProcess: "图像到变化趋势",
        prompt: "若 A(x)=∫₀ˣf(t)dt，且 f 的图像在 x=2 附近位于横轴下方，那么 A 在 x=2 附近怎样变化？",
        options: [
          option("a", "A 在增加"),
          option("b", "A 在减少"),
          option("c", "A 必定等于 0")
        ],
        answer: "b"
      }),
      item({
        id: "V14-C3-RT-02",
        constructId: "riemann_gap",
        knowledgePointId: "GH-06-K01",
        cognitiveProcess: "图像到极限关系",
        prompt: "一幅图显示同一分割下的上和与下和。继续细分时，两者差距缩小。这个图像事实最直接支持什么结论？",
        options: [
          option("a", "细分通常提高面积逼近精度"),
          option("b", "矩形和一定从下方单调增加"),
          option("c", "矩形高度的选择不再重要")
        ],
        answer: "a"
      }),
      item({
        id: "V14-C3-RT-03",
        constructId: "integration_by_parts",
        knowledgePointId: "GH-07-K04",
        cognitiveProcess: "公式结构转换",
        prompt: "把乘积求导关系反向用于 ∫x eˣdx，选择 u=x、dv=eˣdx 后得到哪一步？",
        options: [
          option("a", "x eˣ-∫eˣdx"),
          option("b", "x eˣ+∫x dx"),
          option("c", "eˣ/x")
        ],
        answer: "a"
      }),
      item({
        id: "V14-C3-RT-04",
        constructId: "signed_area_decomposition",
        knowledgePointId: "GH-06-K02",
        cognitiveProcess: "图像面积到符号值",
        prompt: "某变化率图像在横轴上方的面积为 9，在横轴下方的面积大小为 4。对应区间上的定积分是多少？",
        options: [
          option("a", "5"),
          option("b", "13"),
          option("c", "-5")
        ],
        answer: "a"
      }),
      item({
        id: "V14-C3-RT-05",
        constructId: "antiderivative_graph_family",
        knowledgePointId: "GH-06-K03",
        cognitiveProcess: "图像到函数族",
        prompt: "图中三条曲线分别为 y=x²-2、y=x²+1、y=x²+5，它们形状相同且只发生上下平移。这个图像最直接说明什么？",
        options: [
          option("a", "它们的导数相同，都是 2x，因此属于同一个原函数族"),
          option("b", "它们在每个 x 处的函数值都相同"),
          option("c", "上下平移会改变导数中的 x 系数")
        ],
        answer: "a"
      })
    ])
  }),
  retention: Object.freeze({
    id: "retention",
    label: "延迟保持测量",
    purpose: "在延迟后检查关键关系是否仍能独立提取。",
    items: Object.freeze([
      item({
        id: "V14-C3-DR-01",
        constructId: "antiderivative_family",
        knowledgePointId: "GH-06-K03",
        cognitiveProcess: "延迟提取",
        prompt: "不定积分 ∫4x³dx 的完整结果是什么？",
        options: [
          option("a", "x⁴+C"),
          option("b", "4x⁴+C"),
          option("c", "x³+C")
        ],
        answer: "a"
      }),
      item({
        id: "V14-C3-DR-02",
        constructId: "variable_upper_limit",
        knowledgePointId: "GH-07-K01",
        cognitiveProcess: "延迟应用",
        prompt: "若 F(x)=∫₁ˣ(t²+1)dt，那么 F'(2) 等于多少？",
        options: [
          option("a", "3"),
          option("b", "5"),
          option("c", "9")
        ],
        answer: "b"
      }),
      item({
        id: "V14-C3-DR-03",
        constructId: "net_change_vs_distance",
        knowledgePointId: "GH-06-K02",
        cognitiveProcess: "概念辨析",
        prompt: "速度先为 4 m/s 持续 2 s，再为 -2 m/s 持续 1 s。净位移与路程分别是多少？",
        options: [
          option("a", "6 m，10 m"),
          option("b", "10 m，6 m"),
          option("c", "8 m，2 m")
        ],
        answer: "a"
      }),
      item({
        id: "V14-C3-DR-04",
        constructId: "endpoint_difference",
        knowledgePointId: "GH-07-K02",
        cognitiveProcess: "延迟关系提取",
        prompt: "已知 H'(x)=q(x)，且 H(4)-H(1)=-3。根据牛顿-莱布尼茨公式，∫₁⁴q(x)dx 等于多少？",
        options: [
          option("a", "-3"),
          option("b", "3"),
          option("c", "H'(4)-H'(1)")
        ],
        answer: "a"
      }),
      item({
        id: "V14-C3-DR-05",
        constructId: "substitution_structure",
        knowledgePointId: "GH-07-K03",
        cognitiveProcess: "延迟方法选择",
        prompt: "计算 ∫₀¹2x(1+x²)⁴dx，令 u=1+x² 后，原积分应化为哪一个积分？",
        options: [
          option("a", "∫₁²u⁴du"),
          option("b", "∫₀¹u⁴du"),
          option("c", "∫₁²2xu⁴du")
        ],
        answer: "a"
      })
    ])
  })
});

function publicItem(source) {
  return {
    id: source.id,
    constructId: source.constructId,
    knowledgePointId: source.knowledgePointId,
    cognitiveProcess: source.cognitiveProcess,
    prompt: source.prompt,
    options: source.options.map((entry) => ({ ...entry }))
  };
}

function publicStage(stageId = "") {
  const stage = STAGES[String(stageId || "")];
  if (!stage) return null;
  return {
    id: stage.id,
    label: stage.label,
    purpose: stage.purpose,
    itemCount: stage.items.length,
    agentAssistanceAllowed: false,
    feedbackPolicy: "acknowledgement_only",
    items: stage.items.map(publicItem)
  };
}

function sanitizeResponses(stageId = "", responses = {}, options = {}) {
  const stage = STAGES[String(stageId || "")];
  if (!stage) return null;
  const source = responses && typeof responses === "object" && !Array.isArray(responses)
    ? responses
    : {};
  const sanitized = {};
  for (const current of stage.items) {
    const response = String(source[current.id] || "").trim().slice(0, 40);
    if (!response) continue;
    if (!current.options.some((entry) => entry.value === response)) return null;
    sanitized[current.id] = response;
  }
  if (
    options.requireComplete === true
    && Object.keys(sanitized).length !== stage.items.length
  ) return null;
  return sanitized;
}

function grade(stageId = "", responses = {}) {
  const stage = STAGES[String(stageId || "")];
  if (!stage) return null;
  const source = sanitizeResponses(stageId, responses, {
    requireComplete: true
  });
  if (!source) return null;
  const results = [];
  for (const current of stage.items) {
    const response = source[current.id];
    results.push({
      itemId: current.id,
      constructId: current.constructId,
      knowledgePointId: current.knowledgePointId,
      cognitiveProcess: current.cognitiveProcess,
      response,
      correct: response === current.answer,
      score: response === current.answer ? 1 : 0,
      maxScore: 1
    });
  }
  const score = results.reduce((sum, result) => sum + result.score, 0);
  return {
    stageId: stage.id,
    score,
    maxScore: results.length,
    accuracy: results.length ? score / results.length : 0,
    results
  };
}

module.exports = Object.freeze({
  chapterId: CHAPTER_ID,
  version: VERSION,
  stageIds: Object.freeze(Object.keys(STAGES)),
  publicStage,
  sanitizeResponses,
  grade
});
