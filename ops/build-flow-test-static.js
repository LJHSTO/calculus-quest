const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist", "flow-test");

function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(output, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyCourseware(sourceDir, targetDir, relative = "") {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const childRelative = path.join(relative, entry.name);
    const normalized = childRelative.replaceAll(path.sep, "/");
    const topLevel = normalized.split("/")[0];
    if (entry.name === "manifest.json" || topLevel === "prompts" || topLevel === "versions") continue;
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyCourseware(source, target, childRelative);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
  }
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

[
  "flow-test.html",
  "app/flow-test/flow-test.css",
  "app/flow-test/flow-test.js",
  "data/multi-scene-learning-route.json",
  "data/knowledge-graph.json"
].forEach(copyFile);

fs.writeFileSync(path.join(output, "_redirects"), "/flow-test /flow-test.html 200\n", "utf8");

copyCourseware(path.join(root, "resources", "open-maic"), path.join(output, "resources", "open-maic"));

const countFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).reduce(
  (total, entry) => total + (entry.isDirectory() ? countFiles(path.join(directory, entry.name)) : 1),
  0
);
console.log(JSON.stringify({ output, files: countFiles(output) }, null, 2));
