const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const requiredFiles = [
  "flow-test.html",
  "app/flow-test/flow-test.css",
  "app/flow-test/flow-test.js"
];
requiredFiles.forEach((file) => assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`));

const html = fs.readFileSync(path.join(root, "flow-test.html"), "utf8");
const css = fs.readFileSync(path.join(root, "app", "flow-test", "flow-test.css"), "utf8");
const js = fs.readFileSync(path.join(root, "app", "flow-test", "flow-test.js"), "utf8");
assert.match(html, /app\/flow-test\/flow-test\.css/);
assert.match(html, /app\/flow-test\/flow-test\.js/);
assert.doesNotMatch(html, /admin_flow/);
assert.match(html, /href="\.\/"/);
assert.doesNotMatch(html, /href="\/"/);
assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
assert.match(css, /\.frame-empty\[hidden\]\s*\{\s*display:\s*none;/);
assert.match(js, /const BASE_PATH =/);
assert.match(js, /appUrl\("api\/course\/openmaic-v14-route"\)/);
assert.match(js, /appUrl\("api\/learning\/kg"\)/);
assert.doesNotMatch(js, /fetchJson\("\/api\//);

const route = JSON.parse(fs.readFileSync(path.join(root, "data", "openmaic-v14-route.json"), "utf8"));
const resources = [];
(route.chapters || []).forEach((chapter) => {
  (chapter.modules || []).forEach((module) => {
    (module.knowledgePoints || []).forEach((knowledgePoint) => {
      (knowledgePoint.resourceCandidates || []).forEach((candidate) => {
        const file = path.join(root, "resources", candidate.root, candidate.file);
        resources.push(file);
        assert.ok(fs.existsSync(file), `Missing resource for ${knowledgePoint.id}: ${file}`);
        assert.match(candidate.root, /^open-maic\//, `Unexpected resource root: ${candidate.root}`);
      });
    });
  });
});

assert.equal(route.chapters.length, 11);
assert.equal(resources.length, 288);
console.log(JSON.stringify({ ok: true, chapters: route.chapters.length, resources: resources.length }, null, 2));
