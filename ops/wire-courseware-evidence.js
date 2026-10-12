"use strict";

/**
 * Wire courseware scenes into the platform's learning-evidence pipeline.
 *
 * The evidence emitter itself is injected at serve time by the server
 * (see isCoursewareHtml in server.js) — it is NOT baked into the files. What a
 * scene must supply is the calls into that emitter, at the point where the
 * learner's action is actually judged. A freshly generated classroom has none of
 * them, which is why a new package loads but produces no usable evidence.
 *
 * Rules applied here, each idempotent via its own marker:
 *
 *   VISIBLE_CONTAINER   visualization3d
 *     The platform hosts courseware in a collapsible pane. While hidden the
 *     container is 0x0, so `container.clientWidth / clientHeight` is NaN and the
 *     WebGL renderer initialises against a zero-size canvas. Wait for a real
 *     viewport before building the scene.
 *
 *   ATTEMPT_SUBMITTED   simulation / diagram
 *     Report that the learner actually submitted something, so the policy has a
 *     proximal outcome to reason about. Games already report challenge results;
 *     these two types currently report nothing.
 *
 * Usage:
 *   node ops/wire-courseware-evidence.js [dir|file]... [--check]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");
const rewire = process.argv.includes("--rewire");
const explicit = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

// A previously inserted block, from its marker comment through the call statement.
// Used by --rewire to replace an earlier wiring shape (e.g. one that carried no
// correctness verdict) instead of being skipped by the idempotency marker.
const ATTEMPT_BLOCK = /^[ \t]*\/\/ cq-attempt-submitted:[\s\S]*?recordAttempt\?\.\(\{[^\n]*\}\);[ \t]*\n/gm;
const CHALLENGE_BLOCK = /^[ \t]*\/\/ cq-challenge-result:[\s\S]*?recordChallenge\?\.\(\{[\s\S]*?\}\);[ \t]*\n/gm;

const VISIBLE_CONTAINER_MARKER = "functions-limits-visible-container";
const ATTEMPT_MARKER = "cq-attempt-submitted";

// --- rule: visualization3d visible-container guard --------------------------
const CONTAINER_ANCHOR = /^([ \t]*)const container = document\.getElementById\(['"]canvas-container['"]\);[ \t]*$/m;

function visibleContainerGuard(indent) {
  return [
    `${indent}// ${VISIBLE_CONTAINER_MARKER}: hidden host panes have no initial viewport.`,
    `${indent}if (!container.clientWidth || !container.clientHeight) {`,
    `${indent}  await new Promise((resolve) => {`,
    `${indent}    const observer = new ResizeObserver(() => {`,
    `${indent}      if (container.clientWidth > 0 && container.clientHeight > 0) {`,
    `${indent}        observer.disconnect();`,
    `${indent}        resolve();`,
    `${indent}      }`,
    `${indent}    });`,
    `${indent}    observer.observe(container);`,
    `${indent}  });`,
    `${indent}}`
  ].join("\n");
}

// --- rule: game challenge results -------------------------------------------
// Games judge the learner, so they must report a challenge result rather than a
// bare attempt. The anchor is the function the game calls when a level is won;
// failure paths are not wired yet (see the report footer).
const CHALLENGE_MARKER = "cq-challenge-result";
const CHALLENGE_FUNCTION_NAMES = [
  "completeGame", "showWin", "showFinish", "showEndGame", "showResult",
  "levelComplete", "checkRound1Complete", "checkProgress", "finishGame", "winGame"
];

function challengeCall(indent, name) {
  return [
    `${indent}// ${CHALLENGE_MARKER}: the learner actually won this challenge.`,
    `${indent}// independent:false is required for this chapter — a game result is`,
    `${indent}// supporting behavioural evidence, never a mastery verdict.`,
    `${indent}window.OpenMaicLearningEvidence?.recordChallenge?.({`,
    `${indent}  challenge_id: ${JSON.stringify(name)} + '-' + (typeof level !== 'undefined' ? level : (typeof round !== 'undefined' ? round : 1)),`,
    `${indent}  is_correct: true,`,
    `${indent}  evidence_scope: 'courseware_challenge',`,
    `${indent}  independent: false`,
    `${indent}});`
  ].join("\n");
}
// Boolean correctness variables the generated scenes use. When one is in scope,
// the evidence call is placed at the END of the submit body so it can carry the
// verdict; the platform cannot use a result it cannot judge.
const CORRECTNESS_VARIABLES = ["isCorrect", "allCorrect", "is_correct", "correct", "passed", "success"];

/**
 * Index of the `}` closing the brace at `openIndex`. Skips strings, template
 * literals and comments so a brace inside one of those cannot end the body early.
 * Regex literals are not modelled; a mis-parse shows up as a syntax error, which
 * ops/test-courseware-evidence-wiring.js catches.
 */
function matchingBrace(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") { i = source.indexOf("\n", i); if (i < 0) return -1; continue; }
    if (ch === "/" && next === "*") { i = source.indexOf("*/", i); if (i < 0) return -1; i += 1; continue; }
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i += 1; i < source.length; i += 1) {
        if (source[i] === "\\") { i += 1; continue; }
        if (source[i] === ch) break;
      }
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Body range of the function whose opening line matched `anchor`. */
function functionBody(source, anchor) {
  const open = source.indexOf("{", anchor.index + anchor[0].length - 1);
  if (open < 0) return null;
  const close = matchingBrace(source, open);
  if (close < 0) return null;
  return { open, close, body: source.slice(open + 1, close) };
}

function correctnessVariableIn(body) {
  return CORRECTNESS_VARIABLES.find((name) => new RegExp(`(?:const|let|var)\\s+${name}\\s*=`).test(body));
}

// --- rule: hint / reset reporting -------------------------------------------
// This is not bookkeeping. recordAttempt derives `independent` from
// pendingHintCount === 0 && pendingResetCount === 0, so a scene that never calls
// recordHint/recordReset reports every attempt as independent — including
// attempts the learner made after taking hints. Without these two calls the
// platform's independence signal is permanently, silently true.
const HINT_MARKER = "cq-hint-requested";
const RESET_MARKER = "cq-reset-used";

const HINT_ANCHORS = [
  // Most scenes trigger hints from inline markup (`<button onclick="showHint()">`),
  // so the function definition is the reliable anchor, not the control id.
  /^([ \t]*)function\s+(showHint|showHelp|toggleHint)\s*\([^)]*\)\s*\{[ \t]*$/m,
  /^([ \t]*)document\.getElementById\(['"](?:hint|help)-btn['"]\)\.addEventListener\(['"]click['"],\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[ \t]*$/m
];
const RESET_ANCHORS = [
  /^([ \t]*)document\.getElementById\(['"]reset-btn['"]\)\.addEventListener\(['"]click['"],\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[ \t]*$/m,
  /^([ \t]*)function\s+(resetSimulation|reset|resetScene)\s*\([^)]*\)\s*\{[ \t]*$/m
];

function hintCall(indent) {
  return [
    `${indent}// ${HINT_MARKER}: the attempt after this is no longer independent.`,
    `${indent}window.OpenMaicLearningEvidence?.recordHint?.({ source: "scene_control" });`
  ].join("\n");
}

function resetCall(indent) {
  return [
    `${indent}// ${RESET_MARKER}: a restart means the next attempt is not independent.`,
    `${indent}window.OpenMaicLearningEvidence?.recordReset?.({ source: "scene_control" });`
  ].join("\n");
}

function applyFirstAnchor(source, anchors, call) {
  for (const anchor of anchors) {
    const match = anchor.exec(source);
    if (!match) continue;
    const indent = `${match[1]}  `;
    return { source: source.replace(anchor, (line) => `${line}\n${call(indent)}`), matched: true };
  }
  return { source, matched: false };
}

// --- rule: simulation / diagram attempt reporting ---------------------------
// Each scene names its submit path differently, so the anchor is the function
// that finalises a learner answer. The call is inserted as the first statement
// of that function's body, which fires exactly once per submission.
const ATTEMPT_FUNCTION_NAMES = [
  "submitPrediction", "submitAnswer", "handleSubmit", "makePrediction",
  "makeJudgment", "answerJudgment", "validate", "checkDropZone", "handleDrop",
  "takeStep", "checkSequence"
];

// Diagram scenes frequently have no named submit function: they wire the button
// inline. This is the anchor for those.
const SUBMIT_BUTTON_ANCHOR = /^([ \t]*)document\.getElementById\(['"]submit-btn['"]\)\.onclick\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[ \t]*$/m;

function functionBodyAnchor(name) {
  return new RegExp(`^([ \\t]*)(async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{[ \\t]*$`, "m");
}

function attemptCall(indent, name, widgetType, correctnessVariable = "") {
  const payload = [
    `task_id: ${JSON.stringify(name)}`,
    `scene_type: ${JSON.stringify(widgetType)}`,
    ...(correctnessVariable ? [`is_correct: ${correctnessVariable}`] : [])
  ].join(", ");
  return [
    `${indent}// ${ATTEMPT_MARKER}: report the learner's submission so the platform`,
    `${indent}// has a proximal outcome to reason about (see openmaic-learning-event-v2).`,
    `${indent}// \`independent\` is deliberately omitted: the emitter derives it from`,
    `${indent}// whether any hint or reset happened before this submission.`,
    ...(correctnessVariable ? [] : [
      `${indent}// This scene computes no correctness verdict, so the platform can record`,
      `${indent}// that an attempt happened but cannot treat it as independent evidence.`
    ]),
    `${indent}window.OpenMaicLearningEvidence?.recordAttempt?.({ ${payload} });`
  ].join("\n");
}

// The scene's own widget type. Diagram scenes carry no `widgetType` field at
// all — the injected semantic contract is the only place their type appears, and
// it spells it `mindMap` (the route's canonical name for a diagram).
function widgetTypeOf(html) {
  const fromConfig = /"widgetType"\s*:\s*"([^"]+)"/.exec(html)?.[1];
  if (fromConfig) return fromConfig;
  const fromContract = /"scene_type"\s*:\s*"([^"]+)"/.exec(html)?.[1];
  return fromContract || "";
}

function isDiagram(widgetType) {
  return widgetType === "diagram" || widgetType === "mindMap";
}

function collectTargets() {
  const roots = explicit.length ? explicit.map((t) => path.resolve(root, t)) : [path.join(root, "resources", "open-maic")];
  const files = [];
  const walk = (target) => {
    if (!fs.existsSync(target)) return;
    if (fs.statSync(target).isFile()) {
      if (target.toLowerCase().endsWith(".html")) files.push(target);
      return;
    }
    for (const name of fs.readdirSync(target)) walk(path.join(target, name));
  };
  roots.forEach(walk);
  return files.sort();
}

const targets = collectTargets();
if (!targets.length) {
  console.error("no courseware HTML found");
  process.exit(1);
}

const summary = { scanned: 0, changed: 0, rules: {}, unwired: [] };

for (const file of targets) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const source = fs.readFileSync(file, "utf8");
  const widgetType = widgetTypeOf(source);
  summary.scanned += 1;
  let next = rewire
    ? source.replace(ATTEMPT_BLOCK, "").replace(CHALLENGE_BLOCK, "")
    : source;
  const applied = [];

  // Rule 0: hint / reset reporting, for every scene that has such a control.
  if (!next.includes(HINT_MARKER)) {
    const wired = applyFirstAnchor(next, HINT_ANCHORS, hintCall);
    if (wired.matched) { next = wired.source; applied.push("hint-requested"); }
    else summary.unwired.push({ relative, rule: "hint-requested", reason: "no hint control handler" });
  }
  if (!next.includes(RESET_MARKER)) {
    const wired = applyFirstAnchor(next, RESET_ANCHORS, resetCall);
    if (wired.matched) { next = wired.source; applied.push("reset-used"); }
    else summary.unwired.push({ relative, rule: "reset-used", reason: "no reset control handler" });
  }

  // Rule 1: 3D visible-container guard.
  if (widgetType === "visualization3d" && !next.includes(VISIBLE_CONTAINER_MARKER)) {
    const match = CONTAINER_ANCHOR.exec(next);
    if (match) {
      const guard = visibleContainerGuard(match[1]);
      next = next.replace(CONTAINER_ANCHOR, (line) => `${line}\n${guard}`);
      applied.push("visible-container");
    } else {
      summary.unwired.push({ relative, rule: "visible-container", reason: "canvas-container anchor not found" });
    }
  }

  // Rule 2: attempt reporting for simulation / diagram.
  if ((widgetType === "simulation" || isDiagram(widgetType)) && !next.includes(ATTEMPT_MARKER)) {
    let wired = false;
    for (const name of ATTEMPT_FUNCTION_NAMES) {
      const re = functionBodyAnchor(name);
      const anchor = re.exec(next);
      if (!anchor) continue;
      const range = functionBody(next, anchor);
      if (!range) continue;
      const indent = `${anchor[1]}  `;
      const correctness = correctnessVariableIn(range.body);
      if (correctness) {
        // Place the call where the verdict exists: at the end of the body.
        const lineStart = next.lastIndexOf("\n", range.close) + 1;
        const closingIndent = /^[ \t]*/.exec(next.slice(lineStart, range.close))[0];
        const call = attemptCall(closingIndent, name, widgetType, correctness);
        next = `${next.slice(0, lineStart)}${call}\n${next.slice(lineStart)}`;
        applied.push(`attempt-submitted(${name}, is_correct:${correctness})`);
      } else {
        next = next.replace(re, (line) => `${line}\n${attemptCall(indent, name, widgetType)}`);
        applied.push(`attempt-submitted(${name})`);
      }
      wired = true;
      break;
    }
    if (!wired) {
      const buttonMatch = SUBMIT_BUTTON_ANCHOR.exec(next);
      if (buttonMatch) {
        const indent = `${buttonMatch[1]}  `;
        next = next.replace(SUBMIT_BUTTON_ANCHOR, (line) => `${line}\n${attemptCall(indent, "submit-btn", widgetType)}`);
        applied.push("attempt-submitted(submit-btn)");
        wired = true;
      }
    }
    if (!wired) {
      summary.unwired.push({
        relative,
        rule: "attempt-submitted",
        reason: `no submit function or #submit-btn handler: ${ATTEMPT_FUNCTION_NAMES.join(", ")}`
      });
    }
  }

  // Rule 3: game challenge results.
  if (widgetType === "game" && !next.includes(CHALLENGE_MARKER)) {
    let wired = false;
    for (const name of CHALLENGE_FUNCTION_NAMES) {
      const re = functionBodyAnchor(name);
      const match = re.exec(next);
      if (!match) continue;
      const indent = `${match[1]}  `;
      next = next.replace(re, (line) => `${line}\n${challengeCall(indent, name)}`);
      applied.push(`challenge-result(${name})`);
      wired = true;
      break;
    }
    if (!wired) {
      summary.unwired.push({
        relative,
        rule: "challenge-result",
        reason: `no win function found: ${CHALLENGE_FUNCTION_NAMES.join(", ")}`
      });
    }
  }

  if (applied.length || (rewire && next !== source)) {
    summary.changed += 1;
    for (const rule of applied) summary.rules[rule] = (summary.rules[rule] || 0) + 1;
    if (!checkOnly) fs.writeFileSync(file, next, "utf8");
    console.log(`${checkOnly ? "would wire" : "wired"} ${relative} [${applied.join(", ")}]`);
  }
}

console.log(`\n${checkOnly ? "CHECK" : "APPLY"} — scanned ${summary.scanned}, changed ${summary.changed}`);
console.log(`rules applied: ${JSON.stringify(summary.rules)}`);
if (summary.unwired.length) {
  console.log(`\nNOT wired (${summary.unwired.length}):`);
  for (const entry of summary.unwired) console.log(`  ${entry.relative} — ${entry.rule}: ${entry.reason}`);
}
