"use strict";
// Contract honesty: every declared evidence_event must be producible by the
// scene's own code, and the independence claim must match the scene's ability to
// report hint usage.
const fs = require("node:fs");
const path = require("node:path");
const caps = require("../lib/courseware-scene-capabilities");

const root = path.join(__dirname, "..");
const dirs = [
  path.join(root, "resources", "open-maic", "GH-01-新课件v2", "interactive"),
  path.join(root, "resources", "open-maic", "GH-02-新课件v2", "interactive")
];

let problems = 0;
const rows = [];
for (const dir of dirs) {
  for (const name of fs.readdirSync(dir).sort()) {
    const html = fs.readFileSync(path.join(dir, name), "utf8");
    const raw = html.match(/id="openmaic-semantic-contract"[^>]*>([\s\S]*?)<\/script>/);
    if (!raw) {
      console.log(`  NO CONTRACT: ${name}`);
      problems += 1;
      continue;
    }
    const contract = JSON.parse(raw[1]);
    const unverifiable = caps.unverifiableEvents(html, contract.evidence_events);
    if (unverifiable.length) problems += 1;
    const restrictions = contract.assessment_restrictions || {};
    const facts = caps.describeScene(html);
    // An independence claim without hint reporting cannot be verified.
    if (restrictions.independent_evidence_allowed && !facts.reportsHint) {
      console.log(`  INDEPENDENCE UNVERIFIABLE: ${name}`);
      problems += 1;
    }
    if (!restrictions.independent_evidence_allowed && facts.judgesCorrectness && facts.reportsHint) {
      console.log(`  INDEPENDENCE WRONGLY WITHHELD: ${name}`);
      problems += 1;
    }
    rows.push({
      order: name.slice(0, 2),
      type: contract.capabilities?.widget_type || "?",
      events: contract.evidence_events.length,
      hint: facts.reportsHint ? "y" : "-",
      reset: facts.reportsReset ? "y" : "-",
      judges: facts.judgesCorrectness ? "y" : "-",
      indep: restrictions.independent_evidence_allowed ? "y" : "-",
      bad: unverifiable.join(",")
    });
  }
}

console.log("\norder | type            | events | hint reset judges indep | unverifiable");
for (const row of rows) {
  console.log([
    row.order.padStart(5),
    row.type.padEnd(15),
    String(row.events).padStart(6),
    `${row.hint.padStart(4)} ${row.reset.padStart(5)} ${row.judges.padStart(6)} ${row.indep.padStart(5)}`,
    row.bad || "none"
  ].join(" | "));
}
console.log(`\nfiles: ${rows.length}, independent-eligible: ${rows.filter(r => r.indep === "y").length}, problems: ${problems}`);
if (problems) process.exitCode = 1;
