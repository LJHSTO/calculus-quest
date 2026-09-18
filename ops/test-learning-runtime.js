"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadLearningRuntime } = require("../lib/learning-runtime");

const root = path.resolve(__dirname, "..");
const html = loadLearningRuntime(root).toString();
assert.match(html, /app\/main\/error-monitoring\.js/);
assert.equal([...html.matchAll(/<script src=/g)].length, 2);
assert.ok(html.indexOf("app/main/error-monitoring.js") < html.indexOf("assets/learning-runtime.js"));
assert.equal([...html.matchAll(/<link rel="stylesheet"/g)].length, 1);
assert.match(html, /assets\/learning-runtime\.css\?v=/);
assert.ok(!html.includes('src="assets/classroom-icons/'));
const css = fs.readFileSync(path.join(root, "assets/learning-runtime.css"), "utf8");
assert.match(css, /\.\.\/lib\/fonts\/KaTeX_Main-Regular\.woff2/);
assert.ok(!css.includes("D:") && !css.includes("\\Projects\\"));
const read = fs.readFileSync;
try {
  for (const source of ["app/main/core.js", "styles.css", "assets/classroom-icons/Play.svg"]) {
    fs.readFileSync = (file, ...args) => {
      const value = read(file, ...args);
      if (file === path.join(root, source)) return Buffer.from(`${value}\n/* changed source */`);
      return value;
    };
    assert.equal(loadLearningRuntime(root), null, `Stale ${source} must fall back to original sources.`);
  }
} finally {
  fs.readFileSync = read;
}
console.log("learning runtime order and stale-build fallback tests passed");
