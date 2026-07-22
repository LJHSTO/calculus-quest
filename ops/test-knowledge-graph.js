const assert = require("assert");
const path = require("path");
const { loadRoute, validateKnowledgeGraph } = require("../lib/kg-build");

const rootDir = path.resolve(__dirname, "..");
const route = loadRoute(rootDir);
const graph = require("../data/knowledge-graph.json");
const report = validateKnowledgeGraph(route, graph, { rootDir });

assert.equal(report.code, "ok", JSON.stringify(report, null, 2));
assert.equal(report.coverage.chapters, 1);
assert.equal(report.coverage.units, 1);

const brokenGraph = { ...graph, chapters: graph.chapters.filter((chapter) => chapter.id !== "V14-C1") };
const brokenReport = validateKnowledgeGraph(route, brokenGraph, { rootDir, checkResources: false });
assert.equal(brokenReport.ok, false);
assert.equal(brokenReport.code, "kg_route_mismatch");
assert.ok(brokenReport.errors.includes("chapter_id_mismatch"));

const coach = require("../lib/agentic-coach");
const planner = require("../lib/agents/planner");
const chapterId = "V14-C1";
const currentUnitId = "GH-01-K01";
const quizSummary = {
  byChapter: [
    { chapterId, phase: "pre", correct: 9, total: 10, accuracy: 0.9 },
    { chapterId, phase: "post", correct: 4, total: 10, accuracy: 0.4 }
  ],
  wrongConcepts: [{ tag: "GH-01-K01", count: 2 }]
};
const coachResult = coach.plan({ chapterId, currentUnitId, quizSummary });
assert.equal(coachResult.ok, true, JSON.stringify(coachResult, null, 2));
assert.ok(coachResult.skipCandidates.length > 0, "Coach should generate skip candidates from the pre-test result");
assert.ok(coachResult.remediationCandidates.length > 0, "Coach should generate remediation candidates from the post-test result");
const extensionResult = coach.plan({ chapterId: "V14-C3", currentUnitId: "V14-C3-post", quizSummary: { byChapter: [], wrongConcepts: [] } });
assert.equal(extensionResult.ok, true, JSON.stringify(extensionResult, null, 2));
assert.ok(extensionResult.extensionCandidates.length > 0, "Coach should generate an extension candidate from graph edges");

const plannerResult = planner.plan({
  chapterId,
  currentUnitId,
  assessment: { masteryLevel: 0.4, suggestedAction: "remediate", weakConcepts: [{ concept: "输入、输出" }] },
  analyticsResult: { riskLevel: "high", frictionScore: 0.8, engagementScore: 0.3 },
  interactionEvidence: { current: { suggestedMove: "alternate_scene", riskLevel: "high", frictionScore: 0.8 } },
  quizSummary,
  completedUnitIds: []
});
assert.equal(plannerResult.ok, true, JSON.stringify(plannerResult, null, 2));
assert.ok(plannerResult.rankedSceneChoices.length > 0, "Planner should rank route-compatible candidates");

console.log(JSON.stringify({
  ok: true,
  coverage: report.coverage,
  counts: report.counts,
  coach: {
    skip: coachResult.skipCandidates.length,
    remediate: coachResult.remediationCandidates.length,
    extension: extensionResult.extensionCandidates.length
  },
  plannerChoices: plannerResult.rankedSceneChoices.length
}, null, 2));
