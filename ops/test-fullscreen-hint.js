const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../app/main/learning-workspace.js"), "utf8");
const start = source.indexOf("  let fullscreenHintTimer");
const end = source.indexOf("  try { toolsCollapsed", start);
const store = new Map();
let day = 10;
class TestDate extends Date {
  constructor() { super(2026, 8, day, 12); }
}
function element() {
  return { hidden: false, textContent: "", children: [], listeners: {},
    setAttribute() {}, before() {}, append(...children) { this.children.push(...children); },
    addEventListener(name, fn) { this.listeners[name] = fn; } };
}
function boot(participant = "student-a", brokenStorage = false) {
  const context = vm.createContext({
    document: { createElement: element, fullscreenElement: null },
    $: () => element(), clearTimeout() {}, setTimeout() { return 1; },
    shell: { classList: { contains: () => false } },
    state: { participant: { participantId: participant } },
    canvasMode: "interactive",
    getUnit: () => ({ type: "knowledge", id: "K1" }),
    selectedKnowledgeSceneType: () => "game", Date: TestDate,
    localStorage: {
      getItem(key) { if (brokenStorage) throw new Error("disabled"); return store.get(key); },
      setItem(key, value) { if (brokenStorage) throw new Error("disabled"); store.set(key, value); }
    }
  });
  vm.runInContext(`${source.slice(start, end)}
    globalThis.probe = { sync: syncFullscreenHint, hint: fullscreenHint, close: fullscreenHintClose,
      reset: () => fullscreenHintsShown.clear() };`, context);
  return context.probe;
}
const first = boot();
first.sync();
assert.equal(first.hint.hidden, false);
let stopped = false;
first.close.listeners.click({ preventDefault() {}, stopPropagation() { stopped = true; } });
assert.equal(stopped, true);
first.reset();
first.sync();
assert.equal(first.hint.hidden, true);
const reload = boot();
reload.sync();
assert.equal(reload.hint.hidden, true);
const other = boot("student-b");
other.sync();
assert.equal(other.hint.hidden, false);
day++;
reload.sync();
assert.equal(reload.hint.hidden, false);
const unavailable = boot("student-c", true);
unavailable.sync();
unavailable.close.listeners.click({ preventDefault() {}, stopPropagation() {} });
unavailable.reset();
unavailable.sync();
assert.equal(unavailable.hint.hidden, true);
console.log("全屏提示：当天跨场景/刷新关闭、次日恢复、账号隔离、存储不可用降级通过。");
