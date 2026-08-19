const assert = require("node:assert/strict");
const { _internals } = require("../lib/llm");

const gradingJson = JSON.stringify({
  score: 18,
  isCorrect: "partial",
  confidence: 0.86,
  errorType: "incomplete",
  weakConcepts: ["函数、坐标与图像读法"],
  feedback: "关键概念基本正确，但推理还不完整。",
  reasoning: "回答给出了定义，但没有说明图像含义。"
});

const fixtures = [
  {
    name: "chat message string",
    payload: { choices: [{ message: { content: gradingJson } }] }
  },
  {
    name: "chat message content object",
    payload: { choices: [{ message: { content: { type: "text", text: gradingJson } } }] }
  },
  {
    name: "gemini candidates parts",
    payload: { candidates: [{ content: { parts: [{ text: gradingJson }] } }] }
  },
  {
    name: "responses output",
    payload: { output: [{ content: [{ type: "output_text", text: gradingJson }] }] }
  },
  {
    name: "anthropic content",
    payload: { content: [{ type: "text", text: gradingJson }] }
  }
];

fixtures.forEach(({ name, payload }) => {
  assert.equal(
    _internals.responseTextFromChatCompletion(payload),
    gradingJson,
    `${name} response text should be extracted`
  );
});

assert.throws(
  () => _internals.requireResponseText({ choices: [{ message: { content: "" } }] }),
  /empty text response/i
);

async function testEmptyResponseGradingFallback() {
  const originalFetch = global.fetch;
  const originalEnv = {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    OPENAI_COMPATIBLE_API_KEY: process.env.OPENAI_COMPATIBLE_API_KEY,
    OPENAI_COMPATIBLE_BASE_URL: process.env.OPENAI_COMPATIBLE_BASE_URL,
    OPENAI_COMPATIBLE_MODEL: process.env.OPENAI_COMPATIBLE_MODEL
  };
  process.env.LLM_PROVIDER = "openai-compatible";
  process.env.OPENAI_COMPATIBLE_API_KEY = "test-key";
  process.env.OPENAI_COMPATIBLE_BASE_URL = "https://example.invalid/v1";
  process.env.OPENAI_COMPATIBLE_MODEL = "test-model";
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: "" } }] })
  });

  try {
    delete require.cache[require.resolve("../lib/agents/grading")];
    const { gradeOne } = require("../lib/agents/grading");
    const result = await gradeOne({
      questionId: "empty-response-q",
      unitId: "unit-1",
      chapterId: "chapter-1",
      questionType: "short_answer",
      questionText: "解释函数的定义。",
      points: 25,
      response: "函数是输入对应输出的规则。"
    });
    assert.equal(result.errorType, "empty_response");
    assert.match(result.feedback, /可用结果/);
    assert.match(result.feedback, /暂记 0 分/);
    assert.equal(result.score, 0);
  } finally {
    global.fetch = originalFetch;
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

testEmptyResponseGradingFallback()
  .then(() => console.log("LLM response text tests passed"))
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
