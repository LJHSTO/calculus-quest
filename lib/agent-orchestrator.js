const coach = require("./agentic-coach");
const kg = require("./kg");
const grading = require("./agents/grading");
const assessment = require("./agents/assessment");
const analytics = require("./agents/analytics");
const planner = require("./agents/planner");
const qa = require("./agents/qa");

function enrichPlan(plan, assessResult, analyticsResult, interactionEvidence, plannerResult) {
  if (!plan || !plan.ok) return plan;
  const enriched = { ...plan };
  if (assessResult) {
    enriched.assessmentInsight = {
      masteryLevel: assessResult.masteryLevel,
      weakConcepts: assessResult.weakConcepts,
      suggestedAction: assessResult.suggestedAction,
      summary: assessResult.summary
    };
  }
  if (analyticsResult) {
    enriched.analyticsInsight = {
      engagementScore: analyticsResult.engagementScore,
      riskLevel: analyticsResult.riskLevel,
      depthScore: analyticsResult.depthScore,
      modalityPreference: analyticsResult.modalityPreference
    };
  }
  if (interactionEvidence?.current) {
    enriched.interactionInsight = {
      riskLevel: interactionEvidence.current.riskLevel,
      suggestedMove: interactionEvidence.current.suggestedMove,
      frictionScore: interactionEvidence.current.frictionScore,
      engagementScore: interactionEvidence.current.engagementScore,
      dwellMs: interactionEvidence.current.dwellMs,
      answerRevealCount: interactionEvidence.current.answerRevealCount,
      repeatCount: interactionEvidence.current.repeatCount
    };
  }
  if (plannerResult?.ok) {
    enriched.plannerInsight = {
      mode: plannerResult.mode,
      suggestedMove: plannerResult.suggestedMove,
      strategy: plannerResult.strategy,
      recommendedPath: plannerResult.recommendedPath,
      recommendedResource: plannerResult.recommendedResource,
      evidenceUsed: plannerResult.evidenceUsed
    };
    enriched.rankedResourceChoices = plannerResult.rankedResourceChoices || [];
  }
  return enriched;
}

function gradingEvidenceForDecision(results = []) {
  return (Array.isArray(results) ? results : [])
    .filter((result) => !grading.isUnavailableGradingResult(result));
}

async function orchestrate({ chapterId, currentUnitId, quizResults, quizQuestions, interactionEvents, interactionEvidence, studentName, completedUnitIds }) {
  const startTime = Date.now();
  const quizSummary = kg.summariseQuizResults(quizResults || []);

  const gradingResults = await grading.gradeShortAnswers(quizQuestions || []);
  const gradingEvidence = gradingEvidenceForDecision(gradingResults);

  const [assessResult, analyticsResult] = await Promise.all([
    assessment.analyze({ quizSummary, gradingResults: gradingEvidence, interactionEvents }),
    Promise.resolve(analytics.evaluate({
      events: interactionEvents || [],
      timeOnUnit: extractTimeOnUnit(interactionEvents) + Math.round((interactionEvidence?.current?.dwellMs || 0) / 1000),
      paramChanges: extractParamChanges(interactionEvents) + (interactionEvidence?.current?.parameterChangeCount || 0),
      evidence: interactionEvidence
    }))
  ]);

  const plan = coach.plan({ chapterId, currentUnitId, quizSummary });
  const plannerResult = planner.plan({
    chapterId,
    currentUnitId,
    assessment: assessResult,
    analyticsResult,
    interactionEvidence,
    quizSummary,
    completedUnitIds
  });
  const enrichedPlan = enrichPlan(plan, assessResult, analyticsResult, interactionEvidence, plannerResult);

  let narration = "";
  let llmProvider = "skip";
  try {
    const out = await coach.explain(enrichedPlan, {
      studentName: studentName || "同学",
      assessmentInsight: assessResult,
      gradingFeedback: gradingEvidence,
      interactionEvidence,
      plannerInsight: plannerResult
    });
    narration = out.narration;
    llmProvider = out.provider;
  } catch (err) {
    narration = "（AI 助教暂时离线，下面是基于规则的建议。）";
    llmProvider = "fallback";
  }

  const qaResult = qa.check(enrichedPlan, assessResult);
  const latencyMs = Date.now() - startTime;

  return {
    plan: enrichedPlan,
    narration,
    provider: llmProvider,
    gradingResults,
    gradingUnavailableCount: gradingResults.length - gradingEvidence.length,
    assessment: assessResult,
    analytics: analyticsResult,
    planner: plannerResult,
    interactionEvidence,
    qa: qaResult,
    latencyMs
  };
}

async function gradeOnly(questions) {
  return grading.gradeShortAnswers(questions);
}

function extractTimeOnUnit(events) {
  if (!Array.isArray(events) || !events.length) return 0;
  let total = 0;
  events.forEach(e => {
    const dur = e?.payload?.timing?.durationMs || e?.timing?.durationMs || 0;
    total += dur;
  });
  return Math.round(total / 1000);
}

function extractParamChanges(events) {
  if (!Array.isArray(events)) return 0;
  return events.filter(e => {
    const t = e?.payload?.eventType || e?.type || "";
    return t === "parameter_commit" || t === "parameter_change";
  }).length;
}

module.exports = { orchestrate, gradeOnly, _internals: { gradingEvidenceForDecision } };
