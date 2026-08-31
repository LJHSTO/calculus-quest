const assert = require("node:assert/strict");

const originalFetch = global.fetch;
const originalEnv = {
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  OPENAI_COMPATIBLE_API_KEY: process.env.OPENAI_COMPATIBLE_API_KEY,
  OPENAI_COMPATIBLE_BASE_URL: process.env.OPENAI_COMPATIBLE_BASE_URL,
  OPENAI_COMPATIBLE_MODEL: process.env.OPENAI_COMPATIBLE_MODEL,
  OPENAI_COMPATIBLE_WIRE_API: process.env.OPENAI_COMPATIBLE_WIRE_API
};

process.env.LLM_PROVIDER = "openai-compatible";
process.env.OPENAI_COMPATIBLE_API_KEY = "responses-test-key";
process.env.OPENAI_COMPATIBLE_BASE_URL = "https://api.example.test/v1";
process.env.OPENAI_COMPATIBLE_MODEL = "responses-test-model";
process.env.OPENAI_COMPATIBLE_WIRE_API = "responses";

const requests = [];
global.fetch = async (url, options = {}) => {
  requests.push({
    url: String(url),
    headers: options.headers,
    body: JSON.parse(options.body || "{}")
  });
  if (requests.length === 1) {
    return {
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        error: { message: "json_object text.format is not supported" }
      })
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      output: [{
        content: [{
          type: "output_text",
          text: '{"action":"stay_silent","confidence":0.9}'
        }]
      }]
    })
  };
};

(async () => {
  try {
    delete require.cache[require.resolve("../lib/llm")];
    const llm = require("../lib/llm");
    const result = await llm.completeChat({
      system: "Return a policy decision.",
      user: "Stay silent.",
      jsonHint: true,
      maxTokens: 80
    });

    assert.equal(requests.length, 2, "unsupported Responses JSON mode should retry once");
    assert.equal(requests[0].url, "https://api.example.test/v1/responses");
    assert.equal(requests[0].headers.Authorization, "Bearer responses-test-key");
    assert.equal(requests[0].body.model, "responses-test-model");
    assert.match(requests[0].body.instructions, /Return only valid JSON/);
    assert.equal(requests[0].body.input, "Stay silent.");
    assert.equal(requests[0].body.max_output_tokens, 80);
    assert.equal(requests[0].body.store, false);
    assert.deepEqual(requests[0].body.text, {
      format: { type: "json_object" }
    });
    assert.equal(requests[0].body.messages, undefined);
    assert.equal(requests[0].body.max_tokens, undefined);
    assert.equal(requests[1].body.text, undefined);
    assert.equal(result.text, '{"action":"stay_silent","confidence":0.9}');

    console.log("LLM Responses API tests passed");
  } finally {
    global.fetch = originalFetch;
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
