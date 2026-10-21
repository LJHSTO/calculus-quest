"use strict";
const path = require("node:path");
const { readPackage, writeAudit } = require("../lib/openmaic-package");
const [source, output] = process.argv.slice(2);
if (!source || !output) { console.error("用法：node ops/inspect-openmaic-package.js <课堂.maic.zip|classroom.html|manifest.json> <新的审计目录>"); process.exitCode = 1; }
else {
  try {
    const directory = path.resolve(output), workspace = path.resolve(__dirname, "..");
    const relative = path.relative(path.join(workspace, "output"), directory);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("审计输出必须位于当前工作区output内的新目录，避免含答案清单进入公开资源");
    const report = writeAudit(readPackage(path.resolve(source)), directory);
    console.log(`已审计：${report.title}；${report.scenes.length}个场景；格式${report.sourceFormat}；尚未替换现有课程。\n${directory}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
