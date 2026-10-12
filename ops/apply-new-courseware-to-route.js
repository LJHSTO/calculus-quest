"use strict";

/**
 * Point the learning route at an imported courseware package.
 *
 * For every knowledge point it:
 *   - replaces `resourceCandidates` with the package's interactive scenes,
 *   - merges the package's per-knowledge-point slide pages into the single
 *     `slide.canvas` the platform renders.
 *
 * Why merging: the route model has exactly one slide slot per knowledge point
 * (render-learning.js reads `kp.slide`, singular), while the new package emits
 * two pages per knowledge point (concept + worked example). `renderSlideCanvas`
 * builds a fixed `viewportSize × viewportSize*viewportRatio` stage and positions
 * elements absolutely, so stacking page B below page A by one page height is a
 * geometry-only transform that keeps every element.
 *
 * Safety: dry-run by default. Writes to tmp/ and prints a diff summary; pass
 * --apply to rewrite data/multi-scene-learning-route.json in place.
 *
 * Usage:
 *   node ops/apply-new-courseware-to-route.js --package <manifest.json> --root <moduleDir>=<moduleId>... [--apply]
 */

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();
  const repeated = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { flags.add(name); continue; }
    i += 1;
    if (!repeated.has(name)) repeated.set(name, []);
    repeated.get(name).push(next);
    values.set(name, next);
  }
  return { flags, values, repeated };
}

const cli = parseArgs(process.argv.slice(2));
const apply = cli.flags.has("apply");
const packagePath = cli.values.get("package");
assert.ok(packagePath, "usage: node ops/apply-new-courseware-to-route.js --package <manifest.json> [--apply]");
assert.ok(fs.existsSync(packagePath), `package not found: ${packagePath}`);

const routePath = path.join(root, "data", "multi-scene-learning-route.json");
const route = JSON.parse(fs.readFileSync(routePath, "utf8"));
const chapter = route.chapters.find((entry) => entry.id === "V14-C1");
assert.ok(chapter, "V14-C1 chapter missing from the route");

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const scenes = Array.isArray(pkg.scenes) ? pkg.scenes : [];
assert.ok(scenes.length, "package has no scenes");

// moduleDir -> moduleId, e.g. --root "GH-01-新课件v2=GH-01"
const moduleMap = new Map(
  (cli.repeated.get("root") || []).map((pair) => {
    const [dir, id] = pair.split("=");
    assert.ok(dir && id, `--root expects <moduleDir>=<moduleId>, got "${pair}"`);
    return [dir, id];
  })
);
if (!moduleMap.size) {
  for (const module of chapter.modules) moduleMap.set(`${module.id}-新课件v2`, module.id);
}

const NEWLINE = "\n";

// ---- 1. index the package ---------------------------------------------------
// Quizzes are chapter furniture, not knowledge-point content. Excluding every
// quiz (not just the first and last) matters: the mid-chapter formative quiz
// sits between knowledge points and would otherwise break the slide/interactive
// alternation the block detector relies on.
const bodyScenes = scenes.filter((scene) => scene.type !== "quiz");

const blocks = [];
let current = null;
for (const scene of bodyScenes) {
  const isSlide = scene.type === "slide" && (scene.content?.canvas?.elements || []).length > 0;
  if (isSlide) {
    // A knowledge point opens with its slide run and then goes interactive. So a
    // slide that follows interactive scenes starts the NEXT knowledge point —
    // title prefixes are unreliable (some knowledge points have two concept
    // pages and no 示例 page at all).
    const previous = bodyScenes[bodyScenes.indexOf(scene) - 1];
    const startsNew = !current || (previous && previous.type === "interactive");
    if (startsNew) {
      current = { slides: [], interactive: [] };
      blocks.push(current);
    }
    current.slides.push(scene);
    continue;
  }
  if (scene.type === "interactive" && current) current.interactive.push(scene);
}
// A trailing slide-only block is chapter furniture (本章整理), not a knowledge point.
const knowledgeBlocks = blocks.filter((block) => block.interactive.length > 0);
const chapterTailSlides = blocks
  .filter((block) => block.interactive.length === 0)
  .flatMap((block) => block.slides);

const knowledgePoints = chapter.modules.flatMap((module) => module.knowledgePoints);
assert.equal(
  knowledgeBlocks.length,
  knowledgePoints.length,
  `package produced ${knowledgeBlocks.length} knowledge-point blocks but the route has ${knowledgePoints.length}`
);
if (chapterTailSlides.length) {
  console.log(`note: ${chapterTailSlides.length} trailing slide(s) are chapter furniture, not knowledge points: `
    + chapterTailSlides.map((s) => s.order).join(", "));
}

// ---- 2. slide pages --------------------------------------------------------
// Each knowledge point ships two slide pages (concept + worked example). The
// route model has a single `slide` slot, so the pages are carried as `slide.pages`
// and the renderer shows them one at a time. An earlier version stacked them into
// one tall canvas, which reads as a single long page rather than as slides.
function buildSlidePages(slides, kp) {
  const pages = slides.map((scene) => structuredClone(scene.content.canvas));
  const speech = slides
    .flatMap((scene) => (scene.actions || []).filter((a) => a.type === "speech").map((a) => a.text || ""))
    .join("\n\n")
    .trim();
  return {
    title: slides[0].title,
    sceneOrder: slides[0].order,
    summary: speech,
    // `canvas` stays as the first page so single-canvas readers keep working.
    canvas: pages[0],
    pages,
    pageCount: pages.length,
    pageTitles: slides.map((scene) => scene.title)
  };
}

// ---- 3. rebuild candidates -------------------------------------------------
const summary = [];
for (const [index, kp] of knowledgePoints.entries()) {
  const block = knowledgeBlocks[index];
  const moduleDir = [...moduleMap.entries()].find(([, id]) => kp.id.startsWith(id))?.[0];
  assert.ok(moduleDir, `no module dir mapped for ${kp.id}`);

  const before = (kp.resourceCandidates || []).length;
  kp.slide = buildSlidePages(block.slides, kp);
  kp.resourceCandidates = block.interactive.map((scene) => {
    const widgetType = scene.content?.widgetType || "";
    const config = scene.content?.widgetConfig || {};
    const safeTitle = String(scene.title || `scene-${scene.order}`).replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
    return {
      root: `open-maic/${moduleDir}`,
      file: `interactive/${String(scene.order).padStart(2, "0")}_${safeTitle}.html`,
      title: scene.title,
      type: widgetType === "diagram" ? "mindMap" : widgetType,
      widgetType,
      sceneOrder: scene.order,
      score: 100,
      description: String(config.description || config.concept || scene.title || "").slice(0, 300)
    };
  });
  summary.push({
    knowledgePoint: kp.id,
    name: kp.name,
    slidePages: kp.slide.pageCount,
    candidatesBefore: before,
    candidatesAfter: kp.resourceCandidates.length,
    widgets: kp.resourceCandidates.map((c) => c.widgetType).join(",")
  });
}

// ---- 4. version bump -------------------------------------------------------
const previousVersion = route.versionId;
const digest = crypto.createHash("sha256")
  .update(JSON.stringify(summary))
  .digest("hex").slice(0, 8);
route.versionId = `multi-scene-functions-limits-intuition-${digest}`;

const output = JSON.stringify(route, null, 2) + NEWLINE;
const target = apply ? routePath : path.join(root, "tmp", "multi-scene-learning-route.new.json");
fs.writeFileSync(target, output, "utf8");

console.log(`${apply ? "APPLIED" : "DRY RUN"} — route version ${previousVersion} -> ${route.versionId}`);
console.log(`\nkp                | slide pages | candidates | widgets`);
for (const row of summary) {
  console.log([
    row.knowledgePoint.padEnd(17),
    String(row.slidePages).padEnd(13),
    `${row.candidatesBefore}->${row.candidatesAfter}`.padEnd(10),
    row.widgets
  ].join(" | "));
}
console.log(`\ntotal interactive scenes: ${summary.reduce((n, r) => n + r.candidatesAfter, 0)}`);
console.log(`written: ${path.relative(root, target).replaceAll("\\", "/")} (${Buffer.byteLength(output, "utf8")} bytes)`);
if (!apply) console.log("\nReview the diff, then re-run with --apply.");
