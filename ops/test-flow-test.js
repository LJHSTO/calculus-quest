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
const core = fs.readFileSync(path.join(root, "app", "main", "core.js"), "utf8");
const learningRenderer = fs.readFileSync(path.join(root, "app", "main", "render-learning.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
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
assert.match(html, /lib\/katex\.min\.css/);
assert.match(html, /lib\/katex\.min\.js/);
assert.doesNotMatch(html, /allowfullscreen/);
assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
assert.match(css, /\.frame-empty\[hidden\]\s*\{\s*display:\s*none;/);
assert.match(css, /\.viewer-pane\.is-local-fullscreen/);
assert.match(css, /\.frame-shell[^}]*display:\s*flex/);
assert.match(js, /const BASE_PATH =/);
assert.match(js, /flow-test(?:\\\\\.html)?/);
assert.match(js, /COURSEWARE_RESOURCE_VERSION/);
const flowVersion = js.match(/COURSEWARE_RESOURCE_VERSION\s*=\s*"([^"]+)"/)?.[1];
const formalVersion = core.match(/COURSEWARE_RESOURCE_VERSION\s*=\s*"([^"]+)"/)?.[1];
assert.ok(flowVersion);
assert.equal(flowVersion, formalVersion);
assert.match(html, new RegExp(`flow-test\\.js\\?v=${flowVersion.replace("audited-cw-v5", "platform-qa-v2")}`));
assert.match(server, /relative === "flow-test\.html"/);
assert.match(server, /publicFlowTestFiles\.has\(relative\)/);
assert.match(js, /appUrl\("data\/multi-scene-learning-route\.json"\)/);
assert.match(js, /appUrl\("data\/knowledge-graph\.json"\)/);
assert.match(js, /kgResponse\.kg \|\| kgResponse/);
assert.match(js, /function renderQuizPreview/);
assert.match(js, /function renderSlidePreview/);
assert.match(js, /function renderSlideTextContent/);
assert.match(js, /function slideImageSrc/);
assert.match(js, /classroomMedia/);
assert.match(js, /data-slide-fit/);
assert.match(js, /viewerPane:\s*document\.querySelector\("\.viewer-pane"\)/);
assert.match(js, /requestFullscreen/);
assert.match(js, /is-local-fullscreen/);
assert.match(js, /resourcesForKnowledgePoint/);
assert.match(js, /function slideStructureState/);
assert.match(js, /candidate.type === "slide"/);
assert.match(js, /appUrl\(`resources\/\$\{candidate\.root\}\/\$\{candidate\.file\}`\)/);
assert.match(learningRenderer, /coursewareFrameUrl\(`resources\/\$\{candidate\.root\}\/\$\{candidate\.file\}`\)/);
assert.match(learningRenderer, /knowledgeResourceCandidate\(unit, selectedTypeId\)/);
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
const resourceKeys = route.chapters.flatMap((chapter) => (chapter.modules || []).flatMap((module) => (
  (module.knowledgePoints || []).flatMap((knowledgePoint) => (
    (knowledgePoint.resourceCandidates || []).map((candidate) => `${candidate.root}/${candidate.file}`)
  ))
)));
assert.equal(new Set(resourceKeys).size, resourceKeys.length, "resource candidates must be unique");
const encodedByFlow = resourceKeys.map((key) => key.split("/").map(encodeURIComponent).join("/"));
const encodedByFormalSite = resourceKeys.map((key) => encodeURI(key));
assert.deepEqual(encodedByFlow, encodedByFormalSite, "Flow Test and formal site must encode resource paths identically");
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
