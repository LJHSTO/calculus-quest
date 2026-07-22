const fs = require("fs");
const path = require("path");

const DEFAULT_ROUTE_PATH = path.join("data", "multi-scene-learning-route.json");
const DEFAULT_GRAPH_PATH = path.join("data", "knowledge-graph.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function routePath(rootDir = process.cwd()) {
  return path.join(rootDir, DEFAULT_ROUTE_PATH);
}

function graphPath(rootDir = process.cwd()) {
  return path.join(rootDir, DEFAULT_GRAPH_PATH);
}

function loadRoute(rootDir = process.cwd()) {
  return readJson(routePath(rootDir));
}

function formativeMidpointIndex(chapter = {}, knowledgePoints = []) {
  if (!knowledgePoints.length) return 0;
  const fallback = Math.max(1, Math.ceil(knowledgePoints.length / 2));
  const boundaries = [];
  let seen = 0;
  (chapter.modules || []).forEach((module) => {
    seen += (module.knowledgePoints || []).length;
    if (seen > 0 && seen < knowledgePoints.length) boundaries.push(seen);
  });
  if (!boundaries.length) return fallback;
  return boundaries.reduce((best, next) => (
    Math.abs(next - fallback) < Math.abs(best - fallback) ? next : best
  ), boundaries[0]);
}

function quizKnowledgePointIds(chapter = {}, phase = "pre") {
  const flowKey = phase === "pre" ? "preQuiz" : phase === "post" ? "postQuiz" : "formativeQuiz";
  const ids = new Set();
  (chapter.flow?.[flowKey]?.questions || []).forEach((question) => {
    (question.knowledgePointIds || question.knowledge_point_ids || []).forEach((id) => id && ids.add(id));
  });
  return [...ids];
}

function quizUnit(chapter, phase, order) {
  const role = phase === "pre" ? "pre_test" : phase === "post" ? "post_test" : "formative_quiz";
  const label = phase === "pre" ? "知识前测" : phase === "post" ? "结业后测" : "形成测验";
  return {
    id: `${chapter.id}-${phase}`,
    kind: "unit",
    chapterId: chapter.id,
    order,
    type: "quiz",
    title: `${chapter.title} · ${label}`,
    role,
    modality: "assessment",
    representation: "assessment",
    scenarioType: phase === "pre" ? "diagnose" : phase === "post" ? "transfer" : "check",
    difficultyBand: phase === "pre" ? "diagnostic" : phase === "post" ? "transfer" : "core",
    flowKind: "core",
    conceptClusterId: chapter.id,
    conceptClusterLabel: chapter.title,
    assessedKnowledgePointIds: quizKnowledgePointIds(chapter, phase),
    isCheckpoint: true,
    isOptional: false
  };
}

function compactResourceCandidate(candidate = {}) {
  return {
    root: candidate.root || "",
    file: candidate.file || "",
    title: candidate.title || "",
    type: candidate.type || "",
    widgetType: candidate.widgetType || "",
    score: Number(candidate.score || 0)
  };
}

function knowledgeUnit(chapter, module, knowledgePoint, order) {
  const resources = (knowledgePoint.resourceCandidates || [])
    .filter((candidate) => candidate?.root && candidate?.file)
    .map(compactResourceCandidate);
  const modalities = [...new Set(resources.flatMap((candidate) => [candidate.type, candidate.widgetType]).filter(Boolean))];
  return {
    id: knowledgePoint.id,
    kind: "unit",
    chapterId: chapter.id,
    moduleId: module.id,
    moduleTitle: module.title,
    order,
    type: "knowledge",
    title: knowledgePoint.name,
    role: "knowledge",
    modality: modalities.length > 1 ? "multimodal" : modalities[0] || "interactive",
    modalities,
    representation: "mixed",
    scenarioType: chapter.extension ? "extend" : "student_choice",
    difficultyBand: chapter.extension ? "extension" : "core",
    flowKind: chapter.extension ? "extension" : "core",
    conceptClusterId: module.id,
    conceptClusterLabel: module.title,
    conceptClusterFocus: module.coreQuestion || knowledgePoint.goal || "",
    concepts: [knowledgePoint.id, knowledgePoint.name, knowledgePoint.goal].filter(Boolean),
    misconception: knowledgePoint.misconception || "",
    resourceCandidates: resources,
    isCheckpoint: false,
    isOptional: Boolean(chapter.extension)
  };
}

function routeUnits(chapter = {}) {
  const flattened = (chapter.modules || []).flatMap((module) => (
    (module.knowledgePoints || []).map((knowledgePoint) => ({ module, knowledgePoint }))
  ));
  const midpoint = formativeMidpointIndex(chapter, flattened);
  const units = [];
  let order = 1;
  units.push(quizUnit(chapter, "pre", order++));
  flattened.forEach((entry, index) => {
    if (index === midpoint) units.push(quizUnit(chapter, "formative", order++));
    units.push(knowledgeUnit(chapter, entry.module, entry.knowledgePoint, order++));
  });
  if (flattened.length <= midpoint) units.push(quizUnit(chapter, "formative", order++));
  units.push(quizUnit(chapter, "post", order++));
  return units;
}

function buildKnowledgeGraph(route) {
  const chapters = (route.chapters || []).map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    objective: chapter.summary || "",
    order: Number(chapter.order || 0),
    track: chapter.track || (chapter.extension ? "extension" : "main"),
    extension: Boolean(chapter.extension),
    recommendedAfter: chapter.recommendedAfter || "",
    moduleIds: (chapter.modules || []).map((module) => module.id),
    concepts: (chapter.modules || []).flatMap((module) => (
      (module.knowledgePoints || []).map((knowledgePoint) => knowledgePoint.name)
    ))
  }));
  const chapterNodes = chapters.map((chapter) => ({
    ...chapter,
    kind: "chapter",
    chapterId: chapter.id,
    label: chapter.title,
    sceneCount: routeUnits((route.chapters || []).find((item) => item.id === chapter.id)).length
  }));
  const unitNodes = (route.chapters || []).flatMap(routeUnits);
  const edges = [];

  (route.chapters || []).forEach((chapter) => {
    const units = unitNodes.filter((unit) => unit.chapterId === chapter.id).sort((a, b) => a.order - b.order);
    units.forEach((unit) => edges.push({ from: chapter.id, to: unit.id, kind: "contains", scope: "chapter" }));
    for (let index = 0; index < units.length - 1; index += 1) {
      edges.push({ from: units[index].id, to: units[index + 1].id, kind: "follows", scope: "unit" });
    }
    units.filter((unit) => unit.type === "quiz").forEach((quiz) => {
      quiz.assessedKnowledgePointIds.forEach((knowledgePointId) => {
        edges.push({ from: quiz.id, to: knowledgePointId, kind: "assesses", scope: "unit" });
      });
    });
  });

  const mainChapters = chapters.filter((chapter) => !chapter.extension).sort((a, b) => a.order - b.order);
  for (let index = 0; index < mainChapters.length - 1; index += 1) {
    const from = mainChapters[index];
    const to = mainChapters[index + 1];
    edges.push({ from: from.id, to: to.id, kind: "prerequisite", scope: "chapter" });
    const fromUnits = unitNodes.filter((unit) => unit.chapterId === from.id).sort((a, b) => a.order - b.order);
    const toUnits = unitNodes.filter((unit) => unit.chapterId === to.id).sort((a, b) => a.order - b.order);
    edges.push({ from: fromUnits.at(-1).id, to: toUnits[0].id, kind: "chapter_handoff", scope: "unit" });
  }

  chapters.filter((chapter) => chapter.extension && chapter.recommendedAfter).forEach((chapter) => {
    edges.push({ from: chapter.recommendedAfter, to: chapter.id, kind: "extension", scope: "chapter" });
  });

  return {
    schemaVersion: "2.0.0",
    generatedAt: route.generatedAt || route.versionId || "multi-scene-learning-route",
    source: DEFAULT_ROUTE_PATH.replace(/\\/g, "/"),
    sourceVersion: route.versionId || route.schemaVersion || "multi-scene-learning-route",
    description: "由多场景自适应学习路线自动生成的学习规划知识图谱。",
    nodeKinds: ["chapter", "unit"],
    edgeKinds: ["contains", "follows", "prerequisite", "chapter_handoff", "extension", "assesses"],
    roleKinds: ["pre_test", "knowledge", "formative_quiz", "post_test"],
    modalityKinds: ["assessment", "multimodal", "interactive"],
    chapters,
    chapterOrder: chapters.map((chapter) => chapter.id),
    nodes: [...chapterNodes, ...unitNodes],
    edges
  };
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  values.forEach((value) => seen.has(value) ? repeated.add(value) : seen.add(value));
  return [...repeated];
}

function validateKnowledgeGraph(route, graph, { rootDir = process.cwd(), checkResources = true } = {}) {
  const expectedChapters = (route.chapters || []).map((chapter) => chapter.id);
  const expectedUnits = (route.chapters || []).flatMap(routeUnits).map((unit) => unit.id);
  const actualChapters = (graph.chapters || []).map((chapter) => chapter.id);
  const actualUnits = (graph.nodes || []).filter((node) => node.kind === "unit").map((node) => node.id);
  const nodeIds = new Set((graph.nodes || []).map((node) => node.id));
  const missingChapters = expectedChapters.filter((id) => !actualChapters.includes(id));
  const unexpectedChapters = actualChapters.filter((id) => !expectedChapters.includes(id));
  const missingUnits = expectedUnits.filter((id) => !actualUnits.includes(id));
  const unexpectedUnits = actualUnits.filter((id) => !expectedUnits.includes(id));
  const duplicateNodeIds = duplicates((graph.nodes || []).map((node) => node.id));
  const danglingEdges = (graph.edges || []).filter((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to));
  const missingResources = [];

  if (checkResources) {
    (graph.nodes || []).filter((node) => node.kind === "unit").forEach((node) => {
      (node.resourceCandidates || []).forEach((candidate) => {
        const resource = path.join(rootDir, "resources", candidate.root, candidate.file);
        if (!fs.existsSync(resource)) missingResources.push({ unitId: node.id, resource: path.relative(rootDir, resource) });
      });
    });
  }

  const errors = [];
  if (missingChapters.length || unexpectedChapters.length) errors.push("chapter_id_mismatch");
  if (missingUnits.length || unexpectedUnits.length) errors.push("unit_id_mismatch");
  if (duplicateNodeIds.length) errors.push("duplicate_node_id");
  if (danglingEdges.length) errors.push("dangling_edge");
  if (missingResources.length) errors.push("missing_resource");
  return {
    ok: errors.length === 0,
    code: errors.length ? "kg_route_mismatch" : "ok",
    errors,
    coverage: {
      chapters: expectedChapters.length ? (expectedChapters.length - missingChapters.length) / expectedChapters.length : 1,
      units: expectedUnits.length ? (expectedUnits.length - missingUnits.length) / expectedUnits.length : 1
    },
    counts: {
      expectedChapters: expectedChapters.length,
      actualChapters: actualChapters.length,
      expectedUnits: expectedUnits.length,
      actualUnits: actualUnits.length,
      edges: (graph.edges || []).length,
      resources: (graph.nodes || []).reduce((sum, node) => sum + (node.resourceCandidates || []).length, 0)
    },
    missingChapters,
    unexpectedChapters,
    missingUnits,
    unexpectedUnits,
    duplicateNodeIds,
    danglingEdges,
    missingResources
  };
}

function assertKnowledgeGraph(route, graph, options) {
  const report = validateKnowledgeGraph(route, graph, options);
  if (!report.ok) {
    const error = new Error(`kg_route_mismatch: ${report.errors.join(", ")}`);
    error.code = "kg_route_mismatch";
    error.report = report;
    throw error;
  }
  return report;
}

function writeKnowledgeGraph(rootDir = process.cwd()) {
  const route = loadRoute(rootDir);
  const graph = buildKnowledgeGraph(route);
  const report = assertKnowledgeGraph(route, graph, { rootDir });
  fs.writeFileSync(graphPath(rootDir), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  return { graph, report, file: graphPath(rootDir) };
}

module.exports = {
  DEFAULT_ROUTE_PATH,
  DEFAULT_GRAPH_PATH,
  loadRoute,
  routeUnits,
  buildKnowledgeGraph,
  validateKnowledgeGraph,
  assertKnowledgeGraph,
  writeKnowledgeGraph
};
