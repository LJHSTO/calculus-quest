const assert = require("node:assert/strict");

const originalFetch = global.fetch;
const originalEnv = {
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  OPENAI_COMPATIBLE_API_KEY: process.env.OPENAI_COMPATIBLE_API_KEY,
  OPENAI_COMPATIBLE_BASE_URL: process.env.OPENAI_COMPATIBLE_BASE_URL,
  OPENAI_COMPATIBLE_MODEL: process.env.OPENAI_COMPATIBLE_MODEL
};

process.env.LLM_PROVIDER = "openai-compatible";
process.env.OPENAI_COMPATIBLE_API_KEY = "test-key";
process.env.OPENAI_COMPATIBLE_BASE_URL = "https://api.siliconflow.cn/v1";
process.env.OPENAI_COMPATIBLE_MODEL = "Qwen/Qwen3.5-35B-A3B";

const requests = [];
global.fetch = async (_url, options = {}) => {
  requests.push(JSON.parse(options.body || "{}"));
  if (requests.length === 1) {
    return {
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        code: 20024,
        message: "Json mode is not supported for this model."
      })
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: '{"action":"stay_silent","confidence":0.8}' } }]
    })
  };
};

(async () => {
  try {
    delete require.cache[require.resolve("../lib/llm")];
    const llm = require("../lib/llm");
    const result = await llm.completeChat({
      system: "Return JSON.",
      user: "Stay silent.",
      jsonHint: true,
      maxTokens: 80
    });

    assert.equal(requests.length, 2, "unsupported JSON mode should retry exactly once");
    assert.deepEqual(requests[0].response_format, { type: "json_object" });
    assert.equal(requests[0].enable_thinking, false, "structured Qwen grading must reserve tokens for the JSON answer");
    assert.equal(requests[1].response_format, undefined);
    assert.equal(requests[1].enable_thinking, false);
    assert.equal(result.text, '{"action":"stay_silent","confidence":0.8}');
    console.log("llm JSON mode retry tests passed");
  } finally {
    global.fetch = originalFetch;
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
