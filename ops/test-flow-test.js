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
const coursewareContext = fs.readFileSync(path.join(root, "app", "main", "courseware-context.js"), "utf8");
const coursewareBridge = fs.readFileSync(path.join(root, "app", "main", "courseware-bridge.js"), "utf8");
const learningRenderer = fs.readFileSync(path.join(root, "app", "main", "render-learning.js"), "utf8");
const mainHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const mainCss = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(packageJson.scripts?.["flow:static"], undefined);
assert.equal(fs.existsSync(path.join(root, "ops", "build-flow-test-static.js")), false);
assert.match(html, /app\/flow-test\/flow-test\.css/);
assert.match(html, /app\/flow-test\/flow-test\.js/);
assert.match(html, /id="quiz-list"/);
assert.match(html, /id="slide-frame"/);
assert.match(html, /id="quiz-preview"/);
assert.match(html, /id="toggle-navigation"/);
assert.match(html, /<body class="is-navigation-collapsed">/);
assert.doesNotMatch(html, /class="validation-rail"/);
assert.doesNotMatch(html, /answer-access|answer-token/);
assert.doesNotMatch(html, /id="audio-(?:player|play|pause|stop|progress)"/);
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
assert.match(css, /\.frame-shell\.is-local-fullscreen/);
assert.match(css, /\.frame-shell[^}]*display:\s*flex/);
assert.match(css, /body\.is-navigation-collapsed \.workspace/);
assert.match(
  css,
  /body\.is-navigation-collapsed \.workspace\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/s
);
assert.match(
  css,
  /body\.is-navigation-collapsed \.viewer-pane\s*\{[^}]*grid-template-rows:\s*auto auto auto minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s
);
assert.match(
  css,
  /body\.is-navigation-collapsed \.frame-shell,\s*body\.is-navigation-collapsed \.frame-shell iframe\s*\{[^}]*min-height:\s*0[^}]*height:\s*100%/s
);
assert.match(css, /body\.is-navigation-collapsed \.chapter-pane/);
assert.match(css, /\.frame-shell\s*\{[^}]*min-height:\s*680px/);
assert.match(css, /\.frame-shell iframe\s*\{[^}]*width:\s*100%[^}]*min-height:\s*680px/);
assert.match(
  css,
  /@media \(max-width:\s*640px\)[\s\S]*?body\.is-navigation-collapsed \.workspace\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/,
);
assert.doesNotMatch(css, /\.answer-access-|\.flow-audio-/);
assert.match(css, /@media \(max-width:\s*1600px\)[\s\S]*?grid-template-columns:\s*136px\s+312px\s+minmax\(0,\s*1fr\)/);
assert.match(css, /@media \(max-width:\s*1400px\)[\s\S]*?grid-template-columns:\s*320px\s+minmax\(0,\s*1fr\)/);
assert.match(js, /const BASE_PATH =/);
assert.match(js, /flow-test(?:\\\\\.html)?/);
assert.match(js, /COURSEWARE_RESOURCE_VERSION/);
const flowVersion = js.match(/COURSEWARE_RESOURCE_VERSION\s*=\s*"([^"]+)"/)?.[1];
const formalVersion = core.match(/COURSEWARE_RESOURCE_VERSION\s*=\s*"([^"]+)"/)?.[1];
const flowBridgeVersion = js.match(/COURSEWARE_CONTEXT_BRIDGE_VERSION\s*=\s*"([^"]+)"/)?.[1];
const formalBridgeVersion = coursewareContext.match(/BRIDGE_VERSION\s*=\s*"([^"]+)"/)?.[1];
assert.ok(flowVersion);
assert.equal(flowVersion, formalVersion);
assert.equal(flowVersion, "20260727-courseware-interaction-v4");
assert.ok(flowBridgeVersion);
assert.equal(flowBridgeVersion, formalBridgeVersion);
assert.match(js, /v=\$\{COURSEWARE_RESOURCE_VERSION\}&cqContextBridge=\$\{encodeURIComponent\(COURSEWARE_CONTEXT_BRIDGE_VERSION\)\}/);
assert.match(learningRenderer, /cqContextBridge=\$\{encodeURIComponent\(version\)\}/);
assert.match(coursewareBridge, /reportInteraction\("interactive_click"/);
assert.match(coursewareBridge, /reportInteraction\("interactive_drag_end"/);
assert.match(coursewareBridge, /eventType:\s*"parameter_change"/);
assert.match(coursewareBridge, /#overlay:has\(\.start-btn\)/);
assert.match(learningRenderer, /function trackCoursewareBridgeInteraction/);
assert.match(learningRenderer, /event\.data\?\.type === "cq:interaction"/);
const flowCssVersion = html.match(/flow-test\.css\?v=([^"]+)/)?.[1];
const flowJsVersion = html.match(/flow-test\.js\?v=([^"]+)/)?.[1];
assert.ok(flowCssVersion);
assert.equal(flowCssVersion, flowJsVersion);
assert.equal(flowJsVersion, "20260813-platform-fixes-v1");
assert.match(server, /relative === "flow-test\.html"/);
assert.match(server, /publicFlowTestFiles\.has\(relative\)/);
assert.match(server, /"app\/flow-test\/flow-test\.css"/);
assert.match(server, /"app\/flow-test\/flow-test\.js"/);
assert.ok(
  server.indexOf("publicFlowTestFiles.has(relative)") < server.indexOf('url.searchParams.has("v")'),
  "Flow Test no-store policy must run before generic immutable caching"
);
assert.match(server, /relative\.startsWith\("resources\/open-maic\/"\)/);
assert.match(server, /url\?\.searchParams\.has\("cqContextBridge"\)/);
assert.match(js, /function fetchRoute/);
assert.match(js, /appUrl\("api\/course\/flow-test-route"\)/);
assert.match(js, /appUrl\("data\/multi-scene-learning-route\.json"\)/);
assert.match(js, /appUrl\("data\/knowledge-graph\.json"\)/);
assert.match(js, /function setNavigationUi/);
assert.match(js, /state\.navigationCollapsed = !state\.navigationCollapsed/);
assert.doesNotMatch(js, /openAnswerAccessDialog|unlockAnswers|answerAccess|answerToken/);
assert.match(js, /kgResponse\.kg \|\| kgResponse/);
assert.match(js, /function renderQuizPreview/);
assert.match(js, /function renderSlidePreview/);
assert.match(js, /function renderSlideTextContent/);
assert.match(js, /function slideImageSrc/);
assert.match(js, /classroomMedia/);
assert.match(js, /data-slide-fit/);
assert.match(js, /frameShell:\s*document\.querySelector\("\.frame-shell"\)/);
assert.match(js, /requestFullscreen/);
assert.match(js, /is-local-fullscreen/);
assert.match(js, /function viewerFullscreenActive/);
assert.match(js, /const maxFitScale = viewerFullscreenActive\(\) \? 3 : 1\.44/);
assert.doesNotMatch(js, /const fitScale = Math\.min\(1,/);
assert.match(js, /new ResizeObserver\(scheduleSlidePreviewScale\)/);
assert.match(js, /await els\.frameShell\.requestFullscreen\(\)/);
assert.doesNotMatch(js, /await els\.viewerPane\.requestFullscreen\(\)/);
assert.match(css, /\.frame-shell:fullscreen \.slide-preview:not\(\[hidden\]\)/);
assert.match(css, /\.frame-shell:fullscreen \.flow-slide-wrap/);
assert.match(css, /\.frame-shell:fullscreen iframe/);
assert.match(js, /function quizResourceAllowedForPhase/);
assert.match(js, /function quizQuestionDisplayText/);
assert.match(js, /resourcesForKnowledgePoint/);
assert.match(js, /function slideStructureState/);
assert.match(js, /candidate.type === "slide"/);
assert.doesNotMatch(
  js,
  /allAudioResources|openmaic-audio-map|syncAudioPlayer|playAudioPackage|pauseAudioPackage|stopAudioPackage|new Audio\(\)/,
);
assert.match(js, /appUrl\(`resources\/\$\{candidate\.root\}\/\$\{candidate\.file\}`\)/);
assert.match(learningRenderer, /coursewareFrameUrl\(`resources\/\$\{candidate\.root\}\/\$\{candidate\.file\}`\)/);
assert.match(learningRenderer, /knowledgeResourceCandidate\(unit, selectedTypeId\)/);
assert.match(learningRenderer, /const resourceToolbar = isKnowledgeResource\s*\?\s*""/);
assert.match(learningRenderer, /class="type-pill multi-scene-slide-kind">讲解页<\/span>/);
assert.match(learningRenderer, /data-resource-fullscreen>讲解页全屏<\/button>/);
assert.match(mainCss, /\.multi-scene-slide-heading\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s);
const formalStyleVersion = mainHtml.match(/styles\.css\?v=([^"]+)/)?.[1];
assert.ok(formalStyleVersion);
assert.notEqual(formalStyleVersion, "20260726-courseware-layout-v2");
const formalCoreScriptVersion = mainHtml.match(/app\/main\/core\.js\?v=([^"]+)/)?.[1];
assert.ok(formalCoreScriptVersion);
assert.equal(formalCoreScriptVersion, "20260817-assessment-redesign-v3");
assert.match(mainHtml, /lib\/quiz-question-order\.js\?v=20260726-quiz-order-v1/);
const formalRenderScriptVersion = mainHtml.match(/app\/main\/render-learning\.js\?v=([^"]+)/)?.[1];
assert.ok(formalRenderScriptVersion);
assert.notEqual(formalRenderScriptVersion, "20260726-courseware-layout-v2");
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
const audioResources = [];
const audioRoots = new Set(route.chapters.flatMap((chapter) => (chapter.modules || []).map(
  (module) => module.source?.resourceRoot
)).filter(Boolean));
audioRoots.forEach((resourceRoot) => {
  const manifestPath = path.join(root, "resources", resourceRoot, "manifest.json");
  assert.ok(fs.existsSync(manifestPath), `Missing manifest for audio root: ${resourceRoot}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  (manifest.scenes || []).forEach((scene) => {
    (scene.actions || []).forEach((action) => {
      if (!action.audioRef) return;
      const audioPath = path.join(root, "resources", resourceRoot, action.audioRef);
      audioResources.push(audioPath);
      assert.ok(fs.existsSync(audioPath), `Missing audio resource: ${audioPath}`);
    });
  });
});
assert.equal(audioRoots.size, 19);
assert.equal(audioResources.length, 1481);
assert.equal(new Set(audioResources).size, audioResources.length, "audio references must be unique");
const slides = route.chapters.flatMap((chapter) => (chapter.modules || []).flatMap((module) => (
  (module.knowledgePoints || []).filter((knowledgePoint) => knowledgePoint.slide?.canvas)
)));
const chapterQuizzes = route.chapters.reduce((sum, chapter) => sum + ["preQuiz", "postQuiz"].reduce(
  (phaseSum, key) => phaseSum + (chapter.flow?.[key]?.questions || []).length,
  0
), 0);
const knowledgeChecks = route.chapters.reduce((sum, chapter) => sum + (chapter.modules || []).reduce(
  (moduleSum, module) => moduleSum + (module.knowledgePoints || []).reduce(
    (knowledgeSum, knowledgePoint) => knowledgeSum + (knowledgePoint.formativeQuiz?.questions || []).length,
    0
  ),
  0
), 0);
assert.equal(slides.length, 72);
assert.equal(chapterQuizzes, 220);
assert.equal(knowledgeChecks, 144);
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
console.log(JSON.stringify({
  ok: true,
  chapters: route.chapters.length,
  resources: resources.length,
  slides: slides.length,
  quizzes: chapterQuizzes + knowledgeChecks,
  audio: audioResources.length,
  checkableResources: resources.length + slides.length + audioResources.length
}, null, 2));
