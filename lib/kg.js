const fs = require("fs");
const path = require("path");
const { loadRoute, assertKnowledgeGraph } = require("./kg-build");

let cache = null;
let cacheMtime = 0;
let routeMtime = 0;

function load() {
  const file = path.join(process.cwd(), "data", "knowledge-graph.json");
  const routeFile = path.join(process.cwd(), "data", "openmaic-v14-route.json");
  const stat = fs.statSync(file);
  const routeStat = fs.statSync(routeFile);
  if (cache && stat.mtimeMs === cacheMtime && routeStat.mtimeMs === routeMtime) return cache;
  const graph = JSON.parse(fs.readFileSync(file, "utf8"));
  assertKnowledgeGraph(loadRoute(process.cwd()), graph, { rootDir: process.cwd() });
  cache = graph;
  cacheMtime = stat.mtimeMs;
  routeMtime = routeStat.mtimeMs;
  return cache;
}

function getKg() { return load(); }

function nodeById(id) {
  return load().nodes.find((node) => node.id === id) || null;
}

function chapterById(id) {
  return load().chapters.find((chapter) => chapter.id === id) || null;
}

function unitsInChapter(chapterId) {
  return load().nodes.filter((node) => node.kind === "unit" && node.chapterId === chapterId)
    .sort((a, b) => a.order - b.order);
}

function outgoing(id, kind) {
  return load().edges.filter((edge) => edge.from === id && (!kind || edge.kind === kind));
}

function incoming(id, kind) {
  return load().edges.filter((edge) => edge.to === id && (!kind || edge.kind === kind));
}

// Skip closure: BFS along `follows` while the unit is not a checkpoint and not the post_test.
function skippableUnitsAfter(unitId, options = {}) {
  const stopAtRole = new Set(options.stopAtRoles || ["formative_quiz", "post_test"]);
  const stopBeforeRoles = new Set(options.stopBeforeRoles || ["recap"]);
  const limit = options.limit || 8;
  const out = [];
  const seen = new Set([unitId]);
  let frontier = [unitId];
  while (frontier.length && out.length < limit) {
    const next = [];
    for (const id of frontier) {
      for (const edge of outgoing(id, "follows")) {
        if (seen.has(edge.to)) continue;
        const node = nodeById(edge.to);
        if (!node) continue;
        if (stopAtRole.has(node.role)) {
          seen.add(node.id);
          continue;
        }
        if (stopBeforeRoles.has(node.role)) {
          seen.add(node.id);
          continue;
        }
        seen.add(node.id);
        out.push(node);
        next.push(node.id);
        if (out.length >= limit) break;
      }
      if (out.length >= limit) break;
    }
    frontier = next;
  }
  return out;
}

// Find alt-modality units for a given unit (one-hop alt_modality edges).
function altModalityUnitsFor(unitId, options = {}) {
  const limit = options.limit || 3;
  const out = [];
  const edges = outgoing(unitId, "alt_modality").concat(incoming(unitId, "alt_modality").map((edge) => ({ ...edge, from: edge.to, to: edge.from })));
  for (const edge of edges) {
    const node = nodeById(edge.to);
    if (node && out.length < limit && !out.find((existing) => existing.id === node.id)) {
      out.push(node);
    }
  }
  return out;
}

// Extension: from a chapter id, return up to one-hop extension chapters and their first scene.
function extensionUnitsForChapter(chapterId, options = {}) {
  const limit = options.limit || 2;
  const out = [];
  for (const edge of outgoing(chapterId, "extension")) {
    const chapter = chapterById(edge.to);
    if (!chapter) continue;
    const units = unitsInChapter(edge.to);
    const conceptMap = units.find((unit) => unit.role === "concept_map") || units[0];
    if (conceptMap) {
      out.push({ chapter, unit: conceptMap });
    }
    if (out.length >= limit) break;
  }
  return out;
}

// Aggregate quiz_results rows (one per question) into per-(chapter,phase) accuracy and per-concept miss counts.
function summariseQuizResults(results = []) {
  const byChapter = new Map();
  const wrongConcepts = new Map();
  results.forEach((row) => {
    const unitId = row.unit_id || row.unitId || "";
    const chapterId = row.chapter_id || row.chapterId || unitId.split("-scene-")[0];
    const phase = row.phase || "";
    if (!chapterId || !phase) return;
    const rawCorrect = row.is_correct ?? row.isCorrect;
    if (rawCorrect === null || rawCorrect === undefined) return;
    const isCorrect = rawCorrect === true ? 1 : rawCorrect === false ? 0 : Number(rawCorrect);
    if (Number.isNaN(isCorrect) || isCorrect < 0) return; // short_answer without grading
    const key = chapterId + "::" + phase;
    const item = byChapter.get(key) || { chapterId, phase, correct: 0, total: 0 };
    item.correct += isCorrect ? 1 : 0;
    item.total += 1;
    byChapter.set(key, item);
    if (!isCorrect) {
      const tags = [];
      const addTags = (value) => {
        if (Array.isArray(value)) value.forEach((item) => item && tags.push(String(item)));
        else if (value) tags.push(String(value));
      };
      addTags(row.aiWeakConcepts || row.ai_weak_concepts);
      addTags(row.weakConcepts || row.weak_concepts);
      addTags(row.knowledgePointIds || row.knowledge_point_ids);
      addTags(row.concepts);
      if (!tags.length) tags.push(row.question_id || row.questionId || unitId || "unknown");
      Array.from(new Set(tags)).forEach((tag) => {
        const entry = wrongConcepts.get(tag) || { tag, count: 0 };
        entry.count += 1;
        wrongConcepts.set(tag, entry);
      });
    }
  });
  return {
    byChapter: Array.from(byChapter.values()).map((item) => ({
      ...item,
      accuracy: item.total ? item.correct / item.total : 0
    })),
    wrongConcepts: Array.from(wrongConcepts.values()).sort((a, b) => b.count - a.count)
  };
}

module.exports = {
  getKg,
  nodeById,
  chapterById,
  unitsInChapter,
  outgoing,
  incoming,
  skippableUnitsAfter,
  altModalityUnitsFor,
  extensionUnitsForChapter,
  summariseQuizResults
};
