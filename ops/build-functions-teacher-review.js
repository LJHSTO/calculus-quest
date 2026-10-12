"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright-core");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const course = JSON.parse(read("data/multi-scene-learning-route.json"));
const chapter = course.chapters.find((item) => item.id === "V14-C1");
const points = chapter.modules.flatMap((module) => module.knowledgePoints);
const adapter = require("../lib/proactive-policy/adapters/functions-limits");
const instrument = require("../lib/proactive-outcomes/functions-limits");
const prereq = JSON.parse(read("research/审核数据/函数与极限L0前置知识草案.json"));
const supportFields = ["selfExplanationPrompt", "conceptHint", "subgoalPrompt", "nextStepPrompt", "partialExamplePrompt"];
const supportNames = ["自我解释", "概念线索", "子目标拆分", "下一步提示", "部分示例"];
const reviewPath = "research/函数与极限教师人工审核材料.md";
const scaffoldPath = "research/函数与极限L0至L5完整支架设计.md";
const esc = (text) => String(text ?? "").replaceAll("|", "\\|").replace(/\r?\n/g, " ");
const reviewLine = "审核：通过 / 修改后复审 / 停用；意见：________________；审核人及日期：________________";

function prerequisiteQuestion(q, knowledgePointId, role) {
  return { id: q.id, type: "single", question: q.question,
    options: [...q.options.map((label, i) => ({ value: String.fromCharCode(65 + i), label })),
      { value: "__unknown__", label: "我不会" }],
    answer: [q.answer], analysis: q.analysis, points: 1,
    knowledgePointIds: [knowledgePointId], role, instrumentVersion: prereq.version };
}

function probe(point, level) {
  const item = adapter.publicVerificationCheck(point.id, level);
  const answer = item.options.filter((option) => adapter.gradeVerificationCheck({
    knowledgePointId: point.id, supportLevel: level, checkId: item.id, response: option.value
  })?.correct).map((option) => option.value);
  assert.equal(answer.length, 1);
  return { ...item, question: item.prompt, type: "single", answer, points: 1,
    knowledgePointIds: [point.id],
    analysis: "现有检查接口未单列解析。教师须核验答案并补充理由，以及与该级支架的对应关系。"
  };
}

function questionText(q, includeAnswers = true) {
  const lines = [`#### ${q.id}`, "", q.question || q.prompt, "",
    `类型：${({ single: "单选", multiple: "多选", short_answer: "简答" })[q.type] || q.type}；分值：${q.points ?? q.maxScore ?? 1}；知识点：${(q.knowledgePointIds || [q.knowledgePointId]).join("、")}。`, ""];
  for (const option of q.options || []) lines.push(`- ${option.value === "__unknown__" ? "不会" : option.value}：${option.label}`);
  if (includeAnswers) {
    lines.push("", `参考答案：${q.referenceAnswer || (q.answer || []).join("、") || "见解析"}。`, "",
      `解析：${q.analysis || "未单列，需教师补充。"}`, "");
    if (q.commentPrompt) lines.push(`评分说明：${q.commentPrompt}`, "");
    if (q.rubric?.length) {
      lines.push("| 评分标准 | 分值 |", "| --- | --- |");
      for (const row of q.rubric) lines.push(`| ${esc(row.criterion)} | ${row.points} |`);
      lines.push("");
    }
    lines.push(reviewLine, "");
  }
  return lines.join("\n");
}

function updateBlock(file, key, content) {
  const text = read(file);
  const begin = `<!-- GENERATED_${key}_START -->`;
  const end = `<!-- GENERATED_${key}_END -->`;
  const first = text.indexOf(begin);
  const last = text.indexOf(end);
  assert.ok(first >= 0 && last > first, `Missing block: ${file}`);
  fs.writeFileSync(path.join(root, file),
    text.slice(0, first + begin.length) + "\n\n" + content + "\n" + text.slice(last), "utf8");
}

async function main() {
  assert.equal(points.length, 6);
  assert.equal(prereq.knowledgePoints.length, 6);
  const pre = chapter.flow.preQuiz.questions;
  const post = chapter.flow.postQuiz.questions;
  const formative = points.flatMap((p) => p.formativeQuiz.questions);
  const probes = points.flatMap((p) => supportFields.map((_, i) => probe(p, `L${i + 1}`)));
  const retention = instrument.publicStage("retention").items.map((q) => {
    const choice = {};
    for (const item of instrument.publicStage("retention").items) choice[item.id] = item.options[0].value;
    const answer = q.options.filter((o) => {
      const result = instrument.grade("retention", { ...choice, [q.id]: o.value });
      return result.results.find((r) => r.itemId === q.id).correct;
    }).map((o) => o.value);
    assert.equal(answer.length, 1);
    const source = require("../lib/assessments/functions-limits-retention-r2").items.find((i) => i.id === q.id);
    return { ...q, type: "single", answer, points: 1, analysis: source.row[3], knowledgePointIds: [q.knowledgePointId] };
  });
  const l0 = prereq.knowledgePoints.flatMap((p) => p.prerequisites.flatMap((s) => [
    prerequisiteQuestion(s.diagnostic, p.id, "前置诊断"),
    prerequisiteQuestion(s.verification, p.id, "前置复核")
  ]));
  assert.deepEqual([pre.length, post.length, formative.length, probes.length, retention.length, l0.length], [12, 12, 12, 30, 18, 24]);
  for (const questions of [pre, post]) assert.equal(questions.reduce((n, q) => n + q.points, 0), 100);
  const all = [...pre, ...post, ...formative, ...probes, ...retention, ...l0];
  assert.equal(new Set(all.map((q) => q.id)).size, 108);
  for (const q of all) {
    if (q.type === "short_answer") assert.equal(q.rubric.reduce((n, r) => n + r.points, 0), q.points);
    else for (const value of q.answer) assert.ok(q.options.some((o) => o.value === value), q.id);
  }
  const existingPrompts = new Set([...pre, ...post, ...formative, ...probes, ...retention].map(q => q.question));
  for (const q of l0) assert.ok(!existingPrompts.has(q.question), "L0 duplicates an existing item");

  const scaffold = [];
  for (const [index, p] of points.entries()) {
    const base = prereq.knowledgePoints.find((item) => item.id === p.id);
    const profile = adapter.knowledgePoint(p.id);
    scaffold.push(`### 6.${index + 1} ${p.name}`, "", `学习目标：${profile.selfExplanationPrompt}`, "",
      "#### L0：前置知识补偿", "", `邀请语：${base.invitation}`, "");
    for (const skill of base.prerequisites) {
      scaffold.push(`**${skill.id} ${skill.name}**`, "", `用途：${skill.why}`, "",
        `诊断题：${skill.diagnostic.question}`,
        skill.diagnostic.options.map((s, i) => `${String.fromCharCode(65 + i)}. ${s}`).join("；") + "；我不会。", "",
        `补偿原文：${skill.support}`, "",
        `复核题：${skill.verification.question}`,
        skill.verification.options.map((s, i) => `${String.fromCharCode(65 + i)}. ${s}`).join("；") + "；我不会。", "");
    }
    for (const [i, field] of supportFields.entries()) {
      const q = probe(p, `L${i + 1}`);
      scaffold.push(`#### L${i + 1}：${supportNames[i]}`, "", profile[field], "",
        `独立检查：${q.question}`, q.options.map(o => `${o.value === "__unknown__" ? "不会" : o.value}. ${o.label}`).join("；"), "");
    }
    scaffold.push("完成规则：前置复核通过仅返回目标任务；目标检查通过则退出支架。拒绝或未完成不升级；达到本轮上限仍未通过则停止追加。", "");
  }
  updateBlock(scaffoldPath, "SCAFFOLD", scaffold.join("\n"));

  const out = [
    "| 类别 | 数量 | 审核内容 |", "| --- | --- | --- |",
    "| 现有前测 | 12题 | 题面、选项、答案、解析、简答量规 |",
    "| 现有后测 | 12题 | 同上，另核对与前测可比性 |",
    "| 现有形成性检测 | 12题 | 核心/诊断作用及触发依据 |",
    "| 现有支架后检查 | 30题 | 每知识点L1至L5各1题 |",
    "| 现有保持测 | 18题 | 每知识点3题、独立保持而非迁移 |",
    "| 新增L0题 | 24题 | 12个技能各1道诊断、1道复核 |",
    "| L0补偿材料 | 12段及6条邀请语 | 数学准确性、必要性、长度及语气 |",
    "| L1至L5提示 | 30条 | 原文及与检查的匹配 |",
    "| 讲解 | 6个 | 当前课件文本及导出授课稿 |",
    "| 互动 | 24个 | 原件入口、静态文案、配置及任务证据 |",
    "| 问卷 | 参与、体验、回访及L0补充题 | 原文、选项、分支与计分 |", "",
    "主审核题目共108道，其中84道来自当前题库、24道为新增L0草案。课程数据另保留3道章中汇总副本，单列附录，不重复作为独立研究测验计数。", "",
    "### 统一计分", "",
    "现有前后测客观题共80分、简答共20分。单选正确得该题满分；多选须答案集合完全匹配，漏选、多选或错选均0分。保持及拟定L0题每题1分。现有近端检查接口返回正确/错误，本材料用1/0便于审核，不将其合入正式测验总分。明确不会记0；未提交、拒绝和评分失败不自动记0。", "",
    "## 五、前测完整题目", "", ...pre.map(q => questionText(q)),
    "## 六、后测完整题目", "", ...post.map(q => questionText(q)),
    "## 七、形成性检测完整题目", ""
  ];
  for (const p of points) {
    out.push(`### ${p.id} ${p.name}`, "");
    for (const q of p.formativeQuiz.questions) {
      out.push(`作用：${q.adaptiveRole === "core" ? "核心检测" : "诊断检测"}。`, "", questionText(q));
    }
  }
  out.push("## 八、L0至L5全部支架与检查", "");
  for (const p of points) {
    const base = prereq.knowledgePoints.find((item) => item.id === p.id);
    const profile = adapter.knowledgePoint(p.id);
    out.push(`### ${p.id} ${p.name}`, "", `现有目标：${p.goal}`, "",
      `现有误区字段原文：${p.misconception}`, "",
      "注意：若误区字段实际写成正确解释，应由教师补出可观察的错误表现，不能把这段说明直接当作学生已出现的错误。", "",
      `L0邀请语：${base.invitation}`, "");
    for (const s of base.prerequisites) {
      out.push(`#### ${s.id} ${s.name}`, "", `前置关联：${s.why}`, "",
        questionText(prerequisiteQuestion(s.diagnostic, p.id, "前置诊断")),
        `补偿原文：${s.support}`, "", reviewLine, "",
        questionText(prerequisiteQuestion(s.verification, p.id, "前置复核")));
    }
    for (const [i, f] of supportFields.entries()) out.push(`#### L${i + 1} ${supportNames[i]}`, "",
      `支架原文：${profile[f]}`, "", reviewLine, "", questionText(probe(p, `L${i + 1}`)));
  }
  out.push("## 九、保持测完整题目", "", ...retention.map(q => questionText(q)),
    "## 十、讲解与互动完整审核目录", "",
    "以下原文是审核材料，不表示认可其中全部说法。讲解列出当前幻灯片文本及对应导出授课文本；互动列出全部24个原件入口、静态文本与内嵌JSON配置。动态关卡、画布变化和实际反馈仍须打开原件操作核对，静态配置不能证明执行逻辑与之完全一致。", "");
  const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"]
    .find(p => fs.existsSync(p));
  assert.ok(executablePath);
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext();
  await context.route("**/*", route => route.abort());
  const page = await context.newPage();
  const parse = (html) => page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, "text/html");
    const configs = [...doc.querySelectorAll('script[type="application/json"]')].map(n => ({ id: n.id, value: JSON.parse(n.textContent) }));
    doc.querySelectorAll("script, style, noscript").forEach(n => n.remove());
    const lines = doc.body.textContent.split(/\r?\n/).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    return { lines, configs };
  }, html);
  const courseware = [];
  try {
    for (const p of points) {
      out.push(`### ${p.id} ${p.name}`, "", "#### 当前讲解文字", "");
      for (const element of p.slide.canvas.elements) if (element.content) {
        const parsed = await parse(element.content);
        for (const text of parsed.lines) out.push(`> ${text}`, "");
      }
      out.push("#### 对应导出授课文本", "");
      const folder = p.resourceCandidates[0].root;
      const original = JSON.parse(read(`resources/${folder}/index.json`));
      const scene = original.scenes.find(s => s.order === p.slide.sceneOrder && s.title === p.slide.title);
      assert.ok(scene, `${p.id}: missing original lecture`);
      for (const action of scene.actions || []) if (action.text) out.push(`> ${action.text}`, "");
      out.push(reviewLine, "");
      for (const resource of p.resourceCandidates) {
        const relative = `resources/${resource.root}/${resource.file}`;
        const parsed = await parse(read(relative));
        courseware.push({ knowledgePointId: p.id, title: resource.title, file: relative, ...parsed });
        out.push(`#### ${resource.title}`, "", resource.description || "", "",
          `[打开互动原件](<${path.join(root, relative).replaceAll("\\", "/")}>)`, "",
          "静态显示原文：", "", ...parsed.lines.map(s => `> ${s}\n`),
          "内嵌任务、关卡与规则配置：", "");
        for (const config of parsed.configs) out.push(`配置标识：${config.id || "未命名"}。`, "",
          "```json", JSON.stringify(config.value, null, 2), "```", "");
        if (!parsed.configs.length) out.push("原件没有内嵌JSON配置，须结合互动原件的实际任务、参数和反馈审核。", "");
        out.push("核对：公式与数值；输入范围；图像含义；关卡解法；错误反馈；游戏得分是否被误称概念掌握。", "", reviewLine, "");
      }
    }
  } finally { await browser.close(); }
  assert.equal(courseware.length, 24);
  out.push("### 章中汇总副本", "", "以下3题保留在课程数据的章中汇总字段中，不计入前述84道现行主审核题。须核对其是否仍有学生入口，避免旧副本与知识点检测不一致。", "",
    ...chapter.flow.formativeQuiz.questions.map(q => questionText(q)),
    "### 教材阅读映射", "",
    "| 知识点 | 教材与位置 | 审核重点 |", "| --- | --- | --- |",
    "| 输入输出与规则 | 科学出版社《高等数学》，PDF第7页，正文第1至2页 | 定义域、函数唯一性、常值函数 |",
    "| 坐标与图像 | 同上，PDF第8页，正文第2页 | 表示法与图像含义 |",
    "| 变化方向 | 同上，PDF第10页，正文第4页 | 单调性条件与前置难度 |",
    "| 数表趋近 | 同上，PDF第21页，正文第15页 | 趋近直觉与严格条件 |",
    "| 左右极限 | 同上，PDF第22页，正文第16页 | 单侧与双侧关系 |",
    "| 连续 | 高等教育出版社《数学分析原理》第一卷第9版，第四章§1第60目 | 与零基础学生的难度适配 |", "",
    "教材映射来自现有平台配置；本稿不复制外部教材全文或声称已完成教材审校。教师需打开出版社原件核对可访问性、页码、内容和适用性。", "",
    "`https://www.ecsponline.com/yz/B80FF7491E2F84AB089693F76C9A2953E000.pdf`", "",
    "`https://academic.hep.com.cn/flsc/CN/chapter/978-7-04-034526-1/chapter04`", "",
    "## 十一、全部被试问卷与计分", "");
  const survey = read("research/函数与极限被试说明与完整问卷-规范修订版.md");
  out.push(survey.replace(/^# /gm, "### ").replace(/^## /gm, "### "), "");
  updateBlock(reviewPath, "REVIEW", out.join("\n"));
  fs.writeFileSync(path.join(root, "research/审核数据/教师审核题目快照.json"), JSON.stringify({
    chapterId: chapter.id, prerequisiteVersion: prereq.version,
    counts: { existingQuestions: 84, proposedPrerequisiteQuestions: 24, total: 108, supplementalCopies: 3, courseware: 24 },
    questions: all, supplementalCopies: chapter.flow.formativeQuiz.questions
  }, null, 2) + "\n", "utf8");
  console.log("已生成：完整支架、108道题及3道副本、6个讲解、24个互动、完整问卷与教师审核稿。");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
