const path = require("path");
const { writeKnowledgeGraph } = require("../lib/kg-build");

const rootDir = path.resolve(__dirname, "..");
const result = writeKnowledgeGraph(rootDir);

console.log(JSON.stringify({
  ok: true,
  file: path.relative(rootDir, result.file),
  coverage: result.report.coverage,
  counts: result.report.counts
}, null, 2));
