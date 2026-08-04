const { completeChat } = require("../llm");

const GRADING_MODEL =
  process.env.GRADING_MODEL
  || process.env.OPENAI_COMPATIBLE_MODEL
  || process.env.INNOSPARK_MODEL
  || "gemini-2.5-flash";
const GRADING_TIMEOUT_MS = Math.max(1000, Number(process.env.GRADING_TIMEOUT_MS || 25000));
const VALID_ERROR_TYPES = ["none", "calculation", "conceptual", "reasoning", "notation", "incomplete"];

const SYSTEM_PROMPT = `你是一位严谨的高中数学评分专家。根据评分标准对学生的简答题进行评分。

评分原则：
1. 重视推理过程，不仅看最终答案
2. 必须按照题目给出的“满分”评分，score 只能是 0 到该题满分之间的数字；不要输出百分制，除非题目满分就是 100
3. 识别错误类型：calculation（计算错误）、conceptual（概念混淆）、reasoning（推理跳步）、notation（符号误用）、incomplete（不完整）
4. 将错误归因到具体数学概念；weakConcepts 只能使用题目提供的学生可读中文概念名，绝不输出 GH-01-K01 这类内部编码

严格使用以下 JSON 格式输出，不要添加任何其他内容：
{
  "score": <0到本题满分之间的数字>,
  "isCorrect": <true|false|"partial">,
  "confidence": <0.0-1.0>,
  "errorType": <"none"|"calculation"|"conceptual"|"reasoning"|"notation"|"incomplete">,
  "weakConcepts": [<相关概念标签字符串>],
  "feedback": "<一句话中文诊断性反馈>",
  "reasoning": "<评分依据简述>"
}`;

function buildPrompt(q) {
  const questionText = q.questionText || q.question || q.prompt || q.title || q.text || "";
  const referenceAnswer = q.referenceAnswer || q.answerText || q.analysis || "";
  const rubric = q.rubric || q.commentPrompt || "";
  const parts = [`题目：${questionText || "（无题目文本）"}`];
  if (referenceAnswer) parts.push(`参考答案：${referenceAnswer}`);
  if (rubric) parts.push(`评分标准：${rubric}`);
  if (q.points) parts.push(`满分：${q.points} 分。请直接按这个满分给 score，例如满分 20 分时 score 必须在 0 到 20 之间，不要给 0-100 百分制。`);
  if (q.concepts) parts.push(`涉及概念（只可输出这些中文名称，不要输出任何内部编码）：${Array.isArray(q.concepts) ? q.concepts.join("、") : q.concepts}`);
  parts.push(`学生回答：${q.response}`);
  return parts.join("\n");
}

function stripJsonFence(text = "") {
  const fence = String.fromCharCode(96).repeat(3);
  let source = String(text || "").trim();
  if (source.startsWith(fence)) {
    source = source
      .replace(new RegExp("^" + fence + "[A-Za-z]*\\s*", "i"), "")
      .replace(new RegExp("\\s*" + fence + "$", "i"), "")
      .trim();
  }
  return source;
}

function balancedJsonSlice(text = "") {
  const source = stripJsonFence(text);
  const start = source.search(/[\[{]/);
  if (start < 0) return "";
  const opener = source[start];
  const closer = opener === "{" ? "}" : "]";
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
    if (ch === opener) depth += 1;
    if (ch === closer) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

function normaliseParsedJson(value) {
  if (Array.isArray(value)) return value[0] || null;
  if (value?.result && typeof value.result === "object") return value.result;
  if (value?.grading && typeof value.grading === "object") return value.grading;
  return value && typeof value === "object" ? value : null;
}

function quoteBareJsonStrings(source = "") {
  return String(source).replace(
    /("(?:isCorrect|errorType)"\s*:\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*[,}])/g,
    '$1"$2"$3'
  );
}

function normaliseScoreValue(value) {
  if (typeof value === "string") {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return Number(value);
}

function normaliseConfidenceValue(value) {
  const n = normaliseScoreValue(value);
  return n > 1 && n <= 100 ? n / 100 : n;
}

function looseJsonCandidate(text = "") {
  const source = balancedJsonSlice(text)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/，/g, ",")
    .replace(/：/g, ":")
    .replace(/；/g, ";")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)(score|isCorrect|confidence|errorType|weakConcepts|feedback|reasoning)\s*:/g, '$1"$2":');
  return quoteBareJsonStrings(source);
}

function parseLooseNumberField(source = "", key) {
  const match = String(source).match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "i"));
  return match ? Number(match[1]) : null;
}

function parseLooseStringField(source = "", key) {
  const text = String(source || "");
  const quoted = text.match(new RegExp(`"${key}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*)`, "i"));
  if (quoted) {
    try { return JSON.parse(quoted[1] + '"'); } catch {}
    return quoted[1].slice(1).trim();
  }
  const bare = text.match(new RegExp(`"${key}"\\s*:\\s*([^,}\\n]+)`, "i"));
  return bare ? bare[1].replace(/^['"“”]+|['"“”]+$/g, "").trim() : "";
}

function parseLooseCorrectness(source = "") {
  const value = parseLooseStringField(source, "isCorrect").toLowerCase();
  if (/^true$|正确|yes/.test(value)) return true;
  if (/^false$|错误|不正确|no/.test(value)) return false;
  if (/partial|部分/.test(value)) return "partial";
  return null;
}

function parseLooseWeakConcepts(source = "") {
  const match = String(source || "").match(/"weakConcepts"\s*:\s*\[([^\]]*)/i);
  if (!match) return [];
  return match[1]
    .split(/[,，]/)
    .map((item) => item.replace(/^['"“”\s]+|['"“”\s]+$/g, ""))
    .filter(Boolean)
    .slice(0, 8);
}

function looseFieldParse(text = "") {
  const source = looseJsonCandidate(text) || stripJsonFence(text);
  const score = parseLooseNumberField(source, "score");
  if (score === null || Number.isNaN(score)) return null;
  const confidence = parseLooseNumberField(source, "confidence");
  const errorType = parseLooseStringField(source, "errorType") || "none";
  return {
    score,
    isCorrect: parseLooseCorrectness(source),
    confidence: confidence === null || Number.isNaN(confidence) ? 0.5 : confidence,
    errorType: VALID_ERROR_TYPES.includes(errorType) ? errorType : "none",
    weakConcepts: parseLooseWeakConcepts(source),
    feedback: parseLooseStringField(source, "feedback"),
    reasoning: parseLooseStringField(source, "reasoning")
  };
}

function safeParse(text) {
  const fenced = stripJsonFence(text);
  const balanced = balancedJsonSlice(text);
  const candidates = [
    fenced,
    balanced,
    looseJsonCandidate(text),
    quoteBareJsonStrings(fenced),
    quoteBareJsonStrings(balanced)
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return normaliseParsedJson(JSON.parse(candidate));
    } catch {}
  }
  return normaliseParsedJson(looseFieldParse(text));
}

function gradingIdentity(q) {
  return {
    questionId: q.questionId,
    unitId: q.unitId || "",
    chapterId: q.chapterId || ""
  };
}

function gradingTimeoutError() {
  const err = new Error(`AI grading timed out after ${GRADING_TIMEOUT_MS}ms`);
  err.code = "AI_GRADING_TIMEOUT";
  return err;
}

function isGradingTimeout(err) {
  return err?.code === "AI_GRADING_TIMEOUT" || err?.name === "AbortError";
}

async function completeChatForGrading(options) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let didTimeout = false;
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      didTimeout = true;
      if (controller) controller.abort();
      reject(gradingTimeoutError());
    }, GRADING_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      completeChat({ ...options, signal: controller?.signal }),
      timeout
    ]);
  } catch (err) {
    if (didTimeout || isGradingTimeout(err)) throw gradingTimeoutError();
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function gradeOne(q) {
  const llmProvider = require("../llm").provider();
  if (!["openai-compatible", "innospark", "openai"].includes(llmProvider)) {
    return {
      ...gradingIdentity(q),
      score: 0,
      isCorrect: false,
      confidence: 0,
      errorType: "mock_provider",
      weakConcepts: [],
      feedback: "未启用真实大模型，已先按 0 分计入，不影响继续学习。",
      reasoning: "LLM_PROVIDER 未启用真实接口。",
      needsReview: true,
      provider: "mock"
    };
  }
  try {
    const result = await completeChatForGrading({
      system: SYSTEM_PROMPT,
      user: buildPrompt(q),
      jsonHint: true,
      maxTokens: 700,
      model: GRADING_MODEL
    });
    const parsed = safeParse(result.text);
    if (!parsed) {
      return { ...gradingIdentity(q), score: 0, isCorrect: false, confidence: 0, errorType: "parse_error", weakConcepts: [], feedback: `AI 评分解析失败，已先按 0 分计入。原始片段：${String(result.text || "").slice(0, 120)}`, reasoning: "", needsReview: true, provider: result.provider };
    }
    // Reflective self-check: validate parsed fields against current question points.
    const maxScore = Math.max(0, Number(q.points || q.maxScore || q.max_score || 0));
    const rawScore = normaliseScoreValue(parsed.score) || 0;
    const score = maxScore
      ? Math.round(Math.max(0, Math.min(maxScore, rawScore)) * 10) / 10
      : Math.max(0, Math.round(rawScore));
    const confidence = Math.max(0, Math.min(1, normaliseConfidenceValue(parsed.confidence) || 0));
    const errorType = VALID_ERROR_TYPES.includes(parsed.errorType) ? parsed.errorType : "none";
    // If score is 0 but isCorrect is true, or score > 80 but isCorrect is false, flag for review
    const passLine = maxScore ? maxScore * 0.8 : 80;
    const inconsistent = (score === 0 && parsed.isCorrect === true) || (score > passLine && parsed.isCorrect === false);
    const adjustedConfidence = inconsistent ? Math.min(confidence, 0.4) : confidence;
    return {
      ...gradingIdentity(q),
      score,
      isCorrect: parsed.isCorrect ?? null,
      confidence: adjustedConfidence,
      errorType,
      weakConcepts: Array.isArray(parsed.weakConcepts) ? parsed.weakConcepts : [],
      feedback: parsed.feedback || "",
      reasoning: parsed.reasoning || "",
      needsReview: adjustedConfidence < 0.7 || inconsistent,
      provider: result.provider
    };
  } catch (err) {
    if (isGradingTimeout(err)) {
      return { ...gradingIdentity(q), score: 0, isCorrect: false, confidence: 0, errorType: "api_timeout", weakConcepts: [], feedback: "AI 评分超时，已先按 0 分计入，不影响继续学习。", reasoning: "", needsReview: true, provider: "timeout" };
    }
    if (err?.code === "LLM_EMPTY_RESPONSE") {
      return {
        ...gradingIdentity(q),
        score: 0,
        isCorrect: false,
        confidence: 0,
        errorType: "empty_response",
        weakConcepts: [],
        feedback: "模型接口返回了空文本，未能读取评分结果；已先按 0 分计入，不影响继续学习。",
        reasoning: "",
        needsReview: true,
        provider: "empty-response"
      };
    }
    return { ...gradingIdentity(q), score: 0, isCorrect: false, confidence: 0, errorType: "api_error", weakConcepts: [], feedback: `评分出错：${err.message}。已先按 0 分计入，不影响继续学习。`, reasoning: "", needsReview: true, provider: "error" };
  }
}

async function gradeShortAnswers(questions) {
  const shorts = (questions || []).filter(q => q.questionType === "short_answer" && q.response);
  if (!shorts.length) return [];
  const results = await Promise.all(shorts.map(gradeOne));
  return results;
}

module.exports = { gradeShortAnswers, gradeOne, _internals: { safeParse, looseFieldParse } };
