"use strict";
// Verify the wired courseware: scripts still parse, and each scene carries the
// markers its widget type requires.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dirs = [
  path.join(root, "resources", "open-maic", "GH-01-新课件v2", "interactive"),
  path.join(root, "resources", "open-maic", "GH-02-新课件v2", "interactive")
];

let scriptCount = 0;
let syntaxErrors = 0;
const rows = [];

for (const dir of dirs) {
  for (const name of fs.readdirSync(dir).sort()) {
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

    const widgetType = (/"widgetType"\s*:\s*"([^"]+)"/.exec(html) || [])[1]
      || (/"scene_type"\s*:\s*"([^"]+)"/.exec(html) || [])[1]
      || "?";
    const markers = [];
    if (html.includes("functions-limits-visible-container")) markers.push("visible-container");
    if (html.includes("cq-attempt-submitted")) markers.push("attempt-submitted");
    if (html.includes("cq-challenge-result")) markers.push("challenge-result");
    if (html.includes("openmaic-semantic-contract")) markers.push("contract");
    if (html.includes("openmaic-storage-shim-v2")) markers.push("storage-shim");
    if (html.includes("openmaic-audit-repair-shim-v5")) markers.push("audit-repair");
    if (html.includes("openmaic-courseware-layout-runtime-v52")) markers.push("layout-runtime");

    const expected = ["contract", "storage-shim", "audit-repair", "layout-runtime"];
    if (widgetType === "visualization3d") expected.push("visible-container");
    if (widgetType === "simulation" || widgetType === "mindMap" || widgetType === "diagram") {
      expected.push("attempt-submitted");
    }
    if (widgetType === "game") expected.push("challenge-result");
    const missing = expected.filter((marker) => !markers.includes(marker));

    rows.push({ name, widgetType, markers, missing });
  }
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
