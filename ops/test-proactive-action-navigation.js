const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname,
  "../app/main/knowledge-assistant.js"), "utf8");
const start = source.indexOf("  function executeProactiveAction(");
const end = source.indexOf("  function acceptProactiveSuggestion(", start);
assert.ok(start >= 0 && end > start);
function fixture({ locked = false, allowed = true, selected = "simulation", navigation = true } = {}) {
  const calls = [];
  const target = { id: "K2", chapterId: "V14-C3", type: "knowledge" };
  const context = vm.createContext({
    courseMeta: () => ({ unitId: "K1", chapterId: "V14-C3", supported: true }),
    quizAssistantLocked: () => locked,
    proactiveScopeKey: () => "K1",
    currentUnitId: "K1",
    getUnit: (id) => ({ ...target, id }),
    knowledgeInteractionTypes: () => [{ id: "game" }, { id: "simulation" }],
    agenticGuardNavigation: () => allowed,
    agenticUnitCompletionAllowed: () => allowed,
    selectedKnowledgeSceneType: () => selected,
    setKnowledgeSceneType: (id, scene) => {
      calls.push(["scene", id, scene]);
      const changed = selected !== scene;
      selected = scene;
      return changed;
    },
    selectUnit: (id) => {
      calls.push(["navigate", id]);
      if (!navigation) return false;
      context.currentUnitId = id;
      return true;
    },
    renderAll: () => calls.push(["render"]),
    global: { LearningWorkspace: { showInteractive: () => calls.push(["interactive"]) } },
    setStatus: () => calls.push(["status"])
  });
  vm.runInContext(source.slice(start, end), context);
  const run = (targetUnitId = "K1", targetSceneType = "game") =>
    context.executeProactiveAction({ action: "switch_representation", targetUnitId, targetSceneType });
  return { run, calls };
}
for (const options of [{ locked: true }, { allowed: false }]) {
  const test = fixture(options);
  assert.equal(test.run(), false, "测验锁或权限不足时不能切换或宣称成功");
  assert.equal(test.calls.length, 0);
}
const same = fixture();
assert.equal(same.run(), true);
assert.deepEqual(same.calls.map((call) => call[0]), ["scene", "render", "interactive", "status"]);
const other = fixture();
assert.equal(other.run("K2"), true);
assert.deepEqual(other.calls.map((call) => call[0]), ["navigate", "scene", "render", "interactive", "status"]);
const denied = fixture({ navigation: false });
assert.equal(denied.run("K2"), false);
assert.deepEqual(denied.calls, [["navigate", "K2"]]);
const invalid = fixture();
assert.equal(invalid.run("K1", "unknown"), false);
assert.equal(invalid.calls.length, 0);
const repeated = fixture({ selected: "game" });
assert.equal(repeated.run(), true);
assert.ok(repeated.calls.some((call) => call[0] === "interactive"));
console.log("主动换表征回归通过：测验锁、权限、无效场景、实际重绘、跳转失败与幂等恢复。");
