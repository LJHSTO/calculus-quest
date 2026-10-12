"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function loadLearningRuntime(root) {
  const manifestPath = path.join(root, "assets/learning-runtime.json");
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const digest = value => crypto.createHash("sha256").update(value).digest("hex");
  let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  if (digest(html) !== manifest.indexSha256) return null;
  if (!manifest.scripts.length) return null;
  const bundle = fs.readFileSync(path.join(root, "assets/learning-runtime.js"));
  if (digest(bundle).slice(0, 20) !== manifest.version) return null;
  for (const script of manifest.scripts) {
    if (digest(fs.readFileSync(path.join(root, script.file))) !== script.sha256) return null;
    if (!html.includes(script.tag)) return null;
  }
  if (manifest.styles) {
    const css = fs.readFileSync(path.join(root, "assets/learning-runtime.css"));
    if (digest(css).slice(0, 20) !== manifest.styleVersion) return null;
    for (const source of [...manifest.styleSources, ...manifest.icons]) {
      if (digest(fs.readFileSync(path.join(root, source.file))) !== source.sha256) return null;
    }
    for (const [index, style] of manifest.styles.entries()) {
      if (!html.includes(style.tag)) return null;
      html = html.replace(style.tag, index === 0
        ? `<link rel="stylesheet" href="assets/learning-runtime.css?v=${manifest.styleVersion}" />` : "");
    }
    for (const icon of manifest.icons) {
      const encoded = fs.readFileSync(path.join(root, icon.file)).toString("base64");
      html = html.replaceAll(`src="${icon.file}"`, `src="data:image/svg+xml;base64,${encoded}"`);
    }
  }
  // Preserve classic-script order and global bindings; monitoring keeps its own script URL.
  for (const [index, script] of manifest.scripts.entries()) {
    html = html.replace(script.tag, index === 0
      ? `<script src="assets/learning-runtime.js?v=${manifest.version}"></script>`
      : "");
  }
  return Buffer.from(html);
}

module.exports = { loadLearningRuntime };
