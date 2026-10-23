"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const hash = x => crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
async function build(snapshot) {
  if (snapshot.source !== "production-courseware" || !Array.isArray(snapshot.questions) || !snapshot.sha256) throw new Error("需要线上题目快照及来源摘要");
  const rows = [], seen = new Set();
  function add(q, source, kp) {
    if (seen.has(q.id)) return; seen.add(q.id);
    rows.push({ 题目编号: q.id, 材料来源: source, 材料摘要: hash(q), 使用范围: /archivedQuestions/.test(source) ? "历史归档，核对是否误用" : "需按最终协议确认启用",
      知识点: kp || q.knowledgePointIds?.join("；") || q.knowledgePointId || "", 题型: q.type || "选择",
      题干: q.question || q.row?.[0], 选项: JSON.stringify(q.options || q.row?.[1] || []),
      现有答案: JSON.stringify(q.referenceAnswer ?? q.answer ?? q.row?.[2] ?? ""),
      现有解析: q.analysis || q.row?.[3] || "", 现有量规: JSON.stringify(q.rubric || q.commentPrompt || ""),
      分值: q.points ?? "", 配对: q.pairId || "", 教师甲结论: "", 教师乙结论: "", 缺陷与修改建议: "", 等难性依据: "", 复核日期: "" });
  }
  for (const { q, source } of snapshot.questions) add(q, source);
  for (const name of ["functions-limits-transfer-r3", "functions-limits-retention-r3"]) for (const q of require("../lib/assessments/" + name).items) add(q, name);
  const bank = require("../lib/proactive-policy/adapters/functions-limits-check-bank"), points = Object.keys(require("../lib/support-goals").CURRICULUM);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) for (const [n, row] of bank.variantsFor(i, j).entries()) add({ id: `${points[i]}-L${j + 1}-平行${n + 1}`, row }, bank.version, points[i]);
  const SQL = await require("sql.js")(), sql = new SQL.Database();
  const work = require("../lib/study-workbench").createWorkbench({ db: { getDbSync: () => sql, saveNow() {} }, mainEntry: true, env: {} });
  work.state("synthetic-material-export-no-student");
  const saved = JSON.parse(sql.exec("SELECT protocol_json FROM study_workbench_protocols")[0].values[0][0]);
  for (const unit of saved.instruments) for (const q of unit.probes) add({ ...q, question: q.question || q.prompt, answer: [q.answerKey] }, "共同任务 " + saved.protocol.version, unit.knowledgePointId);
  sql.close();
  const checks = rows.map(r => {
    const flags = [];
    if (!r.题干) flags.push("题干缺失");
    if (["\"\"", "[]", "null"].includes(r.现有答案)) flags.push("答案缺失");
    if (r.题型 === "short_answer" && r.现有量规 === '""') flags.push("简答量规缺失");
    if (/事实正确|虽然.*正确/.test(r.现有解析)) flags.push("解析承认另一选项正确，需检查单选歧义");
    if ([r.题干, r.现有解析, r.现有量规].some(t => String(t).includes("\uFFFD"))) flags.push("编码替换字符");
    const same = rows.filter(x => x.题目编号 !== r.题目编号 && x.题干 === r.题干).map(x => x.题目编号);
    return { 题目编号: r.题目编号, 材料摘要: r.材料摘要, 结构检查: flags.length ? flags.join("；") : "通过结构检查，数学和测量效度未签审", 同题干编号: same.join("；"), 人工结论: "" };
  });
  return { rows, checks, manifest: { items: rows.length, source: snapshot.source, courseHash: snapshot.sha256,
    archiveItems: rows.filter(r => r.使用范围.startsWith("历史")).length, flagged: checks.filter(r => !r.结构检查.startsWith("通过")).length,
    teacherReviewCompleted: false, note: "包括归档及平行题材料，不等于学生需做的题数；辅助题来自当前代码版本。" } };
}
function csv(rows) { const cols = Object.keys(rows[0]), cell = x => '"' + String(x ?? "").replaceAll('"', '""') + '"';
  return "\ufeff" + [cols, ...rows.map(r => cols.map(c => r[c]))].map(r => r.map(cell).join(",")).join("\r\n"); }
if (require.main === module) (async () => {
  const [input, output] = process.argv.slice(2); if (!output) throw new Error("用法：node ops/export-pilot-review-materials.js 线上课程快照.json 新目录");
  const result = await build(JSON.parse(fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "")));
  fs.mkdirSync(output, { recursive: false });
  fs.writeFileSync(path.join(output, "教师题目审校材料.csv"), csv(result.rows));
  fs.writeFileSync(path.join(output, "题目结构检查与重复项.csv"), csv(result.checks));
  fs.writeFileSync(path.join(output, "题目材料来源.json"), JSON.stringify(result.manifest, null, 2));
  console.log(JSON.stringify(result.manifest));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { build, csv };
