"use strict";

/**
 * Jev 判断层（TypeSafe System One）。
 *
 * 位置
 * ----
 * 平台有三层：
 *   结构层  事件类型决定的事实（是否自然边界、是否在测量阶段）—— **规则**，不可交给模型
 *   判断层  该不该帮 / 换哪种活动 / 给到哪一级            —— **Jev**
 *   兜底层  Jev 超时或失败时回落到既有规则                 —— **规则**
 *
 * 为什么结构事实不能交给模型
 * ------------------------
 * 实测（同一状态、五个问题一次调用）："现在是自然边界吗"这个问题 Jev 给出
 * 卡住 0.60 / 正常 0.69 / 静坐 0.53——正常推进反而被评为最适合打断，毫无区分力。
 * 因为那是关于**事件类型**的事实，不是判断。
 *
 * 兜底不是可选项
 * -------------
 * 决策点必须**总是**产生一个决定。Jev 不可用时系统行为不能退化，所以：
 * 超时 / 网络错误 / 非 200 / 结构不合法 —— 一律回落到规则，并把 `decisionSource`
 * 记为 `rule_fallback`。这个比例本身就是论文要报告的系统可用性指标。
 *
 * 设计原则：本模块**从不抛异常**。
 */

const crypto = require("node:crypto");

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
// 超时预算来自实测：冷启动 1028ms，之后 297–399ms（中位 374ms，6 次采样）。
// 800ms 会把冷启动整批打成兜底（实测踩过），1500ms 覆盖冷启动并留出余量。
// 决策点是非阻塞的，所以这个量级不会让学生等待。
const DEFAULT_TIMEOUT_MS = 1500;

// 同一份状态在短时间内不重复调用：决策可能被重放（学生刷新、请求重试），
// 重复调用既浪费预算也会让同一次决策拿到不同答案。
const CACHE_TTL_MS = 120000;
const CACHE_MAX = 200;
const cache = new Map();

function config() {
  const key = String(process.env.TYPESAFE_API_KEY || "").trim();
  return {
    apiKey: key,
    enabled: Boolean(key) && String(process.env.PROACTIVE_JEV_ENABLED || "").trim().toLowerCase() !== "false",
    model: String(process.env.TYPESAFE_MODEL || "jev-latest").trim() || "jev-latest",
    timeoutMs: Math.max(200, Math.min(5000,
      Number(process.env.PROACTIVE_JEV_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS))
  };
}

/** 活动类型的 criteria。必须写"适合解决哪类困难"，不能写"这是什么"。 */
const ACTIVITY_CRITERIA = Object.freeze({
  拖动仿真: "他大概知道概念，但不确定改变参数会怎样影响结果，需要亲手试出因果关系",
  关系图: "他分不清几个概念之间的边界与先后顺序，需要把关系摆开来看",
  误解修复挑战: "他心里有一个具体的、可以被证伪的错误想法，需要让它暴露出来并被纠正",
  空间视角: "他能按步骤算出结果，但说不清整体图像，需要换一个角度建立全局认识",
  不换: "问题不在活动形式，只需要一句提示就能继续"
});

const SCAFFOLD_CRITERIA = Object.freeze({
  L1: "只请他用自己的话说明当前理解，不给新信息",
  L2: "给一条针对当前误解的概念性提示",
  L3: "把任务拆成两个先后完成的子目标",
  L4: "只说明下一步做什么，不给完整过程",
  L5: "给一个做到一半的示例，请他补完"
});

function buildQuestions({ activityTypes = [] } = {}) {
  const activityCriteria = {};
  for (const type of activityTypes) {
    const key = ACTIVITY_CRITERIA[type] ? type : null;
    if (key) activityCriteria[key] = ACTIVITY_CRITERIA[key];
  }
  // 始终允许"不换"，否则每个决策点都会被推向换活动
  activityCriteria["不换"] = ACTIVITY_CRITERIA["不换"];
  return {
    needs_help: {
      type: "noul",
      instructions: "这位学习者现在确实需要帮助，而不是正在正常思考或已经接近自己解决。"
        + "注意：单纯的停留时间长并不等于需要帮助。"
    },
    next_activity: {
      type: "choice",
      instructions: "哪一种活动最能解开这位学习者当前的具体困难？按「适合解决哪类困难」判断。"
        + "若当前活动形式没问题、只是缺一句提示，选「不换」。",
      criteria: activityCriteria
    },
    scaffold_depth: {
      type: "choice",
      instructions: "该给到哪一级帮助？给得过多会剥夺学生自己解决的机会，给得过少则无济于事，"
        + "应当从他目前所处的困难程度出发选最合适的一级。",
      criteria: { ...SCAFFOLD_CRITERIA }
    }
  };
}

function cacheKey(state) {
  return crypto.createHash("sha256").update(JSON.stringify(state)).digest("hex").slice(0, 32);
}

function readCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return hit.value;
}

function writeCache(key, value) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

/** 把状态压成模型能读的一段文字。字段语义必须分得清"知识点常见混淆"和"这个学生被诊断出的错误"。 */
function renderState(state = {}) {
  const lines = [
    `知识点：${state.knowledgePoint || "未知"}`,
    state.knowledgePointGoal ? `学习目标：${state.knowledgePointGoal}` : "",
    // 注意：这是**这个知识点常见的混淆**，不是"已经诊断出这个学生错了"
    state.topicMisconception ? `该知识点常见的混淆（不代表这位学生已经犯了这个错）：${state.topicMisconception}` : "",
    `当前活动类型：${state.currentActivityType || "未知"}`,
    `可用活动类型：${(state.activityTypes || []).join("、") || "无"}`,
    `已体验过的活动类型：${(state.activityTypesOpened || []).join("、") || "无"}`,
    `在当前活动类型已停留：${Math.round(Number(state.dwellSeconds) || 0)} 秒`,
    `最近 5 分钟参数提交次数：${Math.round(Number(state.parameterCommits) || 0)}`,
    `最近 5 分钟判定次数：${Math.round(Number(state.judgedAttempts) || 0)}`,
    `最近 5 分钟判定失败次数：${Math.round(Number(state.judgedFailures) || 0)}`,
    `该知识点已确认的测验错误数：${Math.round(Number(state.confirmedGaps) || 0)}`,
    `本次会话已用提示次数：${Math.round(Number(state.hintsUsed) || 0)}`,
    `最近一次事件：${state.lastEvent || "无"}`
  ];
  return lines.filter(Boolean).join("\n");
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * 问 Jev。**从不抛异常**，失败时返回 rule_fallback。
 */
async function decide(state = {}, options = {}) {
  const settings = config();
  const started = Date.now();
  const base = {
    decisionSource: "rule_fallback",
    fallbackReason: "",
    latencyMs: 0,
    cached: false,
    model: settings.model,
    confidence: null,
    needsHelp: null,
    nextActivity: null,
    scaffoldDepth: null,
    probabilities: {},
    confidences: {}
  };

  if (!settings.enabled) {
    return { ...base, fallbackReason: settings.apiKey ? "jev_disabled" : "jev_not_configured" };
  }

  const questions = buildQuestions({ activityTypes: state.activityTypes || [] });
  const key = cacheKey({ state, questions });
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true, latencyMs: 0 };

  const timeoutMs = Math.max(200, Math.min(5000,
    Number(options.timeoutMs) || settings.timeoutMs));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(options.endpoint || ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        state: renderState(state),
        model: settings.model,
        questions
      })
    });
    if (!response.ok) {
      return { ...base, latencyMs: Date.now() - started, fallbackReason: `http_${response.status}` };
    }
    const payload = await response.json();
    const answers = payload?.answers || payload?.results || {};
    const needsHelp = numberOrNull(answers.needs_help?.noul);
    if (needsHelp === null) {
      return { ...base, latencyMs: Date.now() - started, fallbackReason: "malformed_answer" };
    }
    const confidences = {
      // noul 不返回 confidence（文档里只有 Choice 与 Score 返回），
      // 所以"该不该帮"这一环的把握由 needsHelp 的取值本身表达：越接近 0 或 1
      // 越决断，越接近 0.5 越犹豫。这里记为 null，由 needsHelp 承担。
      needs_help: numberOrNull(answers.needs_help?.confidence),
      next_activity: numberOrNull(answers.next_activity?.confidence),
      scaffold_depth: numberOrNull(answers.scaffold_depth?.confidence)
    };
    // 整体置信度取各项的**最小值**：任何一环不确定，整体就该更保守。
    // 这直接支撑"判断不准就不替学生做主"这条设计原则。
    const present = Object.values(confidences).filter((value) => value !== null);
    // "该不该帮"的决断度：0.5 表示完全没把握，0 或 1 表示很有把握。
    const decisiveness = Math.abs(needsHelp - 0.5) * 2;
    const overall = present.length
      ? Math.min(...present, decisiveness)
      : decisiveness;
    const result = {
      ...base,
      decisionSource: "jev",
      fallbackReason: "",
      latencyMs: Date.now() - started,
      confidence: overall,
      needsHelp,
      needsHelpDecisiveness: decisiveness,
      nextActivity: answers.next_activity?.choice || null,
      scaffoldDepth: answers.scaffold_depth?.choice || null,
      probabilities: {
        next_activity: answers.next_activity?.probabilities || {},
        scaffold_depth: answers.scaffold_depth?.probabilities || {}
      },
      confidences
    };
    writeCache(key, result);
    return result;
  } catch (error) {
    const reason = error?.name === "AbortError" || error?.name === "TimeoutError"
      ? "timeout"
      : "request_failed";
    return { ...base, latencyMs: Date.now() - started, fallbackReason: reason };
  } finally {
    clearTimeout(timer);
  }
}

function resetCache() {
  cache.clear();
}

module.exports = {
  decide,
  config,
  buildQuestions,
  renderState,
  resetCache,
  ENDPOINT,
  ACTIVITY_CRITERIA,
  SCAFFOLD_CRITERIA
};
