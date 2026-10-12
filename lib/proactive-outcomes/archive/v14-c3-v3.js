"use strict";

const CHAPTER_ID = "V14-C3";
const VERSION = "v14-c3-outcomes-v3";
const legacyV2 = require("./v14-c3-v2");

function figure(file, alt) {
  return Object.freeze({
    src: `resources/assessment/v14-c3-r3/${file}-r3.svg`,
    alt,
    width: 640,
    height: 300
  });
}

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
  answer,
  figure: illustration
}) {
  return Object.freeze({
    id,
    constructId,
    knowledgePointId,
    cognitiveProcess,
    prompt,
    options: Object.freeze(options),
    answer,
    ...(illustration ? { figure: illustration } : {})
  });
}

const STAGES = Object.freeze({
  near_transfer: Object.freeze({
    id: "near_transfer",
    label: "近迁移测量",
    purpose: "在新情境中应用本章核心关系。",
    items: Object.freeze([
      item({
        id: "V14-C3-NT-r3-01",
        constructId: "signed_accumulation",
        knowledgePointId: "GH-06-K02",
        cognitiveProcess: "情境应用",
        prompt: "某水箱前 4 分钟净流入 12 L，随后 2 分钟净流出 5 L。把流量视为有向变化率，这 6 分钟的净水量变化是多少？",
        options: [
          option("a", "增加 17 L"),
          option("b", "增加 7 L"),
          option("c", "减少 7 L")
        ],
        answer: "b"
      }),
      item({
        id: "V14-C3-NT-r3-02",
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
        id: "V14-C3-NT-r3-03",
        constructId: "substitution_consistency",
        knowledgePointId: "GH-07-K03",
        cognitiveProcess: "变量转换",
        prompt: "对 ∫₁³ 2x/(2+x²) dx 令 u=2+x²，新的积分上下限应是什么？",
        options: [
          option("a", "1 到 3"),
          option("b", "2 到 9"),
          option("c", "3 到 11")
        ],
        answer: "c"
      }),
      item({
        id: "V14-C3-NT-r3-04",
        constructId: "riemann_refinement",
        knowledgePointId: "GH-06-K01",
        cognitiveProcess: "近似判断",
        prompt: "某非负连续函数在有限区间上单调递增。用左端点矩形估算曲线下的面积，把区间从等分为 4 份改为等分为 8 份。哪个判断一定成立？",
        options: [
          option("a", "矩形数量翻倍，所以估计面积也一定翻倍"),
          option("b", "8 份时的估计面积一定大于真实面积"),
          option("c", "8 份时的估计面积不小于 4 份时，且仍不超过真实面积")
        ],
        answer: "c"
      }),
      item({
        id: "V14-C3-NT-r3-05",
        constructId: "integration_by_parts_setup",
        knowledgePointId: "GH-07-K04",
        cognitiveProcess: "方法执行",
        prompt: "计算 ∫₀¹x cos(x) dx 时，取 u=x、dv=cos(x)dx。分部积分后的第一步应写成什么？",
        options: [
          option("a", "[x cos(x)]₀¹+∫₀¹sin(x)dx"),
          option("b", "[x sin(x)]₀¹-∫₀¹sin(x)dx"),
          option("c", "∫₀¹x sin(x)dx")
        ],
        answer: "b"
      })
    ])
  }),
  representation_transfer: Object.freeze({
    id: "representation_transfer",
    label: "跨表征迁移测量",
    purpose: "在图像、语言和符号之间转换同一数学关系。",
    items: Object.freeze([
      item({
        id: "V14-C3-RT-r3-01",
        constructId: "accumulation_graph",
        knowledgePointId: "GH-07-K01",
        cognitiveProcess: "图像到变化趋势",
        prompt: "下图给出连续函数 f 的图像。若 A(x)=∫₀ˣf(t)dt，那么 A 在 x=2 附近怎样变化？",
        figure: figure("累积变化率", "曲线在横坐标 1 和 3 处穿过横轴，在横坐标 2 处纵坐标为 -1；1 与 3 之间的曲线位于横轴下方。"),
        options: [
          option("a", "A 在减少"),
          option("b", "A 在增加"),
          option("c", "A 必定等于 0")
        ],
        answer: "a"
      }),
      item({
        id: "V14-C3-RT-r3-02",
        constructId: "riemann_gap",
        knowledgePointId: "GH-06-K01",
        cognitiveProcess: "图像到极限关系",
        prompt: "下图用上下两组矩形夹住同一曲线下的面积。左图等分为 2 份，右图等分为 4 份。关于这两次面积估计，哪个判断正确？",
        figure: figure("上下和细分", "同一条单调递增曲线在横坐标 0 到 2 上：2 份时下和为 1、上和为 5；4 份时下和为 1.75、上和为 3.75。实线和虚线分别表示两组矩形。"),
        options: [
          option("a", "两图上和都小于真实面积"),
          option("b", "4 份时的上下和已经相等"),
          option("c", "4 份时上下和的差更小，夹住真实面积的范围更窄")
        ],
        answer: "c"
      }),
      item({
        id: "V14-C3-RT-r3-03",
        constructId: "integration_by_parts",
        knowledgePointId: "GH-07-K04",
        cognitiveProcess: "关系图到积分结构",
        prompt: "下图将乘积的导数分成两项。利用这张关系图反向求 ∫x sin(x)dx，正确的改写是哪一个？",
        figure: figure("乘积求导关系", "乘积 x 乘 cos(x) 求导得到两项之和：第一项为 1 乘 cos(x)，第二项为 x 乘负的 sin(x)，合并为 cos(x) 减去 x sin(x)。"),
        options: [
          option("a", "x cos(x)-∫cos(x)dx"),
          option("b", "-x cos(x)+∫cos(x)dx"),
          option("c", "sin(x)/x")
        ],
        answer: "b"
      }),
      item({
        id: "V14-C3-RT-r3-04",
        constructId: "signed_area_decomposition",
        knowledgePointId: "GH-06-K02",
        cognitiveProcess: "图像面积到符号值",
        prompt: "下图为变化率函数 q 在区间 [0,5] 上的图像，阴影内标注的是各块几何面积。∫₀⁵q(x)dx 等于多少？",
        figure: figure("有向面积", "横坐标 0 到 3 之间，函数值为 3，横轴上方矩形标注面积 9；横坐标 3 到 5 之间，函数值为 -2，横轴下方矩形标注面积 4。"),
        options: [
          option("a", "13"),
          option("b", "5"),
          option("c", "-5")
        ],
        answer: "b"
      }),
      item({
        id: "V14-C3-RT-r3-05",
        constructId: "antiderivative_graph_family",
        knowledgePointId: "GH-06-K03",
        cognitiveProcess: "图像到函数族",
        prompt: "下图三条曲线只相差竖直平移。结合图中函数表达式，哪个判断正确？",
        figure: figure("原函数族", "三条开口向上的抛物线分别标为 y=x²-2、y=x²+1、y=x²+5，顶点分别为 (0,-2)、(0,1)、(0,5)。"),
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
        id: "V14-C3-DR-r3-01",
        constructId: "antiderivative_family",
        knowledgePointId: "GH-06-K03",
        cognitiveProcess: "延迟提取",
        prompt: "不定积分 ∫5x⁴dx 的完整结果是什么？",
        options: [
          option("a", "x⁴+C"),
          option("b", "5x⁵+C"),
          option("c", "x⁵+C")
        ],
        answer: "c"
      }),
      item({
        id: "V14-C3-DR-r3-02",
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
        id: "V14-C3-DR-r3-03",
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
        id: "V14-C3-DR-r3-04",
        constructId: "endpoint_difference",
        knowledgePointId: "GH-07-K02",
        cognitiveProcess: "延迟关系提取",
        prompt: "已知 q 在 [1,4] 上连续，H'(x)=q(x)，且 H(4)-H(1)=-3。根据牛顿-莱布尼茨公式，∫₁⁴q(x)dx 等于多少？",
        options: [
          option("a", "-3"),
          option("b", "3"),
          option("c", "H'(4)-H'(1)")
        ],
        answer: "a"
      }),
      item({
        id: "V14-C3-DR-r3-05",
        constructId: "substitution_structure",
        knowledgePointId: "GH-07-K03",
        cognitiveProcess: "延迟方法选择",
        prompt: "计算 ∫₀¹2x(1+x²)⁴dx，令 u=1+x² 后，原积分应化为哪一个积分？",
        options: [
          option("a", "∫₁²2xu⁴du"),
          option("b", "∫₀¹u⁴du"),
          option("c", "∫₁²u⁴du")
        ],
        answer: "c"
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
    options: source.options.map((entry) => ({ ...entry })),
    ...(source.figure ? { figure: { ...source.figure } } : {})
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
  if (Object.keys(source).some((id) => !stage.items.some((current) => current.id === id))) {
    return null;
  }
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

const current = Object.freeze({
  chapterId: CHAPTER_ID,
  version: VERSION,
  stageIds: Object.freeze(Object.keys(STAGES)),
  publicStage,
  sanitizeResponses,
  grade,
  forVersion(version = VERSION) {
    if (version === VERSION) return current;
    if (version === legacyV2.version) return legacyV2;
    return null;
  }
});
module.exports = current;
