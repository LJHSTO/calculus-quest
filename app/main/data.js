// Course data, global state, and runtime flags.
// Keep this legacy key so existing browsers continue loading their local fallback state.
const STORAGE_KEY = "calculus-quest-openmaic-v14-player-v1";
const AUTH_TOKEN_KEY = "calculus-quest-auth-token-v1";
const LAST_PARTICIPANT_KEY = "calculus-quest-last-participant-v1";
const COURSE_MODE = "multi-scene-adaptive";
const MULTI_SCENE_ROUTE_PATH = "/api/course/multi-scene-learning-route";
let activeNarration = null;
let syncTimer = null;
let lastSnapshotJson = "";
let submitInProgress = null;
let previewKnowledgeScenes = {};
const narrationDurationCache = new Map();

const chapters = [
  {
    id: "V14-C1",
    label: "函数、极限与导数入口",
    summary: "从函数图像读法出发，进入极限、连续和导数的第一直觉。"
  },
  {
    id: "V14-C2",
    label: "求导规则与导数应用",
    summary: "把常见求导规则、函数组合、单调性、极值和弯曲连成可操作判断。"
  },
  {
    id: "V14-C3",
    label: "积分直觉与积分方法",
    summary: "从面积、累积和原函数建立积分直觉，再连接基本定理与方法。"
  },
  {
    id: "V14-C4",
    label: "多元函数、梯度与 Jacobian",
    summary: "从曲面、偏导数、梯度和等高线走向多元链式法则与 Jacobian。"
  },
  {
    id: "V14-C5",
    label: "Taylor、Hessian 与无约束优化",
    summary: "用局部近似、二阶信息和梯度下降理解无约束优化。"
  },
  {
    id: "V14-C6",
    label: "约束优化与机器学习闭环",
    summary: "在限制条件下寻找最优，并把导数、梯度和优化接入模型训练闭环。"
  }
];

const CHAPTER_DISPLAY_COPY = {
  "V14-C1": {
    label: "一元基础",
    summary: "函数、极限、连续、导数直觉",
    focus: "先把变化、图像和瞬时变化率说清楚。"
  },
  "V14-C2": {
    label: "求导与应用",
    summary: "规则、链式、单调、极值",
    focus: "把求导规则转成可操作的函数判断。"
  },
  "V14-C3": {
    label: "积分方法",
    summary: "面积、累积、原函数、基本定理",
    focus: "从累积直觉走到常见积分方法。"
  },
  "V14-C4": {
    label: "多元与梯度",
    summary: "偏导、梯度、等高线、Jacobian",
    focus: "把一元变化推广到曲面和方向。"
  },
  "V14-C5": {
    label: "二阶与优化",
    summary: "Taylor、Hessian、梯度下降",
    focus: "用局部近似和二阶信息理解优化。"
  },
  "V14-C6": {
    label: "约束与机器学习",
    summary: "约束条件、拉格朗日、训练闭环",
    focus: "把微积分工具接到模型训练问题。"
  },
  "V14-X1": {
    label: "微分方程",
    summary: "用变化率描述系统演化",
    focus: "适合在积分方法后拓展。"
  },
  "V14-X2": {
    label: "线性代数",
    summary: "向量、矩阵、线性变换",
    focus: "适合在多元与梯度后拓展。"
  },
  "V14-X3": {
    label: "概率统计",
    summary: "随机变量、分布、估计直觉",
    focus: "适合在机器学习闭环后拓展。"
  },
  "V14-X4": {
    label: "深度学习数学",
    summary: "神经网络、反向传播、泛化",
    focus: "适合在机器学习闭环后拓展。"
  },
  "V14-X5": {
    label: "数值优化",
    summary: "迭代、收敛、数值稳定",
    focus: "适合在二阶与优化后拓展。"
  }
};

const chapterGuides = {
  A1: {
    bridge: "函数、坐标系、斜率",
    goal: "把「变量在变」说清楚，能从图像读出变化的快慢和方向。",
    difficulty: "起步",
    pace: "35-45 分钟",
    checkpoint: "能解释斜率正负，判断变化是变快还是变慢。"
  },
  A2a: {
    bridge: "向量、坐标、位移",
    goal: "理解向量如何用方向和长度来描述变化，掌握向量的基本运算。",
    difficulty: "衔接",
    pace: "35-45 分钟",
    checkpoint: "能用向量的加法、数乘和模长描述一步移动。"
  },
  A2b: {
    bridge: "夹角、内积、投影",
    goal: "用夹角和内积判断两个方向的关系，理解投影的含义。",
    difficulty: "衔接",
    pace: "40-50 分钟",
    checkpoint: "能用内积判断两个方向是否一致，会计算投影。"
  },
  A3: {
    bridge: "矩阵变换、函数放大、局部近似",
    goal: "理解矩阵如何改变空间，以及放大观察时曲线为什么像直线。",
    difficulty: "进阶",
    pace: "35-45 分钟",
    checkpoint: "能解释基向量变换，说出局部线性近似的直觉。"
  },
  A4: {
    bridge: "二元函数、曲面、等高线、正定性",
    goal: "从一元函数图像扩展到二元曲面，用等高线理解地形和正定性。",
    difficulty: "进阶",
    pace: "45-55 分钟",
    checkpoint: "能从等高线判断上升方向，解释正定性意味着什么。"
  },
  C1: {
    bridge: "导数、极值、方向导数、梯度",
    goal: "理解导数、方向导数和梯度的关系，能判断不同驻点的类型。",
    difficulty: "挑战",
    pace: "50-60 分钟",
    checkpoint: "能解释梯度为什么指向最陡上升方向，梯度为 0 为何不一定是极值点。"
  },
  D1: {
    bridge: "优化问题、迭代、步长、停止条件",
    goal: "理解梯度下降算法的每一步：方向选择、步长调整和何时停止。",
    difficulty: "应用",
    pace: "45-55 分钟",
    checkpoint: "能解释步长过大或过小对收敛的影响，说出停止条件的意义。"
  },
  D2: {
    bridge: "凸函数、局部与全局最优、优化地形",
    goal: "区分凸函数和非凸函数，理解为什么凸函数更容易找到全局最优。",
    difficulty: "应用",
    pace: "35-45 分钟",
    checkpoint: "能区分局部最低和全局最低，说出凸性的直观判断方法。"
  }
};

const COURSE_INDEX_PATH = "resources/open-maic/course-index.json";
const MULTI_SCENE_INTERACTION_TYPES = [
  { id: "simulation", label: "动手调一调", title: "动手调一调", icon: "调" },
  { id: "game", label: "找错并改正", title: "找错并改正", icon: "改" },
  { id: "mindMap", label: "知识怎么连", title: "知识怎么连", widgetType: "diagram", icon: "图" },
  { id: "visualization3d", label: "换个角度看", title: "换个角度看", icon: "看" }
];
const AGENTIC_CORE_SCENE_ORDERS = [1, 2, 3, 4, 6, 7, 8, 9, 10, 15];
const AGENTIC_CORE_INTERACTIVE_SCENE_ORDERS = [3, 4, 7, 9, 10];
const AGENTIC_RELEARN_SCENE_ORDERS = [5, 11, 12];
const AGENTIC_EXTENSION_SCENE_ORDERS = [13, 14];
const AGENTIC_ADAPTIVE_SCENE_LABELS = {
  5: "重学：对比巩固",
  11: "关系图谱",
  12: "复盘兜底",
  13: "拓展挑战",
  14: "跨章预告"
};
Object.assign(AGENTIC_ADAPTIVE_SCENE_LABELS, {
  5: "形成性重学",
  11: "后测重学",
  12: "复盘重学",
  13: "一步拓展",
  14: "跨章预告"
});
const LEARNING_SCENE_CLUSTERS = [
  { id: "diagnose-map", label: "\u8bca\u65ad\u4e0e\u8def\u7ebf", orders: [1, 2], focus: "\u5148\u5b9a\u4f4d\u5df2\u6709\u76f4\u89c9\uff0c\u518d\u770b\u672c\u8282\u77e5\u8bc6\u5730\u56fe\u3002" },
  { id: "function-coordinate", label: "\u51fd\u6570\u673a\u5668\u4e0e\u5750\u6807", orders: [3, 4, 5, 6], focus: "\u628a\u8f93\u5165\u8f93\u51fa\u5173\u7cfb\u3001\u5750\u6807\u8868\u793a\u548c\u56fe\u50cf\u573a\u666f\u653e\u5728\u540c\u4e00\u5c0f\u8282\u6bd4\u8f83\u3002" },
  { id: "slope-transfer", label: "\u659c\u7387\u4e0e\u53d8\u5316\u5feb\u6162", orders: [7, 8, 9, 11], focus: "\u7528\u4e24\u70b9\u659c\u7387\u3001\u6392\u5e8f\u3001\u5173\u7cfb\u7f51\u7b49\u4e0d\u540c\u573a\u666f\u7406\u89e3\u53d8\u5316\u7387\u3002" },
  { id: "local-linear", label: "\u5c40\u90e8\u53d8\u5316\u4e0e\u62d3\u5c55", orders: [10, 13, 14], focus: "\u4ece\u5c40\u90e8\u659c\u7387\u8d70\u5411\u653e\u5927\u89c2\u5bdf\u548c\u4e0b\u4e00\u7ae0\u9884\u544a\u3002" },
  { id: "review-post", label: "\u590d\u76d8\u4e0e\u540e\u6d4b", orders: [12, 15], focus: "\u6574\u7406\u8bc1\u636e\uff0c\u5b8c\u6210\u8fc1\u79fb\u9898\u548c\u672c\u8282\u6536\u675f\u3002" }
];

function learningClusterTemplatesForChapter(chapterId = "") {
  return LEARNING_SCENE_CLUSTERS;
}

function inferredSceneMetadata(chapterId = "", scene = {}, sceneOrder = 0, assessmentPhase = "") {
  const template = LEARNING_SCENE_CLUSTERS.find((cluster) => cluster.orders.includes(sceneOrder));
  const title = `${scene.title || ""} ${scene.content?.title || ""}`;
  const representation = scene.type === "quiz"
    ? "assessment"
    : /公式|代数|符号/.test(title)
      ? "symbolic"
      : /坐标|图像|地图|关系|曲线|斜率/.test(title)
        ? "visual"
        : scene.type === "interactive"
          ? "manipulative"
          : "verbal";
  const scenarioType = scene.type === "quiz"
    ? (assessmentPhase === "pre" ? "diagnose" : assessmentPhase === "post" ? "transfer" : "check")
    : /重学|复盘|兜底/.test(title)
      ? "remediate"
      : /拓展|预告|挑战/.test(title)
        ? "extend"
        : scene.type === "interactive"
          ? "manipulate"
          : "explain";
  return {
    conceptClusterId: scene.conceptClusterId || template?.id || `${chapterId}-cluster-${Math.ceil((sceneOrder || 1) / 3)}`,
    conceptClusterLabel: scene.conceptClusterLabel || template?.label || "学习小节",
    conceptClusterFocus: scene.conceptClusterFocus || template?.focus || "围绕同一知识点切换不同学习场景。",
    representation: scene.representation || representation,
    scenarioType: scene.scenarioType || scenarioType,
    difficultyBand: scene.difficultyBand || (sceneOrder >= 13 ? "extension" : sceneOrder >= 11 ? "remedial" : "core")
  };
}
const validViews = new Set(["home", "learn", "progress"]);
let state = null;
let currentView = "home";
let currentChapterId = chapters[0].id;
let currentUnitId = "";
let libraryFilter = "all";
let courseIndex = null;
let multiSceneLearningRoute = null;
let prefetchStarted = false;
let manifests = new Map();
let manifestPromises = new Map();
let audioMapPromises = new Map();
let audioMaps = new Map();
let curriculum = [];
