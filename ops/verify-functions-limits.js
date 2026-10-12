"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const steps = [
  ["课件预处理一致性", "prepare-functions-limits.js", ["--check"]],
  ["24份语义合同", "apply-v14-c3-semantic-contracts.js", ["--check"], { COURSEWARE_CHAPTER_ID: "V14-C1" }],
  ["题目、验证题与不会选项", "test-functions-limits.js"],
  ["六知识点中文教材及测量保护", "test-textbook-theme-browser.js", [], { TEXTBOOK_TEST_CHAPTER: "V14-C1" }],
  ["全路线题目映射", "test-quiz-coverage.js"],
  ["权威判分与答案隔离", "test-authoritative-quiz-api.js"],
  ["策略与分组隔离", "test-proactive-policy.js"],
  ["参与、撤回与主动策略接口回归", "test-proactive-study-api.js"],
  ["草稿代次与同步", "test-learning-snapshot-versioning.js"],
  ["刷新草稿恢复边界", "test-quiz-draft-recovery.js"],
  ["已提交测验恢复", "test-quiz-snapshot-reconciliation.js"],
  ["事件持久化", "test-learning-event-durability.js"],
  ["分析导出与缺失值边界", "test-research-analysis-export.js"],
  ["学习效果描述性指标", "test-functions-limits-metrics.js"],
  ["完整后台导出", "test-admin-export-all.js"],
  ["助教上下文", "test-learning-assistant.js"],
  ["助教图形证据边界", "test-assistant-grounding.js"],
  ["不会选项桌面浏览器", "test-unknown-browser.js"],
  ["72小时保持测全过程", "test-retention-v4-api.js", [], { RETENTION_TEST_CHAPTER: "V14-C1" }],
  ...["GH-01-K01", "GH-01-K02", "GH-01-K03", "GH-02-K01", "GH-02-K02", "GH-02-K03"].map(id =>
    [`${id}的L1至L5支架`, "test-proactive-submission-browser.js", [],
      { TEST_PROACTIVE_CHAPTER: "V14-C1", TEST_PROACTIVE_KNOWLEDGE_POINT: id, TEST_PROACTIVE_FINAL_OUTCOME: "correct", TEST_PROACTIVE_FINAL_LEVEL: "5" }]),
  ["最高支架后停止追加", "test-proactive-submission-browser.js", [],
    { TEST_PROACTIVE_CHAPTER: "V14-C1", TEST_PROACTIVE_KNOWLEDGE_POINT: "GH-02-K03", TEST_PROACTIVE_FINAL_OUTCOME: "incorrect", TEST_PROACTIVE_FINAL_LEVEL: "5" }],
  ["学生确认换表征", "test-proactive-submission-browser.js", [],
    { TEST_PROACTIVE_CHAPTER: "V14-C1", TEST_PROACTIVE_KNOWLEDGE_POINT: "GH-01-K01", TEST_PROACTIVE_ALTERNATIVE: "1" }],
  ...[1366, 1920].map(width => [`${width}桌面全课件显示与真实交互`, "test-courseware-browser.js", [], {
    COURSEWARE_BROWSER_CHAPTER: "V14-C1", COURSEWARE_BROWSER_SURFACE: "formal",
    COURSEWARE_BROWSER_WIDTH: String(width), COURSEWARE_BROWSER_HEIGHT: width === 1366 ? "768" : "1080"
  }])
];
const directory = path.join(root, "output/函数极限实验验收");
fs.mkdirSync(directory, { recursive: true });
const results = [];
for (const [label, file, args = [], env = {}] of steps) {
  console.log(`开始：${label}`);
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.join(__dirname, file), ...args], {
    cwd: root, env: { ...process.env, ...env }, windowsHide: true, encoding: "utf8",
    timeout: 300000, maxBuffer: 4 * 1024 * 1024
  });
  const passed = result.status === 0;
  results.push({ label, file, passed, exitCode: result.status, elapsedMs: Date.now() - started,
    output: `${result.stdout || ""}${result.stderr || ""}`.replace(/\u001b\[[0-9;]*m/g, ""),
    error: result.error ? String(result.error.code || "execution_error") : null });
  console.log(`${passed ? "通过" : "失败"}：${label}`);
  fs.writeFileSync(path.join(directory, "最新验收.json"), JSON.stringify({
    generatedAt: new Date().toISOString(), chapterId: "V14-C1", planned: steps.length,
    completed: results.length, passed: results.length === steps.length && results.every(r => r.passed),
    results, limitations: ["真实评分另见合成验收报告", "尚无真人前后测等难性数据", "游戏全部关卡与所有参数组合并非穷尽验证", "正式研究需研究者确认告知、评分复核和实验冻结"]
  }, null, 2), "utf8");
}
console.log(`验收完成：${results.filter(r => r.passed).length}/${steps.length}，报告：${directory}`);
fs.copyFileSync(path.join(directory, "最新验收.json"),
  path.join(directory, `验收-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
if (results.some(r => !r.passed)) process.exitCode = 1;
