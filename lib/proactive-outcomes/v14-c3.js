"use strict";

const CHAPTER_ID = "V14-C3";
const VERSION = "v14-c3-outcomes-v1";

function option(value, label) {
  return Object.freeze({ value, label });
}

function item({
  id,
  constructId,
  prompt,
  options,
  answer
}) {
  return Object.freeze({
    id,
    constructId,
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
        prompt: "对 ∫₀² 2x/(1+x²) dx 令 u=1+x²，新的积分上下限应是什么？",
        options: [
          option("a", "0 到 2"),
          option("b", "1 到 4"),
          option("c", "1 到 5")
        ],
        answer: "c"
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
        prompt: "把乘积求导关系反向用于 ∫x eˣdx，选择 u=x、dv=eˣdx 后得到哪一步？",
        options: [
          option("a", "x eˣ-∫eˣdx"),
          option("b", "x eˣ+∫x dx"),
          option("c", "eˣ/x")
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
        prompt: "速度先为 4 m/s 持续 2 s，再为 -2 m/s 持续 1 s。净位移与路程分别是多少？",
        options: [
          option("a", "6 m，10 m"),
          option("b", "10 m，6 m"),
          option("c", "8 m，2 m")
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
