"use strict";

const game = require("../resources/open-maic/函数极限混合探索/game-model");
const points = ["GH-01-K01", "GH-01-K02", "GH-01-K03", "GH-02-K01", "GH-02-K02", "GH-02-K03"];

// Recheck a recorded practice attempt against its task rules. This is process
// evidence for offering help, never an independent learning outcome.
function grade(data, point) {
  const kind = points.indexOf(point), s = data?.parameters;
  if (kind < 0 || data?.independent !== false || data?.evidence_scope !== "assisted_game_attempt"
    || !/^concept-games-20261027-v[23]$/.test(data.feedback_version || "")
    || !s || s.kind !== kind || !Number.isInteger(s.round) || s.round < 0 || s.round >= game.rounds(kind)
    || s.won !== false || !String(data.challenge_id || "").startsWith(point + "-game-r" + s.round)) return null;
  try {
    const state = structuredClone(s);
    if (kind === 0 && (!Array.isArray(s.links) || s.links.length !== 3 || s.links.some(a=>!Array.isArray(a)||a.some(v=>![0,1].includes(v))||new Set(a).size!==a.length))) return null;
    if (kind === 1 && (!Number.isInteger(s.parcel)||s.parcel<0||s.parcel>2||!Array.isArray(s.collected)||!Array.isArray(data.response)||data.response.length!==2||data.response.some(v=>!Number.isInteger(v)||v < -3||v>3))) return null;
    if (kind === 2 && (!Array.isArray(s.segments)||s.segments.length!==3||s.segments.some(v=>![null,-1,0,1].includes(v)))) return null;
    if (kind === 3 && (!Number.isFinite(s.distance)||s.distance<=0||s.distance>1)) return null;
    if (kind === 4 && (!Array.isArray(s.docks)||s.docks.length!==2||s.docks.some(v=>!Number.isInteger(v)||v<0||v>5))) return null;
    if (kind === 5 && (![s.right,s.point].every(v=>Number.isInteger(v)&&v>=0&&v<=5))) return null;
    return game.check(state, data.response).correct;
  } catch { return null; }
}

function collect(rows, point, now) {
  const seen = new Set(), attempts = [];
  for (const row of [...rows].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at))) {
    const payload = row.payload || {}, data = payload.data || {}, at = Date.parse(row.created_at);
    if (payload.eventType !== "courseware_challenge_result" || !Number.isFinite(at) || at>now || now-at>300000) continue;
    const correct = grade(data, point), key = data.attempt_id || row.id;
    if (correct === null || seen.has(key)) continue;
    seen.add(key); attempts.push({row, correct, at});
  }
  const lastSuccess = attempts.findLastIndex(a=>a.correct);
  return {attempts, failures:attempts.slice(lastSuccess+1).filter(a=>!a.correct), latest:attempts.at(-1)};
}
module.exports = {grade, collect};
