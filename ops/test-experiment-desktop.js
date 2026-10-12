const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const steps = [
  ["语义合同一致性", "apply-v14-c3-semantic-contracts.js", "--check"],
  ["四场景固定位置与状态", "test-scene-choice.js"],
  ["图形证据边界", "test-assistant-grounding.js"],
  ["正式站真实操作与后台保存", "test-courseware-browser.js"],
  ["桌面学习工作区", "test-learning-workspace-browser.js"]
];
const results = [];
for (const [label, script, ...args] of steps) {
  console.log(`\n开始：${label}`);
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    cwd: root,
    env: {
      ...process.env,
      COURSEWARE_BROWSER_CHAPTER: "V14-C3",
      COURSEWARE_BROWSER_TARGET: "",
      COURSEWARE_BROWSER_SURFACE: "formal",
      COURSEWARE_BROWSER_HOST_FEATURES: "0",
      WORKSPACE_DESKTOP_ONLY: "1"
    },
    windowsHide: true,
    stdio: "inherit"
  });
  results.push({ label, script, exitCode: result.status, passed: result.status === 0, elapsedMs: Date.now() - started });
  if (result.status !== 0) break;
}
const output = path.join(root, "output", "桌面章节验收");
fs.mkdirSync(output, { recursive: true });
const passed = results.length === steps.length && results.every((step) => step.passed);
const report = path.join(output, "最新验收.json");
fs.writeFileSync(report, JSON.stringify({
  createdAt: new Date().toISOString(), chapterId: "V14-C3", desktopOnly: true,
  passed, results, notRun: steps.slice(results.length).map(([label]) => label),
  scope: "7个讲解入口、28个互动入口、真实控件和关系图节点语义、后台保存、桌面工作区。",
  excluded: ["所有参数组合与数学状态的穷尽审校", "游戏全关卡回归（单独运行courseware:games:test）", "真实模型回复质量", "前后测实测等难", "真人教学效果"]
}, null, 2), "utf8");
console.log(`桌面验收报告：${report}`);
if (!passed) process.exitCode = 1;
