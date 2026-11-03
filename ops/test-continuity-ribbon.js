'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../resources/open-maic/GH-02-极限与连续：直觉探索/interactive/17_连续就是不跳断：空间视角.html'), 'utf8');
const generation = source.slice(source.indexOf('function generateCurvePoints()'), source.indexOf('// ── Create ribbon'));
for (const hasGap of [false, true]) {
  const paths = vm.runInNewContext(generation + '\ngenerateCurvePoints()', { hasGap, gapT: .5, gapSize: .15, curvePoint: t => t });
  assert.equal(paths.length, hasGap ? 2 : 1);
  assert.equal(paths[0][0], 0);
  assert.equal(paths.at(-1).at(-1), 1);
  if (hasGap) {
    assert.equal(paths[0].at(-1), .5);
    assert.equal(paths[1][0], .65);
    assert.ok(paths.every(p => p.every(t => t <= .5) || p.every(t => t >= .65)), '任何一条曲线均不能跨过断点');
  }
}
const rebuild = source.slice(source.indexOf('function rebuildRibbon()'), source.indexOf('// ── Resize'));
let removed = 0, disposed = 0, added = 0;
const ribbon = { traverse(fn) { fn({ geometry: { dispose() { disposed++; } }, material: { dispose() { disposed++; } } }); } };
const context = { scene: { remove() { removed++; }, add() { added++; } }, objects: { continuous_ribbon: ribbon, gapMarker1: {}, gapMarker2: {} }, createRibbon: () => ribbon, updateProbe() {}, probeT: 0 };
vm.runInNewContext(rebuild + '\nfor(let i=0;i<100;i++) rebuildRibbon();', context);
assert.equal(removed, 100); assert.equal(added, 100); assert.equal(disposed, 200);
assert.equal(context.objects.gapMarker1, undefined);
console.log('连续性断点几何与100次重建资源释放：通过');
