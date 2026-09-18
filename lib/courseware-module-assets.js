"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function loadCoursewareModules(root) {
  const manifestPath = path.join(root, "assets/courseware-modules/manifest.json");
  const files = new Set();
  const lookup = new Map();
  if (fs.existsSync(manifestPath)) {
    for (const entry of JSON.parse(fs.readFileSync(manifestPath, "utf8"))) {
      if (!/^[A-Za-z0-9-]+-[a-f0-9]{16}\.js$/.test(entry.file)) throw new Error("Invalid courseware module filename.");
      const relative = `assets/courseware-modules/${entry.file}`;
      const bytes = fs.readFileSync(path.join(root, relative));
      if (crypto.createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
        throw new Error("Courseware module integrity check failed.");
      }
      files.add(relative);
      lookup.set(entry.sourceHash, relative);
    }
  }
  return {
    files,
    rewrite(html, filePath) {
      if (!lookup.size) return html;
      const directory = path.posix.dirname(path.relative(root, filePath).replaceAll(path.sep, "/"));
      return html.replace(/<script type="importmap">([\s\S]*?)<\/script>/g, (tag, json) => {
        const map = JSON.parse(json);
        let changed = false;
        for (const [name, value] of Object.entries(map.imports || {})) {
          if (!value.startsWith("data:text/javascript;base64,")) continue;
          const bytes = Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
          const target = lookup.get(crypto.createHash("sha256").update(bytes).digest("hex"));
          if (!target) continue;
          map.imports[name] = path.posix.relative(directory, target);
          changed = true;
        }
        return changed ? `<script type="importmap">${JSON.stringify(map)}</script>` : tag;
      });
    }
  };
}

module.exports = { loadCoursewareModules };
