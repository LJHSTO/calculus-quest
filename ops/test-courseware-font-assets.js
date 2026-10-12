"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createCoursewareFontRewriter } = require("../lib/courseware-font-assets");

const root = path.resolve(__dirname, "..");
const rewrite = createCoursewareFontRewriter(root);
const font = fs.readFileSync(path.join(root, "lib/fonts/KaTeX_Main-Regular.woff2")).toString("base64");
const source = `<style>@font-face{src:url(data:font/woff2;base64,${font})}</style><p>f(x)</p>`;
const resource = path.join(root, "resources/open-maic/module/interactive/lesson.html");
const result = rewrite(source, resource);
assert.equal(result, '<style>@font-face{src:url(../../../../lib/fonts/KaTeX_Main-Regular.woff2)}</style><p>f(x)</p>');
assert.equal(rewrite(result, resource), result);
const unknown = "data:font/woff2;base64,YWJj";
assert.equal(rewrite(unknown, resource), unknown, "Unknown fonts must remain embedded.");
assert.equal(rewrite(source, path.join(root, "resources/open-maic/module/lesson.html"))
  .includes("../../../lib/fonts/KaTeX_Main-Regular.woff2"), true);
console.log("courseware font deduplication tests passed");
