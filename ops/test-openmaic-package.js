"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { readPackage, inventory, writeAudit } = require("../lib/openmaic-package");
const root = path.resolve(__dirname, ".."), dir = fs.mkdtempSync(path.join(root, "output/maic-package-test-"));
// Synthetic fixtures follow the v1.2.0 published contract, not a claim that an
// actual newly generated classroom has been visually or educationally validated.
function crc(bytes) { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function zip(name, content) {
  const n = Buffer.from(name), b = Buffer.from(content), local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt32LE(crc(b), 14); local.writeUInt32LE(b.length, 18); local.writeUInt32LE(b.length, 22); local.writeUInt16LE(n.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt32LE(crc(b), 16); central.writeUInt32LE(b.length, 20); central.writeUInt32LE(b.length, 24); central.writeUInt16LE(n.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + n.length, 12); end.writeUInt32LE(local.length + n.length + b.length, 16);
  return Buffer.concat([local, n, b, central, n, end]);
}
const manifest = { formatVersion: 1, appVersion: "1.2.0", stage: { name: "合成迁移夹具" }, agents: [], mediaIndex: {}, scenes: [
  { order: 1, type: "slide", title: "定义", content: { type: "slide", canvas: { elements: [] } } },
  { order: 2, type: "interactive", title: "探索", content: { type: "interactive", widgetType: "simulation", html: '<html><body><script>throw new Error("不得执行导入内容")</script><img src="https://example.invalid/a.png"></body></html>' } },
  { order: 3, type: "quiz", title: "检查", content: { type: "quiz", questions: [{ answer: ["A"] }] } }
] };
const json = JSON.stringify(manifest), html = `<html><script type="application/json" id="openmaic-classroom">${json.replace(/</g, "\\u003c")}</script></html>`;
const checks = [];
for (const [name, bytes, format] of [["manifest.json", json, "manifest_json"], ["classroom.html", html, "offline_html"], ["lesson.maic.zip", zip("manifest.json", json), "maic_zip"], ["lesson.zip", zip("classroom.html", html), "offline_html_zip"]]) {
  const file = path.join(dir, name); fs.writeFileSync(file, bytes); const pkg = readPackage(file), report = inventory(pkg);
  assert.equal(pkg.format, format); assert.equal(report.scenes.length, 3); assert.equal(report.researchReady, false);
  assert.equal(report.scenes[1].externalReferenceCount, 1); assert.ok(report.warnings.some(x => x.includes("答案")));
  checks.push(`${format}解析、摘要与答案边界`);
}
const malicious = path.join(dir, "bad.zip"); fs.writeFileSync(malicious, zip("../manifest.json", json)); assert.throws(() => readPackage(malicious), /不安全/);
const badCrc = zip("manifest.json", json); badCrc[60] ^= 1; fs.writeFileSync(malicious, badCrc); assert.throws(() => readPackage(malicious), /校验/);
fs.writeFileSync(malicious, JSON.stringify({ ...manifest, scenes: [...manifest.scenes, manifest.scenes[0]] })); assert.throws(() => readPackage(malicious), /唯一/);
checks.push("拒绝路径穿越、损坏ZIP与重复场景编号");
const pkg = readPackage(path.join(dir, "manifest.json")); writeAudit(pkg, path.join(dir, "审计")); assert.throws(() => writeAudit(pkg, path.join(dir, "审计")), /已存在/); checks.push("保留源包及旧审计，不覆盖已有目录");
const { spawnSync } = require("node:child_process"), { digest } = require("../lib/openmaic-package");
const mappingFile = path.join(dir, "已审映射.json"), staged = path.join(dir, "暂存");
const mapping = { sourceHash: pkg.sourceHash, reviewedBy: "合成测试审核标签", instrumentVersion: "synthetic-only", mappings: manifest.scenes.map(scene => ({ order: scene.order, contentHash: digest(JSON.stringify(scene.content)), knowledgePointId: "synthetic-kp", subSkill: "synthetic-skill", reviewerApproved: true, semanticAdapter: "synthetic-adapter", role: scene.type === "quiz" ? "assessment_private" : "learning" })) };
fs.writeFileSync(mappingFile, JSON.stringify(mapping));
const stagedResult = spawnSync(process.execPath, [path.join(__dirname, "stage-openmaic-courseware.js"), path.join(dir, "manifest.json"), mappingFile, staged], { windowsHide: true, encoding: "utf8" });
assert.equal(stagedResult.status, 0, stagedResult.stderr);
assert.equal(JSON.parse(fs.readFileSync(path.join(staged, "已审核场景目录.json"), "utf8")).activeRouteChanged, false);
assert.ok(fs.existsSync(path.join(staged, "场景-002.html")));
mapping.mappings[2].role = "learning"; fs.writeFileSync(mappingFile, JSON.stringify(mapping));
const rejectedTarget = path.join(dir, "应拒绝");
assert.notEqual(spawnSync(process.execPath, [path.join(__dirname, "stage-openmaic-courseware.js"), path.join(dir, "manifest.json"), mappingFile, rejectedTarget], { windowsHide: true }).status, 0);
assert.equal(fs.existsSync(rejectedTarget), false); checks.push("完整教学审核后才暂存，测验答案不混入学习页，失败不留下半成品");
const out = path.join(root, "output/OpenMAIC迁移与研究方案-2026-10-17"); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "新版课件格式验收.json"), JSON.stringify({ passed: true, checks, fixture: "依据官方v1.2.0格式构造；不等于实测用户的新课堂导出" }, null, 2));
console.log(`通过：${checks.length}项新版课件读取与边界检查`);
