const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const routePath = path.join(rootDir, "data", "multi-scene-learning-route.json");
const guidancePath = path.join(rootDir, "prompts", "assessment-guidance.json");
const outputRoot = path.join(rootDir, "prompts", "assessments");
const assessmentGuidance = fs.existsSync(guidancePath)
  ? JSON.parse(fs.readFileSync(guidancePath, "utf8"))
  : { modules: {}, knowledgePoints: {} };

function readRoute() {
  return JSON.parse(fs.readFileSync(routePath, "utf8"));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${value.trim()}\n`, "utf8");
}

function knowledgePointBlock(knowledgePoints) {
  return knowledgePoints
    .map((point) => [
      `- ID：${point.id}`,
      `  名称：${point.name}`,
      `  学习目标：${point.goal || "以网站中该知识点的现有定义为准。"}`,
      `  常见误解：${point.misconception || "围绕该知识点的典型概念混淆设置干扰项。"}`
    ].join("\n"))
    .join("\n");
}

function prePostPrompt(chapter, module) {
  const moduleGuidance = assessmentGuidance.modules?.[module.id];
  const blueprintGuidance = moduleGuidance?.pairedBlueprint?.length
    ? `【本模块专用六题蓝图】\n\n${moduleGuidance.pairedBlueprint.map((item) => `- ${item}`).join("\n")}\n\n${moduleGuidance.boundary || ""}`
    : "【本模块题目边界】\n\n严格按照上方知识点名称、目标和误解确定题目内容，不得从模块标题自行扩展额外定理或技巧。";
  return `# ${module.id} 前测与后测配对生成提示词

\`\`\`text
请为 OpenMAIC 生成一组严格配对的前测 A 卷和后测 B 卷。这是 assessment-only 任务，只生成测评题目，不生成课件、讲解、实验、游戏、模拟、关系图、3D 可视化或其他学习资源。

只输出一个合法 JSON object，不要输出 Markdown、代码围栏、说明、自检过程或修改痕迹。

【网站原始信息】

章节 ID：${chapter.id}
章节名称：${chapter.title}
学习模块 ID：${module.id}
学习模块名称：${module.title}
先修要求：${module.prerequisite || "以网站现有学习路线为准。"}

本模块现有知识点：
${knowledgePointBlock(module.knowledgePoints)}

以上章节、模块、知识点的 ID 和名称必须逐字保持，不得改名、缩写、翻译、合并、拆分、删除或新增知识点。所有题目只能考查这些知识点，不得混入其他模块、后续内容、未列出的定理、标准极限公式或额外运算技巧。每道题必须标注一个主要 knowledgePointId，不得用笼统的模块主题掩盖越界内容。

${blueprintGuidance}

【输出结构】

顶层键只允许 languageDirective、courseTitle、outlines。outlines 必须且只能包含两个 type="quiz" 的对象：

1. id="${module.id}-pre"；title="前测：${module.title}（A卷）"；order=1。
2. id="${module.id}-post"；title="后测：${module.title}（B卷）"；order=2。

两卷各 6 题，总分均为 60 分，difficulty 均为 medium。题型、顺序和分值结构固定一致：Q1-Q5 为选择题，合计包含 4 道 single 和 1 道 multiple，每题 8 分；Q6 为 text，固定放在最后且为全卷最高分题，分值 20 分。前测和后测的 keyPoints 都必须恰好包含 6 个字符串；每个字符串本身必须是可由 JSON.parse 直接解析的单个题目对象，不得使用 id:q1,type:single 之类的非 JSON 文本。
每个题目对象完整写出 id、type、question、options（text 除外）、answer、analysis、points、knowledgePointIds、cognitiveLevel、estimatedSteps、pairId 和 equivalence。题目 id 必须严格为 ${module.id}-pre-q1 至 ${module.id}-pre-q6、${module.id}-post-q1 至 ${module.id}-post-q6，不得缩写、重复或增加 q6b 等变体；pairId 必须按题位严格使用 P01 至 P06，每卷各出现一次。
所有选择题的 question 只能包含题干，不得在 question 内重复写“选项：A…B…C…D…”或①②③④选项清单；question 字符串结束后必须有 JSON 逗号，再写独立 options 字段。options 必须严格使用 [{"value":"A","label":"选项文字"},...] 结构；answer 必须始终为数组，单选如 ["B"]，多选如 ["A","B","D"]，不得写成 "B" 或 "ABD"，不得在 options 中使用 correct 字段。
equivalence 必须且只能包含 presentationMode、knownConditionCount、operationCount、symbolComplexity 和 conclusionClass，用作 A/B 程序等值检查；配对题这些字段必须逐项相同。若 presentationMode="table"，题目对象根层级还必须提供 evidence={kind:"two-sided-table",targetX,targetY,correctOptionId:"B",rows:[{x,y},...]}，左右各 3 行，并保证数值确实从两侧趋近 targetY；evidence 不得嵌套在 equivalence 中。text 题必须在题目对象根层级提供 rubric 数组，每项包含 criterion 和整数 points；rubric 不得嵌套在 equivalence 中。
OpenMAIC 的测验题干不会渲染 Markdown 表格。数表题的 question 必须使用两行纯文本，例如“x 值：1.9，1.99，2.01，2.1；f(x) 值：3.9，3.99，4.01，4.1”，不得包含竖线 |、表头分隔线 ---、HTML 表格或代码围栏。

不得只写“考查某概念”“判断某性质”“诊断某误解”等题目摘要。若没有完整题干、完整选项、明确答案和解析，该 keyPoint 视为未生成，不得输出。

所有现有知识点必须至少被一个题位覆盖；多出的题位用于覆盖本模块的核心概念或基础应用，不得引入新知识点。

【前后测严格等值】

按照题位逐题配对：pre-q1 对应 post-q1，依此类推。每对题使用相同 pairId，并保持完全一致的知识点、题型、认知层级、预计解题步骤、分值、已知条件数量、信息呈现方式、数学对象类型、函数或表达式结构、符号复杂度、计算量、选项数量、正确项数量和评分规则。

信息呈现方式和先备运算也是等值条件：若 A 题根据数表判断，B 题也必须根据同样行列规模的数表判断；若 A 题不需要因式分解、约分、解方程或调用额外定理，B 题也不得增加这些步骤。不得用“主题相近”代替逐题同构。

A、B 卷只能替换数值、函数表达式、坐标、变量名称、选项顺序或数学结构等价的熟悉情境，不得改变解题路径。不得使用完全相同的题干、数值或选项顺序。

后测不得比前测增加综合性、迁移要求、阅读量、陌生情境、运算步骤、符号复杂度、干扰信息或抽象程度。不能只凭 difficulty 标签判断等值，必须根据题目实际结构配对。

【题型与答案规则】

- single：固定 4 个选项，恰好一个正确答案，points=8。
- multiple：固定 4 个选项，points=8；题干必须明确要求选择所有正确说法或所有错误说法；正确项数量可以为 1、2 或 3，不得让全部选项都正确或全部错误。A/B 配对题的正确项数量必须相同，但不同多选题之间不要求相同。
- text：必须为 Q6 和全卷最后一题，points=20，是全卷分值最高的题；给出参考答案和可独立评分的评分点，每个评分点必须标明确切整数分值且合计恰好为 20，不得使用“6~7 分”等分值区间。A/B 配对题的评分点数量、逐项分值和要求必须一致。
- 正确答案的位置不得形成固定规律；干扰项必须来自对应知识点的真实计算错误、符号误读或概念混淆。

【质量与适龄要求】

参考正式数学教材课后练习题的严谨性、条件完整性和推理结构，但面向高中生控制符号密度、阅读量和计算长度。数据应适合手算，不使用竞赛技巧、偏题或故意绕弯的表达。

前测不得引用尚未学习的课件或实验；后测不得要求回忆学习场景中的特定画面、按钮、操作步骤或实验读数。所有题目必须脱离课件和图片独立作答。

【输出前静默检查】

逐题重新计算并确认：两个 quiz 的 keyPoints 均恰好有 6 个可 JSON.parse 的完整题目对象字符串，不含纯考查目标摘要或重复变体；Q1-Q5 的 points 均为 8，Q6 为 text 且 points=20，Q6 固定最后并为最高分题，两卷 points 求和都严格等于 60；每个 pairId 在 A/B 卷各出现一次；配对题的 equivalence 字段、呈现方式、先备运算、解题步骤与实际难度一致；所有知识点至少覆盖一次；所有 knowledgePointIds 来自上方清单；没有未列出的定理或标准极限；single 只有一个正确答案；multiple 有 1 至 3 个正确项且配对数量一致；答案、选项与解析一致；数表 evidence 的数值趋势与答案一致；没有缺失条件、无关数据、图片依赖、自我纠错文字或新增知识点。
\`\`\`
`;
}

function checkPrompt(chapter, module, point) {
  const pointGuidance = assessmentGuidance.knowledgePoints?.[point.id];
  const boundaryGuidance = pointGuidance
    ? `【本知识点专用边界】\n\n允许内容：${pointGuidance.allowed}\n\n禁止内容：${pointGuidance.forbidden}`
    : "【本知识点专用边界】\n\n只使用知识点名称、目标和常见误解直接支持的数学内容，不得从模块标题扩展额外定理或技巧。";
  return `# ${point.id} 形测生成提示词

\`\`\`text
请为 OpenMAIC 生成一套严格围绕单个知识点的形成性测验。这是 assessment-only 任务，只生成题目，不生成课件、讲解、实验、游戏、模拟、关系图、3D 可视化或其他学习资源。

只输出一个合法 JSON object，不要输出 Markdown、代码围栏、说明、自检过程或修改痕迹。

【网站原始信息】

章节 ID：${chapter.id}
章节名称：${chapter.title}
学习模块 ID：${module.id}
学习模块名称：${module.title}
知识点 ID：${point.id}
知识点名称：${point.name}
知识点目标：${point.goal || "以网站中该知识点的现有定义为准。"}
常见误解：${point.misconception || "围绕该知识点的典型概念混淆设置干扰项。"}

以上名称和 ID 必须逐字保持，不得改名、缩写、翻译、合并、拆分或新增知识点。

${boundaryGuidance}

【学习场景与形测关系】

该知识点可以有任意数量的候选学习场景，场景数量以后可能增减。无论学生选择哪个现有场景学习，本知识点始终只有这一套共用形测；不得按场景数量生成多套题。

题目必须与具体学习资源无关，不得引用任何场景专属的界面、按钮、拖动操作、游戏规则、图像画面、实验步骤或特定读数，也不得使用“刚才的实验”“课件中”“如图”“见上图”等表达。选择不同场景的学生必须能够公平作答。

【固定输出】

顶层键只允许 languageDirective、courseTitle、outlines。outlines 必须且只能包含一个 quiz：

id="${point.id}-check"
type="quiz"
title="即时检查：${point.name}"
order=1
quizConfig={"questionCount":3,"difficulty":"medium","questionTypes":["single","multiple"]}

只生成 3 道选择题，不生成 text 或简答题。每题固定 10 分，总分 30 分：

1. Q1：single，核心概念辨析。
2. Q2：single，一至两步基础应用。
3. Q3：multiple，围绕常见误解的诊断题。

keyPoints 必须恰好包含 3 个字符串，每个字符串本身必须是可由 JSON.parse 直接解析的单个题目对象，不得使用非 JSON 的字段拼接文本。每题完整写出 id、type、question、4 个 options、answer、analysis、points、knowledgePointIds、cognitiveLevel、estimatedSteps、pairId 和 equivalence；id 必须严格为 ${point.id}-check-q1 至 ${point.id}-check-q3。question 只能包含题干，不得内嵌或重复选项清单，question 后必须用 JSON 逗号分隔独立 options 字段。options 必须严格使用 [{"value":"A","label":"选项文字"},...]，answer 必须为数组，单选如 ["B"]、多选如 ["A","C"]，不得使用 correct 字段或 "AC" 字符串。equivalence 必须且只能包含 presentationMode、knownConditionCount、operationCount、symbolComplexity 和 conclusionClass；数表题还必须在题目对象根层级提供可程序复算的 two-sided-table evidence，不得嵌套在 equivalence 中。数表题的 question 必须用“x 值：…；f(x) 值：…”两行纯文本，不得使用 Markdown 表格、竖线 | 或 --- 分隔线。不得只写“考查某概念”“进行基础应用”“诊断某误解”等题目摘要；缺少完整题干、4 个选项、明确答案或解析时不得输出。每题 points 必须等于 10；knowledgePointIds 必须且只能填写 ["${point.id}"]。

【选择题规则】

- single 恰好一个正确答案。
- multiple 的题干必须明确要求选择所有正确说法或所有错误说法；正确项数量可以为 1、2 或 3，不得固定为某一种比例，也不得让全部选项都正确或全部错误。
- 正确答案位置不得形成固定规律。
- 干扰项必须来自上方常见误解或该知识点真实、典型的计算错误和概念混淆，不得使用无意义随机选项。

【内容与质量边界】

只考查“${point.name}”，不得混入同模块其他知识点、后续知识点或额外内容。参考正式数学教材课后练习题的严谨性、条件完整性和推理结构，但面向高中生控制符号密度、阅读量和计算长度。题意必须能够独立理解，数据适合手算，不使用竞赛技巧，每题只测量一个明确目标。

【输出前静默检查】

逐题重新计算并确认：只输出一个 quiz；keyPoints 恰好有 3 个完整题目字符串且不含纯考查目标摘要；恰好 3 道选择题且每题 10 分、总分 30 分；只考查 ${point.id}；没有学习场景、课件或图片依赖；single 恰好一个正确答案；multiple 有 1 至 3 个正确项且题干选择目标明确；答案、选项与解析完全一致；没有新增或改写知识点；输出中没有自我纠错或检查过程。
\`\`\`
`;
}

function buildReadme(chapters, moduleCount, pointCount) {
  const lines = [
    "# 全站测评题生成提示词",
    "",
    "本目录由 `node ops/generate-assessment-prompts.js` 根据 `data/multi-scene-learning-route.json` 生成。课程路线是章节、模块和知识点名称及 ID 的唯一来源。",
    "",
    `当前覆盖 ${chapters.length} 个章节、${moduleCount} 个学习模块、${pointCount} 个知识点。每个模块一份前后测配对提示词，每个知识点一份共用形测提示词。`,
    "",
    "形测按知识点设置，与候选学习场景的数量和具体内容解耦。建议在 OpenMAIC 中一次只提交一个文件，生成后必须进行答案复算和人工审阅。",
    "",
    "## 生成结果校验",
    "",
    "把模型返回的完整 JSON 保存为文件后，前后测运行 `npm run assessment:validate -- result.json --module GH-02`；形成性测验追加 `--knowledge-point GH-02-K01`。只有输出 PASS 的结果才能进入题库。校验器会拦截题数、题型、分值、知识点、重复题、A/B 等值签名、评分量表和结构化数表趋势错误；数学内容仍需人工复核。",
    "",
    "## 目录",
    ""
  ];

  for (const chapter of chapters) {
    lines.push(`### ${chapter.id} ${chapter.title}`, "");
    for (const module of chapter.modules || []) {
      lines.push(`- \`${module.id}\` ${module.title}：1 份前后测提示词，${module.knowledgePoints.length} 份形测提示词`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function main() {
  const route = readRoute();
  const chapters = Array.isArray(route.chapters) ? route.chapters : [];
  const seenModuleIds = new Set();
  const seenPointIds = new Set();
  let moduleCount = 0;
  let pointCount = 0;

  ensureDir(outputRoot);

  for (const chapter of chapters) {
    for (const module of chapter.modules || []) {
      if (!module.id || seenModuleIds.has(module.id)) {
        throw new Error(`Invalid or duplicate module ID: ${module.id || "<empty>"}`);
      }
      if (!Array.isArray(module.knowledgePoints) || module.knowledgePoints.length === 0) {
        throw new Error(`Module has no knowledge points: ${module.id}`);
      }

      seenModuleIds.add(module.id);
      moduleCount += 1;
      const moduleDir = path.join(outputRoot, module.id);
      writeText(path.join(moduleDir, "pre-post-paired-prompt.md"), prePostPrompt(chapter, module));

      for (const point of module.knowledgePoints) {
        if (!point.id || seenPointIds.has(point.id)) {
          throw new Error(`Invalid or duplicate knowledge-point ID: ${point.id || "<empty>"}`);
        }
        seenPointIds.add(point.id);
        pointCount += 1;
        writeText(path.join(moduleDir, "checks", `${point.id}-prompt.md`), checkPrompt(chapter, module, point));
      }
    }
  }

  writeText(path.join(outputRoot, "README.md"), buildReadme(chapters, moduleCount, pointCount));
  process.stdout.write(`Generated ${moduleCount} pre/post prompts and ${pointCount} formative prompts.\n`);
}

main();
