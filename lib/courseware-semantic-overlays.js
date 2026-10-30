"use strict";

const exploration = require("../resources/open-maic/主动探索证据/exploration-model");
const freeExploration = require("../resources/open-maic/主动探索证据/free-exploration");

// Both the wiring command and the contract checker use the actual optional
// exploration model. Its attempts are process evidence, never independent mastery.
function applyExploration(contract, pointId, sceneType) {
  if (!exploration.get(pointId, sceneType)) return contract;
  contract.contract_revision = exploration.version;
  contract.evidence_events = [...new Set([...contract.evidence_events,
    "attempt_submitted", "challenge_result", "task_progress", "exploration_observed"])];
  Object.assign(contract.capabilities, {
    reports_attempt: true, reports_challenge: true, judges_correctness: true
  });
  contract.free_exploration = {
    version: freeExploration.version, role: "observation_not_need_or_mastery"
  };
  contract.concept_exploration = {
    version: exploration.version, optional: true,
    grading: "server_rechecked_process", independent: false
  };
  contract.assessment_restrictions.independent_evidence_allowed = false;
  return contract;
}

module.exports = { applyExploration };
