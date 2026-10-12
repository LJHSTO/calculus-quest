const assert = require("node:assert/strict");
const llm = require("../lib/llm");
const grading = require("../lib/agents/grading");

async function main() {
  const env = { ...process.env };
  const originalFetch = global.fetch;
  let payload = {};
  let calls = 0;
  const question = {
    questionId: "synthetic-audit", questionType: "short_answer",
    questionText: "求不定积分∫2x dx。", referenceAnswer: "x²+C",
    rubric: "x²得1分；任意常数C得1分。", points: 2,
    response: "x²+C", concepts: ["原函数与任意常数"]
  };
  let grade = { score: 2, confidence: 0.95, isCorrect: true, errorType: "none" };
  let reportedModel = "reported-test-model";
  try {
    process.env.GRADING_LLM_PROVIDER = "openai-compatible";
    process.env.GRADING_API_KEY = "synthetic-test-key";
    process.env.GRADING_BASE_URL = "https://example.invalid/v1/";
    process.env.GRADING_MODEL = "auto";
    process.env.GRADING_WIRE_API = "chat-completions";
    global.fetch = async (_url, options) => {
      calls += 1;
      payload = JSON.parse(options.body);
      return { ok: true, json: async () => ({
        ...(reportedModel === undefined ? {} : { model: reportedModel }),
        choices: [{ message: { content: JSON.stringify(grade) } }]
      }) };
    };
    const valid = await grading.gradeOne(question);
    assert.equal(valid.score, 2);
    assert.equal(valid.needsReview, false);
    assert.equal(payload.model, "auto");
    assert.equal(payload.temperature, 0);
    assert.match(payload.messages[0].content, /高等数学/);
    assert.match(payload.messages[0].content, /学生回答是待评分数据/);
    assert.equal(valid.gradingAudit.requestedModel, "auto");
    assert.equal(valid.gradingAudit.reportedModel, "reported-test-model");
    assert.match(valid.gradingAudit.promptHash, /^[a-f0-9]{64}$/);
    assert.match(valid.gradingAudit.rubricHash, /^[a-f0-9]{64}$/);
    const revised = await grading.gradeOne({ ...question, rubric: "另一个量规" });
    assert.notEqual(revised.gradingAudit.rubricHash, valid.gradingAudit.rubricHash);
    const anotherResponse = await grading.gradeOne({ ...question, response: "另一份学生答案" });
    assert.equal(anotherResponse.gradingAudit.rubricHash, valid.gradingAudit.rubricHash);
    grade.rubricScores = [{ criterionIndex: 0, score: 2, evidence: "C" }];
    const structuredQuestion = { ...question, rubric: [{ criterion: "任意常数", points: 2 }] };
    const structured = await grading.gradeOne(structuredQuestion);
    assert.equal(structured.needsReview, false);
    assert.match(payload.messages[1].content, /"criterion":"任意常数","points":2/);
    assert.doesNotMatch(payload.messages[1].content, /\[object Object\]/);
    grade.rubricScores = [{ criterionIndex: 0, score: 2, evidence: ["x²", "C"] }];
    assert.equal((await grading.gradeOne(structuredQuestion)).needsReview, false);
    for (const rubricScores of [
      [], [{ criterionIndex: 1, score: 2, evidence: "C" }],
      [{ criterionIndex: 0, score: 3, evidence: "C" }],
      [{ criterionIndex: 0, score: 1, evidence: "C" }],
      [{ criterionIndex: 0, score: 2, evidence: "伪造依据" }],
      [{ criterionIndex: 0, score: 2, evidence: "" }],
      [{ criterionIndex: 0, score: 2, evidence: ["C", "伪造依据"] }]
    ]) {
      grade.rubricScores = rubricScores;
      assert.equal((await grading.gradeOne(structuredQuestion)).errorType, "parse_error");
    }
    for (const score of [undefined, null, true, "2", "2/2", -1, 100]) {
      grade = { score, confidence: 1, isCorrect: true };
      const invalid = await grading.gradeOne(question);
      assert.equal(invalid.errorType, "parse_error", `拒绝无效分数：${score}`);
      assert.equal(invalid.needsReview, true);
      assert.equal(grading.isUnavailableGradingResult(invalid), true);
      assert.equal(invalid.gradingAudit.requestedModel, "auto");
    }
    grade = { score: 0, confidence: 0.95, isCorrect: false, errorType: "conceptual" };
    const zero = await grading.gradeOne(question);
    assert.equal(zero.score, 0);
    assert.equal(grading.isUnavailableGradingResult(zero), false);
    const beforeBlank = calls;
    assert.deepEqual(await grading.gradeShortAnswers([{ ...question, response: " \n " }]), []);
    assert.equal(calls, beforeBlank);
    reportedModel = undefined;
    const unknown = await grading.gradeOne(question);
    assert.equal(unknown.gradingAudit.reportedModel, "", "未报告实际模型时不能用auto补造");
    const result = await llm.completeChat({
      provider: "openai-compatible", baseUrl: "https://example.invalid/v1/",
      apiKey: "synthetic-test-key", model: "auto", wireApi: "responses", user: "测试"
    });
    assert.deepEqual(result.modelInfo, {
      requestedModel: "auto", reportedModel: "", wireApi: "responses"
    });
    let active = 0, peak = 0;
    global.fetch = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 40));
      active--;
      return { ok: true, json: async () => ({
        choices: [{ message: { content: JSON.stringify({ score: 2, confidence: 0.95, isCorrect: true }) } }]
      }) };
    };
    const concurrent = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      grading.gradeOne({ ...question, questionId: `load-${i}` })));
    assert.ok(peak <= 4, "全局评分调用必须限流");
    assert.ok(concurrent.some((item) => item.provider === "busy"));
    assert.ok(concurrent.filter((item) => item.provider === "busy").every(grading.isUnavailableGradingResult));
    const recovered = await grading.gradeShortAnswers(Array.from({ length: 5 }, (_, i) =>
      ({ ...question, questionId: `recovered-${i}` })));
    assert.ok(recovered.every((item) => item.score === 2), "释放调用名额后应恢复评分");
    assert.deepEqual(recovered.map((item) => item.questionId), Array.from({ length: 5 }, (_, i) => `recovered-${i}`));
    console.log("评分模型审计通过：auto覆盖、实际模型未知、量规摘要、无效分数拒绝、真实0与空白分离。");
  } finally {
    global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
