"use strict";
// 有界复核：仅运行列出的既有测试；不启动或重建常规学习预览数据库。
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "output", "六维开发审计与研究方向-2026-10-20");
fs.mkdirSync(path.join(output, "验证日志"), { recursive: true });
const tests = [
  "test-design-contract-boundaries", "test-design-space-projection",
  "test-evidence-strength", "test-quiet-dwell-reachability",
  "test-proactive-gate-sensitivity", "test-proactive-policy",
  "test-courseware-verification-match", "test-courseware-evidence-wiring",
  "test-learner-memory", "test-conversation-context", "test-research-controls",
  "test-main-common-tasks", "test-study-workbench", "test-proactivity-randomization",
  "test-proactive-evidence-audit"
];
const previewFile = path.join(root, "output", "函数极限预览.json");
const previewHash = () => fs.existsSync(previewFile)
  ? crypto.createHash("sha256").update(fs.readFileSync(previewFile)).digest("hex") : null;
const before = previewHash();
const results = tests.map(name => {
  const started = Date.now();
  const result = spawnSync(process.execPath, [`ops/${name}.js`], {
    cwd: root, windowsHide: true, encoding: "utf8", timeout: 90000,
    maxBuffer: 4 * 1024 * 1024
  });
  const log = (result.stdout || "") + (result.stderr || "") + (result.error?.message || "");
  fs.writeFileSync(path.join(output, "验证日志", `${name}.txt`), log, "utf8");
  const row = { script: `ops/${name}.js`, passed: result.status === 0 && !result.error,
    exitCode: result.status, durationMs: Date.now() - started,
    log: `验证日志/${name}.txt`, dataClass: "synthetic_engineering" };
  console.log(`${row.passed ? "通过" : "失败"}：${name}`);
  return row;
});
const files = ["server.js", "lib/proactive-policy/index.js", "lib/proactive-policy/evidence-package.js",
  "lib/proactive-policy/timing-gate.js", "lib/proactive-policy/evidence-audit.js",
  "lib/proactive-policy/lifecycle.js", "lib/proactive-policy/design-space.js",
  "lib/research-controls.js", "lib/study-workbench.js", "lib/learner-memory.js",
  "app/main/proactive-learning.js", "app/main/proactive-hud.js"];
const report = {
  generatedAt: new Date().toISOString(), scope: "D1/D2及关联保护的既有自动化测试复跑；不是全站验收或真人效度验证",
  results, passed: results.filter(x => x.passed).length, total: results.length,
  persistentPreviewPointerUnchanged: before === previewHash(),
  sources: files.map(file => ({ file, sha256: crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(root, file))).digest("hex") }))
};
fs.writeFileSync(path.join(output, "本轮定向验证.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({passed:report.passed,total:report.total,
  persistentPreviewPointerUnchanged:report.persistentPreviewPointerUnchanged}));
if (report.passed !== report.total || !report.persistentPreviewPointerUnchanged) process.exitCode = 1;
