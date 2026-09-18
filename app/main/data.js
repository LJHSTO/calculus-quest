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
    "id": "V14-C1",
    "label": "函数与极限",
    "summary": "从函数规则与坐标图像出发，理解趋近、左右极限和连续。"
  }
];
const CHAPTER_DISPLAY_COPY = {
  "V14-C1": {
    "label": "函数与极限",
    "summary": "函数规则、坐标图像、极限与连续",
    "focus": "从输入与输出出发，理解趋近与连续。"
  }
};
const chapterGuides = {};

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
