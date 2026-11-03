"use strict";
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), assert = require("node:assert/strict");
const base = path.resolve(__dirname, "../resources/open-maic");
function section(s, a, b) { const i = s.indexOf(a), j = s.indexOf(b, i + a.length); assert.ok(i >= 0 && j > i); return s.slice(i, j); }
const read = p => fs.readFileSync(path.join(base, p), "utf8");
const mapping = read("GH-01-函数、坐标与图像读法入门/interactive/06_输入、输出和函数规则：空间视角.html");
const functions = vm.runInNewContext(section(mapping, "const functions = {", "let currentFunc") + "functions");
assert.equal(functions.sqrt.fn(4), 2); assert.equal(functions.sine.fn(Math.PI / 2), 1);
for (const x of [-3, -1, 0, 1, 3]) assert.equal(functions.sine.fn(x), Math.sin(x));
assert.ok(Number.isNaN(functions.sqrt.fn(-1)));
const terrain = read("GH-01-函数、坐标与图像读法入门/interactive/17_图像的上升、下降与变化方向：空间视角.html");
const nodes = {}, box = { terrainHeightScale: 1.5, gravityStrength: .8, animationSpeed: 1, ballRadius: .2,
  document: { getElementById: id => nodes[id] ||= { style: {}, textContent: "" } } };
vm.createContext(box); vm.runInContext(section(terrain, "function getTerrainHeight(", "function getTerrainColor(")
  + section(terrain, "function getTerrainSlope(", "// --- ANIMATION ---"), box);
for (const start of [[5, 0], [-3, 2], [1, -4]]) {
  box.ballState = { position: { x: start[0], z: start[1], y: box.getTerrainHeight(...start) + box.ballRadius },
    velocity: { x: 0, z: 0, multiplyScalar(k) { this.x *= k; this.z *= k; } } };
  for (let i = 0; i < 26; i++) {
    const before = box.ballState.position.y;
    vm.runInContext("{" + section(terrain, "const pos = ballState.position;", "// Boundary check")
      + section(terrain, "const heightChange =", "// End direction status") + "}", box);
    const after = box.ballState.position.y, label = nodes["status-dir"].textContent;
    if (i === 0) assert.ok(after <= before, "静止释放不能沿正梯度向上加速");
    if (after - before > .0001) assert.match(label, /上升/);
    if (after - before < -.0001) assert.match(label, /下降/);
  }
}
const graph = read("GH-02-极限与连续：直觉探索/interactive/04_从数表观察趋近：关系图.html");
assert.ok(!graph.includes("= L ≠ f(a)")); assert.ok(!graph.includes("永远不推开门"));
assert.match(graph, /f\(a\) 未定义时/);
assert.match(graph, /误认为必然相等/);
assert.match(graph, /<td>跳跃间断<\/td><td>不存在<\/td><td>可存在或未定义<\/td>/);
console.log("通过：函数值、默认运动高度与方向标签、极限与点值的结论");
