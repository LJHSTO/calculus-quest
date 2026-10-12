"use strict";

/**
 * Representation choice: turning "which kind of activity should this learner do
 * next" into a first-class agent decision.
 *
 * Why this module exists
 * ----------------------
 * The platform already ranked scenes for the UI (app/main/scene-recommender.js),
 * but that ranking was never part of the proactive agent's decision loop: it did
 * not appear among the policy's candidate kinds, it was not gated by the policy's
 * thresholds, and — crucially — its recommendation was never paired with a
 * proximal outcome. So the system could not answer "was suggesting this activity
 * type better than staying put?".
 *
 * This module is the missing link. It produces, for one knowledge point:
 *   - the full candidate set with scores and reasons,
 *   - which activity types the learner has already experienced,
 *   - a recommended target and the reason for it,
 *   - a stable selection id so the choice can be paired with its outcome later.
 *
 * It is deliberately courseware-agnostic: it reads `resourceCandidates` from the
 * route and the learner's history, nothing else. Swapping the courseware changes
 * the data, not this code.
 */

const recommender = require("../../app/main/scene-recommender");

const CHOICE_VERSION = "representation-choice-v1";

function clean(value = "") {
  return String(value || "").trim();
}

/** Activity types the learner has actually opened for this knowledge point. */
function experiencedTypesFor({ history = [], knowledgePointId = "" } = {}) {
  const seen = new Set();
  for (const entry of Array.isArray(history) ? history : []) {
    if (!entry || typeof entry !== "object") continue;
    const entryPoint = clean(entry.knowledgePointId || entry.unitId);
    if (knowledgePointId && entryPoint && entryPoint !== knowledgePointId) continue;
    const type = recommender.normalizeType({ type: entry.sceneType || entry.type || entry.selectedType });
    if (type) seen.add(type);
  }
  return [...seen];
}

/**
 * Rank the activity types available for a knowledge point.
 *
 * @param {object}   options
 * @param {object}   options.knowledgePoint   route knowledge point (needs name/goal/misconception + resourceCandidates)
 * @param {string[]} options.experiencedTypes types already opened
 * @param {number}   options.masteryLevel     0..1, or null when unknown
 * @param {boolean}  options.reviewMode       true when the learner is revisiting
 */
function chooseRepresentation({
  knowledgePoint = {},
  experiencedTypes = [],
  masteryLevel = null,
  reviewMode = false
} = {}) {
  const candidates = Array.isArray(knowledgePoint.resourceCandidates)
    ? knowledgePoint.resourceCandidates
    : [];
  if (!candidates.length) return null;

  // scene-recommender only honours `experiencedTypes` in review mode; the agent
  // needs it always, because "you have not seen this kind of activity yet" is a
  // reason to suggest it during first learning too.
  const ranked = recommender.rank({
    knowledgePoint,
    candidates,
    masteryLevel,
    experiencedTypes,
    reviewMode: true
  });
  if (!ranked.ranked.length) return null;

  const experienced = new Set(experiencedTypes.map((type) => recommender.normalizeType({ type })).filter(Boolean));
  const options = ranked.ranked.map((entry) => ({
    typeId: entry.typeId,
    title: clean(entry.candidate?.title || entry.candidate?.file || entry.typeId),
    score: entry.score,
    reasons: entry.reasons,
    reasonLabels: entry.reasonLabels,
    experienced: experienced.has(entry.typeId)
  }));
  const unseen = options.filter((option) => !option.experienced);
  // Prefer an activity type the learner has not tried; among those, the highest
  // score wins. Only when everything has been tried does the plain ranking decide.
  const pool = unseen.length ? unseen : options;
  const target = pool.slice().sort((a, b) => b.score - a.score || a.typeId.localeCompare(b.typeId))[0];

  // Report the reason that actually decided the choice, not the highest-weighted
  // base reason. When the target won because it is unseen, saying
  // "definition_match" would mislabel the decision in the log and in analysis.
  const decisiveReasons = [];
  if (!target.experienced && experienced.size > 0) decisiveReasons.push("unseen_representation");
  if (target.experienced && unseen.length === 0) decisiveReasons.push("all_representations_experienced");
  for (const reason of target.reasons) {
    if (!decisiveReasons.includes(reason)) decisiveReasons.push(reason);
  }
  const decisiveReason = decisiveReasons[0] || "representation_choice";
  const decisiveLabel = recommender.reasonLabel(decisiveReason)
    || target.reasonLabels[0] || "";

  return {
    choiceVersion: CHOICE_VERSION,
    knowledgePointId: clean(knowledgePoint.id),
    conceptKind: ranked.conceptKind,
    masteryLevel: ranked.masteryLevel,
    available: options.map((option) => option.typeId),
    experienced: [...experienced],
    unseen: unseen.map((option) => option.typeId),
    candidates: options,
    targetTypeId: target.typeId,
    targetTitle: target.title,
    targetReasonCode: decisiveReason,
    targetReasonLabel: decisiveLabel,
    targetReasons: decisiveReasons,
    // Stable id so a decision can be joined to its proximal outcome in analysis.
    selectionId: [CHOICE_VERSION, clean(knowledgePoint.id), target.typeId, experienced.size].join(":")
  };
}

/** True when every available activity type has already been experienced. */
function representationsExhausted(choice) {
  return Boolean(choice) && choice.available.length > 0 && choice.unseen.length === 0;
}

module.exports = { chooseRepresentation, experiencedTypesFor, representationsExhausted, CHOICE_VERSION };
