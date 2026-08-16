"use strict";

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const route = JSON.parse(fs.readFileSync(path.join(rootDir, "data", "multi-scene-learning-route.json"), "utf8"));
const guidance = JSON.parse(fs.readFileSync(path.join(rootDir, "prompts", "assessment-guidance.json"), "utf8"));
const moduleDefinition = route.chapters
  .flatMap((chapter) => chapter.modules || [])
  .find((module) => module.id === "GH-02");

if (!moduleDefinition) throw new Error("GH-02 module definition not found");

const blueprints = guidance.modules?.["GH-02"]?.pairedBlueprint || [];
if (blueprints.length !== 6) throw new Error("GH-02 must define exactly six paired blueprints");

const pairTypes = ["single", "single", "single", "multiple", "single", "text"];
const outputDir = path.join(rootDir, "prompts", "assessments", "GH-02", "pairs");
fs.mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < 6; index += 1) {
  const pairNumber = String(index + 1).padStart(2, "0");
  const pairId = `P${pairNumber}`;
  const type = pairTypes[index];
  const points = type === "text" ? 20 : 8;
  const optionsRule = type === "text"
    ? "不得输出 options；必须输出非空 answer、非空 analysis，以及根层级 rubric。rubric 恰好为 6、6、8 分三项。"
    : `必须输出 4 个 value/label 选项；answer 必须是选项 value 数组。${type === "single" ? "恰好 1 个正确项。" : "正确项为 1 至 3 个。"}`;

  const prompt = `# GH-02 ${pairId} 独立配对生成提示词

\`\`\`text
你只生成一对前后测平行题，不生成整卷，不生成课件。只输出一个合法 JSON object，顶层只能有 pre 和 post 两个键，不要输出 Markdown、代码围栏、解释或自检文字。

本题对规则：
${blueprints[index]}

现有知识点名称和 ID 不得修改：
${moduleDefinition.knowledgePoints.map((point) => `- ${point.id}：${point.name}`).join("\n")}

pre.id 必须为 "GH-02-pre-q${index + 1}"；post.id 必须为 "GH-02-post-q${index + 1}"。两题的 pairId 都必须为 "${pairId}"，type 都必须为 "${type}"，points 都必须为 ${points}。

每个题目对象必须完整包含 id、type、question、answer、analysis、points、knowledgePointIds、cognitiveLevel、estimatedSteps、pairId、equivalence。${optionsRule}

equivalence 必须且只能包含 presentationMode、knownConditionCount、operationCount、symbolComplexity、conclusionClass；pre 与 post 的五项值必须逐项相同。两题还必须保持相同知识点、认知层级、步骤数、正确项数量和评分负荷。

测量等值不等于题干复刻。pre 与 post 严禁仅替换数字、函数名、变量、坐标或选项顺序；删除数字和变量后，两题不得仍是相同或近似题干。两题至少改变提问句式、信息组织顺序、熟悉语境、干扰项误解来源中的两项，同时保持核心推理链不变。

question 不得包含空引号占位符、Markdown 表格、图片依赖或选项清单。选择题的 options 必须是独立字段。若 presentationMode="table"，题目根层级必须包含 two-sided-table evidence，且题干和 evidence.rows 都完整保存左 3、右 3 共 6 组数据。

输出前确认：顶层只有 pre、post；恰好两个题目对象；ID、题型、分值和 pairId 正确；答案与解析一致；两题测量等值但题干表面异构。
\`\`\`
`;

  fs.writeFileSync(path.join(outputDir, `${pairId}-prompt.md`), prompt, "utf8");
}

process.stdout.write(`Generated ${blueprints.length} GH-02 pair prompts.\n`);
