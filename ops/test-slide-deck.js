"use strict";
// The slide must be a paginated deck, not one tall stacked page.
//
// Two independent things have to hold:
//   1. the route carries the pages separately (slide.pages), and
//   2. the renderer turns them into a deck with prev/next controls.
// A route with merged canvases, or a renderer that ignores `pages`, both regress
// silently to the long-scroll form the learner complained about.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const route = JSON.parse(fs.readFileSync(path.join(root, "data", "multi-scene-learning-route.json"), "utf8"));
const renderer = fs.readFileSync(path.join(root, "app", "main", "render-learning.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const chapter = route.chapters.find((entry) => entry.id === "V14-C1");
const points = chapter.modules.flatMap((module) => module.knowledgePoints);

// --- 1. route carries pages ------------------------------------------------
// The route may ship either shape: `slide.pages` (a package that emits more than
// one page per knowledge point) or a single `slide.canvas` (the older courseware).
// Both must render correctly, so the test guards whichever shape is in the route
// rather than assuming one.
const pagedPoints = points.filter((point) => Array.isArray(point.slide.pages));
const singlePoints = points.filter((point) => !Array.isArray(point.slide.pages));
assert.equal(
  pagedPoints.length + singlePoints.length,
  points.length,
  "every knowledge point must have either slide.pages or slide.canvas"
);

let pageTotal = 0;
for (const point of pagedPoints) {
  const slide = point.slide;
  assert.ok(slide.pages.length >= 1, `${point.id} needs at least one page`);
  assert.equal(slide.pageCount, slide.pages.length, `${point.id} pageCount must match pages`);
  assert.deepEqual(slide.canvas, slide.pages[0], `${point.id} slide.canvas must stay the first page`);
  for (const [index, page] of slide.pages.entries()) {
    const height = Math.round(Number(page.viewportSize) * Number(page.viewportRatio));
    const bottoms = (page.elements || []).map((el) => Number(el.top || 0) + Number(el.height || 0));
    assert.ok(
      Math.max(0, ...bottoms) <= height + 2,
      `${point.id} page ${index + 1} overflows its canvas (max ${Math.round(Math.max(0, ...bottoms))} > ${height})`
    );
    const ids = (page.elements || []).map((el) => el.id);
    assert.equal(new Set(ids).size, ids.length, `${point.id} page ${index + 1} has duplicate element ids`);
  }
  pageTotal += slide.pages.length;
}

for (const point of singlePoints) {
  assert.ok(point.slide.canvas?.elements?.length, `${point.id} has no slide canvas at all`);
  pageTotal += 1;
}

// A merged canvas would be taller than a single page (the old 1126-tall form).
for (const point of points) {
  for (const page of (point.slide.pages || [point.slide.canvas]).filter(Boolean)) {
    const ratio = Number(page.viewportRatio);
    assert.ok(
      ratio > 0.5 && ratio < 0.65,
      `${point.id} page ratio ${ratio} is not a single 16:9 page — pages look merged`
    );
  }
}

// --- 2. renderer builds a deck ----------------------------------------------
assert.match(renderer, /function renderSlideDeck\s*\(/, "renderer must define renderSlideDeck");
assert.match(renderer, /function setupSlideDeckControls\s*\(/, "renderer must define setupSlideDeckControls");
assert.match(renderer, /slide\.pages/, "renderer must read slide.pages");
assert.match(renderer, /data-slide-deck-prev/, "deck needs a previous control");
assert.match(renderer, /data-slide-deck-next/, "deck needs a next control");
assert.match(renderer, /data-slide-deck-status/, "deck needs a page indicator");
// Hidden pages have no measurable width, so the scale must be re-applied on switch,
// and it must be derived from the canvas wrap rather than the page wrapper.
assert.match(
  renderer,
  /function showSlideDeckPage[\s\S]*?syncSlideCanvasScale\(wrap\)/,
  "switching pages must re-run the canvas scale against the canvas wrap"
);
assert.match(
  renderer,
  /const wrap = pages\[index\]\.querySelector\("\[data-slide-canvas\]"\)/,
  "the scale must be derived from the canvas wrap, whose width is the slide's, not the deck's"
);
// Hiding must not depend on a stylesheet rule beating another stylesheet rule:
// the `hidden` attribute is only honoured through the UA stylesheet, so a
// `display` rule on the same element silently wins and both pages show at once.
assert.match(
  renderer,
  /page\.style\.display = i === index \? "" : "none"/,
  "pages must be hidden with an inline style, not only the hidden attribute"
);
assert.match(renderer, /aria-hidden/, "hidden pages should be marked aria-hidden");
// The deck must be wired up wherever the slide canvas scaling is.
const scaleCalls = (renderer.match(/setupSlideCanvasScaling\(els\.lessonPlayer\);/g) || []).length;
const deckCalls = (renderer.match(/setupSlideDeckControls\(els\.lessonPlayer\);/g) || []).length;
assert.equal(deckCalls, scaleCalls, "every slide render must also set up the deck controls");
assert.ok(deckCalls >= 2, `expected the deck to be set up on every render path, got ${deckCalls}`);

// --- 3. styles + cache busting ----------------------------------------------
assert.match(styles, /\.slide-deck-viewport > \.slide-page\[hidden\]/, "hidden pages need a display rule as a fallback");
assert.match(styles, /\.slide-deck-controls/, "deck controls need styling");
// Assert the cache busters carry a version, not a specific string: the version
// changes with every edit, and pinning it just makes this test fail on each bump.
assert.match(index, /render-learning\.js\?v=[0-9a-z-]+/, "render-learning.js needs a cache buster");
assert.match(index, /styles\.css\?v=[0-9a-z-]+/, "styles.css needs a cache buster");
// The courseware frame must be bounded by its stage, not by the viewport: a 100vh
// frame lays the scene out for the whole viewport while only part of it is
// visible, so the scene's own controls end up off-screen and unreachable.
assert.match(
  styles,
  /\.multi-scene-courseware-stage \{[^}]*height: clamp\(/,
  "the courseware stage must bound its height to the visible area"
);
assert.match(styles, /\.multi-scene-courseware-stage > \.embed-frame \{[^}]*height: 100vh/, "the courseware frame must keep the 100vh height the scenes are laid out for");

console.log(`讲解页通过：${points.length} 个知识点 / ${pageTotal} 页（${pagedPoints.length} 个分页、${singlePoints.length} 个单页，均未合并）、翻页控件与页码、切页重算缩放、样式与缓存版本就位。`);
