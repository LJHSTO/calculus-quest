"use strict";
// Measure how many of the 24 old-courseware scenes can produce usable evidence,
// and how many can serve as INDEPENDENT evidence.
//
// Independent evidence requires the scene to (a) judge correctness and (b) report
// hint/reset usage — without (b) the emitter stamps every attempt independent:true
// and an assisted attempt would be counted as unassisted.
const fs = require("node:fs");
const path = require("node:path");
const caps = require("../lib/courseware-scene-capabilities");

const root = path.join(__dirname, "..");
const route = JSON.parse(fs.readFileSync(path.join(root, "data", "multi-scene-learning-route.json"), "utf8"));
const chapter = route.chapters.find((c) => c.id === "V14-C1");

const rows = [];
for (const module of chapter.modules) {
  for (const point of module.knowledgePoints) {
    for (const candidate of point.resourceCandidates) {
      const file = path.join(root, "resources", candidate.root, candidate.file);
      if (!fs.existsSync(file)) {
        rows.push({ kp: point.id, type: candidate.widgetType, missing: true });
        continue;
      }
      const html = fs.readFileSync(file, "utf8");
      const facts = caps.describeScene(html);
      const contract = /id="openmaic-semantic-contract"[^>]*>([\s\S]*?)<\/script>/.exec(html);
      rows.push({
        kp: point.id,
        type: candidate.widgetType,
        judges: facts.judgesCorrectness,
        reportsChallenge: facts.reportsChallenge,
        reportsAttempt: facts.reportsAttempt,
        hint: facts.reportsHint,
        reset: facts.reportsReset,
        events: contract ? JSON.parse(contract[1]).evidence_events.length : 0,
        independent: facts.judgesCorrectness && facts.reportsHint
      });
    }
  }
}

console.log("kp          | type            | judges | challenge | attempt | hint | reset | events | independent");
for (const row of rows) {
  if (row.missing) { console.log(`  ${row.kp} ${row.type} MISSING`); continue; }
  console.log([
    row.kp.padEnd(11),
    row.type.padEnd(15),
    (row.judges ? "yes" : "-").padEnd(6),
    (row.reportsChallenge ? "yes" : "-").padEnd(9),
    (row.reportsAttempt ? "yes" : "-").padEnd(7),
    (row.hint ? "yes" : "-").padEnd(4),
    (row.reset ? "yes" : "-").padEnd(5),
    String(row.events).padStart(6),
    row.independent ? "YES" : "-"
  ].join(" | "));
}

const byType = new Map();
for (const row of rows) {
  if (row.missing) continue;
  const entry = byType.get(row.type) || { total: 0, judges: 0, challenge: 0, hint: 0, independent: 0 };
  entry.total += 1;
  if (row.judges) entry.judges += 1;
  if (row.reportsChallenge) entry.challenge += 1;
  if (row.hint) entry.hint += 1;
  if (row.independent) entry.independent += 1;
  byType.set(row.type, entry);
}

console.log("\n按活动类型：");
for (const [type, e] of byType) {
  console.log(`  ${type.padEnd(16)} ${e.total} 个 | 判定对错 ${e.judges} | 上报挑战 ${e.challenge} | 上报提示 ${e.hint} | 可作独立证据 ${e.independent}`);
}
const total = rows.filter((r) => !r.missing).length;
const independent = rows.filter((r) => r.independent).length;
const challenge = rows.filter((r) => r.reportsChallenge).length;
console.log(`\n合计：${total} 个场景 | 能上报结果事件 ${challenge} | 可作独立证据 ${independent}`);
