"use strict";
// Verify the wired courseware: scripts still parse, and each scene carries the
// markers its widget type requires.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const assert=require('node:assert/strict');
const resources=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1')
  .modules.flatMap(m=>m.knowledgePoints).flatMap(p=>p.resourceCandidates.filter(c=>c.type!=='slide'));
assert.equal(resources.length,24);

let scriptCount = 0;
let syntaxErrors = 0;
const rows = [];

  for (const resource of resources) {
    const dir=path.join(root,'resources',resource.root),name=resource.file;
    const html = fs.readFileSync(path.join(dir, name), "utf8");
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const type = (/\btype\s*=\s*["']([^"']+)["']/i.exec(match[1] || "") || [])[1] || "";
      if (/json|importmap|module/i.test(type)) continue;
      if (!match[2] || match[2].trim().length < 20) continue;
      scriptCount += 1;
      try {
        new Function(match[2]);
      } catch (error) {
        syntaxErrors += 1;
        console.log(`  SYNTAX ERROR ${name}: ${String(error.message).slice(0, 90)}`);
      }
    }

    const widgetType = resource.type;
    const markers = [];
    if (html.includes("functions-limits-visible-container")) markers.push("visible-container");
    if (html.includes("cq-attempt-submitted")) markers.push("attempt-submitted");
    if (html.includes("cq-challenge-result")) markers.push("challenge-result");
    if (html.includes("openmaic-semantic-contract")) markers.push("contract");
    if (html.includes("openmaic-storage-shim-v2")) markers.push("storage-shim");
    if (html.includes("openmaic-audit-repair-shim-v5")) markers.push("audit-repair");
    if (html.includes("openmaic-courseware-layout-runtime-v52")) markers.push("layout-runtime");
    if (html.includes('maic_learning_event')&&html.includes('challenge_result')) markers.push('learning-result');
    if (html.includes('CQNativeProgress')) markers.push('native-progress');
    if (html.includes('CQSimulationProgress')) markers.push('simulation-progress');

    const expected = ["contract", "learning-result", "native-progress"];
    if(widgetType==='simulation')expected.push('simulation-progress');
    const missing = expected.filter((marker) => !markers.includes(marker));

    rows.push({ name, widgetType, markers, missing });
  }

console.log(`\norder | widget          | markers                                        | missing`);
for (const row of rows) {
  console.log([
    row.name.slice(0, 2).padStart(5),
    row.widgetType.padEnd(15),
    row.markers.join(",").padEnd(46),
    row.missing.length ? `MISSING: ${row.missing.join(",")}` : "ok"
  ].join(" | "));
}

const incomplete = rows.filter((row) => row.missing.length);
console.log(`\nplain scripts parsed: ${scriptCount}, syntax errors: ${syntaxErrors}`);
console.log(`files: ${rows.length}, fully wired: ${rows.length - incomplete.length}, incomplete: ${incomplete.length}`);
if (syntaxErrors || incomplete.length) process.exitCode = 1;
