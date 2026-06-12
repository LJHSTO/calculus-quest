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
    summary: "从函数、坐标图像和斜率建立微积分直觉。",
    glm: ["函数是描述变化的机器.html", "坐标系把函数画成图像.html", "斜率是变化快慢的第一种语言.html"]
  },
  {
    id: "A2a",
    label: "向量：方向与长度",
    summary: "把变化表示成可操作的方向、长度和步伐。",
    glm: ["向量是带方向的变化量.html", "向量可以相加, 也可以伸缩反向.html", "距离与范数_ 变化有多大.html"]
  },
  {
    id: "A2b",
    label: "内积与投影",
    summary: "理解夹角、内积和投影，为方向导数做准备。",
    glm: ["内积判断两个方向是否一致.html", "投影看见某个方向上的分量.html", "沿指定方向的变化率.html"]
  },
  {
    id: "A3",
    label: "空间变换与局部线性",
    summary: "用矩阵变换和放大观察理解局部近似。",
    glm: ["矩阵可以改变空间.html", "放大后曲线像直线.html"]
  },
  {
    id: "A4",
    label: "曲面与正定性",
    summary: "从曲线走向曲面、等高线和最快上升方向。",
    glm: ["从抛物线到碗形曲面.html", "从曲线走向曲面和等高线.html", "正定意味着从中心往哪走都变大.html"]
  },
  {
    id: "C1",
    label: "导数、梯度与驻点",
    summary: "学习导数、极值、梯度、方向导数和驻点判断。",
    glm: [
      "用导数寻找最高点和最低点.html",
      "一条曲线上怎样找最低点.html",
      "亲手算出一个梯度.html",
      "梯度为 0 不一定是最低点.html",
      "梯度是函数上升最快的方向.html"
    ]
  },
  {
    id: "D1",
    label: "梯度下降",
    summary: "把梯度转化为迭代步骤、步长策略和停止条件。",
    glm: [
      "优化就是在可能范围内找最好.html",
      "把目标函数看成地形.html",
      "梯度下降每一步做什么.html",
      "步长决定走得稳不稳.html",
      "沿最陡下降方向走.html"
    ]
  },
  {
    id: "D2",
    label: "凸性与全局最优",
    summary: "比较凸地形与非凸山谷，理解优化可靠性。",
    glm: ["凸函数为什么好优化.html", "有很多山谷时可能走到局部最低.html"]
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

const supplementModels = [
  {
    id: "glm-5",
    label: "GLM-5",
    role: "结构化复盘",
    useCase: "适合把刚学过的概念重新串成步骤。"
  },
  {
    id: "gemini-3.1-pro",
    label: "Gemini 3.1 Pro",
    role: "直觉类比",
    useCase: "适合前测暴露直觉不足时先补图像感。"
  },
  {
    id: "qwen3.6-27b",
    label: "Qwen 3.6 27B",
    role: "快速纠偏",
    useCase: "适合用较短路径补定义、公式和基础例子。"
  },
  {
    id: "qwen3.6-35b-a3b",
    label: "Qwen 3.6 35B A3B",
    role: "迁移挑战",
    useCase: "适合形成性测验后做更完整的解释和应用迁移。"
  }
];

const supplementAnalysis = {
  "函数是描述变化的机器.html": {
    chapterId: "A1",
    title: "函数：输入输出与变化关系",
    tags: ["函数", "输入", "输出", "自变量", "因变量", "变化关系"],
    prerequisite: "理解一个量如何决定另一个量。",
    bestFor: "前测中混淆函数、自变量和因变量时。"
  },
  "坐标系把函数画成图像.html": {
    chapterId: "A1",
    title: "坐标图像：把函数变成可观察轨迹",
    tags: ["坐标", "图像", "点", "横轴", "纵轴", "函数图像"],
    prerequisite: "能把有序数对和函数值联系起来。",
    bestFor: "看不懂图像上一个点代表什么时。"
  },
  "斜率是变化快慢的第一种语言.html": {
    chapterId: "A1",
    title: "斜率：变化快慢与局部趋势",
    tags: ["斜率", "变化快慢", "正负", "上升", "下降", "局部"],
    prerequisite: "已能读函数图像和坐标点。",
    bestFor: "前测或阶段测中无法解释斜率正负、大小或物理意义时。"
  },
  "向量是带方向的变化量.html": {
    chapterId: "A2a",
    title: "向量：有方向的变化量",
    tags: ["向量", "方向", "长度", "坐标", "变化量", "箭头"],
    prerequisite: "理解坐标中的位移。",
    bestFor: "把向量只当成数字而忽略方向时。"
  },
  "向量可以相加, 也可以伸缩反向.html": {
    chapterId: "A2a",
    title: "向量运算：相加、伸缩与反向",
    tags: ["向量加法", "数乘", "伸缩", "反向", "首尾相接", "线性组合"],
    prerequisite: "知道向量有坐标和方向。",
    bestFor: "形成性测验中不会组合两步变化或调整方向时。"
  },
  "距离与范数_ 变化有多大.html": {
    chapterId: "A2a",
    title: "范数：距离与变化大小",
    tags: ["距离", "范数", "长度", "误差", "两点距离", "大小"],
    prerequisite: "能读向量坐标。",
    bestFor: "不会衡量离目标还有多远、误差多大时。"
  },
  "内积判断两个方向是否一致.html": {
    chapterId: "A2b",
    title: "内积：判断方向一致性",
    tags: ["内积", "点积", "夹角", "方向一致", "垂直", "正负"],
    prerequisite: "理解向量方向和长度。",
    bestFor: "无法用内积正负解释两个方向关系时。"
  },
  "投影看见某个方向上的分量.html": {
    chapterId: "A2b",
    title: "投影：某个方向上的分量",
    tags: ["投影", "分量", "影子", "方向分解", "长度", "夹角"],
    prerequisite: "理解内积和夹角。",
    bestFor: "把二维变化分解到指定方向时卡住。"
  },
  "沿指定方向的变化率.html": {
    chapterId: "A2b",
    title: "方向变化率：沿指定方向看变化",
    tags: ["方向导数", "指定方向", "变化率", "分量", "梯度预备"],
    prerequisite: "理解投影和方向贡献。",
    bestFor: "不能从方向分量过渡到方向导数时。"
  },
  "矩阵可以改变空间.html": {
    chapterId: "A3",
    title: "矩阵：空间变换的规则",
    tags: ["矩阵", "空间变换", "基向量", "映射", "线性变换"],
    prerequisite: "理解向量坐标。",
    bestFor: "看不出矩阵如何移动、拉伸或旋转空间时。"
  },
  "放大后曲线像直线.html": {
    chapterId: "A3",
    title: "局部线性：放大后用直线近似曲线",
    tags: ["局部线性", "放大", "近似", "切线", "直线", "微分"],
    prerequisite: "理解斜率和线性变换。",
    bestFor: "无法解释为什么局部可以近似为线性模型时。"
  },
  "从抛物线到碗形曲面.html": {
    chapterId: "A4",
    title: "曲面：从一维抛物线到二维碗形",
    tags: ["抛物线", "曲面", "碗形", "二维函数", "多元函数"],
    prerequisite: "理解一元函数图像。",
    bestFor: "从曲线过渡到曲面时缺少空间想象。"
  },
  "从曲线走向曲面和等高线.html": {
    chapterId: "A4",
    title: "等高线：从曲面读地形",
    tags: ["等高线", "曲面", "地形", "高度", "多维", "水平截面"],
    prerequisite: "理解曲面代表函数值。",
    bestFor: "不会用等高线判断上升、下降和地形形状时。"
  },
  "正定意味着从中心往哪走都变大.html": {
    chapterId: "A4",
    title: "正定：从中心向外都变大",
    tags: ["正定", "二次型", "中心", "曲率", "碗形", "稳定"],
    prerequisite: "能读二次曲面和方向变化。",
    bestFor: "无法判断局部碗形、稳定性或最小点形状时。"
  },
  "用导数寻找最高点和最低点.html": {
    chapterId: "C1",
    title: "导数与极值：最高点和最低点",
    tags: ["导数", "极值", "最高点", "最低点", "斜率为零", "一元函数"],
    prerequisite: "理解斜率表示变化趋势。",
    bestFor: "不知道为什么导数能帮助找极值时。"
  },
  "一条曲线上怎样找最低点.html": {
    chapterId: "C1",
    title: "一元最低点：候选点与比较",
    tags: ["最低点", "候选点", "端点", "导数", "曲线", "比较"],
    prerequisite: "理解导数和极值。",
    bestFor: "会求导但不会组织最低点判断流程时。"
  },
  "亲手算出一个梯度.html": {
    chapterId: "C1",
    title: "梯度计算：偏导数组成的向量",
    tags: ["梯度", "偏导数", "计算", "多元函数", "向量", "公式"],
    prerequisite: "理解多元函数和导数。",
    bestFor: "不能把多个方向的变化率合成梯度时。"
  },
  "梯度为 0 不一定是最低点.html": {
    chapterId: "C1",
    title: "驻点：梯度为零不等于最低点",
    tags: ["驻点", "梯度为零", "鞍点", "最高点", "最低点", "反例"],
    prerequisite: "会计算梯度。",
    bestFor: "把梯度为零机械等同于最小值时。"
  },
  "梯度是函数上升最快的方向.html": {
    chapterId: "C1",
    title: "梯度方向：最快上升方向",
    tags: ["梯度", "最快上升", "方向导数", "方向", "上升", "向量"],
    prerequisite: "理解方向导数和梯度计算。",
    bestFor: "不能解释梯度的几何意义时。"
  },
  "优化就是在可能范围内找最好.html": {
    chapterId: "D1",
    title: "优化问题：在约束范围内找最好",
    tags: ["优化", "目标", "约束", "最好", "最小化", "最大化"],
    prerequisite: "理解函数值可以比较大小。",
    bestFor: "不清楚优化问题由目标、变量、约束组成时。"
  },
  "把目标函数看成地形.html": {
    chapterId: "D1",
    title: "目标函数地形：高度与下降",
    tags: ["目标函数", "地形", "高度", "下降", "损失", "曲面"],
    prerequisite: "能读曲面和等高线。",
    bestFor: "无法把优化过程想象成在地形上移动时。"
  },
  "梯度下降每一步做什么.html": {
    chapterId: "D1",
    title: "梯度下降：每一步更新什么",
    tags: ["梯度下降", "迭代", "更新", "负梯度", "参数", "下一步"],
    prerequisite: "理解梯度方向。",
    bestFor: "形成性测验中不会写出下降更新逻辑时。"
  },
  "步长决定走得稳不稳.html": {
    chapterId: "D1",
    title: "步长：稳定、震荡与收敛",
    tags: ["步长", "学习率", "稳定", "震荡", "收敛", "迭代"],
    prerequisite: "理解梯度下降每步移动。",
    bestFor: "无法解释步长过大或过小的影响时。"
  },
  "沿最陡下降方向走.html": {
    chapterId: "D1",
    title: "负梯度：最陡下降方向",
    tags: ["负梯度", "最陡下降", "下降方向", "梯度下降", "方向", "优化"],
    prerequisite: "理解梯度是最快上升方向。",
    bestFor: "不知道为什么要沿负梯度而不是梯度走时。"
  },
  "凸函数为什么好优化.html": {
    chapterId: "D2",
    title: "凸函数：可靠优化的地形",
    tags: ["凸函数", "全局最低", "可靠", "碗形", "优化", "局部最低"],
    prerequisite: "理解目标函数地形和最低点。",
    bestFor: "不能解释凸问题为什么更可靠时。"
  },
  "有很多山谷时可能走到局部最低.html": {
    chapterId: "D2",
    title: "非凸山谷：局部最低与起点影响",
    tags: ["非凸", "山谷", "局部最低", "起点", "多峰", "路径"],
    prerequisite: "理解凸地形和梯度下降。",
    bestFor: "不能区分局部最低和全局最低，或忽略起点影响时。"
  }
};

const state = loadState();
const COURSE_INDEX_PATH = "resources/open-maic/course-index.json";
const validViews = new Set(["home", "learn", "library", "progress"]);
let currentView = validViews.has(state.currentView) ? state.currentView : "home";
let currentChapterId = state.currentChapterId || chapters[0].id;
let currentUnitId = state.currentUnitId || "";
let libraryFilter = "all";
let courseIndex = null;
let prefetchStarted = false;
let manifests = new Map();
let manifestPromises = new Map();
let curriculum = [];
let supplementUnits = [];
let supplementEntryUnitId = "";

