const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const contracts = require("../data/proactive-courseware-contracts.json");
const route = require("../data/multi-scene-learning-route.json");

const chapter = route.chapters.find((item) => item.id === contracts.chapterId);
assert.ok(chapter, "实验章节必须存在");
const candidates = chapter.modules.flatMap((module) =>
  (module.knowledgePoints || []).flatMap((point) =>
    (point.resourceCandidates || []).map((candidate) => ({ point, candidate }))
  )
);
assert.ok(candidates.length >= 12, "积分章节应有完整互动课件集合");
for (const { point, candidate } of candidates) {
  const type = String(candidate.type || candidate.widgetType || "").replace("diagram", "mindMap");
  const scene = contracts.sceneTasks[type];
  assert.ok(scene?.task, `${point.id}/${candidate.file} 缺少场景学习任务`);
  assert.ok(scene.evidence.length >= 2, `${point.id}/${candidate.file} 缺少可观测证据`);
  const file = path.join(__dirname, "..", "resources", candidate.root, candidate.file);
  assert.ok(fs.existsSync(file), `${candidate.file} 缺少本地课件`);
  const html = fs.readFileSync(file, "utf8");
  assert.match(html, /<canvas|<svg|<input|<button/i, `${candidate.file} 没有可操作或可视内容`);
}
console.log(`proactive courseware package tests passed (${candidates.length} scenes)`);
