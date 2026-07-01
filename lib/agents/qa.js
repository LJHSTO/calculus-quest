function check(plan, assessment) {
  const issues = [];

  if (assessment?.suggestedAction === "remediate" && plan?.skipCandidates?.length > 0 && !plan?.remediationCandidates?.length) {
    issues.push("assessment_recommends_remediate_but_coach_only_offers_skip");
  }

  if (assessment?.masteryLevel >= 0.8 && plan?.remediationCandidates?.length > 0 && !plan?.skipCandidates?.length) {
    issues.push("high_mastery_but_only_remediation_offered");
  }

  if (assessment?.confidenceLevel < 0.3) {
    issues.push("low_assessment_confidence");
  }

  return { approved: issues.length === 0, issues };
}

module.exports = { check };
