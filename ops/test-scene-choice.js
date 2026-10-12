const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const order = ["simulation", "game", "mindMap", "visualization3d"];
let selected = "";
let recommended = "visualization3d";
const sandbox = {
  knowledgeInteractionTypes: () => [...order].reverse().map((id) => ({ id })),
  selectedKnowledgeSceneType: () => selected,
  knowledgeSceneRecommendation: () => ({
    ranked: order.map((typeId) => ({ typeId, score: typeId === recommended ? 10 : 1,
      recommended: typeId === recommended, reasonLabels: ["当前知识点"] })),
    recommended: { typeId: recommended }
  }),
  knowledgeResourceCandidate: (unit, id) => ({ title: id }),
  cleanStudentSceneTitle: (title) => title,
  escapeHtml: (value) => String(value)
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/main/render-learning.js"), "utf8"), sandbox);
for (recommended of order) {
  for (selected of ["", ...order]) {
    const html = sandbox.renderKnowledgeSceneChoicePanel({ id: "fixture", label: "测试", type: "knowledge" });
    assert.deepEqual([...html.matchAll(/data-knowledge-scene="([^"]+)"/g)].map((match) => match[1]), order);
    const buttons = [...html.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((match) => match[0]);
    for (const [index, button] of buttons.entries()) {
      assert.equal(button.includes('data-recommended="true"'), order[index] === recommended);
      assert.equal(button.includes('aria-pressed="true"'), order[index] === selected);
      assert.equal(button.includes("scene-selection-badge"), order[index] === selected);
      assert.equal(button.includes("coach-recommendation-badge"), order[index] === recommended);
    }
  }
}
console.log("四场景固定顺序与推荐/已选独立状态通过（20 种组合）。");
