"use strict";
// Stage reviewed scene mappings. Never edits the active route or assessment bank.
const fs = require("node:fs"), path = require("node:path");
const { readPackage, digest } = require("../lib/openmaic-package");
const [source, mappingFile, target] = process.argv.slice(2);
try {
  if (!source || !mappingFile || !target) throw new Error("用法：node ops/stage-openmaic-courseware.js <原始课件包> <教学映射.json> <output内的新目录>");
  const pkg = readPackage(path.resolve(source)), mapping = JSON.parse(fs.readFileSync(mappingFile, "utf8"));
  const base = path.resolve(__dirname, "../output"), directory = path.resolve(target), relative = path.relative(base, directory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || fs.existsSync(directory)) throw new Error("请指定output内尚不存在的暂存目录");
  if (mapping.sourceHash !== pkg.sourceHash || !mapping.reviewedBy?.trim() || !mapping.instrumentVersion?.trim()) throw new Error("需要匹配源包的教学审核人与测量版本");
  if (!Array.isArray(mapping.mappings) || mapping.mappings.length !== pkg.manifest.scenes.length) throw new Error("教学映射必须逐场景完整填写");
  const byOrder = new Map(mapping.mappings.map(m => [m.order, m]));
  if (byOrder.size !== mapping.mappings.length) throw new Error("映射场景编号重复");
  const files = [], catalog = [];
  for (const scene of pkg.manifest.scenes) {
    const m = byOrder.get(scene.order);
    if (!m || m.contentHash !== digest(JSON.stringify(scene.content)) || m.reviewerApproved !== true
      || !m.knowledgePointId?.trim() || !m.subSkill?.trim()) throw new Error(`场景${scene.order}尚未完成或已变更教学映射`);
    if (scene.type === "quiz" && m.role !== "assessment_private") throw new Error(`测验场景${scene.order}必须标记assessment_private并由服务端迁移判分`);
    const entry = { ...m, sceneType: scene.type, title: scene.title, sourceAppVersion: pkg.manifest.appVersion, stagedFile: null, active: false };
    if (scene.type === "interactive") {
      if (!scene.content.html || !m.semanticAdapter?.trim()) throw new Error(`互动场景${scene.order}缺少HTML或语义适配说明`);
      const name = `场景-${String(scene.order).padStart(3, "0")}.html`;
      files.push([name, scene.content.html]); entry.stagedFile = name;
      entry.warning = "保留原始互动HTML，尚须语义桥、资源路径与离线浏览器验收，不能直接认定已适配";
    }
    catalog.push(entry);
  }
  // All validation precedes writes. Source ZIP paths are never used as destinations.
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, content] of files) fs.writeFileSync(path.join(directory, name), content, "utf8");
  fs.writeFileSync(path.join(directory, "已审核场景目录.json"), JSON.stringify({ sourceHash: pkg.sourceHash, reviewedBy: mapping.reviewedBy,
    instrumentVersion: mapping.instrumentVersion, activeRouteChanged: false, researchReady: false, scenes: catalog,
    remaining: ["引用资源完整性与断网检查", "slide渲染兼容性", "语义事件与目标子技能绑定", "服务端答案分离", "主路线注册与全部回归"] }, null, 2));
  console.log(`已暂存${files.length}个互动场景；完整${catalog.length}个场景保留于目录。当前学生课程未改变。\n${directory}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
