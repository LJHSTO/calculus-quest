"use strict";

// Observable process summaries. A pause or a reversal is not a diagnosis.
function extractBehaviorFeatures(rows = [], { now = Date.now(), windowMs = 300000 } = {}) {
  const events = rows.map(row => {
    let payload = row.payload;
    if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { payload = {}; } }
    payload ||= {};
    return { id: row.id, at: Date.parse(row.created_at), type: payload.eventType || payload.data?.eventType || "",
      data: payload.data || {}, scene: payload.sceneType || "" };
  }).filter(e => Number.isFinite(e.at) && e.at <= now && e.at >= now - windowMs)
    .sort((a,b) => a.at-b.at);
  const parameters = new Map();
  for (const event of events.filter(e => /parameter_commit$/.test(e.type))) {
    const nested = event.data.value && typeof event.data.value==="object" ? event.data.value : event.data.state || {};
    const value = typeof event.data.value==="number" ? event.data.value : nested.value ?? nested.newValue ?? event.data.newValue;
    const key = event.data.parameter || nested.parameter || nested.param || event.data.parameterName || event.data.controlId;
    if (!key || typeof value !== "number" || !Number.isFinite(value)) continue;
    if (!parameters.has(key)) parameters.set(key, []);
    parameters.get(key).push(value);
  }
  const parameterStats = [...parameters].map(([name, values]) => {
    const mean = values.reduce((a,b)=>a+b,0)/values.length;
    const directions = values.slice(1).map((v,i)=>Math.sign(v-values[i])).filter(Boolean);
    return { name, count:values.length, variance:values.reduce((s,v)=>s+(v-mean)**2,0)/values.length,
      reversals:directions.slice(1).filter((v,i)=>v!==directions[i]).length };
  });
  const interactions = events.filter(e => !/proactive_|heartbeat|visibility/.test(e.type));
  const gaps = interactions.slice(1).map((e,i)=>e.at-interactions[i].at);
  const navigation = events.filter(e=>/scene_selected|slide_changed|page_changed/.test(e.type));
  return { version:"observable-process-v1", windowMs, eventCount:events.length,
    parameterStats, pauseCount:gaps.filter(ms=>ms>=15000).length,
    lastInteractionAgeMs:interactions.length ? now-interactions.at(-1).at : null,
    rapidNavigationCount:navigation.slice(1).filter((e,i)=>e.at-navigation[i].at<2000).length,
    sceneCounts:Object.fromEntries(["simulation","game","mindMap","visualization3d"].map(scene=>[scene,events.filter(e=>e.scene===scene).length])),
    sources:events.slice(-40).map(e=>e.id),
    missing:[...(!parameterStats.length?["numeric_parameter_series"]:[]),...(!interactions.length?["recent_interaction"]:[])],
    interpretation:"行为描述；不等同于困惑、投入程度或能力" };
}
module.exports = { extractBehaviorFeatures };
