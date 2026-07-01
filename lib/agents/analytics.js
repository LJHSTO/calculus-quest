function evaluate({ events, timeOnUnit, paramChanges, evidence }) {
  events = events || [];
  const totalEvents = events.length;
  const currentEvidence = evidence?.current || {};
  const totalTime = timeOnUnit || Math.round((currentEvidence.dwellMs || 0) / 1000) || 0;
  const totalParams = paramChanges || currentEvidence.parameterChangeCount || 0;
  const friction = Number(currentEvidence.frictionScore || 0);
  const evidenceEngagement = Number(currentEvidence.engagementScore || 0);

  const engagementScore = Math.min(1, (
    Math.min(1, totalEvents / 50) * 0.3 +
    Math.min(1, totalTime / 600) * 0.4 +
    Math.min(1, totalParams / 10) * 0.2 +
    evidenceEngagement * 0.1
  ));

  let riskLevel = "low";
  if (currentEvidence.riskLevel) riskLevel = currentEvidence.riskLevel;
  else if (totalEvents < 5 && totalTime < 60) riskLevel = "high";
  else if (totalEvents < 15 && totalTime < 180) riskLevel = "medium";
  if (friction >= 0.65) riskLevel = "high";
  else if (friction >= 0.35 && riskLevel === "low") riskLevel = "medium";

  const depthScore = Math.min(1, totalParams / 15);

  const modalities = {};
  events.forEach(e => {
    const mod = e?.payload?.moduleRole || e?.moduleRole || "unknown";
    modalities[mod] = (modalities[mod] || 0) + 1;
  });
  const sorted = Object.entries(modalities).sort((a, b) => b[1] - a[1]);
  const modalityPreference = sorted[0]?.[0] || "visual";

  return {
    engagementScore: +engagementScore.toFixed(3),
    riskLevel,
    depthScore: +depthScore.toFixed(3),
    modalityPreference,
    suggestedMove: currentEvidence.suggestedMove || "continue",
    frictionScore: +friction.toFixed(3)
  };
}

module.exports = { evaluate };
