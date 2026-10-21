"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "output", "论文初稿与学习数据核验-2026-10-20");
fs.mkdirSync(path.join(output, "验证日志"), { recursive: true });
const results = [];
for (const name of ["test-selected-participant-export", "test-main-common-tasks",
  "test-study-workbench", "test-student-data-chain-api"]) {
  const result = spawnSync(process.execPath, [`ops/${name}.js`], { cwd: root,
    windowsHide: true, encoding: "utf8", timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, "验证日志", name + ".txt"),
    (result.stdout || "") + (result.stderr || "") + (result.error?.message || ""), "utf8");
  results.push({ script: `ops/${name}.js`, passed: result.status === 0 && !result.error,
    exitCode: result.status, log: `验证日志/${name}.txt` });
  console.log(`${results.at(-1).passed ? "通过" : "失败"}：${name}`);
}
const sources = ["lib/study-workbench.js", "lib/selected-participant-export.js",
  "app/main/common-learning.js", "app/main/analytics.js", "server.js", "db.js"];
fs.writeFileSync(path.join(output, "数据链路验证.json"), JSON.stringify({
  generatedAt: new Date().toISOString(), dataClass: "synthetic_engineering",
  scope: "四个定向脚本；含独立隔离服务的六知识点 HTTP 流程，不是浏览器视觉验收或教学效果证据",
  total: results.length, passed: results.filter(row => row.passed).length, results,
  sources: sources.map(file => ({ file, sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex") }))
}, null, 2), "utf8");
if (results.some(row => !row.passed)) process.exitCode = 1;
