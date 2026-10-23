"use strict";

const bank = require("../assessments/functions-limits-r1");
const legacy = require("./v14-c3");
const expanded = require("../assessments/functions-limits-retention-r2");
const current = require("../assessments/functions-limits-retention-r3");
// 迁移题从 r2 的 18 题缩到 r3 的 12 题（每知识点 2 题），与后测同场次施测。
// 18 题会把一小时会话的测试段推到 25 分钟以上，学习段被压到不足 30 分钟，
// 而学习时间正是决策点产出的唯一来源。
const transfer = require("../assessments/functions-limits-transfer-r3");
const revisedTransfer = require("../assessments/functions-limits-transfer-r4");

// Stage descriptors. The factory used to hardcode "retention" in publicStage,
// sanitizeResponses and grade, so a second instrument could not be added without
// rewriting all three. Each stage now carries its own identity and cognitive
// process, which is also what makes the retention and transfer results
// distinguishable in the exported data.
const RETENTION_STAGE = Object.freeze({
  id: "retention",
  label: "保持测量",
  purpose: "后测提交满三天后，独立检查六个知识点的保持情况。",
  cognitiveProcess: "延迟保持",
  defaultSubSkill: "核心概念保持"
});
const TRANSFER_STAGE = Object.freeze({
  id: "transfer",
  label: "迁移测量",
  purpose: "通过情境应用题独立检查六个知识点，与常规后测分开计分。",
  cognitiveProcess: "近迁移",
  defaultSubSkill: "新情境迁移"
});

function createInstrument(version, stages) {
  const byStage = new Map(stages.map(({ rows, ...stage }) => [stage.id, {
    ...stage,
    items: rows.map(({ row, id, knowledgePointId, subSkill }) => {
      const q = bank.question(row, id, knowledgePointId);
      return {
        id: q.id, prompt: q.question, question: q.question, type: "single",
        constructId: knowledgePointId, knowledgePointId,
        cognitiveProcess: stage.cognitiveProcess,
        subSkill: subSkill || stage.defaultSubSkill,
        options: q.options, answer: q.answer[0], maxScore: 1
      };
    })
  }]));
  function publicStage(stageId) {
    const stage = byStage.get(stageId);
    if (!stage) return null;
    return {
      id: stage.id, label: stage.label, purpose: stage.purpose,
      itemCount: stage.items.length, agentAssistanceAllowed: false,
      feedbackPolicy: "acknowledgement_only",
      items: stage.items.map(({ answer, ...q }) => structuredClone(q))
    };
  }
  function sanitizeResponses(stageId, responses, { requireComplete = false } = {}) {
    const stage = byStage.get(stageId);
    if (!stage || !responses || typeof responses !== "object" || Array.isArray(responses)) return null;
    if (Object.keys(responses).some(id => !stage.items.some(q => q.id === id))) return null;
    const clean = {};
    for (const q of stage.items) {
      if (!responses[q.id]) continue;
      const value = String(responses[q.id]).trim();
      if (!q.options.some(o => o.value === value)) return null;
      clean[q.id] = value;
    }
    return requireComplete && Object.keys(clean).length !== stage.items.length ? null : clean;
  }
  function grade(stageId, responses) {
    const stage = byStage.get(stageId);
    if (!stage) return null;
    const clean = sanitizeResponses(stageId, responses, { requireComplete: true });
    if (!clean) return null;
    const results = stage.items.map(q => ({
      itemId: q.id, constructId: q.constructId,
      knowledgePointId: q.knowledgePointId, cognitiveProcess: q.cognitiveProcess,
      response: clean[q.id], correct: clean[q.id] === q.answer,
      score: clean[q.id] === q.answer ? 1 : 0, maxScore: 1
    }));
    const score = results.reduce((n, q) => n + q.score, 0);
    return { stageId, score, maxScore: stage.items.length, accuracy: score / stage.items.length, results };
  }
  return Object.freeze({
    chapterId: "V14-C1", version, stageIds: [...byStage.keys()],
    publicStage, sanitizeResponses, grade,
    forVersion(value = version) { return instruments[value] || legacy.forVersion(value); }
  });
}

const instruments = {
  "functions-limits-retention-r1": createInstrument("functions-limits-retention-r1", [
    {
      ...RETENTION_STAGE,
      rows: bank.retention.map((row, i) => ({
        row, id: `V14-C1-DR-r1-${i + 1}`,
        knowledgePointId: bank.ids[i], subSkill: "核心概念保持"
      }))
    }
  ]),
  [expanded.version]: createInstrument(expanded.version, [
    { ...RETENTION_STAGE, rows: expanded.items }
  ]),
  [current.version]: createInstrument(current.version, [
    { ...RETENTION_STAGE, rows: current.items },
    { ...TRANSFER_STAGE, rows: transfer.items }
  ]),
  "functions-limits-retention-r4": createInstrument("functions-limits-retention-r4", [
    { ...RETENTION_STAGE, rows: current.items },
    { ...TRANSFER_STAGE, rows: revisedTransfer.items }
  ])
};
module.exports = instruments["functions-limits-retention-r4"];
