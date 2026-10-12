"use strict";

const legacyV3 = require("./archive/v14-c3-v3");
const VERSION = "v14-c3-retention-v4";
// Reuse reviewed mathematical tasks, not the old three-stage sequence.
const selection = [
  ["retention", 0, "c"],
  ["retention", 1, "b"],
  ["retention", 2, "a"],
  ["retention", 3, "a"],
  ["retention", 4, "c"],
  ["representation_transfer", 1, "c"],
  ["near_transfer", 4, "b"]
];
const items = selection.map(([stage, index, answer], position) => {
  const source = legacyV3.publicStage(stage).items[index];
  return {
    ...source, id: `V14-C3-DR-r4-${String(position + 1).padStart(2, "0")}`,
    sourceItemId: source.id, cognitiveProcess: `延迟保持：${source.cognitiveProcess}`, answer
  };
});

function publicStage(stageId) {
  if (stageId !== "retention") return null;
  return {
    id: "retention", label: "保持测量",
    purpose: "后测提交满三天后，独立检查本章七个知识点的保持情况。",
    itemCount: items.length, agentAssistanceAllowed: false,
    feedbackPolicy: "acknowledgement_only",
    items: items.map(({ answer, ...item }) => structuredClone(item))
  };
}

function sanitizeResponses(stageId, responses = {}, options = {}) {
  if (stageId !== "retention" || !responses || typeof responses !== "object" || Array.isArray(responses)) return null;
  if (Object.keys(responses).some((id) => !items.some((item) => item.id === id))) return null;
  const clean = {};
  for (const item of items) {
    const value = String(responses[item.id] || "").trim();
    if (!value) continue;
    if (!item.options.some((option) => option.value === value)) return null;
    clean[item.id] = value;
  }
  return options.requireComplete && Object.keys(clean).length !== items.length ? null : clean;
}

function grade(stageId, responses) {
  const clean = sanitizeResponses(stageId, responses, { requireComplete: true });
  if (!clean) return null;
  const results = items.map((item) => ({
    itemId: item.id, constructId: item.constructId, knowledgePointId: item.knowledgePointId,
    cognitiveProcess: item.cognitiveProcess, response: clean[item.id],
    correct: clean[item.id] === item.answer, score: clean[item.id] === item.answer ? 1 : 0, maxScore: 1
  }));
  const score = results.reduce((sum, result) => sum + result.score, 0);
  return { stageId, score, maxScore: items.length, accuracy: score / items.length, results };
}

const current = Object.freeze({
  chapterId: "V14-C3", version: VERSION, stageIds: Object.freeze(["retention"]),
  publicStage, sanitizeResponses, grade,
  forVersion(version = VERSION) {
    return version === VERSION ? current : legacyV3.forVersion(version);
  }
});
module.exports = current;
