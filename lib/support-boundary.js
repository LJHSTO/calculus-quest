"use strict";
const activityTypes = new Set(["interactive_input", "interactive_drag_start", "parameter_change", "unit_exit", "knowledge_scene_select", "knowledge_scene_selected"]);
function latestBoundary(entries, boundaryTypes, now) {
  const entry = entries.filter(e => e.at > 0 && e.at <= now && (boundaryTypes.has(e.type) || activityTypes.has(e.type)))
    .sort((a, b) => b.at - a.at || Number(activityTypes.has(b.type)) - Number(activityTypes.has(a.type)))[0];
  if (!entry || !boundaryTypes.has(entry.type)) return { entry: null, token: null, active: false };
  return { entry, token: `${entry.row.id}:${entry.type}:${entry.at}`, active: now - entry.at <= 12000 };
}
module.exports = { latestBoundary };
