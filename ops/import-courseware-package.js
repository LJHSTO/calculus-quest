"use strict";

/**
 * Land an OpenMAIC classroom package (.maic.zip or its manifest.json) as
 * per-scene HTML files under resources/open-maic/, in the layout the platform
 * and ops/apply-v14-c3-semantic-contracts.js expect:
 *
 *   <root>/<moduleDir>/interactive/<NN>_<title>.html
 *
 * The package stores each interactive scene as an inline `content.html` string;
 * this script writes them out and reports the scene inventory so the route can be
 * pointed at them.
 *
 * Non-destructive: it writes into the module directories you name and refuses to
 * overwrite an existing file unless --force is passed.
 *
 * Usage:
 *   node ops/import-courseware-package.js <manifest.json|.maic.zip> [--root <dir>] [--force]
 */

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");

// Minimal flag parser: --flag, --key value, and repeated --module value.
function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();
  const repeated = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { flags.add(name); continue; }
    i += 1;
    if (!repeated.has(name)) repeated.set(name, []);
    repeated.get(name).push(next);
    values.set(name, next);
  }
  return { flags, values, repeated, positional };
}

const cli = parseArgs(process.argv.slice(2));
const force = cli.flags.has("force");
const targetRoot = cli.values.has("root")
  ? path.resolve(root, cli.values.get("root"))
  : path.join(root, "resources", "open-maic");
const source = cli.positional[0];

assert.ok(source, "usage: node ops/import-courseware-package.js <manifest.json|.maic.zip> [--root <dir>] [--module <name>]... [--force]");
assert.ok(fs.existsSync(source), `package not found: ${source}`);

// --- read the manifest (plain JSON, or the single entry inside a .maic.zip) ---
function readManifest(file) {
  const buffer = fs.readFileSync(file);
  const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!isZip) return JSON.parse(buffer.toString("utf8"));
  const { execFileSync } = require("node:child_process");
  const outDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "maic-import-"));
  execFileSync("powershell", [
    "-NoProfile", "-Command",
    `Expand-Archive -LiteralPath '${file.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`
  ], { stdio: "ignore" });
  const manifestFile = path.join(outDir, "manifest.json");
  assert.ok(fs.existsSync(manifestFile), "the archive has no manifest.json");
  const parsed = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  parsed.__extractedFrom = outDir;
  return parsed;
}

const manifest = readManifest(source);
const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
assert.ok(scenes.length, "the package has no scenes");
console.log(`package: ${path.basename(source)}`);
console.log(`classroom: ${manifest.stage?.name || "(unnamed)"} | scenes: ${scenes.length} | appVersion: ${manifest.appVersion}`);

// --- group interactive scenes into knowledge-point blocks ---
// A knowledge point's scenes run consecutively between quiz scenes. The new
// package only has chapter-level quizzes, so we split on the slide that opens a
// knowledge point: each block starts at a slide and ends before the next block's
// first slide, with quizzes acting as hard separators.
const interactive = scenes.filter((scene) => scene.type === "interactive");
const missingInline = interactive.filter((scene) => !String(scene.content?.html || "").trim());
assert.equal(
  missingInline.length,
  0,
  `${missingInline.length} interactive scene(s) have no inline html: ${missingInline.map((s) => s.order).join(", ")}`
);

// --- write files, numbered by scene order, grouped two module dirs deep ---
// The caller names the module directories; default to one flat dir per half so a
// 6-knowledge-point chapter lands as GH-01 (first three) + GH-02 (last three),
// matching the existing route layout.
const moduleDirs = cli.repeated.get("module")?.length
  ? cli.repeated.get("module")
  : ["GH-01-新课件", "GH-02-新课件"];

// Split interactive scenes into module blocks the way the package itself does:
// a mid-chapter quiz is a hard boundary. The package opens with a pretest and
// closes with a posttest, so the boundary count is "quizzes before this scene,
// minus the pretest". Splitting by scene count instead would cut a knowledge
// point in half.
function moduleIndexFor(scene) {
  const quizzesBefore = scenes.filter(
    (candidate) => candidate.type === "quiz" && candidate.order < scene.order
  ).length;
  return Math.min(moduleDirs.length - 1, Math.max(0, quizzesBefore - 1));
}

const written = [];
const skipped = [];

interactive.forEach((scene) => {
  const moduleDir = moduleDirs[moduleIndexFor(scene)];
  const dir = path.join(targetRoot, moduleDir, "interactive");
  fs.mkdirSync(dir, { recursive: true });
  const safeTitle = String(scene.title || `scene-${scene.order}`)
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 60);
  const file = path.join(dir, `${String(scene.order).padStart(2, "0")}_${safeTitle}.html`);
  if (fs.existsSync(file) && !force) {
    skipped.push(file);
    return;
  }
  fs.writeFileSync(file, String(scene.content.html), "utf8");
  written.push({
    order: scene.order,
    widgetType: scene.content?.widgetType || "",
    title: scene.title,
    file: path.relative(root, file).replaceAll("\\", "/"),
    bytes: Buffer.byteLength(String(scene.content.html), "utf8")
  });
});

console.log(`\nwrote ${written.length} file(s), skipped ${skipped.length} existing`);
for (const entry of written) {
  console.log(`  ${String(entry.order).padStart(3)} | ${entry.widgetType.padEnd(16)} | ${(entry.bytes / 1048576).toFixed(2)}MB | ${entry.file}`);
}
if (skipped.length) {
  console.log("\nskipped (already present; pass --force to overwrite):");
  skipped.forEach((file) => console.log(`  ${path.relative(root, file).replaceAll("\\", "/")}`));
}

// --- machine-readable inventory for the route update ---
const inventoryFile = path.join(root, "tmp", "courseware-import-inventory.json");
fs.mkdirSync(path.dirname(inventoryFile), { recursive: true });
fs.writeFileSync(inventoryFile, JSON.stringify({
  source: path.basename(source),
  classroom: manifest.stage?.name || "",
  importedAt: new Date().toISOString(),
  scenes: written
}, null, 2) + "\n", "utf8");
console.log(`\ninventory: ${path.relative(root, inventoryFile).replaceAll("\\", "/")}`);

if (manifest.__extractedFrom) {
  fs.rmSync(manifest.__extractedFrom, { recursive: true, force: true });
}
