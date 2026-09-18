"use strict";

const bank = require("../assessments/functions-limits-r1");

const expanded = require("../assessments/functions-limits-retention-r2");
const current = require("../assessments/functions-limits-retention-r3");
function createInstrument(version, rows) {
  const items = rows.map(({ row, id, knowledgePointId, subSkill }) => {
    const q = bank.question(row, id, knowledgePointId);
    return { id: q.id, prompt: q.question, question: q.question, type: "single",
      constructId: knowledgePointId, knowledgePointId, cognitiveProcess: "延迟保持", subSkill,
      options: q.options, answer: q.answer[0], maxScore: 1 };
  });
  function publicStage(stageId) {
    if (stageId !== "retention") return null;
    return { id: stageId, label: "保持测量", purpose: "后测提交满三天后，独立检查六个知识点的保持情况。",
      itemCount: items.length, agentAssistanceAllowed: false, feedbackPolicy: "acknowledgement_only",
      items: items.map(({ answer, ...q }) => structuredClone(q)) };
  }
  function sanitizeResponses(stageId, responses, { requireComplete = false } = {}) {
    if (stageId !== "retention" || !responses || typeof responses !== "object" || Array.isArray(responses)) return null;
    if (Object.keys(responses).some(id => !items.some(q => q.id === id))) return null;
    const clean = {};
    for (const q of items) {
      if (!responses[q.id]) continue;
      const value = String(responses[q.id]).trim();
      if (!q.options.some(o => o.value === value)) return null;
      clean[q.id] = value;
    }
    return requireComplete && Object.keys(clean).length !== items.length ? null : clean;
  }
  function grade(stageId, responses) {
    const clean = sanitizeResponses(stageId, responses, { requireComplete: true });
    if (!clean) return null;
    const results = items.map(q => ({ itemId: q.id, constructId: q.constructId,
      knowledgePointId: q.knowledgePointId, cognitiveProcess: q.cognitiveProcess,
      response: clean[q.id], correct: clean[q.id] === q.answer,
      score: clean[q.id] === q.answer ? 1 : 0, maxScore: 1 }));
    const score = results.reduce((n, q) => n + q.score, 0);
    return { stageId, score, maxScore: items.length, accuracy: score / items.length, results };
  }
  return Object.freeze({ chapterId: "V14-C1", version, stageIds: ["retention"], publicStage, sanitizeResponses, grade,
    forVersion(value = version) { return instruments[value] || null; } });
}
const instruments = {
  "functions-limits-retention-r1": createInstrument("functions-limits-retention-r1",
    bank.retention.map((row, i) => ({ row, id: `V14-C1-DR-r1-${i + 1}`,
      knowledgePointId: bank.ids[i], subSkill: "核心概念保持" }))),
  [expanded.version]: createInstrument(expanded.version, expanded.items),
  [current.version]: createInstrument(current.version, current.items)
};
module.exports = instruments[current.version];
