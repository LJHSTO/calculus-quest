const { completeChat, provider } = require("../llm");

const LIVE_PROVIDERS = ["openai-compatible", "innospark", "openai"];
const ASSESSMENT_LLM_ENABLED = String(
  process.env.ASSESSMENT_LLM_ENABLED || ""
).trim().toLowerCase() === "true";
const ASSESSMENT_MODEL =
  process.env.ASSESSMENT_MODEL
  || process.env.OPENAI_COMPATIBLE_MODEL
  || process.env.INNOSPARK_MODEL
  || "gemini-2.5-flash";
const ASSESSMENT_TIMEOUT_MS = Math.max(
  100,
  Number(process.env.ASSESSMENT_TIMEOUT_MS || 12000)
);

const SYSTEM_PROMPT = `你是一个学习诊断专家。根据学生的答题数据、简答题评分和课件交互数据，判断学生掌握状态。
只输出一个完整合法 JSON 对象，不要输出 markdown，不要输出代码块，不要解释。
JSON 字段：
{
  "masteryLevel": 0到1之间的数字,
  "weakConcepts": [{"concept":"概念名","severity":"high|medium|low","reason":"原因"}],
  "suggestedAction": "skip|remediate|extend|continue",
  "confidenceLevel": 0到1之间的数字,
  "summary": "一句中文诊断总结"
}`;

function buildPrompt({ quizSummary, gradingResults, interactionEvents }) {
  const parts = ["## 答题数据"];
  if (quizSummary?.byChapter?.length) {
    quizSummary.byChapter.forEach((chapter) => {
      const accuracy = Number(chapter.accuracy ?? 0);
      parts.push(`- 章节 ${chapter.chapterId || "未知"}，阶段 ${chapter.phase || "未知"}，正确 ${chapter.correct ?? 0}/${chapter.total ?? 0}，准确率 ${(accuracy * 100).toFixed(0)}%`);
    });
  }

  if (quizSummary?.wrongConcepts?.length) {
    parts.push("\n## 错误概念");
    quizSummary.wrongConcepts.slice(0, 10).forEach((item) => {
      parts.push(`- 概念 ${item.tag || item.concept || "未知"}，错误次数 ${item.count ?? 1}`);
    });
  }

  if (gradingResults?.length) {
    parts.push("\n## 简答题 AI 评分");
    gradingResults.slice(0, 10).forEach((grade) => {
      const weakConcepts = Array.isArray(grade.weakConcepts) ? grade.weakConcepts.join("、") : "";
      parts.push(`- 题目 ${grade.questionId || grade.id || "未知"}：${grade.score ?? "待评"} 分，错误类型 ${grade.errorType || "none"}，弱概念 [${weakConcepts}]，反馈：${grade.feedback || "无"}`);
    });
  }

  if (interactionEvents?.length) {
    const eventTypes = {};
    let totalTime = 0;
    let paramChanges = 0;
    interactionEvents.forEach((event) => {
      const type = event?.type || event?.payload?.eventType || "unknown";
      eventTypes[type] = (eventTypes[type] || 0) + 1;
      totalTime += Number(event?.payload?.timing?.durationMs || event?.timing?.durationMs || 0);
      if (type === "parameter_commit" || type === "parameter_change") paramChanges += 1;
    });
    parts.push("\n## 课件交互数据");
    parts.push(`- 总交互事件数：${interactionEvents.length}`);
    parts.push(`- 总停留时长：${Math.round(totalTime / 1000)} 秒`);
    parts.push(`- 参数调整次数：${paramChanges}`);
    Object.entries(eventTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([type, count]) => parts.push(`- 事件类型 ${type}：${count} 次`));
  }

  return parts.join("\n");
}

function stripJsonFence(text = "") {
  const fence = String.fromCharCode(96).repeat(3);
  let source = String(text || "").trim();
  if (source.startsWith(fence)) {
    source = source
      .replace(new RegExp(`^${fence}[A-Za-z]*\\s*`, "i"), "")
      .replace(new RegExp(`\\s*${fence}$`, "i"), "")
      .trim();
  }
  return source;
}

function balancedJsonSlice(text = "") {
  const source = stripJsonFence(text);
  const start = source.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

function safeParse(text) {
  try {
    const candidate = balancedJsonSlice(text);
    if (candidate) return JSON.parse(candidate);
  } catch {}
  try {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return null;
}

function parsePartialAssessment(text = "") {
  const source = stripJsonFence(text);
  const numberField = (key) => {
    const match = source.match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "i"));
    return match ? Number(match[1]) : null;
  };
  const stringField = (key) => {
    const match = source.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)`, "i"));
    return match ? match[1].trim() : "";
  };
  const weakConcepts = [];
  const weakBlock = source.match(/"weakConcepts"\s*:\s*\[([\s\S]*?)(?:\]|\n\s*"suggestedAction")/i);
  if (weakBlock) {
    const conceptObjects = weakBlock[1].match(/"concept"\s*:\s*"([^"]+)"/gi) || [];
    conceptObjects.forEach((item) => {
      const match = item.match(/"concept"\s*:\s*"([^"]+)"/i);
      if (match) weakConcepts.push({ concept: match[1], severity: "medium", reason: "模型诊断提及" });
    });
    const quotedItems = weakBlock[1].match(/"([^"]+)"/g) || [];
    quotedItems
      .map((item) => item.replace(/^"|"$/g, ""))
      .filter((item) => item && !["concept", "severity", "reason", "high", "medium", "low"].includes(item))
      .forEach((item) => {
        if (!weakConcepts.some((concept) => concept.concept === item)) {
          weakConcepts.push({ concept: item, severity: "medium", reason: "模型诊断提及" });
        }
      });
  }
  const masteryLevel = numberField("masteryLevel");
  const confidenceLevel = numberField("confidenceLevel");
  const suggestedAction = stringField("suggestedAction");
  const summary = stringField("summary");
  if (masteryLevel == null && !weakConcepts.length && !suggestedAction && confidenceLevel == null && !summary) return null;
  return { masteryLevel, weakConcepts, suggestedAction, confidenceLevel, summary };
}

function normalizedUnitNumber(value, fallbackValue) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallbackValue;
  if (numeric > 1 && numeric <= 100) return Math.max(0, Math.min(1, numeric / 100));
  return Math.max(0, Math.min(1, numeric));
}

function fallback(quizSummary, reason = "诊断降级为规则模式") {
  const accuracy = Number(quizSummary?.byChapter?.[0]?.accuracy ?? 0.5);
  const weakConcepts = (quizSummary?.wrongConcepts || []).slice(0, 3).map((item) => ({
    concept: item.tag || item.concept || "未知概念",
    severity: Number(item.count || 1) >= 3 ? "high" : "medium",
    reason: `错误 ${item.count || 1} 次`
  }));
  return {
    masteryLevel: accuracy,
    weakConcepts,
    suggestedAction: accuracy >= 0.8 ? "skip" : accuracy < 0.6 ? "remediate" : "continue",
    confidenceLevel: 0.3,
    summary: reason,
    provider: "rules"
  };
}

function normalizeAssessment(parsed, llmProvider) {
  const masteryLevel = normalizedUnitNumber(parsed.masteryLevel, 0.5);
  const confidenceLevel = normalizedUnitNumber(parsed.confidenceLevel, 0.5);
  const allowedActions = new Set(["skip", "remediate", "extend", "continue"]);
  const weakConcepts = (Array.isArray(parsed.weakConcepts) ? parsed.weakConcepts : []).map((item) => {
    if (typeof item === "string") return { concept: item, severity: "medium", reason: "模型诊断提及" };
    return {
      concept: item?.concept || item?.tag || "未知概念",
      severity: ["high", "medium", "low"].includes(item?.severity) ? item.severity : "medium",
      reason: item?.reason || "模型诊断提及"
    };
  });
  return {
    masteryLevel,
    weakConcepts,
    suggestedAction: allowedActions.has(parsed.suggestedAction) ? parsed.suggestedAction : "continue",
    confidenceLevel,
    summary: parsed.summary || "",
    provider: llmProvider
  };
}

async function completeAssessment(options) {
  const controller = new AbortController();
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error(`Assessment timed out after ${ASSESSMENT_TIMEOUT_MS}ms`);
      error.code = "ASSESSMENT_TIMEOUT";
      reject(error);
    }, ASSESSMENT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      completeChat({ ...options, signal: controller.signal }),
      timeout
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function analyze({ quizSummary, gradingResults, interactionEvents }) {
  if (!ASSESSMENT_LLM_ENABLED) {
    return fallback(quizSummary, "基于固定规则的诊断结果");
  }
  const which = provider();
  if (!LIVE_PROVIDERS.includes(which)) return fallback(quizSummary, "基于规则的诊断结果");
  try {
    const user = buildPrompt({ quizSummary, gradingResults, interactionEvents });
    const first = await completeAssessment({
      system: SYSTEM_PROMPT,
      user,
      jsonHint: false,
      maxTokens: 2400,
      model: ASSESSMENT_MODEL
    });
    let result = first;
    let parsed = safeParse(result.text) || parsePartialAssessment(result.text);
    if (!parsed) {
      result = await completeAssessment({
        system: `${SYSTEM_PROMPT}\n输出必须以 { 开头，以 } 结尾。`,
        user,
        jsonHint: false,
        maxTokens: 4000,
        model: ASSESSMENT_MODEL
      });
      parsed = safeParse(result.text) || parsePartialAssessment(result.text);
    }
    if (!parsed) {
      return fallback(quizSummary, `诊断解析失败，已降级为规则模式。原始片段：${String(result.text || "").slice(0, 80)}`);
    }
    return normalizeAssessment(parsed, result.provider || which);
  } catch (error) {
    return fallback(quizSummary, `诊断接口异常，已降级为规则模式：${error.message}`);
  }
}

module.exports = { analyze, _internals: { buildPrompt, safeParse, parsePartialAssessment, fallback } };
