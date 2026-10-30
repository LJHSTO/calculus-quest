"use strict";

/**
 * Derive what a courseware scene can actually do, from the scene's own code.
 *
 * The semantic contract used to declare `evidence_events` as prose: nothing checked
 * that a scene really emits them, so a contract could promise evidence the scene
 * never produces and the policy would wait forever. Everything here is read out of
 * the file, and the same module is used by the contract generator and by the
 * verification test, so the two cannot drift apart.
 */

const fs = require("node:fs");
const path = require("node:path");

// Event name -> what the scene must contain for the claim to be true.
// `null` means the platform's injected emitter produces it without scene code.
// Note the optional-chaining form: the wiring emits `recordHint?.(...)`, so a
// pattern requiring `recordHint(` directly would miss every wired scene.
const OPTIONAL_CALL = String.raw`\s*(?:\?\.)?\s*\(`;
const EVENT_REQUIREMENTS = Object.freeze({
  scene_entered: null,
  scene_completed: null,
  time_on_task: null,
  interaction_change: /emit\(\s*["']interaction_change["']|parameter_commit|parameter_changed/,
  hint_requested: new RegExp(`recordHint${OPTIONAL_CALL}`),
  reset_used: new RegExp(`recordReset${OPTIONAL_CALL}`),
  attempt_submitted: new RegExp(`recordAttempt${OPTIONAL_CALL}|recordChallenge${OPTIONAL_CALL}|emit\\(\\s*["']attempt_submitted["']`),
  challenge_result: new RegExp(`recordChallenge${OPTIONAL_CALL}|emit\\(\\s*["']challenge_result["']`),
  parameter_commit: /emit\(\s*["']parameter_commit["']/,
  task_progress: /emit\(\s*["']task_progress["']/,
  exploration_observed: /emit\(\s*["']exploration_observed["']/,
  independent_check_completed: new RegExp(`recordChallenge${OPTIONAL_CALL}`)
});

// Script bodies only: a bare mention inside widget-config JSON or an importmap is
// not code and must not count as evidence.
function scriptBodies(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs]) => {
      const type = (/\btype\s*=\s*["']([^"']+)["']/i.exec(attrs || "") || [])[1] || "";
      return !/json|importmap/i.test(type);
    })
    .map(([, , body]) => body)
    .join("\n");
}

function describeScene(html) {
  const code = scriptBodies(html);
  const controls = [];
  if (/<input[^>]+type=["']range["']/i.test(html)) controls.push("slider");
  if (/<input[^>]+type=["']number["']/i.test(html)) controls.push("number");
  if (/<select\b/i.test(html)) controls.push("select");
  if (/<button\b/i.test(html)) controls.push("button");
  if (/draggable|dragstart|pointerdown|touchstart/i.test(html)) controls.push("drag");
  if (/<canvas\b/i.test(html)) controls.push("canvas");

  const judgesCorrectness = /(?:const|let|var)\s+(?:isCorrect|allCorrect|is_correct|correct|passed|success)\s*=/
    .test(code);
  const reportsAttempt = new RegExp(`recordAttempt${OPTIONAL_CALL}|recordChallenge${OPTIONAL_CALL}`).test(code);
  const reportsChallenge = new RegExp(`recordChallenge${OPTIONAL_CALL}`).test(code);
  const reportsHint = new RegExp(`recordHint${OPTIONAL_CALL}`).test(code);
  const reportsReset = new RegExp(`recordReset${OPTIONAL_CALL}`).test(code);
  const usesWebgl = /WebGLRenderer|new\s+THREE\.|getContext\(["']webgl/i.test(code);
  const externalNetwork = /(?:src|href)\s*=\s*["']https?:\/\//i.test(html)
    || /from\s+["']https?:\/\//i.test(code)
    || /import\s*\(\s*["']https?:\/\//i.test(code);
  const keepsState = /localStorage|sessionStorage/.test(code);
  // The platform injects the emitter at serve time, so a scene that never touches
  // it still gets scene_entered / scene_completed / time_on_task.
  const declaredEvents = Object.entries(EVENT_REQUIREMENTS)
    .filter(([, requirement]) => requirement === null || requirement.test(code))
    .map(([event]) => event);

  return {
    controls: [...new Set(controls)],
    judgesCorrectness,
    reportsAttempt,
    reportsChallenge,
    reportsHint,
    reportsReset,
    usesWebgl,
    externalNetwork,
    keepsState,
    declaredEvents
  };
}

/** Events a contract claims that the scene's own code cannot produce. */
function unverifiableEvents(html, claimed = []) {
  const code = scriptBodies(html);
  return claimed.filter((event) => {
    const requirement = EVENT_REQUIREMENTS[event];
    if (requirement === undefined) return true; // unknown event name
    if (requirement === null) return false;
    return !requirement.test(code);
  });
}

function describeFile(file) {
  return describeScene(sourceWithLocalScripts(file));
}

// Read scripts referenced by the actual document; never execute or fetch them.
function sourceWithLocalScripts(file) {
  const html = fs.readFileSync(file, "utf8");
  const resourcesRoot = path.resolve(__dirname, "../resources") + path.sep;
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map(([, src]) => src).filter(src => !/^(?:[a-z]+:|\/)/i.test(src))
    .map(src => path.resolve(path.dirname(file), src.split(/[?#]/)[0]))
    .filter(target => target.startsWith(resourcesRoot) && fs.existsSync(target))
    .map(target => `<script>${fs.readFileSync(target, "utf8")}</script>`);
  return html + scripts.join("\n");
}

module.exports = { describeScene, describeFile, sourceWithLocalScripts, unverifiableEvents, EVENT_REQUIREMENTS };
