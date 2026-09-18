// LLM adapter. Defaults to a mock provider so local development never blocks on the network.
// Set LLM_PROVIDER=openai-compatible and provide an environment credential or LLM_CONFIG_FILE.

const fs = require("fs");
const path = require("path");

const OPENAI_COMPATIBLE_DEFAULT_BASE_URL = "https://api.innospark.cn/v1";
const OPENAI_COMPATIBLE_DEFAULT_MODEL = "gemini-2.5-flash";
const LLM_CONFIG_FILE_ENV_KEYS = [
  "LLM_CONFIG_FILE",
  "OPENAI_COMPATIBLE_CONFIG_FILE",
  "LLM_API_KEY_FILE",
  "OPENAI_COMPATIBLE_API_KEY_FILE"
];

function loadEnvFile() {
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      const first = val.charCodeAt(0);
      const last = val.charCodeAt(val.length - 1);
      if (val.length >= 2 && first === last && (first === 34 || first === 39)) val = val.slice(1, -1);
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  } catch (error) {
    console.warn(".env load skipped:", error.message);
  }
}

loadEnvFile();

function provider() {
  return (process.env.LLM_PROVIDER || "mock").toLowerCase();
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function firstListItem(value = "") {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .find(Boolean) || "";
}

function stripOuterQuotes(value = "") {
  const text = String(value || "").trim();
  if (text.length < 2) return text;
  const first = text[0];
  const last = text[text.length - 1];
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function assignmentValues(text = "") {
  const values = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    values[match[1].toUpperCase()] = stripOuterQuotes(match[2]);
  }
  return values;
}

function objectValue(source, keys) {
  if (!source || typeof source !== "object") return "";
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function endpointConfig(endpoint = "") {
  const value = String(endpoint || "").trim();
  if (!value) return { baseUrl: "", wireApi: "" };
  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/+$/g, "");
    let basePath = pathname;
    let wireApi = "";
    if (/\/chat\/completions$/i.test(pathname)) {
      basePath = pathname.replace(/\/chat\/completions$/i, "");
      wireApi = "chat-completions";
    } else if (/\/responses$/i.test(pathname)) {
      basePath = pathname.replace(/\/responses$/i, "");
      wireApi = "responses";
    }
    url.pathname = basePath || "/";
    url.search = "";
    url.hash = "";
    return {
      baseUrl: url.toString().replace(/\/$/g, ""),
      wireApi
    };
  } catch {
    return { baseUrl: value, wireApi: "" };
  }
}

function parseLlmConfigText(text = "") {
  const source = String(text || "").trim();
  if (!source) return {};

  const assignments = assignmentValues(source);
  let json = {};
  if (source.startsWith("{")) {
    try {
      json = JSON.parse(source);
    } catch {
      json = {};
    }
  }

  const normalized = source.replace(/\\"/g, "\"");
  const bearerMatch = normalized.match(/Authorization\s*:\s*Bearer\s+([^\s"'\\]+)/i);
  const urlMatch = normalized.match(/https?:\/\/[^\s"'\\]+/i);
  const modelMatch = normalized.match(/["']model["']\s*:\s*["']([^"']+)["']/i);
  const labeledKeyMatch = normalized.match(
    /(?:api[_ -]?key|密钥)\s*[:：]\s*["']?([^\s"'\\]+)/i
  );
  const endpoint = firstText(
    objectValue(json, ["baseUrl", "base_url", "endpoint", "url"]),
    assignments.OPENAI_COMPATIBLE_BASE_URL,
    assignments.INNOSPARK_BASE_URL,
    assignments.OPENROUTER_BASE_URL,
    assignments.BASE_URL,
    urlMatch?.[0]
  );
  const derivedEndpoint = endpointConfig(endpoint);

  let apiKey = firstText(
    objectValue(json, ["apiKey", "api_key", "key", "token"]),
    assignments.OPENAI_COMPATIBLE_API_KEY,
    assignments.INNOSPARK_API_KEY,
    assignments.OPENROUTER_API_KEY,
    assignments.API_KEY,
    assignments.TOKEN,
    bearerMatch?.[1],
    labeledKeyMatch?.[1]
  );
  if (!apiKey) {
    const contentLines = source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    if (
      contentLines.length === 1
      && !/\s/.test(contentLines[0])
      && !/^https?:\/\//i.test(contentLines[0])
    ) {
      apiKey = stripOuterQuotes(contentLines[0]);
    }
  }

  return {
    apiKey,
    baseUrl: firstText(
      objectValue(json, ["baseUrl", "base_url"]),
      assignments.OPENAI_COMPATIBLE_BASE_URL,
      assignments.INNOSPARK_BASE_URL,
      assignments.OPENROUTER_BASE_URL,
      assignments.BASE_URL,
      derivedEndpoint.baseUrl
    ),
    model: firstText(
      objectValue(json, ["model"]),
      assignments.OPENAI_COMPATIBLE_MODEL,
      assignments.INNOSPARK_MODEL,
      assignments.OPENROUTER_MODEL,
      assignments.DEFAULT_MODEL,
      firstListItem(assignments.OPENROUTER_MODELS),
      assignments.MODEL,
      modelMatch?.[1]
    ),
    wireApi: firstText(
      objectValue(json, ["wireApi", "wire_api"]),
      assignments.OPENAI_COMPATIBLE_WIRE_API,
      assignments.OPENAI_WIRE_API,
      assignments.WIRE_API,
      derivedEndpoint.wireApi
    )
  };
}

function configuredFilePath(overrides = {}) {
  return firstText(
    overrides.configFile,
    overrides.apiKeyFile,
    ...LLM_CONFIG_FILE_ENV_KEYS.map((key) => process.env[key])
  );
}

function readLlmConfigFile(filePath = "") {
  const resolvedPath = path.resolve(String(filePath || "").trim());
  let source;
  try {
    source = fs.readFileSync(resolvedPath, "utf8");
  } catch {
    const error = new Error(`LLM configuration file could not be read: ${resolvedPath}`);
    error.code = "LLM_CONFIG_FILE_UNREADABLE";
    throw error;
  }
  const parsed = parseLlmConfigText(source);
  if (!parsed.apiKey) {
    const error = new Error(`LLM configuration file does not contain a usable API key: ${resolvedPath}`);
    error.code = "LLM_CONFIG_FILE_INVALID";
    throw error;
  }
  return parsed;
}

function responseTextFromValue(value, depth = 0) {
  if (depth > 8 || value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((item) => responseTextFromValue(item, depth + 1)).join("");
  }
  if (typeof value !== "object") return "";
  if (typeof value.text === "string" && value.text.trim()) return value.text;
  if (typeof value.output_text === "string" && value.output_text.trim()) return value.output_text;
  if (
    typeof value.value === "string"
    && value.value.trim()
    && (!value.type || /text/i.test(value.type))
  ) {
    return value.value;
  }
  for (const key of ["content", "parts", "output", "message", "candidates", "choices", "response", "data"]) {
    const text = responseTextFromValue(value[key], depth + 1);
    if (text) return text;
  }
  return "";
}

function responseTextFromChatCompletion(json) {
  return responseTextFromValue(json).trim();
}

function requireResponseText(json) {
  const text = responseTextFromChatCompletion(json);
  if (!text) {
    const error = new Error("LLM returned an empty text response");
    error.code = "LLM_EMPTY_RESPONSE";
    throw error;
  }
  return text;
}

async function complete({ system, user, jsonHint = false, maxTokens = 600 } = {}) {
  const which = provider();
  if (isLiveProvider(which)) return compatibleComplete({ system, user, jsonHint, maxTokens });
  return mockComplete({ system, user, jsonHint });
}

function isLiveProvider(which) {
  return ["openai-compatible", "innospark", "openai"].includes(which);
}

function liveConfig(modelOverride = "", overrides = {}) {
  const directApiKey = firstText(
    overrides.apiKey,
    process.env.OPENAI_COMPATIBLE_API_KEY,
    process.env.INNOSPARK_API_KEY
  );
  const configFile = configuredFilePath(overrides);
  const fileConfig = !directApiKey && configFile
    ? readLlmConfigFile(configFile)
    : {};
  const baseUrl =
    overrides.baseUrl
    || process.env.OPENAI_COMPATIBLE_BASE_URL
    || process.env.INNOSPARK_BASE_URL
    || fileConfig.baseUrl
    || OPENAI_COMPATIBLE_DEFAULT_BASE_URL;
  const apiKey = directApiKey || fileConfig.apiKey;
  const model =
    modelOverride
    || process.env.OPENAI_COMPATIBLE_MODEL
    || process.env.INNOSPARK_MODEL
    || fileConfig.model
    || OPENAI_COMPATIBLE_DEFAULT_MODEL;
  const wireApi = normalizeWireApi(
    overrides.wireApi
    || process.env.OPENAI_COMPATIBLE_WIRE_API
    || process.env.OPENAI_WIRE_API
    || fileConfig.wireApi
    || "chat-completions"
  );
  if (!apiKey) throw new Error("OpenAI-compatible API key is not set");
  return {
    baseUrl,
    apiKey,
    model,
    wireApi,
    credentialSource: directApiKey ? "environment" : "file"
  };
}

function runtimeInfo(overrides = {}) {
  const selectedProvider = String(overrides.provider || provider()).trim().toLowerCase();
  const live = isLiveProvider(selectedProvider);
  if (!live) {
    return {
      provider: selectedProvider,
      live: false,
      liveConfigured: false,
      model: "",
      wireApi: "",
      credentialSource: ""
    };
  }
  try {
    const config = liveConfig(overrides.model, overrides);
    return {
      provider: selectedProvider,
      live: true,
      liveConfigured: true,
      model: config.model,
      wireApi: config.wireApi,
      credentialSource: config.credentialSource
    };
  } catch (error) {
    return {
      provider: selectedProvider,
      live: true,
      liveConfigured: false,
      model: firstText(overrides.model),
      wireApi: normalizeWireApi(overrides.wireApi || ""),
      credentialSource: "",
      configErrorCode: error?.code || "LLM_CONFIG_MISSING"
    };
  }
}

function chatCompletionsUrl(baseUrl) {
  return new URL("chat/completions", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

function responsesUrl(baseUrl) {
  return new URL("responses", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

function normalizeWireApi(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  return ["responses", "response"].includes(normalized)
    ? "responses"
    : "chat-completions";
}

function shouldDisableThinkingForJson(model = "") {
  return /qwen/i.test(String(model || ""));
}

function completionRequest({
  wireApi,
  model,
  system,
  user,
  jsonHint,
  maxTokens,
  temperature
}) {
  if (wireApi === "responses") {
    const body = {
      model,
      instructions: system || "",
      input: user || "",
      max_output_tokens: maxTokens,
      store: false
    };
    if (Number.isFinite(Number(temperature))) body.temperature = Number(temperature);
    if (jsonHint) body.text = { format: { type: "json_object" } };
    return body;
  }
  const body = {
    model,
    messages: [
      { role: "system", content: system || "" },
      { role: "user", content: user || "" }
    ],
    max_tokens: maxTokens
  };
  if (Number.isFinite(Number(temperature))) body.temperature = Number(temperature);
  if (jsonHint) {
    body.response_format = { type: "json_object" };
    if (shouldDisableThinkingForJson(model)) body.enable_thinking = false;
  }
  return body;
}

function completionUrl(baseUrl, wireApi) {
  return wireApi === "responses"
    ? responsesUrl(baseUrl)
    : chatCompletionsUrl(baseUrl);
}

function withoutStructuredOutput(body, wireApi) {
  const retryBody = { ...body };
  if (wireApi === "responses") delete retryBody.text;
  else delete retryBody.response_format;
  return retryBody;
}

function structuredOutputUnsupported(text = "") {
  return /Structured response content must be a string|response_format|json_object|json mode is not supported|text\.format|invalid input/i.test(
    String(text || "")
  );
}

function safeProviderErrorText(text = "", secrets = []) {
  let result = String(text || "");
  for (const secret of secrets) {
    const value = String(secret || "");
    if (value.length >= 4) result = result.split(value).join("[REDACTED]");
  }
  return result
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [REDACTED]")
    .slice(0, 200);
}

function responseModelInfo(json, requestedModel, wireApi) {
  return {
    requestedModel: String(requestedModel || "").slice(0, 160),
    reportedModel: typeof json?.model === "string" ? json.model.trim().slice(0, 160) : "",
    wireApi
  };
}

// OpenAI-compatible adapter for providers such as Innospark (`POST /v1/chat/completions`).
async function compatibleComplete({ system, user, jsonHint, maxTokens }) {
  const { baseUrl, apiKey, model, wireApi } = liveConfig();
  const body = completionRequest({
    wireApi,
    model,
    system,
    user,
    jsonHint,
    maxTokens
  });
  const res = await fetch(completionUrl(baseUrl, wireApi), {
    method: "POST",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `OpenAI-compatible LLM HTTP ${res.status}: ${safeProviderErrorText(txt, [apiKey])}`
    );
  }
  const json = await res.json();
  const text = requireResponseText(json);
  return { provider: provider(), text, modelInfo: responseModelInfo(json, model, wireApi) };
}

// Mock provider: composes a deterministic Chinese narration from a "draft" payload embedded in the user prompt.
// The user prompt template that calls this MUST embed a JSON block tagged `<<<plan_json>>> ... <<<end>>>`.
function mockComplete({ user }) {
  const planMatch = String(user || "").match(/<<<plan_json>>>([\s\S]*?)<<<end>>>/);
  let plan = {};
  if (planMatch) {
    try { plan = JSON.parse(planMatch[1]); } catch { plan = {}; }
  }
  const lines = [];
  if (plan.openingNote) lines.push(plan.openingNote);
  if (Array.isArray(plan.skip) && plan.skip.length) {
    const titles = plan.skip.slice(0, 3).map((unit) => `「${unit.title}」`).join("、");
    lines.push(`你在「${plan.chapterTitle || "本章前测"}」里的答题情况看起来已经掌握得不错，要不要先跳过 ${titles} 这一组直接进入下一个挑战？这些环节会保留入口，随时可以回来补。`);
  }
  if (Array.isArray(plan.remediate) && plan.remediate.length) {
    const items = plan.remediate.slice(0, 2).map((unit) => `「${unit.title}」（${unit.modality === "visual" ? "图像版" : unit.modality === "symbolic" ? "公式版" : "对比版"}）`).join("、");
    lines.push(`刚刚的后测里 ${plan.weakConcepts || "几个概念"} 看起来还没踩稳。想换一种方式再走一遍吗？我推荐 ${items}，换个视角试试。`);
  }
  if (Array.isArray(plan.extension) && plan.extension.length) {
    const extItem = plan.extension[0];
    lines.push(`如果还有兴趣，可以提前走一步到「${extItem.chapterTitle}」的入口「${extItem.title}」，先看看下一章的全景图，再决定要不要深入。我只解锁一步，避免一次走太远。`);
  }
  if (!lines.length) lines.push("整体表现稳定，按当前路线继续就好。");
  return { provider: "mock", text: lines.join("\n\n") };
}

async function completeChat({
  system,
  user,
  jsonHint = false,
  maxTokens = 600,
  model,
  signal,
  provider: providerOverride,
  baseUrl,
  apiKey,
  wireApi,
  configFile,
  temperature
} = {}) {
  const which = String(providerOverride || provider()).toLowerCase();
  if (!isLiveProvider(which)) return mockComplete({ system, user, jsonHint });
  const {
    baseUrl: selectedBaseUrl,
    apiKey: selectedApiKey,
    model: selectedModel,
    wireApi: selectedWireApi
  } = liveConfig(model, { baseUrl, apiKey, wireApi, configFile });
  const systemContent = jsonHint
    ? `${system || ""}\n\nReturn only valid JSON. Do not wrap it in markdown fences.`
    : system || "";
  const body = completionRequest({
    wireApi: selectedWireApi,
    model: selectedModel,
    system: systemContent,
    user,
    jsonHint,
    maxTokens,
    temperature
  });
  const request = async (payload) => fetch(completionUrl(selectedBaseUrl, selectedWireApi), {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${selectedApiKey}` },
    body: JSON.stringify(payload),
    signal
  });
  let res = await request(body);
  if (
    !res.ok
    && jsonHint
    && (body.response_format || body.text?.format)
  ) {
    const txt = await res.text().catch(() => "");
    if (structuredOutputUnsupported(txt)) {
      res = await request(withoutStructuredOutput(body, selectedWireApi));
    } else {
      throw new Error(
        `OpenAI-compatible Chat HTTP ${res.status}: ${safeProviderErrorText(txt, [selectedApiKey])}`
      );
    }
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `OpenAI-compatible Chat HTTP ${res.status}: ${safeProviderErrorText(txt, [selectedApiKey])}`
    );
  }
  const json = await res.json();
  const text = requireResponseText(json);
  return { provider: which, text, modelInfo: responseModelInfo(json, selectedModel, selectedWireApi) };
}

module.exports = {
  complete,
  completeChat,
  provider,
  runtimeInfo,
  _internals: {
    responseTextFromChatCompletion,
    requireResponseText,
    normalizeWireApi,
    completionRequest,
    completionUrl,
    endpointConfig,
    parseLlmConfigText,
    readLlmConfigFile,
    safeProviderErrorText
  }
};
