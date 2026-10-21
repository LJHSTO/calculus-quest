"use strict";

// Read package data without executing authored HTML or extracting archive paths.
const fs = require("node:fs"), path = require("node:path"), zlib = require("node:zlib"), crypto = require("node:crypto");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function safeEntry(name) {
  requireValue(typeof name === "string" && name && !/[\\\x00-\x1f:]/.test(name)
    && !name.startsWith("/") && !name.split("/").some(x => x === ".." || x === "."), "课件包包含不安全的路径");
  return name;
}
function zipEntries(buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  }
  requireValue(end >= 0, "ZIP目录缺失或文件不完整");
  requireValue(buffer.readUInt16LE(end + 4) === 0 && buffer.readUInt16LE(end + 6) === 0, "暂不支持分卷ZIP");
  const count = buffer.readUInt16LE(end + 10), offset = buffer.readUInt32LE(end + 16);
  requireValue(count < 65535 && count <= 10000 && offset < end, "ZIP64或过大的目录暂不支持，请先导出manifest.json");
  const entries = new Map(); let cursor = offset;
  for (let n = 0; n < count; n++) {
    requireValue(cursor + 46 <= end && buffer.readUInt32LE(cursor) === 0x02014b50, "ZIP目录损坏");
    const flags = buffer.readUInt16LE(cursor + 8), method = buffer.readUInt16LE(cursor + 10);
    const size = buffer.readUInt32LE(cursor + 24), packed = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28), extra = buffer.readUInt16LE(cursor + 30), comment = buffer.readUInt16LE(cursor + 32);
    const start = buffer.readUInt32LE(cursor + 42), next = cursor + 46 + nameLength + extra + comment;
    requireValue(next <= end && !(flags & 1) && [0, 8].includes(method), "ZIP格式或加密方式不支持");
    const name = safeEntry(buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"));
    requireValue(!entries.has(name), "ZIP含重复路径");
    entries.set(name, { name, size, read(maxBytes = 24 * 1024 * 1024) {
      requireValue(size <= maxBytes && start + 30 <= offset && buffer.readUInt32LE(start) === 0x04034b50, "ZIP条目过大或损坏");
      const localNameLength = buffer.readUInt16LE(start + 26), localExtra = buffer.readUInt16LE(start + 28);
      const dataStart = start + 30 + localNameLength + localExtra;
      requireValue(dataStart + packed <= offset, "ZIP条目越界");
      requireValue(buffer.subarray(start + 30, start + 30 + localNameLength).toString("utf8") === name
        && buffer.readUInt16LE(start + 8) === method && buffer.readUInt16LE(start + 6) === flags, "ZIP本地条目与目录不一致");
      const content = buffer.subarray(dataStart, dataStart + packed);
      const raw = method === 0 ? content : zlib.inflateRawSync(content, { maxOutputLength: maxBytes });
      requireValue(raw.length === size, "ZIP条目长度不一致");
      // CRC is checked as well: corrupted media cannot silently acquire a new hash.
      let crc = 0xffffffff;
      for (const byte of raw) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
      requireValue(((crc ^ 0xffffffff) >>> 0) === buffer.readUInt32LE(cursorForEntry + 16), "ZIP条目校验失败");
      return raw;
    } });
    const cursorForEntry = cursor; // block-scoped for the deferred reader
    cursor = next;
  }
  return entries;
}
function embeddedManifest(html) {
  const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(m => /\bid\s*=\s*["']openmaic-classroom["']/i.test(m[1])
      && /\btype\s*=\s*["']application\/json["']/i.test(m[1]));
  requireValue(blocks.length === 1, "不是可识别的OpenMAIC离线课堂：需要唯一的openmaic-classroom数据块");
  return JSON.parse(blocks[0][2]);
}
function readPackage(file) {
  requireValue(fs.statSync(file).size <= 512 * 1024 * 1024, "审计器单包上限512MB；较大课堂请提供manifest.json及独立资源目录");
  const bytes = fs.readFileSync(file); let manifest, format, entries = new Map();
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    entries = zipEntries(bytes);
    if (entries.has("manifest.json")) { manifest = JSON.parse(entries.get("manifest.json").read().toString("utf8")); format = "maic_zip"; }
    else if (entries.has("classroom.html")) { manifest = embeddedManifest(entries.get("classroom.html").read(128 * 1024 * 1024).toString("utf8")); format = "offline_html_zip"; }
    else throw new Error("ZIP中没有根目录manifest.json或classroom.html");
  } else {
    const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
    if (text.trimStart().startsWith("{")) { manifest = JSON.parse(text); format = "manifest_json"; }
    else { manifest = embeddedManifest(text); format = "offline_html"; }
  }
  requireValue(manifest?.formatVersion === 1 && Array.isArray(manifest.scenes) && manifest.scenes.length > 0, "不支持的课堂格式版本或空课堂");
  requireValue(manifest.scenes.length <= 1000, "课堂场景数超过审计上限");
  const orders = new Set();
  for (const scene of manifest.scenes) {
    requireValue(Number.isInteger(scene.order) && scene.order >= 0 && !orders.has(scene.order), "场景order必须唯一且为非负整数"); orders.add(scene.order);
    requireValue(["slide", "interactive", "quiz", "pbl"].includes(scene.type) && scene.content && typeof scene.content === "object", "课堂包含不支持的场景");
  }
  return { manifest, format, entries, sourceHash: digest(bytes), sourceName: path.basename(file) };
}
function inventory(pkg) {
  return { schemaVersion: "openmaic-migration-audit-v1", sourceName: pkg.sourceName, sourceHash: pkg.sourceHash,
    sourceFormat: pkg.format, appVersion: pkg.manifest.appVersion || "未知", formatVersion: pkg.manifest.formatVersion,
    title: pkg.manifest.stage?.name || "未命名课堂", researchReady: false,
    warnings: ["离线播放不是主动介入适配；需逐场景映射、语义事件和服务端测量。",
      "原始manifest可能含测验答案，不可直接放入学生静态目录。",
      ...(pkg.format.startsWith("offline") ? ["离线播放清单已简化；白板、多智能体配置和在线PBL不可据此恢复。优先取得.maic.zip作为迁移源。"] : [])],
    scenes: pkg.manifest.scenes.map(scene => ({ order: scene.order, type: scene.type, title: scene.title,
      widgetType: scene.content.widgetType || "", contentHash: digest(JSON.stringify(scene.content)),
      inlineHtml: typeof scene.content.html === "string" && scene.content.html.length > 0,
      hasSemanticBridge: /courseware-(?:semantic|learning)|CoursewareLearningEvidence/.test(scene.content.html || ""),
      externalReferenceCount: new Set((JSON.stringify(scene.content).match(/https?:\/\/[^\s"<>]+/g) || [])).size,
      // Findings are leads; a static scan cannot prove the absence of dynamic network calls.
      status: scene.type === "quiz" ? "答案与学生题面分离后迁移" : scene.type === "pbl" ? "需单独适配在线交互" : "等待教学映射与浏览器验收"
    })),
    assets: [...pkg.entries.values()].map(e => ({ path: e.name, bytes: e.size })),
    requiredChecks: ["目标与子技能", "课件事件来源", "L1至L5任务边界", "共同探针与结果题分池", "学生控制", "升级渐退退出", "离线网络检查", "小窗口真实操作"] };
}
function mappingTemplate(pkg) {
  return { sourceHash: pkg.sourceHash, reviewedBy: "", instrumentVersion: "", mappings: pkg.manifest.scenes.map(s => ({
    order: s.order, contentHash: digest(JSON.stringify(s.content)), knowledgePointId: "", subSkill: "", role: s.type === "quiz" ? "assessment_review_required" : "learning",
    evidenceScope: "unknown", independentCheckItemIds: [], semanticAdapter: "", reviewerApproved: false
  })) };
}
function writeAudit(pkg, directory) {
  requireValue(!fs.existsSync(directory), "目标目录已存在；请使用新的版本目录以保留原审计结果");
  fs.mkdirSync(directory, { recursive: true });
  const report = inventory(pkg);
  fs.writeFileSync(path.join(directory, "课件迁移审计.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(directory, "教学映射待填写.json"), JSON.stringify(mappingTemplate(pkg), null, 2));
  fs.writeFileSync(path.join(directory, "原始课堂清单-含答案勿公开.json"), JSON.stringify(pkg.manifest, null, 2));
  return report;
}
module.exports = { readPackage, inventory, mappingTemplate, writeAudit, zipEntries, embeddedManifest, digest };
