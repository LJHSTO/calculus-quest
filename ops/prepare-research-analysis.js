const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { schemas } = require("../lib/research-analysis-export");
const { csvCell } = require("../admin/csv");

const filenames = {
  participants: "参与者名册.csv", quiz_attempts: "逐题作答.csv", phase_scores: "阶段与题型候选分数.csv",
  assessment_catalog: "当前题目目录.csv", courseware_events: "逐次课件事件.csv",
  outcome_items: "独立测量逐题结果.csv", outcome_sessions: "测量会话与失访.csv", grading_audits: "评分审计.csv",
  proactive_decisions: "主动决策与支架后检查.csv"
};

function prepare(data, directory) {
  assert.equal(data.schema_version, "research-analysis-package-v1", "分析包版本不受支持。");
  assert.deepEqual(Object.keys(data.tables).sort(), Object.keys(schemas).sort(), "分析包表结构不完整。");
  assert.equal(data.data_fingerprint, crypto.createHash("sha256")
    .update(JSON.stringify(data.tables)).digest("hex"), "分析包数据摘要不匹配，内容可能已改变。");
  const files = {};
  const dictionaryRows = [["数据表", "字段标识", "中文列名", "类型", "空值表示", "取值含义"]];
  for (const [table, fields] of Object.entries(schemas)) {
    const rows = data.tables[table];
    assert.ok(Array.isArray(rows), `${table}不是数据表。`);
    assert.equal(data.counts[table], rows.length, `${table}行数不一致。`);
    const columns = Object.keys(fields);
    rows.forEach((row) => {
      assert.deepEqual(Object.keys(row).sort(), [...columns].sort(), `${table}字段不完整。`);
      for (const [field, [, type]] of Object.entries(fields)) {
        assert.ok(row[field] === null || (typeof row[field] === type
          && (type !== "number" || Number.isFinite(row[field]))), `${table}.${field}类型错误。`);
      }
    });
    const cells = [Object.values(fields).map(([label]) => label),
      ...rows.map((row) => columns.map((column) => row[column]))];
    files[filenames[table]] = "\uFEFF" + cells.map((row) => row.map((value) =>
      typeof value === "number" ? `"${value}"` : csvCell(value)).join(",")).join("\r\n");
    for (const [field, [label, type]] of Object.entries(fields)) {
      dictionaryRows.push([filenames[table], field, label, type, "空单元格；原JSON为null，不等于0",
        data.dictionary?.[table]?.find((item) => item.field === field)?.meaning || ""]);
    }
  }
  files["字段字典.csv"] = "\uFEFF" + dictionaryRows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  files["分析清单.json"] = JSON.stringify({
    schema_version: data.schema_version, exported_at: data.generated_at, scope: data.scope,
    export_transform_digest: data.export_transform_digest,
    data_fingerprint: data.data_fingerprint,
    counts: data.counts, protocol: data.protocol, warnings: data.warnings,
    csv_semantics: "空值为空单元格。文本可能触发电子表格公式时加前导单引号；原始JSON保留未改变的值。",
    analysis_gate: "候选分数不是正式冻结分数；本脚本不计算实验显著性，不把缺失填0，不自动排除退出者。"
  }, null, 2);
  const output = path.resolve(directory);
  assert.ok(!fs.existsSync(output), "目标目录已存在，为保护已有数据拒绝覆盖。");
  console.log(`分析输出目录：${output}`);
  fs.mkdirSync(output, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(output, name), content, { encoding: "utf8", flag: "wx" });
  }
  return { directory: output, files: Object.keys(files), counts: data.counts };
}

if (require.main === module) {
  try {
    assert.ok(process.argv[2] && process.argv[3], "用法：node ops/prepare-research-analysis.js 分析包.json 新输出目录");
    const data = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8").replace(/^\uFEFF/, ""));
    console.log(JSON.stringify(prepare(data, process.argv[3])));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { prepare };
