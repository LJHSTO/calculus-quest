const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const file = path.join(__dirname,
  "../resources/open-maic/GH-06-积分直觉：面积、累积与原函数/interactive/08_定积分作为累积：拖动实验.html");
const html = fs.readFileSync(file, "utf8");
const stateCode = html.slice(html.indexOf("const state = {"), html.indexOf("// ========== Canvas Setup"));
const integrationCode = html.slice(html.indexOf("function flowRate(t)"), html.indexOf("// ========== Drawing"));
assert.ok(stateCode && integrationCode);
const sandbox = vm.createContext({ W: 1000, H: 600, updateButton() {}, updateStateUI() {} });
vm.runInContext(stateCode + "\n" + integrationCode, sandbox);
const run = (code) => vm.runInContext(code, sandbox);
run("step(100)");
assert.equal(run("state.time"), 20);
const expected = 2 * (1 - Math.cos(20)) + 10;
assert.ok(Math.abs(run("state.volume") - expected) < 1e-10,
  "最后一帧只能累计到20秒，不能把越界时间的流量算进去");
let cases = 0;
for (const amplitude of [0.1, 2, 5]) {
  for (const frequency of [0.2, 1, 4]) {
    for (const offset of [-3, 0, 3]) {
      for (const dt of [0.01, 0.7, 100]) {
        run(`Object.assign(state, { amplitude: ${amplitude}, frequency: ${frequency},
          offset: ${offset}, time: 0, volume: 0, history: [], waterParticles: [], ended: false });
          while (state.time < state.maxTime) step(${dt});`);
        const value = amplitude * (1 - Math.cos(frequency * 20)) / frequency + offset * 20;
        const measured = run("state.volume");
        assert.ok(Math.abs(measured - value) < 1e-9, JSON.stringify({ amplitude, frequency, offset, dt, value, measured }));
        assert.equal(run("state.history[0].time"), 0);
        assert.equal(run("state.history.at(-1).time"), 20);
        assert.ok(run("state.history.every(h => h.time >= 0 && h.time <= 20)"));
        assert.ok(run("state.history.length <= 801"), "绘图样本有界且不丢弃早期累计区间");
        assert.ok(run("state.initialVolume + state.volume >= 0 && state.initialVolume + state.volume <= state.capacity"),
          "允许参数内水箱不能出现负存水量或无提示溢出");
        cases++;
      }
    }
  }
}
console.log(`累积模拟数学通过：${cases}组参数/步长、精确积分、终点边界、全历史绘图范围与水箱物理边界。`);
