const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const core = fs.readFileSync(path.join(root, "app", "main", "core.js"), "utf8");
const analytics = fs.readFileSync(path.join(root, "app", "main", "analytics.js"), "utf8");
const renderer = fs.readFileSync(path.join(root, "app", "main", "render-learning.js"), "utf8");

assert.match(index, /app\/main\/content-security\.js/);
assert.ok(
  index.indexOf("app/main/content-security.js") < index.indexOf("app/main/core.js"),
  "content sanitizer must load before core rendering"
);
assert.doesNotMatch(core, /localStorage\.setItem\(AUTH_TOKEN_KEY/);
assert.match(core, /sessionStorage\.setItem\(AUTH_TOKEN_KEY/);
assert.match(core, /delete persisted\.authToken/);
assert.doesNotMatch(renderer, /sandbox="[^"]*allow-same-origin/);
assert.match(analytics, /event\.source/);
assert.match(analytics, /contentWindow === event\.source/);
assert.match(core, /CourseContentSecurity\.sanitizeRichHtml/);

console.log("client content security tests passed");
