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
assert.match(html, /id="quiz-list"/);
assert.match(html, /id="slide-frame"/);
assert.match(html, /id="quiz-preview"/);
assert.doesNotMatch(html, /admin_flow/);
assert.doesNotMatch(html, /target="_blank"/);
assert.doesNotMatch(html, /open-resource/);
assert.match(html, /id="slide-zoom-in"/);
assert.match(html, /id="slide-fullscreen"/);
assert.match(html, /allow="fullscreen; autoplay"/);
assert.match(html, /allowfullscreen/);
assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
assert.match(css, /\.frame-empty\[hidden\]\s*\{\s*display:\s*none;/);
assert.match(css, /\.viewer-pane\.is-local-fullscreen/);
assert.match(css, /\.frame-shell[^}]*display:\s*flex/);
assert.match(js, /const BASE_PATH =/);
assert.match(js, /flow-test(?:\\\\\.html)?/);
assert.match(js, /COURSEWARE_RESOURCE_VERSION/);
assert.match(js, /appUrl\("data\/multi-scene-learning-route\.json"\)/);
assert.match(js, /appUrl\("data\/knowledge-graph\.json"\)/);
assert.match(js, /kgResponse\.kg \|\| kgResponse/);
assert.match(js, /function renderQuizPreview/);
assert.match(js, /function renderSlidePreview/);
assert.match(js, /viewerPane:\s*document\.querySelector\("\.viewer-pane"\)/);
assert.match(js, /requestFullscreen/);
assert.match(js, /is-local-fullscreen/);
assert.match(js, /allowFullscreen/);
assert.match(js, /resourcesForKnowledgePoint/);
assert.match(js, /function slideStructureState/);
assert.match(js, /candidate.type === "slide"/);
assert.doesNotMatch(js, /fetchJson\("\/api\//);

const route = JSON.parse(fs.readFileSync(path.join(root, "data", "multi-scene-learning-route.json"), "utf8"));
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
const slides = route.chapters.flatMap((chapter) => (chapter.modules || []).flatMap((module) => (
  (module.knowledgePoints || []).filter((knowledgePoint) => knowledgePoint.slide?.canvas)
)));
const quizzes = route.chapters.reduce((sum, chapter) => sum + ["preQuiz", "formativeQuiz", "postQuiz"].reduce(
  (phaseSum, key) => phaseSum + (chapter.flow?.[key]?.questions || []).length,
  0
), 0);
assert.equal(slides.length, 72);
assert.equal(quizzes, 330);
assert.ok(slides.every((knowledgePoint) => Array.isArray(knowledgePoint.slide.canvas.elements)));

const gh04SpaceFiles = [
  "06_幂函数求导：空间视角.html",
  "10_和差积商规则：空间视角.html",
  "15_链式法则：空间视角.html",
  "19_常见函数变化速度：空间视角.html"
];
gh04SpaceFiles.forEach((file) => {
  const html = fs.readFileSync(path.join(root, "resources", "open-maic", "GH-04-常用求导规则与函数组合", "interactive", file), "utf8");
  assert.match(html, /id="space-canvas"/);
  assert.match(html, /id="view-fallback"/);
  assert.match(html, /postMessage/);
  assert.doesNotMatch(html, /本地生成的空间视角兜底场景/);
});

const overlayRegression = fs.readFileSync(path.join(
  root,
  "resources",
  "open-maic",
  "GH-02-极限与连续：直觉探索",
  "interactive",
  "10_图像上的左右极限：误解修复挑战.html"
), "utf8");
assert.match(overlayRegression, /#overlay[\s\S]*background:\s*#0a0a2e;/);
assert.match(overlayRegression, /#overlay[\s\S]*isolation:\s*isolate;/);
assert.match(overlayRegression, /#overlay[\s\S]*z-index:\s*2147483647\s*!important;/);
assert.doesNotMatch(overlayRegression, /<div id="overlay" id="startScreen">/);
console.log(JSON.stringify({ ok: true, chapters: route.chapters.length, resources: resources.length, slides: slides.length, quizzes, checkableResources: resources.length + slides.length }, null, 2));
