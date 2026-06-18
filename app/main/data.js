// Course data, global state, and runtime flags.
const STORAGE_KEY = "calculus-quest-learning-player-v1";
const AUTH_TOKEN_KEY = "calculus-quest-auth-token-v1";
const LAST_PARTICIPANT_KEY = "calculus-quest-last-participant-v1";
let activeNarration = null;
let syncTimer = null;
let lastSnapshotJson = "";
let submitInProgress = null;
const narrationDurationCache = new Map();

const chapters = [
  {
    id: "A1",
    label: "变化与斜率",
    summary: "从函数、坐标图像和斜率建立微积分直觉。"
  },
  {
    id: "A2a",
    label: "向量：方向与长度",
    summary: "把变化表示成可操作的方向、长度和步伐。"
  },
  {
    id: "A2b",
    label: "内积与投影",
    summary: "理解夹角、内积和投影，为方向导数做准备。"
  },
  {
    id: "A3",
    label: "空间变换与局部线性",
    summary: "用矩阵变换和放大观察理解局部近似。"
  },
  {
    id: "A4",
    label: "曲面与正定性",
    summary: "从曲线走向曲面、等高线和最快上升方向。"
  },
  {
    id: "C1",
    label: "导数、梯度与驻点",
    summary: "学习导数、极值、梯度、方向导数和驻点判断。"
  },
  {
    id: "D1",
    label: "梯度下降",
    summary: "把梯度转化为迭代步骤、步长策略和停止条件。"
  },
  {
    id: "D2",
    label: "凸性与全局最优",
    summary: "比较凸地形与非凸山谷，理解优化可靠性。"
  }
];

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

const MAIC_UI_MODEL = {
  id: "qwen3.6-35b-a3b",
  label: "Qwen 3.6 35B A3B",
  role: "MAIC-UI 互动课件生成源"
};

const COURSE_INDEX_PATH = "resources/open-maic/course-index.json";
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
const AGENTIC_MAIC_UI_ADAPTIVE_MAP = {
  A1: {
    5: { file: "函数是描述变化的机器.html", label: "函数机器重学" },
    11: { file: "斜率是变化快慢的第一种语言.html", label: "斜率语言重学" },
    12: { file: "坐标系把函数画成图像.html", label: "坐标图像复盘" },
    13: { file: "放大后曲线像直线.html", label: "局部线性拓展" },
    14: { file: "用导数寻找最高点和最低点.html", label: "导数极值预告" }
  },
  A2a: {
    5: { file: "向量是带方向的变化量.html", label: "向量方向重学" },
    11: { file: "向量可以相加, 也可以伸缩反向.html", label: "向量运算重学" },
    12: { file: "距离与范数_ 变化有多大.html", label: "距离范数复盘" },
    13: { file: "内积判断两个方向是否一致.html", label: "内积预备拓展" },
    14: { file: "投影看见某个方向上的分量.html", label: "投影预告" }
  },
  A2b: {
    5: { file: "内积判断两个方向是否一致.html", label: "内积方向重学" },
    11: { file: "投影看见某个方向上的分量.html", label: "投影分量重学" },
    12: { file: "沿指定方向的变化率.html", label: "方向变化率复盘" },
    13: { file: "亲手算出一个梯度.html", label: "梯度计算拓展" },
    14: { file: "梯度是函数上升最快的方向.html", label: "梯度方向预告" }
  },
  A3: {
    5: { file: "矩阵可以改变空间.html", label: "矩阵变换重学" },
    11: { file: "放大后曲线像直线.html", label: "局部线性重学" },
    12: { file: "从曲线走向曲面和等高线.html", label: "曲面等高线复盘" },
    13: { file: "从抛物线到碗形曲面.html", label: "二次曲面拓展" },
    14: { file: "正定意味着从中心往哪走都变大.html", label: "正定直觉预告" }
  },
  A4: {
    5: { file: "从曲线走向曲面和等高线.html", label: "曲面等高线重学" },
    11: { file: "从抛物线到碗形曲面.html", label: "碗形曲面重学" },
    12: { file: "正定意味着从中心往哪走都变大.html", label: "正定方向复盘" },
    13: { file: "梯度是函数上升最快的方向.html", label: "梯度方向拓展" },
    14: { file: "沿指定方向的变化率.html", label: "方向导数预告" }
  },
  C1: {
    5: { file: "亲手算出一个梯度.html", label: "梯度计算重学" },
    11: { file: "梯度是函数上升最快的方向.html", label: "梯度方向重学" },
    12: { file: "沿指定方向的变化率.html", label: "方向导数复盘" },
    13: { file: "把目标函数看成地形.html", label: "目标地形拓展" },
    14: { file: "沿最陡下降方向走.html", label: "最陡下降预告" }
  },
  D1: {
    5: { file: "把目标函数看成地形.html", label: "目标地形重学" },
    11: { file: "梯度下降每一步做什么.html", label: "梯度下降重学" },
    12: { file: "步长决定走得稳不稳.html", label: "步长稳定复盘" },
    13: { file: "沿最陡下降方向走.html", label: "最陡下降拓展" },
    14: { file: "有很多山谷时可能走到局部最低.html", label: "局部最低预告" }
  },
  D2: {
    5: { file: "优化就是在可能范围内找最好.html", label: "优化目标重学" },
    11: { file: "凸函数为什么好优化.html", label: "凸函数重学" },
    12: { file: "有很多山谷时可能走到局部最低.html", label: "局部最低复盘" },
    13: { file: "一条曲线上怎样找最低点.html", label: "曲线最低点拓展" },
    14: { file: "梯度为 0 不一定是最低点.html", label: "驻点判断预告" }
  }
};
const validViews = new Set(["home", "learn", "library", "progress"]);
let state = null;
let currentView = "home";
let currentChapterId = chapters[0].id;
let currentUnitId = "";
let libraryFilter = "all";
let courseIndex = null;
let prefetchStarted = false;
let manifests = new Map();
let manifestPromises = new Map();
let curriculum = [];
