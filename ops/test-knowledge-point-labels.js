const assert = require("node:assert/strict");
const { labelsFor } = require("../app/main/knowledge-point-labels");

const chapters = [{
  id: "V14-C1",
  modules: [{
    knowledgePoints: [
      { id: "GH-01-K01", name: "输入、输出和函数规则" },
      { id: "GH-01-K02", name: "坐标点与函数图像" },
      { id: "GH-01-K03", name: "图像的上升、下降与变化方向" }
    ]
  }]
}];

assert.deepEqual(
  labelsFor(["GH-01-K01", "GH-01-K02", "GH-01-K03"], chapters, "V14-C1"),
  ["输入、输出和函数规则", "坐标点与函数图像", "图像的上升、下降与变化方向"]
);
assert.deepEqual(
  labelsFor([{ concept: "GH-01-K01" }, "函数图像", "GH-01-K01"], chapters, "V14-C1"),
  ["输入、输出和函数规则", "函数图像"]
);
assert.deepEqual(labelsFor(["GH-99-K99"], chapters, "V14-C1"), ["相关知识点"]);
console.log("knowledge point label tests passed");
