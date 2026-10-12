"use strict";

/**
 * 近迁移测量工具（V14-C1 函数与极限）· r3 —— **每个知识点 2 题，共 12 题**
 *
 * 为什么从 r2 的 18 题缩到 12 题
 * ---------------------------
 * 一小时的会话里，前测 12 题 + 后测（核心 12 + 迁移 12）= 36 题，约 21 分钟，
 * 学习段剩约 30 分钟。r2 的 18 道迁移题会把测试段推到 25 分钟以上，学习时间被
 * 压到不足 30 分钟——而学习时间正是决策点产出的唯一来源（见
 * research/决策点产出实测与设计修正-2026-09-22.md）。
 *
 * 每知识点保留 2 题：一个测量"能不能在新情境里用出来"，另一个换个情境再测一次，
 * 既保证每个知识点都有迁移观测，也把题量控制在可执行的范围内。
 *
 * 迁移与保持的区别在**题目内容**（新情境 vs 练过的表征），不在**施测时点**。
 * 本工具与后测在**同一场次**施测，分开计分。
 *
 * row 结构：[题干, [四个选项], 正确选项下标, 解析]
 * "我不会"选项由平台在渲染时追加，不写在这里。
 */

const bank = require("./functions-limits-r1");
const expanded = require("./functions-limits-transfer-r2");

// r2 每个知识点 3 题、按知识点连续排列。r3 取前 2 题——它们已经在 r2 里
// 通过了结构、位置分布、与保持测/题库题干零重复、概念归属、解析可教学这几项检查。
const ITEMS_PER_KNOWLEDGE_POINT = 2;

const items = bank.ids.flatMap((knowledgePointId, kpIndex) => {
  const owned = expanded.items.filter((item) => item.knowledgePointId === knowledgePointId);
  return owned.slice(0, ITEMS_PER_KNOWLEDGE_POINT).map((item, itemIndex) => ({
    ...item,
    id: `V14-C1-TR-r3-${kpIndex + 1}-${itemIndex + 1}`
  }));
});

module.exports = {
  version: "functions-limits-transfer-r3",
  stageId: "transfer",
  chapterId: "V14-C1",
  construct: "near_transfer",
  constructNote: "每题使用课件、前测、后测与保持测中均未出现过的新情境，测量概念在新情境中的可用性，而不是原表征下的记忆保持。与后测同场次施测，分开计分。",
  itemsPerKnowledgePoint: ITEMS_PER_KNOWLEDGE_POINT,
  administeredWith: "post",
  derivedFrom: expanded.version,
  items
};
