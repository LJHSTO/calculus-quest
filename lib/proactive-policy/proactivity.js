"use strict";

/**
 * 主动水平与决策点随机化。
 *
 * 四级主动水平与可复现的条件标签。此处的 confidence 是策略分数；未经
 * 独立校准不能称作概率。决策点 timing 标签及延迟函数不是已执行的时机实验，
 * 不能据此推断投递时机不同或帮助剂量相等。实际处理须核对前端执行与曝光日志。
 * 文献依据及研究空白以研究报告为准，代码注释不构成实证证据。
 *
 * 为什么用哈希而不是 Math.random
 * ----------------------------
 * 哈希分配是**可复现**的：同一个参与者、同一个决策点序号永远得到同一条件。
 * 这在数据被重新分析、或需要核对某个决策点时是必需的；Math.random 做不到。
 */

const crypto = require("node:crypto");

const PROACTIVITY_LEVELS = Object.freeze(["none", "notification", "suggestion", "intervention"]);

/**
 * 每个档位怎么呈现。
 *
 * `autoExecute` 描述拟议能力，当前学习前端仍需学生确认，不消费该标志自动换活动。
 */
const LEVEL_BEHAVIOR = Object.freeze({
  none: Object.freeze({
    level: "none",
    label: "反应式",
    description: "只在学生主动求助时提供帮助",
    display: false,
    presentation: "",
    includeContent: false,
    autoExecute: false,
    reasonCode: "reactive_only"
  }),
  notification: Object.freeze({
    level: "notification",
    label: "告知式",
    description: "只告知「这里有帮助可用」，把决定权完全留给学生",
    display: true,
    presentation: "inline_nudge",
    includeContent: false,
    autoExecute: false,
    reasonCode: "notification_only"
  }),
  suggestion: Object.freeze({
    level: "suggestion",
    label: "建议式",
    description: "自动给出具体帮助内容，学生决定是否采纳",
    display: true,
    presentation: "assistant_prompt",
    includeContent: true,
    autoExecute: false,
    reasonCode: "suggestion_offered"
  }),
  intervention: Object.freeze({
    level: "intervention",
    label: "干预式",
    description: "提出高主动帮助；当前平台仍由学生确认后切换活动",
    display: true,
    presentation: "inline_nudge",
    includeContent: true,
    autoExecute: true,
    reasonCode: "intervention_applied"
  })
});

function behaviorFor(level = "") {
  return LEVEL_BEHAVIOR[String(level || "").toLowerCase()] || null;
}

/**
 * 固定档：恒为 Suggestion。
 *
 * 这是本平台冻结的工程对照；其学习、信任和负担效果仍需目标人群验证。
 */
function fixedLevel() {
  return "suggestion";
}

/**
 * 自适应档：按策略分数阈值建议主动水平，尚未建立概率校准。
 *
 * 逻辑的核心是"判断不准就别替学生做主"：
 *   - 分数高且需要帮助明确 → Intervention（执行仍受授权约束）
 *   - 置信度高但需要帮助一般 → Suggestion
 *   - 置信度中等              → Suggestion
 *   - 置信度低                → Notification（只告知，不替学生判断）
 *
 * 这些手设阈值是可检验的工程启发式，不能用作已验证优于规则策略的证据。
 */
function adaptiveLevel({ confidence = 0, needsHelp = 0 } = {}) {
  const c = Number.isFinite(Number(confidence)) ? Number(confidence) : 0;
  const need = Number.isFinite(Number(needsHelp)) ? Number(needsHelp) : 0;
  if (c >= 0.85 && need >= 0.80) return "intervention";
  if (c >= 0.60) return "suggestion";
  return "notification";
}

/** 该档位的呈现方式。 */
function proactivityBehavior({ policy = "fixed", confidence = 0, needsHelp = 0 } = {}) {
  const level = String(policy || "fixed").toLowerCase() === "adaptive"
    ? adaptiveLevel({ confidence, needsHelp })
    : fixedLevel();
  return {
    policy: String(policy || "fixed").toLowerCase(),
    level,
    ...behaviorFor(level)
  };
}

const DECISION_CELLS = Object.freeze([
  Object.freeze(["fixed", "agent"]),
  Object.freeze(["fixed", "random"]),
  Object.freeze(["adaptive", "agent"]),
  Object.freeze(["adaptive", "random"])
]);

/** 用哈希字节做 Fisher–Yates，得到四种条件的一个随机排列。 */
function permuteCells(digest) {
  const cells = DECISION_CELLS.map((cell) => [...cell]);
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = digest[i] % (i + 1);
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

/**
 * 决策点条件分配 —— **参与者内置换区块**。
 *
 * 为什么不直接对每个决策点独立哈希：那样 480 个决策点在四格里会有约 ±25 的
 * 随机波动（实测 22.5%–27.7%），而且某个参与者可能明显偏向某一格。区块置换让
 * 每个参与者每 4 个决策点恰好覆盖四种条件各一次，把参与者层面的混淆消掉——这在
 * 被试内设计里是标准做法，也直接提高功效。
 *
 * 仍然可复现：区块顺序由 hash(salt|参与者|区块序号) 决定，同一份数据重新分析时
 * 会得到完全一样的分配。
 *
 * @param {object} options
 * @param {string} options.participantId   参与者 id
 * @param {number} options.decisionSequence 该参与者的决策点序号（从 1 开始，逐点递增）
 * @param {string} options.salt             实验盐，固定后不可更改
 */
function assignDecisionCondition({ participantId = "", decisionSequence = 0, salt = "" } = {}) {
  const sequence = Math.max(1, Math.trunc(Number(decisionSequence) || 1));
  const blockIndex = Math.floor((sequence - 1) / DECISION_CELLS.length);
  const position = (sequence - 1) % DECISION_CELLS.length;
  const material = `${salt}|${participantId}|proactivity-block|${blockIndex}`;
  const digest = crypto.createHash("sha256").update(material).digest();
  const order = permuteCells(digest);
  const [proactivityPolicy, triggerTiming] = order[position];
  return {
    proactivityPolicy,
    triggerTiming,
    blockIndex,
    blockPosition: position,
    conditionDigest: digest.toString("hex").slice(0, 16)
  };
}

/**
 * 随机时刻条件延迟多久展示。
 *
 * 仅生成可复现的建议延迟；调用方必须另行实现并验证投递。延迟可能改变失效率，
 * 不能仅凭此函数宣称两组实际曝光次数相等。
 */
function randomTimingDelayMs({ participantId = "", decisionSequence = 0, salt = "", windowMs = 45000 } = {}) {
  const material = `timing|${salt}|${participantId}|${Math.max(0, Math.trunc(Number(decisionSequence) || 0))}`;
  const digest = crypto.createHash("sha256").update(material).digest();
  const ratio = digest.readUInt16BE(0) / 65535;
  const window = Math.max(1000, Math.trunc(Number(windowMs) || 45000));
  return Math.round(ratio * window);
}

/**
 * 知识点层面的哈希轮转，非严格拉丁方或有限样本平衡分配。
 * 六知识点双条件时每人3/3，但hash偏移在有限参与者中未必等频，取模也非精确
 * 均匀采样；不能保证每个知识点两条件人数相同。旧干跑仅为合成机会估计，
 * 不是真人观测。新工作台的分层互补随机序列见study-workbench.js，两者协议分离。
 *
 * @param {object} options
 * @param {string} options.participantId       参与者 id
 * @param {number} options.knowledgePointIndex 该知识点在章节里的下标（0 起）
 * @param {number} options.knowledgePointCount 章节知识点总数
 * @param {string} options.salt                实验盐
 * @param {string[]} options.conditions        条件取值（默认两个）
 */
function assignKnowledgePointCondition({
  participantId = "",
  knowledgePointIndex = 0,
  knowledgePointCount = 6,
  salt = "",
  conditions = ["rule", "adaptive"]
} = {}) {
  const count = Math.max(2, Math.trunc(Number(knowledgePointCount) || 6));
  const index = Math.max(0, Math.trunc(Number(knowledgePointIndex) || 0)) % count;
  const list = Array.isArray(conditions) && conditions.length >= 2 ? conditions : ["rule", "adaptive"];
  const digest = crypto.createHash("sha256")
    .update(`${salt}|${participantId}|knowledge-point-offset`)
    .digest();
  const offset = digest[0] % count;
  // 双条件时对半切最均衡；多于两条件时按块切
  const blockSize = Math.max(1, Math.floor(count / list.length));
  const slot = Math.floor(((index + offset) % count) / blockSize) % list.length;
  return {
    condition: list[slot],
    offset,
    slot,
    assignmentDigest: digest.toString("hex").slice(0, 16)
  };
}

/** 该条件对应的主动水平策略名（rule → fixed，其余 → adaptive）。 */
function proactivityPolicyForCondition(condition = "") {
  return String(condition || "").toLowerCase() === "rule" ? "fixed" : "adaptive";
}

module.exports = {
  PROACTIVITY_LEVELS,
  LEVEL_BEHAVIOR,
  behaviorFor,
  fixedLevel,
  adaptiveLevel,
  proactivityBehavior,
  assignDecisionCondition,
  assignKnowledgePointCondition,
  proactivityPolicyForCondition,
  randomTimingDelayMs
};
