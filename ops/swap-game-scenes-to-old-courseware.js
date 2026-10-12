"use strict";

/**
 * Swap the game slot of every knowledge point to the old courseware's
 * misconception-repair game.
 *
 * Measured reason: the new package's six games are one template — identical
 * `gameType` and `scoring` (including a `speedBonus` that rewards rushing), two of
 * them carry no learner feedback at all, one has corrupted generated text, and the
 * interaction is "fill the slots" rather than reasoning. The old courseware's six
 * games are purpose-built per knowledge point (six distinct evidence scopes), ask
 * the learner to hypothesise a rule and test it against all collected evidence,
 * carry zero cross-scene references and zero persona names (so they mix cleanly
 * with the new slides), and are already fully integrated with the platform.
 *
 * The simulation / diagram / 3D slots keep the new package: its widget config is
 * richer, its 3D scenes are correctly scoped, and its slides are written and
 * self-contained. Each knowledge point still ends up with three or four scenes of
 * different types, so scene choice stays a real variable.
 *
 * Dry-run by default; pass --apply to rewrite the route.
 *
 * Usage: node ops/swap-game-scenes-to-old-courseware.js [--apply]
 */

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const apply = process.argv.includes("--apply");
const routePath = path.join(root, "data", "multi-scene-learning-route.json");
const route = JSON.parse(fs.readFileSync(routePath, "utf8"));
const chapter = route.chapters.find((entry) => entry.id === "V14-C1");
assert.ok(chapter, "V14-C1 chapter missing from the route");

// knowledge point -> the old courseware game that teaches it
const OLD_GAME_ROOT = {
  "GH-01-K01": "GH-01-函数、坐标与图像读法入门",
  "GH-01-K02": "GH-01-函数、坐标与图像读法入门",
  "GH-01-K03": "GH-01-函数、坐标与图像读法入门",
  "GH-02-K01": "GH-02-极限与连续：直觉探索",
  "GH-02-K02": "GH-02-极限与连续：直觉探索",
  "GH-02-K03": "GH-02-极限与连续：直觉探索"
};
const OLD_GAME_FILE = {
  "GH-01-K01": "05_输入、输出和函数规则：误解修复挑战.html",
  "GH-01-K02": "10_坐标点与函数图像：误解修复挑战.html",
  "GH-01-K03": "16_图像的上升、下降与变化方向：误解修复挑战.html",
  "GH-02-K01": "05_从数表观察趋近：误解修复挑战.html",
  "GH-02-K02": "10_图像上的左右极限：误解修复挑战.html",
  "GH-02-K03": "16_连续就是不跳断：误解修复挑战.html"
};

const rows = [];
for (const module of chapter.modules) {
  for (const point of module.knowledgePoints) {
    const dir = OLD_GAME_ROOT[point.id];
    const file = OLD_GAME_FILE[point.id];
    assert.ok(dir && file, `no old game mapped for ${point.id}`);
    const absolute = path.join(root, "resources", "open-maic", dir, "interactive", file);
    assert.ok(fs.existsSync(absolute), `old game missing on disk: ${dir}/${file}`);
    const html = fs.readFileSync(absolute, "utf8");
    // The replacement must be able to carry the same evidence contract.
    assert.match(html, /recordChallenge/, `${file} does not report a challenge result`);
    assert.match(html, /openmaic-semantic-contract/, `${file} is missing the semantic contract`);
    assert.match(html, /openmaic-storage-shim-v2/, `${file} is missing the storage shim`);

    const candidates = point.resourceCandidates || [];
    const index = candidates.findIndex((candidate) => candidate.type === "game"
      || candidate.widgetType === "game");
    assert.ok(index >= 0, `${point.id} has no game candidate to replace`);
    const before = candidates[index];
    const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || before.title;
    candidates[index] = {
      ...before,
      root: `open-maic/${dir}`,
      file: `interactive/${file}`,
      title,
      widgetType: "game",
      type: "game",
      sceneOrder: before.sceneOrder,
      score: before.score,
      description: "收集证据、提出规则、用全部证据检验的误解修复挑战。"
    };
    rows.push({
      knowledgePoint: point.id,
      from: `${before.root.split("/").pop()}/${before.file.split("/").pop()}`.slice(0, 46),
      to: `${dir}/${file}`.slice(0, 46)
    });
  }
}

const digest = crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 8);
const previousVersion = route.versionId;
route.versionId = `multi-scene-functions-limits-hybrid-${digest}`;
const output = `${JSON.stringify(route, null, 2)}\n`;
const target = apply ? routePath : path.join(root, "tmp", "multi-scene-learning-route.hybrid.json");
fs.writeFileSync(target, output, "utf8");

console.log(`${apply ? "APPLIED" : "DRY RUN"} — route version ${previousVersion} -> ${route.versionId}`);
console.log("\nknowledge point | replaced game");
for (const row of rows) {
  console.log(`  ${row.knowledgePoint.padEnd(13)} | ${row.from}  ->  ${row.to.split("/").pop()}`);
}
console.log(`\nwritten: ${path.relative(root, target).replaceAll("\\", "/")}`);
if (!apply) console.log("Review, then re-run with --apply.");
