"use strict";

/**
 * 主动水平与决策点随机化。
 *
 * 为什么需要
 * ----------
 * 现有文献（arXiv:2212.10346）把"主动水平"当作**固定条件**在被试间比较，发现了
 * 一个权衡：越主动越能维持专注（负性情感下 GCL 5.37 vs 4.56），但信任（5.26 vs
 * 5.80）与可用性（3.37 vs 3.90）都更低。文献调研 §7 把"把主动水平作为*策略*而非
 * 固定条件"列为尚未填补的空白。
 *
 * 本模块提供两件事：
 *   1. 四级主动水平的操作化（None / Notification / Suggestion / Intervention）
 *   2. 决策点层面的 2×2 随机化：
 *        主动水平策略  固定档（恒为 Suggestion） vs 自适应档（按校准置信度选档）
 *        触发时机      agent 判断 vs 随机时刻
 *
 * 为什么"随机时刻"是对照的关键
 * --------------------------
 * 它让两组被打断的**次数与内容完全对齐**，只有时机不同。否则"时机智能有没有用"
 * 这个结论会被"打断得更多/更少"混淆掉。
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
 * `autoExecute` 是 Intervention 与 Suggestion 的实质差别：Suggestion 给出内容但
 * 等学生点击；Intervention 直接执行（在本平台上是"直接把学生切到目标活动类型"）。
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
    description: "直接替学生执行（本平台上是直接切换到目标活动类型），并说明做了什么",
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
 * 选它作为固定档的对照，是因为文献里 Suggestion 是**唯一显著提升信任**的档位
 * （配对 t(9) = -4.28, p = .002），也就是"信任安全"的中间档。拿它当对照，
 * 自适应档若想在信任上取胜就必须真的更好，而不是靠"少打扰"取胜。
 */
function fixedLevel() {
  return "suggestion";
}

/**
 * 自适应档：用**校准置信度**决定该多主动。
 *
 * 逻辑的核心是"判断不准就别替学生做主"：
 *   - 置信度高且需要帮助明确 → Intervention（可以直接执行）
 *   - 置信度高但需要帮助一般 → Suggestion
 *   - 置信度中等              → Suggestion
 *   - 置信度低                → Notification（只告知，不替学生判断）
 *
 * 这也是规则策略做不到的地方：手设的 0.78 没有概率含义，无法支撑这个判断。
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
 * "随机时刻"不改变被打断的**次数**，只改变**时机**：决策点照常识别，但展示被推迟
 * 到窗口内的一个确定时长之后。延迟由同一份哈希材料导出，因此可复现。
 */
function randomTimingDelayMs({ participantId = "", decisionSequence = 0, salt = "", windowMs = 45000 } = {}) {
  const material = `timing|${salt}|${participantId}|${Math.max(0, Math.trunc(Number(decisionSequence) || 0))}`;
  const digest = crypto.createHash("sha256").update(material).digest();
  const ratio = digest.readUInt16BE(0) / 65535;
  const window = Math.max(1000, Math.trunc(Number(windowMs) || 45000));
  return Math.round(ratio * window);
}

/**
 * 知识点层面的条件分配 —— **拉丁方轮转**。
 *
 * 为什么不用决策点层面
 * ------------------
 * 干跑实测（ops/simulate-decision-yield.js）：`cooldownMs = 10 分钟` 而每个知识点
 * 只学约 5 分钟，所以一个知识点内通常只有 1–2 次干预机会。20 人一小时的实际产出是
 * **每人 6–18 个决策点**，四格每格只有 30–90 个观测，达不到 120 的目标。
 *
 * 决策点不是独立同分布的观测，而是被"知识点"这个单位结构化的。既然如此，就把随机化
 * 的单位提到知识点层面。
 *
 * 轮转怎么保证均衡
 * --------------
 * 条件按 `(知识点下标 + 偏移) % 知识点数 < 半数` 决定，偏移由 hash(盐|参与者) 决定。
 * 于是每个知识点在偏移的 6 个取值里恰好有 3 个落在"A 条件"，所以当偏移在参与者之间
 * 均匀分布时，**每个知识点被分到每个条件的次数相等**。
 *
 * 用偏移而不是固定对半，是为了让"条件"不与"会话中的位置"混淆——否则前三个知识点
 * 永远是同一条件，疲劳/学习效应会和条件效应混在一起。
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
