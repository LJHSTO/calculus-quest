// EduIllustrate-inspired 4-stage standardized course generation protocol.
// Reference: arXiv:2604.05005 (EduIllustrate, ECNU)
//
// The protocol sits at the prompt orchestration layer — it does NOT modify
// the Open MAIC platform itself. Instead it standardizes the prompts that
// are fed into Open MAIC, ensuring Sequential Anchoring and concept-chain
// coherence across scenes.
//
// Usage:
//   const { generateCourseOutline, generateScene, assembleChapter } = require("./course-gen/protocol");
//   const outline = await generateCourseOutline(kgChapter);
//   for (const scene of outline.scenes) {
//     const generated = await generateScene(scene, kgChapter);
//   }
//   const report = await assembleChapter(outline, generatedScenes);

const { completeChat } = require("../llm");

const GEN_MODEL = "claude-sonnet-4-6";

const REPRESENTATIONS = ["assessment", "verbal", "visual", "symbolic", "numeric", "manipulative", "relational", "applied"];
const SCENARIO_TYPES = ["diagnose", "map", "explain", "manipulate", "compare", "check", "transfer", "remediate", "extend", "preview"];
const DIFFICULTY_BANDS = ["diagnostic", "core", "remedial", "extension", "transfer"];

function cleanMetadataToken(value, allowed, fallback) {
  const text = String(value || "").trim();
  return allowed.includes(text) ? text : fallback;
}

function fallbackClusterId(chapterId, sceneOrder) {
  return `${chapterId || "chapter"}-cluster-${Math.max(1, Math.ceil(Number(sceneOrder || 1) / 3))}`;
}

function normaliseSceneMetadata(scene = {}, chapterMeta = {}, fallback = {}) {
  const sceneOrder = Number(scene.sceneOrder || scene.order || fallback.sceneOrder || 1);
  const role = scene.role || fallback.role || "lecture";
  const modality = scene.modality || fallback.modality || "narrative";
  const clusterId = scene.conceptClusterId || fallback.conceptClusterId || fallbackClusterId(chapterMeta.id, sceneOrder);
  const anchorConcept = scene.anchorConcept || fallback.anchorConcept || scene.title || "";
  const concepts = Array.isArray(scene.concepts) && scene.concepts.length
    ? scene.concepts
    : [anchorConcept].filter(Boolean);
  const representation = cleanMetadataToken(
    scene.representation || fallback.representation || (role.includes("test") || role === "formative_quiz" ? "assessment" : modality === "experiment" ? "manipulative" : modality === "symbolic" ? "symbolic" : modality === "relational" ? "relational" : modality === "visual" ? "visual" : "verbal"),
    REPRESENTATIONS,
    "verbal"
  );
  const scenarioType = cleanMetadataToken(
    scene.scenarioType || fallback.scenarioType || (role === "pre_test" ? "diagnose" : role === "post_test" ? "transfer" : role === "formative_quiz" ? "check" : role === "concept_map" ? "map" : role === "experiment" || modality === "experiment" ? "manipulate" : "explain"),
    SCENARIO_TYPES,
    "explain"
  );
  const difficultyBand = cleanMetadataToken(
    scene.difficultyBand || fallback.difficultyBand || (role === "pre_test" ? "diagnostic" : role === "post_test" ? "transfer" : sceneOrder >= 13 ? "extension" : "core"),
    DIFFICULTY_BANDS,
    "core"
  );
  return {
    conceptClusterId: clusterId,
    conceptClusterLabel: scene.conceptClusterLabel || fallback.conceptClusterLabel || anchorConcept || "Learning cluster",
    conceptClusterFocus: scene.conceptClusterFocus || fallback.conceptClusterFocus || "Same concept through multiple learning scenes.",
    concepts,
    representation,
    scenarioType,
    difficultyBand
  };
}

function attachSceneMetadata(courseware = {}, outline = {}, chapterMeta = {}) {
  const scenes = Array.isArray(courseware.scenes) ? courseware.scenes : [];
  const outlineScenes = Array.isArray(outline.scenes) ? outline.scenes : [];
  scenes.forEach((scene, index) => {
    const outlineScene = outlineScenes[index] || {};
    const metadata = normaliseSceneMetadata(
      { ...outlineScene, ...scene, sceneOrder: scene.order || outlineScene.sceneOrder || index + 1 },
      { ...chapterMeta, id: chapterMeta.id || chapterMeta.chapterId || courseware.chapterId || "chapter" },
      outlineScene
    );
    Object.assign(scene, metadata);
  });
  return courseware;
}

// ── Stage 1: Outline ──────────────────────────────────────────────────
// Input: a KG chapter object with { id, title, objective, concepts[] }
// Output: { scenes: [{ sceneOrder, role, anchorConcept, modality, visualAnchorType }] }
// Enforces: pre_test at scene 1, post_test at last scene, 8-10 scenes total.

async function generateCourseOutline(kgChapter) {
  const system = [
    "你是一位微积分课程设计师，遵循 EduIllustrate 标准化生成流程的第一阶段（Outline Stage）。",
    "你的任务是根据章节知识点序列，生成 8-10 个 scene 的大纲。",
    "规则：",
    "1. scene-1 必须是 pre_test，覆盖本章所有 concepts 作为诊断",
    "2. 最后一个 scene 必须是 post_test，与 pre_test 形成对照",
    "3. 中间 scenes 按 concept 难度递增排列，每个 scene 锚定一个 concept",
    "4. modality 可选：narrative（讲解）、visual（图像）、symbolic（公式）、relational（关系图）、experiment（互动实验）",
    "5. 前测后第一个 scene 应是 concept_map（概念地图），建立全局认知",
    "6. 确保概念链连续：每个 scene 的 anchorConcept 应与前一个 scene 有逻辑衔接",
    "7. 每个 scene 必须带研究元数据：conceptClusterId、conceptClusterLabel、conceptClusterFocus、concepts、representation、scenarioType、difficultyBand。",
    "8. 同一知识点的不同学习场景必须共享同一个 conceptClusterId；representation/scenarioType 用于区分表达方式与学习任务。",
    "严格输出 JSON，不要添加其他内容。"
  ].join("\n");

  const user = [
    "章节 ID：" + kgChapter.id,
    "章节标题：" + kgChapter.title,
    "学习目标：" + (kgChapter.objective || ""),
    "知识点序列：" + (kgChapter.concepts || []).join(" → "),
    "",
    "请输出以下 JSON 格式：",
    '{"scenes":[{"sceneOrder":1,"role":"pre_test","anchorConcept":"...","modality":"assessment","visualAnchorType":"none","conceptClusterId":"...","conceptClusterLabel":"...","conceptClusterFocus":"...","concepts":["..."],"representation":"assessment","scenarioType":"diagnose","difficultyBand":"diagnostic"},...]}'
  ].join("\n");

  const result = await completeChat({ system, user, jsonHint: true, maxTokens: 800, model: GEN_MODEL });
  return safeParse(result) || { scenes: [], error: "outline_parse_failed", provider: result.provider };
}

// ── Stage 2: Visual Anchor ────────────────────────────────────────────
// For each scene, determine the best visual anchor type.
// EduIllustrate defines: coordinate_graph, geometric_diagram, dynamic_process, data_table, formula_block

async function generateVisualAnchor(scene, kgChapter) {
  const system = [
    "你是 EduIllustrate 第二阶段（Visual Anchor Stage）的设计师。",
    "为给定 scene 的锚定概念选择最合适的视觉锚点类型。",
    "类型可选：coordinate_graph（坐标图）、geometric_diagram（几何示意）、dynamic_process（动态过程）、data_table（数据表格）、formula_block（公式块）、none（无需视觉锚点）",
    "同时提供一句话的视觉描述，用于指导 Open MAIC 生成交互组件。",
    "严格输出 JSON。"
  ].join("\n");

  const user = [
    "章节：" + kgChapter.title,
    "Scene " + scene.sceneOrder + "，角色：" + scene.role,
    "锚定概念：" + scene.anchorConcept,
    "模态：" + scene.modality
  ].join("\n");

  const result = await completeChat({ system, user, jsonHint: true, maxTokens: 200, model: GEN_MODEL });
  return safeParse(result) || { visualAnchorType: "none", description: "", provider: result.provider };
}

// ── Stage 3: Scene Generation Prompt Builder ──────────────────────────
// Builds the standardized prompt for Open MAIC to generate a single scene.
// This is NOT an LLM call — it produces a prompt string that feeds into
// Open MAIC's generation pipeline.

function buildScenePrompt(scene, visualAnchor, kgChapter, prerequisiteConcepts) {
  const metadata = normaliseSceneMetadata(scene, kgChapter);
  var lines = [
    "## 课程生成指令（EduIllustrate 标准化）",
    "章节：" + kgChapter.title + "（" + kgChapter.id + "）",
    "学习目标：" + (kgChapter.objective || ""),
    "课程使用简体中文教学。数学专业术语采用中国高中数学标准译名。教学语气应专业且具启发性，鼓励12年级学生通过互动实验构建数学直觉。",
    "",
    "## 当前 Scene",
    "序号：" + scene.sceneOrder,
    "角色：" + scene.role,
    "锚定概念：" + scene.anchorConcept,
    "模态：" + scene.modality,
    "",
    "## Research metadata (must be copied into the generated scene JSON as top-level fields)",
    "conceptClusterId: " + metadata.conceptClusterId,
    "conceptClusterLabel: " + metadata.conceptClusterLabel,
    "conceptClusterFocus: " + metadata.conceptClusterFocus,
    "concepts: " + metadata.concepts.join(", "),
    "representation: " + metadata.representation,
    "scenarioType: " + metadata.scenarioType,
    "difficultyBand: " + metadata.difficultyBand,
    "Allowed representation values: " + REPRESENTATIONS.join(", "),
    "Allowed scenarioType values: " + SCENARIO_TYPES.join(", "),
    "Allowed difficultyBand values: " + DIFFICULTY_BANDS.join(", "),
    "",
    "## 视觉锚点",
    "类型：" + (visualAnchor.visualAnchorType || "none"),
    "描述：" + (visualAnchor.description || ""),
    "",
    "## 前置概念（学生应已掌握）",
    (prerequisiteConcepts || []).join("、") || "无",
    ""
  ];

  // Role-specific constraints
  if (scene.role === "pre_test") {
    lines.push("## 前测约束");
    lines.push("1. 4 道选择题（2 道单选 + 2 道多选），每题 20-30 分，总分 100");
    lines.push("2. 覆盖本章所有 concepts（每道题至少涉及 1 个 concept）");
    lines.push("3. 题目类型：2 道概念定义题 + 1 道图像判断题 + 1 道综合题");
    lines.push("4. 每道题必须有 analysis 字段（答案解析）");
    lines.push("5. 不泄露后测答案");
  } else if (scene.role === "post_test") {
    lines.push("## 后测约束");
    lines.push("1. 4-6 道题（3-4 道选择题 + 1-2 道简答题）");
    lines.push("2. 选择题与前测对照：前测考\"定义识别\"，后测考\"应用迁移\"");
    lines.push("3. 至少 1 道简答题（type: short_answer），必须有 analysis/commentPrompt/concepts/points 字段");
    lines.push("4. 简答题要求学生描述推理过程");
  } else if (scene.role === "formative_quiz") {
    lines.push("## 形成性测验约束");
    lines.push("1. 3-4 道题，聚焦\"过程理解\"而非最终答案");
    lines.push("2. 1 道预测题 + 1 道策略题 + 1 道概念辨析题");
    lines.push("3. 每题必须有 analysis 字段，不需要简答题");
  } else if (scene.role === "concept_map") {
    lines.push("## 概念地图约束");
    lines.push("1. 生成 slide 展示 concepts 之间的逻辑关系");
    lines.push("2. 开场用一句话回顾前测发现，引出本章学习路线");
    lines.push("3. 至少 5 个 teacherActions，逐步展示知识全景");
  } else if (scene.role === "experiment" || scene.modality === "experiment") {
    lines.push("## 互动场景 Widget 约束");
    lines.push("1. widgetConfig.type = simulation");
    lines.push("2. 至少 2 个可调参数（variables 数组长度 >= 2）");
    lines.push("3. 至少 1 个数值参数（带 min/max/default）+ 至少 1 个分类参数（带 options）");
    lines.push("4. 至少 3 个预设场景（presets），每个展示不同数学情况");
    lines.push("5. teacherActions 至少 4 步：speech 开场 -> highlight 指出控件 -> setState 演示 -> speech 启发提问");
    lines.push("6. widgetConfig.concept 用 snake_case 英文标识");
    lines.push("7. variable.label 用简体中文");
    lines.push("8. description 一句话说明交互目的");
    lines.push("9. 数学公式用 LaTeX 语法");
  } else if (scene.role === "lecture" || scene.role === "formula_bridge" || scene.role === "recap") {
    lines.push("## 讲解场景约束");
    lines.push("1. 生成 slide，包含讲解文字 + 关键公式或图像");
    lines.push("2. 至少 5 个 teacherActions，逐步讲解");
    lines.push("3. 开头一句话承接上一个 scene 的核心发现");
  }

  // Sequential Anchoring
  lines.push("");
  lines.push("## Scene 衔接约束");
  if (scene.sceneOrder === 1) {
    lines.push("不需要承接，直接进入测试");
  } else {
    lines.push("开场用一句话回顾上一个 scene 的核心发现，引出本 scene");
    lines.push("衔接语模板：刚才我们通过{previous_scene_type}了解了{previous_concept}，现在让我们{current_action}");
  }

  return lines.join("\n");
}

// ── Stage 4: Assembly + Sequential Anchoring Check ────────────────────
// After all scenes are generated, verify concept-chain continuity.
// This is an LLM-as-judge step inspired by EduIllustrate's quality rubric.

async function assembleChapter(outline, generatedScenes) {
  const system = [
    "你是 EduIllustrate 第四阶段（Assembly + Sequential Anchoring）的质量检查员。",
    "检查生成的课件序列是否存在以下问题：",
    "1. 概念断裂：scene-N 的结尾概念在 scene-(N+1) 的开头没有承接",
    "2. 前测覆盖缺失：pre_test 的题目没有覆盖所有互动 scene 的知识点",
    "3. 难度跳跃：相邻 scene 的难度差异过大",
    "4. 模态同质：连续 3 个以上 scene 使用相同模态",
    "5. 后测缺失对照：post_test 没有与前测对应的题目",
    "严格输出 JSON。"
  ].join("\n");

  const sceneSummaries = (generatedScenes || []).map(s => {
    return "Scene " + s.sceneOrder + " [" + s.role + "/" + s.modality + "]: " +
      "概念=" + s.anchorConcept + ", 交互参数=" + (s.paramCount || 0) + ", 题目数=" + (s.questionCount || 0);
  }).join("\n");

  const user = [
    "大纲场景数：" + (outline.scenes || []).length,
    "已生成场景数：" + (generatedScenes || []).length,
    "",
    "## 场景摘要",
    sceneSummaries,
    "",
    "请输出：",
    '{"gapReport":[{"type":"concept_gap","sceneFrom":N,"sceneTo":N,"detail":"..."}],' +
    '"suggestions":["..."],"qualityScore":0.0-1.0,"pass":true|false}'
  ].join("\n");

  const result = await completeChat({ system, user, jsonHint: true, maxTokens: 600, model: GEN_MODEL });
  return safeParse(result) || { gapReport: [], suggestions: ["assembly_parse_failed"], qualityScore: 0, pass: false, provider: result.provider };
}

// ── 8-Dimension Quality Rubric (from EduIllustrate) ───────────────────

const QUALITY_DIMENSIONS = [
  "concept_accuracy",        // 概念准确性
  "visual_text_alignment",   // 图文一致性
  "interaction_usability",   // 交互可用性
  "knowledge_chain_contin",  // 知识链连续性
  "pretest_coverage",        // 前后测覆盖度
  "difficulty_gradient",     // 难度梯度
  "language_style",          // 语言风格
  "accessibility"            // 无障碍性
];

// ── Helpers ───────────────────────────────────────────────────────────

function safeParse(result) {
  if (!result || !result.text) return null;
  try {
    const match = result.text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return null;
}

module.exports = {
  generateCourseOutline,
  generateVisualAnchor,
  buildScenePrompt,
  attachSceneMetadata,
  normaliseSceneMetadata,
  assembleChapter,
  QUALITY_DIMENSIONS
};
