"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  validatePairedAssessment,
  validateFormativeAssessment
} = require("./assessment-output-validator");

const ROOT = path.resolve(__dirname, "..");
const PROMPTS_ROOT = path.join(ROOT, "prompts", "assessments");
const GRAPH_PATH = path.join(ROOT, "data", "knowledge-graph.json");
const DEFAULT_ENV_PATH = path.resolve(ROOT, "..", "OpenMAIC", ".env.local");

const PAIRED_BLUEPRINTS = {
  "GH-03": [
    "GH-03-K01：根据两个点或两个时刻计算平均变化率，并解释为割线斜率；A/B 使用不同信息组织方式。",
    "GH-03-K01：诊断把平均变化率误当成两个函数值平均数等典型错误；不得与 P01 同为直接套公式题。",
    "GH-03-K02：给出同等数量的逐步缩短时间间隔或横坐标间隔及对应平均变化率，判断瞬时变化率的趋近值；不得要求符号求导。",
    "GH-03-K02：解释某点切线斜率在几何或运动情境中的含义；不得依赖图片，不得与 P03 只换数字。",
    "GH-03-K03：多选辨析 f'(a) 的符号、单位、局部变化方向和切线斜率含义；不得求单调区间、极值或使用求导法则。",
    "GH-03-K03：简答题，依据已直接给出的 f'(a) 数值，完整解释符号、大小、单位和局部变化意义；不得计算导函数，不得判断完整单调区间或极值。"
  ]
};

function readEnvValue(text, name) {
  const match = text.match(new RegExp(`(?:^|\\n|\\r|\\s)${name}=([^\\r\\n]+)`));
  return match?.[1]?.trim();
}

function extractJson(text) {
  const source = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(source); } catch {}
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(source.slice(start, end + 1));
  throw new Error("模型响应中没有合法 JSON object");
}

function buildModules(graph) {
  const units = graph.nodes.filter((node) => node.kind === "unit" && node.type === "knowledge" && node.moduleId);
  const grouped = new Map();
  for (const unit of units) {
    if (!grouped.has(unit.moduleId)) grouped.set(unit.moduleId, {
      id: unit.moduleId,
      title: unit.moduleTitle,
      knowledgePoints: []
    });
    grouped.get(unit.moduleId).knowledgePoints.push({ id: unit.id, name: unit.title });
  }
  return [...grouped.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function requestJson({ endpoint, apiKey, model, prompt, signal }) {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      messages: [{ role: "user", content: prompt }]
    }),
    signal
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
  const envelope = JSON.parse(body);
  return extractJson(envelope.choices?.[0]?.message?.content);
}

async function generateOne(task, config) {
  const outputDir = path.join(PROMPTS_ROOT, task.module.id, "outputs");
  const outputPath = path.join(outputDir, task.outputName);
  if (!config.force) {
    try {
      const existing = JSON.parse(await fs.readFile(outputPath, "utf8"));
      const result = task.validate(existing);
      if (result.valid) return { task, status: "cached", outputPath };
    } catch {}
  }
  const sourcePrompt = await fs.readFile(task.promptPath, "utf8");
  const prompt = `${sourcePrompt}\n\n【批处理输出覆盖规则】为避免双重转义，outlines[].keyPoints 数组中的每一道题直接写成 JSON object，不要把题目对象序列化为字符串。本规则仅覆盖上文关于 keyPoints 元素必须是字符串的要求，其余 ID、题型、分值、顺序、等值性和内容边界全部保持不变。`;
  let lastError;
  for (let attempt = 1; attempt <= config.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const payload = await requestJson({ ...config, prompt, signal: controller.signal });
      const result = task.validate(payload);
      if (!result.valid) {
        const summary = result.errors.slice(0, 12).map((error) => `${error.code}@${error.path}`).join(", ");
        throw new Error(`质量校验失败: ${summary}`);
      }
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      return { task, status: "generated", outputPath };
    } catch (error) {
      lastError = error;
      if (attempt < config.retries) await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${task.label}: ${lastError?.message || lastError}`);
}

async function generatePairedInPieces(task, config) {
  const outputDir = path.join(PROMPTS_ROOT, task.module.id, "outputs");
  const outputPath = path.join(outputDir, task.outputName);
  if (!config.force) {
    try {
      const existing = JSON.parse(await fs.readFile(outputPath, "utf8"));
      if (task.validate(existing).valid) return { task, status: "cached", outputPath };
    } catch {}
  }
  const sourcePrompt = await fs.readFile(task.promptPath, "utf8");
  const points = task.module.knowledgePoints;
  const pairs = [];
  const pairCacheDir = path.join(outputDir, "pairs");
  for (let index = 0; index < 6; index += 1) {
    const pairId = `P${String(index + 1).padStart(2, "0")}`;
    const kpIndex = Math.min(Math.floor(index * points.length / 6), points.length - 1);
    const kpId = points[kpIndex].id;
    const type = index === 5 ? "text" : index === 4 ? "multiple" : "single";
    const pointsValue = index === 5 ? 20 : 8;
    const blueprint = PAIRED_BLUEPRINTS[task.module.id]?.[index] || `${kpId}：严格依据该知识点名称、学习目标和常见误解命题，不得扩展到其他知识点。`;
    const prompt = `${sourcePrompt}\n\n【本次分片生成规则】只生成 ${pairId} 这一对题，不要输出 outlines。专用蓝图：${blueprint} 两题只考查 ${kpId}，题型均为 ${type}，分值均为 ${pointsValue}。只输出 {"pre":题目对象,"post":题目对象}。pre.id 必须为 ${task.module.id}-pre-q${index + 1}，post.id 必须为 ${task.module.id}-post-q${index + 1}，两题 pairId 都为 ${pairId}。keyPoints 字符串规则不适用于本次分片。equivalence 只能含 presentationMode、knownConditionCount、operationCount、symbolComplexity、conclusionClass 五个字段且两题逐项完全相同。除非题干和根层 evidence 都提供完整六行双侧数表，否则 presentationMode 不得写 table。A/B 题必须测量等值但表面异构，禁止只换数值、变量或选项顺序；不得依赖图片、课件或学习场景。`;
    let generated;
    const pairCachePath = path.join(pairCacheDir, `${pairId}.json`);
    if (!config.force) {
      try {
        const cached = JSON.parse(await fs.readFile(pairCachePath, "utf8"));
        if (cached?.pre?.id === `${task.module.id}-pre-q${index + 1}` && cached?.post?.id === `${task.module.id}-post-q${index + 1}`) generated = cached;
      } catch {}
    }
    let lastError;
    for (let attempt = 1; !generated && attempt <= config.retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        generated = await requestJson({ ...config, prompt, signal: controller.signal });
        if (!generated?.pre || !generated?.post) throw new Error("分片缺少 pre 或 post 题目对象");
        await fs.mkdir(pairCacheDir, { recursive: true });
        await fs.writeFile(pairCachePath, `${JSON.stringify(generated, null, 2)}\n`, "utf8");
        break;
      } catch (error) {
        lastError = error;
        if (attempt < config.retries) await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
      } finally { clearTimeout(timer); }
    }
    if (!generated) throw new Error(`${task.label} ${pairId}: ${lastError?.message || lastError}`);
    pairs.push(generated);
    console.log(`  ${task.module.id} ${pairId} complete`);
  }
  const makeOutline = (phase, order) => ({
    id: `${task.module.id}-${phase}`,
    type: "quiz",
    title: `${phase === "pre" ? "前测" : "后测"}：${task.module.title}（${phase === "pre" ? "A" : "B"}卷）`,
    order,
    difficulty: "medium",
    quizConfig: { questionCount: 6, difficulty: "medium", questionTypes: ["single", "multiple", "text"] },
    keyPoints: pairs.map((pair) => JSON.stringify(pair[phase]))
  });
  const payload = {
    languageDirective: "所有学生可见文本必须使用简体中文。",
    courseTitle: `${task.module.title}测评`,
    outlines: [makeOutline("pre", 1), makeOutline("post", 2)]
  };
  const result = task.validate(payload);
  if (!result.valid) {
    const summary = result.errors.slice(0, 20).map((error) => `${error.code}@${error.path}`).join(", ");
    throw new Error(`${task.label}: 组装后质量校验失败: ${summary}`);
  }
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { task, status: "generated", outputPath };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const envPathArg = process.argv.find((arg) => arg.startsWith("--env="));
  const modelArg = process.argv.find((arg) => arg.startsWith("--model="));
  const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
  const envText = await fs.readFile(envPathArg ? envPathArg.slice(6) : DEFAULT_ENV_PATH, "utf8");
  const apiKey = readEnvValue(envText, "OPENROUTER_API_KEY");
  const endpoint = readEnvValue(envText, "OPENROUTER_BASE_URL") || "https://api.hcnsec.cn/v1";
  const configuredModels = readEnvValue(envText, "OPENROUTER_MODELS")?.split(",").map((item) => item.trim()).filter(Boolean) || [];
  const model = modelArg?.slice(8) || readEnvValue(envText, "DEFAULT_MODEL") || configuredModels[0] || "auto";
  if (!apiKey) throw new Error(`没有在 ${DEFAULT_ENV_PATH} 找到 OPENROUTER_API_KEY`);

  const graph = JSON.parse(await fs.readFile(GRAPH_PATH, "utf8"));
  const modules = buildModules(graph).filter((module) => module.id !== "GH-02");
  const only = onlyArg?.slice(7).split(",").filter(Boolean);
  const selected = only ? modules.filter((module) => only.includes(module.id)) : modules;
  const tasks = [];
  for (const module of selected) {
    tasks.push({
      kind: "paired",
      module,
      label: `${module.id} 前后测`,
      promptPath: path.join(PROMPTS_ROOT, module.id, "pre-post-paired-prompt.md"),
      outputName: `${module.id}-pre-post.json`,
      validate: (payload) => validatePairedAssessment(payload, module)
    });
    for (const point of module.knowledgePoints) tasks.push({
      module,
      label: `${point.id} 形测`,
      promptPath: path.join(PROMPTS_ROOT, module.id, "checks", `${point.id}-prompt.md`),
      outputName: `${point.id}-check.json`,
      validate: (payload) => validateFormativeAssessment(payload, module, point.id)
    });
  }

  const config = { apiKey, endpoint, model, force: args.has("--force"), retries: 3, timeoutMs: 120_000 };
  console.log(`准备生成 ${tasks.length} 份测评，模型 ${model}，服务 ${new URL(endpoint).host}`);
  const failures = [];
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    try {
      const result = task.kind === "paired"
        ? await generatePairedInPieces(task, config)
        : await generateOne(task, config);
      console.log(`[${index + 1}/${tasks.length}] ${result.status}: ${task.label}`);
    } catch (error) {
      failures.push(error.message);
      console.error(`[${index + 1}/${tasks.length}] failed: ${error.message}`);
    }
  }
  if (failures.length) {
    console.error(`\n${failures.length} 份生成失败：\n${failures.join("\n")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
