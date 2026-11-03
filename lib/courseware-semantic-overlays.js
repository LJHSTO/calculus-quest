"use strict";

const exploration = require("../resources/open-maic/主动探索证据/exploration-model");
const freeExploration = require("../resources/open-maic/主动探索证据/free-exploration");

// 自由探索只记录观察，不把已撤下的附加练习声明为课件能力。
function applyExploration(contract, pointId, sceneType) {
  if (!exploration.get(pointId, sceneType)) return contract;
  if (contract.concept_exploration) {
    contract.evidence_events=contract.evidence_events.filter(e=>!["attempt_submitted","challenge_result","task_progress"].includes(e));
    Object.assign(contract.capabilities,{reports_attempt:false,reports_challenge:false,judges_correctness:false});
  }
  contract.contract_revision = 'free-observation-no-injected-support-20261102-v1';
  contract.evidence_events = [...new Set([...contract.evidence_events, "exploration_observed"])];
  contract.free_exploration = {
    version: freeExploration.version, role: "observation_not_need_or_mastery"
  };
  delete contract.concept_exploration;
  contract.assessment_restrictions.independent_evidence_allowed = false;
  return contract;
}

module.exports = { applyExploration };
