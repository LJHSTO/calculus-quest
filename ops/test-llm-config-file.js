const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const originalFetch = global.fetch;
const trackedEnv = [
  "LLM_PROVIDER",
  "LLM_CONFIG_FILE",
  "LLM_API_KEY_FILE",
  "OPENAI_COMPATIBLE_CONFIG_FILE",
  "OPENAI_COMPATIBLE_API_KEY_FILE",
  "OPENAI_COMPATIBLE_API_KEY",
  "OPENAI_COMPATIBLE_BASE_URL",
  "OPENAI_COMPATIBLE_MODEL",
  "OPENAI_COMPATIBLE_WIRE_API",
  "INNOSPARK_API_KEY",
  "INNOSPARK_BASE_URL",
  "INNOSPARK_MODEL",
  "GRADING_LLM_PROVIDER",
  "GRADING_CONFIG_FILE",
  "GRADING_API_KEY",
  "GRADING_BASE_URL",
  "GRADING_MODEL",
  "GRADING_WIRE_API"
];
const originalEnv = Object.fromEntries(trackedEnv.map((key) => [key, process.env[key]]));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-llm-config-"));

function clearTrackedEnv() {
  trackedEnv.forEach((key) => delete process.env[key]);
}

function restoreEnvironment() {
  clearTrackedEnv();
  Object.entries(originalEnv).forEach(([key, value]) => {
    if (value !== undefined) process.env[key] = value;
  });
}

function reload(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function write(name, text) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, text, "utf8");
  return filePath;
}

async function main() {
  clearTrackedEnv();
  process.env.LLM_PROVIDER = "openai-compatible";

  const rawPath = write("raw.txt", "raw-file-test-key");
  process.env.LLM_CONFIG_FILE = rawPath;
  let llm = reload("../lib/llm");
  let parsed = llm._internals.readLlmConfigFile(rawPath);
  assert.equal(parsed.apiKey, "raw-file-test-key");

  const assignmentPath = write(
    "assignment.txt",
    [
      "OPENAI_COMPATIBLE_BASE_URL=https://assignment.example/v1",
      "OPENAI_COMPATIBLE_API_KEY=assignment-file-test-key",
      "OPENAI_COMPATIBLE_MODEL=assignment-model",
      "OPENAI_COMPATIBLE_WIRE_API=responses"
    ].join("\n")
  );
  parsed = llm._internals.readLlmConfigFile(assignmentPath);
  assert.equal(parsed.apiKey, "assignment-file-test-key");
  assert.equal(parsed.baseUrl, "https://assignment.example/v1");
  assert.equal(parsed.model, "assignment-model");
  assert.equal(parsed.wireApi, "responses");

  const openRouterPath = write(
    "openrouter.env",
    [
      "OPENROUTER_BASE_URL=https://openrouter.example/v1",
      "OPENROUTER_API_KEY=openrouter-file-test-key",
      "OPENROUTER_MODELS=first-router-model,second-router-model"
    ].join("\n")
  );
  parsed = llm._internals.readLlmConfigFile(openRouterPath);
  assert.equal(parsed.apiKey, "openrouter-file-test-key");
  assert.equal(parsed.baseUrl, "https://openrouter.example/v1");
  assert.equal(parsed.model, "first-router-model");

  const jsonPath = write(
    "config.json",
    JSON.stringify({
      baseUrl: "https://json.example/v1",
      apiKey: "json-file-test-key",
      model: "json-model",
      wireApi: "responses"
    })
  );
  parsed = llm._internals.readLlmConfigFile(jsonPath);
  assert.equal(parsed.apiKey, "json-file-test-key");
  assert.equal(parsed.baseUrl, "https://json.example/v1");
  assert.equal(parsed.model, "json-model");
  assert.equal(parsed.wireApi, "responses");

  const curlPath = write(
    "curl.txt",
    [
      "curl https://curl.example/v1/chat/completions \\",
      "  -H \"Content-Type: application/json\" \\",
      "  -H \"Authorization: Bearer curl-file-test-key\" \\",
      "  -d '{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}]}'"
    ].join("\n")
  );
  process.env.LLM_CONFIG_FILE = curlPath;
  llm = reload("../lib/llm");
  const runtime = llm.runtimeInfo();
  assert.deepEqual(runtime, {
    provider: "openai-compatible",
    live: true,
    liveConfigured: true,
    model: "auto",
    wireApi: "chat-completions",
    credentialSource: "file"
  });
  assert.equal(Object.hasOwn(runtime, "apiKey"), false);

  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({
      url: String(url),
      authorization: options.headers.Authorization,
      body: JSON.parse(options.body || "{}")
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              score: 2,
              isCorrect: true,
              confidence: 0.96,
              errorType: "none",
              weakConcepts: [],
              feedback: "判断正确。",
              reasoning: "过程完整。"
            })
          }
        }]
      })
    };
  };

  const assistantResult = await llm.completeChat({
    system: "回答测试。",
    user: "测试",
    maxTokens: 20,
    temperature: 0.25
  });
  assert.match(assistantResult.text, /判断正确/);
  assert.equal(requests[0].url, "https://curl.example/v1/chat/completions");
  assert.equal(requests[0].authorization, "Bearer curl-file-test-key");
  assert.equal(requests[0].body.model, "auto");
  assert.equal(requests[0].body.temperature, 0.25);

  process.env.GRADING_LLM_PROVIDER = "openai-compatible";
  const grading = reload("../lib/agents/grading");
  const grade = await grading.gradeOne({
    questionId: "file-config-grade",
    unitId: "unit",
    chapterId: "chapter",
    questionType: "short_answer",
    questionText: "1+1 等于多少？",
    referenceAnswer: "2",
    points: 2,
    response: "2"
  });
  assert.equal(grade.score, 2);
  assert.equal(requests[1].authorization, "Bearer curl-file-test-key");
  assert.equal(grading.gradingRuntimeInfo().credentialSource, "file");
  assert.equal(grading.gradingRuntimeInfo().model, "auto");

  global.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => "Authorization: Bearer curl-file-test-key"
  });
  await assert.rejects(
    () => llm.completeChat({ system: "测试", user: "测试" }),
    (error) => {
      assert.doesNotMatch(error.message, /curl-file-test-key/);
      assert.match(error.message, /\[REDACTED\]/);
      return true;
    }
  );

  const emptyPath = write("empty.txt", "");
  assert.throws(
    () => llm._internals.readLlmConfigFile(emptyPath),
    (error) => {
      assert.equal(error.code, "LLM_CONFIG_FILE_INVALID");
      assert.doesNotMatch(error.message, /file-test-key/);
      return true;
    }
  );
  assert.throws(
    () => llm._internals.readLlmConfigFile(path.join(tmpDir, "missing.txt")),
    (error) => {
      assert.equal(error.code, "LLM_CONFIG_FILE_UNREADABLE");
      return true;
    }
  );

  console.log("LLM config file tests passed");
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
    restoreEnvironment();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
