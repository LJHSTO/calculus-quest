"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(__dirname, "../data/proactive-courseware-contracts.json");

const SCENE_TASKS = Object.freeze({
  simulation: {
    task: "拖动或改变参数，观察量怎样变化，并用一个具体例子说明你的判断。",
    evidence: ["产生与场景相关的参数或拖动操作", "能指出一个支持判断的例子"]
  },
  mindMap: {
    task: "顺着关系图说明概念怎样连接，并标出最容易混淆的一条关系。",
    evidence: ["打开并浏览关系图", "能说出至少两个概念之间的连接"]
  },
  game: {
    task: "在误解修复挑战里先独立判断，再根据反馈修正。游戏得分不作为掌握证明。",
    evidence: ["提交至少一次挑战尝试", "能说明哪一种常见误解被排除"]
  },
  visualization3d: {
    task: "换一个空间视角观察同一对象，并说明这个视角比平面图多看到了什么。",
    evidence: ["旋转或切换视角", "能比较空间视角与平面表示的差别"]
  }
});

function deriveProactiveCoursewareContracts() {
  const route = require("../data/multi-scene-learning-route.json");
  const adapter = require("./proactive-policy/adapters/v14-c3");
  const chapter = (route.chapters || []).find((item) => item.id === "V14-C3");
  if (!chapter) throw new Error("路线中缺少 V14-C3，无法生成课件任务合同。");
  const knowledgePoints = {};
  for (const point of chapter.modules.flatMap((module) => module.knowledgePoints || [])) {
    const adapted = adapter.knowledgePoints?.[point.id];
    const misconception = adapted?.misconception || point.misconception || "";
    knowledgePoints[point.id] = {
      learningTask: adapted?.selfExplanationPrompt || point.goal || "",
      successEvidence: ["产生与知识点相关的操作", "独立解释概念或完成平台验证题"],
      misconceptionSignals: misconception ? [misconception] : [],
      supports: ["ask_reflection", "highlight_target", "show_comparison", "open_hint"]
    };
  }
  return {
    schemaVersion: 1,
    chapterId: "V14-C3",
    courseVersion: route.versionId || "",
    purpose: "由已入库的 V14-C3 适配器与课程路线生成。界面操作不等于概念掌握，独立验证由平台题库完成。",
    derivedFrom: "lib/proactive-policy/adapters/v14-c3.js + data/multi-scene-learning-route.json",
    knowledgePoints,
    sceneTasks: SCENE_TASKS
  };
}

function loadProactiveCoursewareContracts() {
  if (!fs.existsSync(FILE)) return deriveProactiveCoursewareContracts();
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (error) {
    throw new Error(`无法读取 data/proactive-courseware-contracts.json：${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || !parsed.knowledgePoints || !parsed.sceneTasks) {
    throw new Error("data/proactive-courseware-contracts.json 缺少 knowledgePoints 或 sceneTasks，拒绝当作课件合同使用。");
  }
  return parsed;
}

const contracts = loadProactiveCoursewareContracts();
Object.defineProperty(contracts, "deriveProactiveCoursewareContracts", {
  value: deriveProactiveCoursewareContracts
});
Object.defineProperty(contracts, "loadProactiveCoursewareContracts", {
  value: loadProactiveCoursewareContracts
});
module.exports = contracts;
