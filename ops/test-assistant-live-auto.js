const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

async function main() {
  assert.ok(process.argv.includes("--live"), "真实调用须显式传入 --live；只使用合成提问。");
  for (const name of [
    "OPENAI_COMPATIBLE_API_KEY", "OPENAI_COMPATIBLE_BASE_URL", "OPENAI_COMPATIBLE_WIRE_API",
    "INNOSPARK_API_KEY", "INNOSPARK_BASE_URL", "OPENAI_WIRE_API"
  ]) process.env[name] = "";
  const llm = require("../lib/llm");
  const assistant = require("../lib/learning-assistant");
  const index = assistant.buildCourseContextIndex(require("../data/multi-scene-learning-route.json"));
  const functionsLimits = process.argv.includes("--functions-limits");
  const cases = functionsLimits ? [
    {
      label: "函数规则与真实参数",
      unitId: "GH-01-K01", sceneType: "simulation",
      contextRef: { kind: "interaction", scope: "interactive", semanticId: "interactive:id:input_x-slider",
        label: "输入值 x", confidence: "medium",
        state: { parameter: "输入值 x", oldValue: "3", newValue: "4", min: "-8", max: "8" } },
      question: "假设规则是y=2x+1，我把输入从3调成4，输出应该增加多少？这是否说明我已经掌握函数？",
      reviewCriteria: ["输出由7变9，增加2", "不把一次滑块操作当作已经掌握函数"]
    },
    {
      label: "极限与单点函数值",
      unitId: "GH-02-K02", sceneType: "simulation",
      contextRef: { kind: "text", scope: "interactive", label: "合成函数情境", excerpt: "x不等于1时f(x)=2x+1，f(1)=9。" },
      question: "x趋近1时极限是9吗？这个函数在1连续吗？",
      reviewCriteria: ["极限为3而非9", "因f(1)=9不等于3而不连续", "不使用有限数表冒充证明"]
    },
    {
      label: "未知画面不臆测",
      unitId: "GH-02-K03", sceneType: "visualization3d",
      contextRef: { kind: "viewport", scope: "interactive", label: "当前画布", confidence: "low", coarse: true },
      question: "我点中的红色线段为什么变短了？",
      reviewCriteria: ["说明无法识别具体线段，不虚构其颜色、位置或变化原因"]
    }
  ] : [
    {
      label: "真实滑块事件形状",
      unitId: "GH-06-K01", sceneType: "simulation",
      contextRef: {
        kind: "interaction", scope: "interactive", semanticId: "interactive:id:partition_count-slider",
        label: "分割数量", confidence: "medium",
        state: { parameter: "分割数量", oldValue: "10", newValue: "51", min: "1", max: "100" }
      },
      question: "我刚把这个参数调大了，为什么不能说现在已经得到精确积分？",
      reviewCriteria: ["识别分割数量从10到51", "有限分割通常仍是近似，不宣称任意函数误差必单调下降", "不声称学生已掌握积分"]
    },
    {
      label: "净位移与路程",
      unitId: "GH-06-K02", sceneType: "simulation",
      contextRef: { kind: "text", scope: "interactive", label: "合成速度情境", excerpt: "先以2米每秒走3秒，再以负2米每秒走3秒。" },
      question: "这时定积分是0，能不能说总路程也是0？请算一下。",
      reviewCriteria: ["净位移0米", "总路程12米", "解释带符号积分和速度绝对值积分的区别"]
    },
    {
      label: "粗粒度画面边界",
      unitId: "GH-07-K03", sceneType: "visualization3d",
      contextRef: { kind: "viewport", scope: "interactive", label: "当前画布", confidence: "low", coarse: true },
      question: "我点中的红色线段为什么变短了？",
      reviewCriteria: ["承认无法确认所点线段及其颜色", "条件式解释或请学生提供参数，不虚构当前图形状态"]
    }
  ];
  const results = [];
  for (const fixture of cases) {
    const resolved = assistant.resolveAssistantContext({ index, chapterId: functionsLimits ? "V14-C1" : "V14-C3", ...fixture });
    const prompt = assistant.buildAssistantPrompt({ resolved, question: fixture.question });
    const record = { ...fixture, requestedModel: "auto", completed: false };
    const started = Date.now();
    try {
      const clarification = assistant.unresolvedVisualReferenceReply({ resolved, question: fixture.question });
      const response = clarification ? { text: clarification } : await llm.completeChat({
        system: prompt.system, user: prompt.user, provider: "openai-compatible",
        configFile: "D:/Desktop/key.txt", model: "auto", maxTokens: 700,
        signal: AbortSignal.timeout(30000)
      });
      record.answer = response.text;
      record.modelInfo = response.modelInfo || null;
      record.modelCalled = !clarification;
      record.completed = Boolean(response.text.trim()) && !response.text.includes("\uFFFD");
    } catch {
      record.error = "接口超时或调用失败；不记录原始错误与凭据。";
    }
    record.elapsedMs = Date.now() - started;
    record.promptHash = crypto.createHash("sha256").update(prompt.system + prompt.user).digest("hex");
    results.push(record);
    console.log(JSON.stringify(record));
  }
  const output = path.resolve("output", functionsLimits ? "函数极限真实助教合成验收" : "真实auto助教合成验收");
  fs.mkdirSync(output, { recursive: true });
  const report = path.join(output, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(report, JSON.stringify({
    syntheticOnly: true, studentDataSent: false, formalDatabaseModified: false,
    limitation: "使用生产上下文解析、提示和模型传输。非全站端到端测试；完成调用不等于教学质量合格，须逐条对照审校标准。",
    results
  }, null, 2), "utf8");
  console.log(`合成验收报告：${report}`);
  assert.ok(results.every((result) => result.completed), "存在未完成的真实调用，不能宣称全部通过。");
}

main().catch((error) => {
  console.error(error instanceof assert.AssertionError ? error.message : "真实助教验收未完成；不输出敏感配置。");
  process.exitCode = 1;
});
