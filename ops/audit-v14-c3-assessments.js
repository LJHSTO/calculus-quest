const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const route = require("../data/multi-scene-learning-route.json");
const outcomes = require("../lib/proactive-outcomes/v14-c3");
const chapter = route.chapters.find((entry) => entry.id === "V14-C3");
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Content review notes, not empirical item difficulty estimates or human sign-off.
const pairNotes = [
  "同为面积极限识别；两题应明确连续、非负与有限区间，后测给出极限值使提示更直接。",
  "正速度/正注水率与累计量平行；情境不同但数学关系一致，尚无实测等值证据。",
  "前测直接提取定理，后测借助面积微元提示；前测误称 f 为原函数，后测未区分有向面积。",
  "均为原函数端点差的直接应用；后测增加位置情境。后测 B 选项解析的除法方向文字写反。",
  "前测概念识别，后测错误诊断；相同知识点不等于相同认知操作。",
  "同为面积极限解释；与各卷第 1 题高度重复，压缩了对其他知识点的测量。",
  "前测全正、后测全负，后测增加符号抵消负担；不能仅据元数据认定等难。",
  "两题均标 multiple 却要求选择唯一组合；前测选正确、后测选错误，后测第④条本身有歧义。",
  "前测常数项选项有争议；后测 B 把 v du 解释为 v 的变化，数学对象颠倒，A 也过于含混。",
  "前测多项式且两人都正确，后测三角函数且一人错误；需统一函数熟悉度、判断模式和分项评分。"
];
const formativeNotes = {
  "GH-06-K01": [
    "矩形宽度为 1，面积和为 10，C 唯一正确；应明确讨论非负函数。",
    "B、C 为错误说法，键一致；补连续非负条件，并避免把每次细分都必然更准确当定理。"
  ],
  "GH-06-K02": [
    "持续注水条件下 A 正确；数学与单位一致。",
    "B 的“位移的定积分”应为“速度的定积分”；D 应明确为净累积，防止混淆路程。"
  ],
  "GH-06-K03": [
    "严重：A 的 F=x²+1 与 B 的全体原函数都正确，但单选键只有 B，会把正确推理判错。",
    "A、B、D 在同一区间条件下成立；应补共同区间，避免非连通定义域的例外。"
  ],
  "GH-07-K01": [
    "连续且全正，F 随上限增加而增加，A 正确。",
    "A 应表述为以 x 为自变量（函数也可常值）；B 应写有向累积，当前面积措辞不支持负值情况。"
  ],
  "GH-07-K02": [
    "B 唯一正确；核心是原函数端点差而非被积函数端点差。",
    "A、B、D 正确；连续条件与常数相消关系一致。"
  ],
  "GH-07-K03": [
    "u=1+x²，du=2x dx，新上下限 1、2，A 正确。",
    "A、C 正确；与核心题共享数值和上下限，诊断用途可以，不能当独立迁移证据。"
  ],
  "GH-07-K04": [
    "A 为合理的方法选择启发式；不是所有分部积分都保证求导更简单。",
    "A、C、D 正确；明显的“只背公式”干扰项可能使题目过易，需预试检查。"
  ]
};
const outcomeNotes = {
  near_transfer: [
    "12-5=7，a 正确，区分净累积与总流量。",
    "应找原函数再作端点差，a 正确；正确选项明显最长，检查线索效应。",
    "x=0、2 对应 u=1、5，c 正确。",
    "a 使用“有机会”而非保证每次更准，表述可接受；补非负或有向积分语境。",
    "u=x、v=sin(x)，边界项减积分，a 正确。"
  ],
  representation_transfer: [
    "f<0 推出 A'<0，b 正确；当前只有文字描述图像，并没有实际图像。",
    "a 是三项中合理答案；题干提到“一幅图”但未提供图，也不足以直接证明差距极限为零。",
    "a 正确；这是符号到符号操作，不能单独代表图像跨表征迁移。",
    "9-4=5，a 正确；没有实际图像，实际测的是文字到符号。",
    "三条曲线导数均为2x，a 正确；题干称“图中”但未提供图。"
  ],
  retention: [
    "∫4x³dx=x⁴+C，a 正确。",
    "F'(2)=2²+1=5，b 正确。",
    "净位移8-2=6，路程8+2=10，a 正确。",
    "原函数端点差为-3，a 正确。",
    "u从1到2，du=2x dx，a 正确。"
  ]
};
const blocking = new Set([
  "V14-C3-pre-q8", "V14-C3-post-q8", "V14-C3-pre-q9", "V14-C3-post-q9",
  "GH-06-K03-check-q1", "GH-06-K02-check-q2", "GH-07-K01-check-q2"
]);
const clean = new Set([
  "V14-C3-pre-q2", "V14-C3-post-q2", "V14-C3-pre-q4",
  "GH-06-K02-check-q1", "GH-07-K01-check-q1", "GH-07-K02-check-q1",
  "GH-07-K02-check-q2", "GH-07-K03-check-q1", "GH-07-K04-check-q1"
]);
const rows = [];
for (const [key, phase] of [["preQuiz", "前测"], ["postQuiz", "后测"]]) {
  for (const [index, question] of chapter.flow[key].questions.entries()) {
    rows.push({ phase, id: question.id, type: question.type, points: question.points,
      pairId: question.pairId, question,
      status: blocking.has(question.id) ? "须修订" : clean.has(question.id) ? "未发现明确答案错误" : "须复核",
      note: pairNotes[index], contentDigest: digest(question) });
  }
}
for (const unit of chapter.modules.flatMap((module) => module.knowledgePoints)) {
  for (const [index, question] of unit.formativeQuiz.questions.entries()) {
    rows.push({ phase: "形成性", id: question.id, type: question.type, points: question.points,
      question, status: blocking.has(question.id) ? "须修订"
        : clean.has(question.id) ? "未发现明确答案错误" : "须复核",
      note: formativeNotes[unit.id][index], contentDigest: digest(question) });
  }
}
const expectedKeys = {
  near_transfer: ["a", "a", "c", "a", "a"],
  representation_transfer: ["b", "a", "a", "a", "a"],
  retention: ["a", "b", "a", "a", "a"]
};
for (const stageId of outcomes.stageIds) {
  const stage = outcomes.publicStage(stageId);
  const responses = Object.fromEntries(stage.items.map((item, index) => [item.id, expectedKeys[stageId][index]]));
  const result = outcomes.grade(stageId, responses);
  if (result.score !== stage.itemCount) throw new Error(`人工复算键与服务端不一致：${stageId}`);
  for (const [index, item] of stage.items.entries()) {
    const question = { ...item, answer: expectedKeys[stageId][index] };
    rows.push({ phase: stage.label, id: item.id, type: "single", points: 1, question,
      status: stageId === "representation_transfer" ? "构念待修订" : "未发现明确答案错误",
      note: outcomeNotes[stageId][index], contentDigest: digest(question) });
  }
}
if (rows.length !== 49 || rows.some((row) => !row.note)) throw new Error("逐题审校覆盖不完整");
const pairs = chapter.flow.preQuiz.questions.map((pre) => {
  const post = chapter.flow.postQuiz.questions.find((item) => item.pairId === pre.pairId);
  return { pairId: pre.pairId, preId: pre.id, postId: post?.id,
    preType: pre.type, postType: post?.type, prePoints: pre.points, postPoints: post?.points,
    preCharacters: pre.question.length, postCharacters: post?.question.length,
    preKnowledge: pre.knowledgePointIds, postKnowledge: post?.knowledgePointIds,
    metadataEqual: JSON.stringify(pre.equivalence) === JSON.stringify(post?.equivalence),
    empiricalEquivalence: "尚无校准数据，不可确认" };
});
const report = {
  date: "2026-09-09", reviewer: "AI内容审校，尚非独立数学教师签核",
  sourceDigest: digest(rows.map(({ question }) => question)),
  releaseReady: false,
  scope: "20道前后测、14道形成性、15道独立结果测量；不包含课件内题目与主动策略验证题",
  blockedReason: "存在判分歧义、数学措辞错误与跨表征构念缺口，且无实测前后测等值证据",
  pairs, rows
};
const reviewedSourceDigest = "f82649602e7d7e5b6868611a49b08928aa666d76b2a4e2b3d9841af138dc16f0";
if (report.sourceDigest !== reviewedSourceDigest) {
  throw new Error("题库已改变：须重新逐题审校并更新审校记录，不能复用旧结论。");
}
if (process.argv.includes("--write")) {
  const dir = path.join(root, "research");
  fs.writeFileSync(path.join(dir, "V14-C3正式测量逐题审校-2026-09-09.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  const lines = [
    "# V14-C3 正式测量逐题审校", "",
    "审校日期：2026-09-09。AI 内容审校，不代替独立数学教师签核或实测等值检验。", "",
    "**放行状态：未通过。** " + report.blockedReason + "。", "",
    report.scope + "。覆盖共49题，逐题内容与SHA-256指纹保存在同名JSON中。", "",
    "## 逐题记录", "",
    "| 阶段 | 题号 | 状态 | 审校结果 |", "| --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.phase} | ${row.id} | ${row.status} | ${row.note} |`),
    "", "## 前后测比较", "",
    "目前各10题、各100分、7单选+2多选+1简答；相同题型、分值和pairId只是蓝图配对，不是难度等值证据。",
    "第5、7、8、9、10对存在认知操作、正负情境、判断方向或函数熟悉度的差异。第1和第6对内容高度重复。",
    "建议先修订数学正确性和单选唯一性，再统一每对题的任务要求与评分量规，另用目标人群预试校准。",
    "", "## 独立测量缺口", "",
    "跨表征5题目前没有实际图像，其中一题仍是符号到符号操作；应补真实图像/图表，并明确转换方向。",
    "15道独立测量中12题答案为a、2题为b、1题为c，应平衡选项位置，不能仅换题号冒充新工具。",
    "所有题目修订必须保留旧版内容，使用新工具版本/实验协议；旧结果不能直接套用新题意。",
    "", "## 后续评估范围", "",
    "还需审查28份互动课件内部的前置题、预测题、挑战题、退出题，以及主动支架的验证题。",
    "本报告未把浏览器通关或机器校验当成上述数学审校，也未宣称测量信效度已建立。", ""
  ];
  fs.writeFileSync(path.join(dir, "V14-C3正式测量逐题审校-2026-09-09.md"), lines.join("\n"), "utf8");
}
console.log(JSON.stringify({ items: rows.length, pairs: pairs.length,
  revisionItems: rows.filter((row) => ["须修订", "构念待修订"].includes(row.status)).length,
  sourceDigest: report.sourceDigest, releaseReady: false }));
