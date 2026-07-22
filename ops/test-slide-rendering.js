const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app", "main", "render-learning.js"), "utf8");
const interactionTypes = [
  { id: "simulation", label: "拖动实验" },
  { id: "game", label: "误解修复挑战" },
  { id: "mindMap", label: "关系图" },
  { id: "visualization3d", label: "空间视角" }
];
const candidateTitles = {
  simulation: "图像上的左右极限：拖动实验",
  game: "图像上的左右极限：误解修复挑战",
  mindMap: "图像上的左右极限：关系图",
  visualization3d: "图像上的左右极限：空间视角"
};
const sandbox = {
  console,
  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
  renderMathInHtml: (value) => value,
  renderInlineMath: (value) => value,
  resourceUrl: (value) => value,
  knowledgeInteractionTypes: () => interactionTypes,
  selectedKnowledgeSceneType: () => "",
  knowledgeResourceCandidate: (_unit, typeId) => ({
    title: candidateTitles[typeId],
    file: `${typeId}.html`
  })
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "render-learning.js" });

const canvas = {
  viewportSize: 1000,
  viewportRatio: 0.5625
};

assert.equal(typeof sandbox.renderSlideCanvas, "function");
const canvasHtml = sandbox.renderSlideCanvas(
  {
    ...canvas,
    theme: { backgroundColor: "#ffffff" },
    elements: [
      {
        id: "table",
        type: "table",
        left: 100,
        top: 180,
        width: 320,
        height: 160,
        cellMinHeight: 40,
        colWidths: [0.4, 0.6],
        data: [
          [
            {
              text: "条件",
              style: {
                color: "#1f4e79",
                fontsize: "14",
                backcolor: "#d9e2f3",
                align: "center"
              }
            },
            { text: "含义", style: { align: "center" } }
          ]
        ]
      },
      {
        id: "image",
        type: "image",
        left: 580,
        top: 210,
        width: 360,
        height: 202,
        src: "/api/classroom-media/cqv14-gh-10/media/gen_img_example.png"
      }
    ]
  },
  "V14-C1",
  "multi-scene-required-slide",
  "open-maic/GH-10-多元链式法则与-Jacobian-实战"
);
assert.match(canvasHtml, /data-slide-canvas/);
assert.match(canvasHtml, /data-slide-width="1000"/);
assert.match(canvasHtml, /data-slide-height="562\.5"/);
assert.match(canvasHtml, /width:1000px;height:562\.5px/);
assert.match(canvasHtml, /left:100px;top:180px;width:320px;height:160px/);
assert.match(canvasHtml, /<col style="width:40%"/);
assert.match(canvasHtml, /min-height:40px/);
assert.match(canvasHtml, /font-size:14px/);
assert.match(canvasHtml, /color:#1f4e79/);
assert.match(
  canvasHtml,
  /src="resources\/open-maic\/GH-10-多元链式法则与-Jacobian-实战\/media\/gen_img_example\.png"/
);

const axis = sandbox.renderSlideElement({
  id: "axis",
  type: "line",
  left: 90,
  top: 235,
  width: 3,
  start: [0, 110],
  end: [300, 110],
  points: ["", "arrow"],
  style: "solid",
  color: "#64748b"
}, canvas, "V14-C1");

assert.match(axis, /<svg/);
assert.match(axis, /viewBox="0 0 1000 562\.5"/);
assert.match(axis, /x1="90"/);
assert.match(axis, /y1="345"/);
assert.match(axis, /x2="390"/);
assert.match(axis, /y2="345"/);
assert.match(axis, /marker-end="url\(#slide-arrow-axis\)"/);

const dashed = sandbox.renderSlideElement({
  id: "guide",
  type: "line",
  left: 90,
  top: 235,
  width: 2,
  start: [150, 110],
  end: [150, 55],
  points: ["", ""],
  style: "dashed",
  color: "#94a3b8"
}, canvas, "V14-C1");

assert.match(dashed, /stroke-dasharray=/);

const circle = sandbox.renderSlideElement({
  id: "point",
  type: "shape",
  left: 234,
  top: 279,
  width: 12,
  height: 12,
  path: "M 1 0.5 A 0.5 0.5 0 1 1 0 0.5 A 0.5 0.5 0 1 1 1 0.5 Z",
  fill: "#ef4444",
  viewBox: [1, 1]
}, canvas, "V14-C1");

assert.match(circle, /<svg/);
assert.match(circle, /viewBox="0 0 1 1"/);
assert.match(circle, /<path d="M 1 0\.5/);

const route = JSON.parse(
  fs.readFileSync(path.join(root, "data", "multi-scene-learning-route.json"), "utf8")
);
let routeLineCount = 0;
let routeShapeCount = 0;
for (const chapter of route.chapters || []) {
  for (const module of chapter.modules || []) {
    for (const knowledgePoint of module.knowledgePoints || []) {
      const routeCanvas = knowledgePoint.slide?.canvas;
      for (const element of routeCanvas?.elements || []) {
        if (element.type !== "line" && element.type !== "shape") continue;
        const html = sandbox.renderSlideElement(element, routeCanvas, chapter.id, module.source?.resourceRoot || "");
        assert.match(html, /<svg/, `${knowledgePoint.id} ${element.id} must use SVG`);
        assert.doesNotMatch(html, /NaN|undefined/, `${knowledgePoint.id} ${element.id} produced invalid geometry`);
        if (element.type === "line") routeLineCount += 1;
        else routeShapeCount += 1;
      }
    }
  }
}
assert.ok(routeLineCount > 200, `expected route line coverage, got ${routeLineCount}`);
assert.ok(routeShapeCount > 300, `expected route shape coverage, got ${routeShapeCount}`);

const choices = sandbox.renderKnowledgeSceneChoicePanel({
  id: "GH-02-K02",
  type: "knowledge",
  label: "图像上的左右极限"
});

assert.match(choices, /<small>交互模拟<\/small>/);
assert.match(choices, /<small>闯关练习<\/small>/);
assert.match(choices, /<small>图解梳理<\/small>/);
assert.match(choices, /<small>三维观察<\/small>/);
assert.doesNotMatch(choices, /<small>图像上的左右极限：拖动实验<\/small>/);

console.log(`slide rendering tests passed (${routeLineCount} lines, ${routeShapeCount} shapes)`);
