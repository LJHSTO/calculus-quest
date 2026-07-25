#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const routePath = path.resolve(
  root,
  process.argv.find((arg) => arg.startsWith("--route="))?.slice("--route=".length) ||
    "data/multi-scene-learning-route.json"
);
const shouldWrite = process.argv.includes("--write");
const phases = ["preQuiz", "formativeQuiz", "postQuiz"];
const phaseSlug = { preQuiz: "pre", formativeQuiz: "formative", postQuiz: "post" };

const keywordGroups = {
  "GH-01": [
    ["输入", "输出", "函数规则", "映射", "对应关系", "输入输出机器"],
    ["坐标", "横轴", "纵轴", "原点", "落点", "坐标系"],
    ["上升", "下降", "变化方向", "趋势", "递增", "递减", "越来越快", "越来越慢"]
  ],
  "GH-02": [
    ["数表", "数值", "趋近", "靠近", "无限接近"],
    ["左极限", "右极限", "左右极限", "左侧", "右侧", "两侧", "极限值"],
    ["连续", "间断", "跳跃", "断点", "不跳断", "函数值"]
  ],
  "GH-03": [
    ["平均变化率", "割线", "平均速度", "总路程", "两点之间", "Δx", "Δy"],
    ["瞬时变化率", "切线", "瞬时速度", "某一时刻", "某一点"],
    ["导数符号", "导数的意义", "正导数", "负导数", "f'(x)", "斜率"]
  ],
  "GH-04": [
    ["幂函数", "x²", "x^", "次数", "多次求导", "三阶导数", "四次函数"],
    ["和差", "乘积法则", "商法则", "积商", "交叉项", "f·g", "f*g"],
    ["链式法则", "复合函数", "内层函数", "外层函数", "嵌套", "变化率传递", "dL/d"],
    ["指数函数", "对数函数", "三角函数", "sin", "cos", "e^", "变化速度", "赛车"]
  ],
  "GH-05": [
    ["导函数图像", "导数图像", "f'", "单调", "递增", "递减", "符号变化"],
    ["临界点", "极值", "极大值", "极小值", "峰顶", "谷底"],
    ["二阶导数", "凹凸", "拐点", "曲率", "f''"],
    ["最值建模", "实际问题", "最大利润", "最大化利润", "最佳产量", "实际限制", "最小成本", "最大面积", "最优尺寸"]
  ],
  "GH-06": [
    ["小矩形", "矩形逼近", "分割", "黎曼", "宽度", "面积近似"],
    ["定积分", "累积", "总量", "积分值", "区间面积", "有向面积"],
    ["原函数", "不定积分", "反导数", "+C", "积分常数"]
  ],
  "GH-07": [
    ["变上限", "上限函数", "累积函数", "F(x)"],
    ["牛顿-莱布尼茨", "牛顿莱布尼茨", "微积分基本定理", "上下限代入"],
    ["换元", "代换", "变量替换", "u=", "凑微分"],
    ["分部积分", "积分乘积", "uv", "反复分部"]
  ],
  "GH-08": [
    ["多输入", "二元函数", "多个变量", "两个变量", "身高和年龄", "f(x, y)"],
    ["曲面", "等高线", "水平面", "切片", "山峰", "轮廓线"],
    ["偏导数", "偏导", "锁定", "固定其他", "对x求导", "对y求导", "f_x", "f_xy"]
  ],
  "GH-09": [
    ["梯度向量", "梯度", "∇f", "最快上升", "梯度分量"],
    ["方向导数", "单位方向", "任意方向", "方向向量", "夹角", "点积"],
    ["等高线垂直", "梯度与等高线", "等高线", "法向", "正交", "垂直于等高线"]
  ],
  "GH-10": [
    ["多元链式法则", "链式法则", "依赖关系", "依赖链", "复合路径", "t→"],
    ["向量值函数", "向量函数", "输出向量", "输出分量", "多输出", "二维向量", "三维向量", "R² → R³"],
    ["Jacobian", "雅可比", "偏导表格", "导数矩阵", "几行几列", "行列规则", "矩阵尺寸"],
    ["局部线性", "线性变形", "拉伸", "旋转", "局部映射", "线性近似", "行列式", "坍缩", "局部放大镜", "非线性函数"]
  ],
  "GH-11": [
    ["一阶 Taylor", "一阶Taylor", "一阶泰勒", "切线近似", "线性近似"],
    ["二阶 Taylor", "二阶Taylor", "二阶泰勒", "二次近似", "抛物线近似", "余项"],
    ["Hessian", "海森", "二阶偏导矩阵", "特征值"],
    ["驻点", "极大点", "极小点", "鞍点", "正定", "负定", "不定矩阵"]
  ],
  "GH-12": [
    ["目标函数", "目标地形", "损失地形", "山谷", "等高图"],
    ["负梯度", "下降方向", "最陡下降", "-∇", "梯度反方向"],
    ["步长", "学习率", "收敛速度", "步子", "震荡", "过大", "过小"],
    ["迭代路径", "迭代信号", "停止信号", "停止条件", "终止", "更新式", "迭代次数"]
  ],
  "GH-13": [
    ["可行区域", "可行域", "约束条件", "约束边界", "预算", "满足约束"],
    ["拉格朗日", "乘子", "λ", "梯度平行", "边际价值", "敏感度"],
    ["凸函数", "凸集合", "非凸", "碗", "连线", "全局最优"],
    ["线性规划", "二次规划", "LP", "QP", "线性约束", "规划问题"]
  ],
  "GH-14": [
    ["损失函数", "模型参数", "训练目标", "误差函数", "参数θ"],
    ["最小二乘", "均方误差", "线性回归", "平方损失", "残差"],
    ["计算图", "自动微分", "反向传播", "梯度反传", "节点", "数学记账"],
    ["小批量", "mini-batch", "minibatch", "随机梯度", "SGD", "batch size"],
    ["完整学习路线", "学习路线回看", "训练闭环", "完整流程", "综合回看", "训练过程中的震荡", "探索与利用", "泛化能力", "综合"]
  ],
  "EXT-01": [
    ["微分方程", "导数方程", "未知函数", "变化率方程"],
    ["可分离变量", "变量分离", "一阶线性方程", "积分因子"],
    ["指数增长", "指数衰减", "半衰期", "人口增长", "增长模型", "衰减模型"]
  ],
  "EXT-02": [
    ["向量空间", "向量", "线性组合", "基向量", "维度"],
    ["矩阵乘法", "矩阵运算", "线性变换", "旋转矩阵", "变换矩阵"],
    ["行列式", "逆矩阵", "线性方程组", "可逆", "det"],
    ["特征值", "特征向量", "特征方向", "eigen"],
    ["正交", "投影", "内积", "夹角", "Gram", "垂足"]
  ],
  "EXT-03": [
    ["随机事件", "样本空间", "概率公理", "互斥事件"],
    ["条件概率", "贝叶斯", "独立事件", "先验", "后验"],
    ["随机变量", "分布函数", "概率质量", "概率密度", "离散分布", "连续分布"],
    ["期望", "方差", "大数定律", "均值", "长期平均"],
    ["正态分布", "二项分布", "泊松分布", "中心极限定理", "常见分布"]
  ],
  "EXT-04": [
    ["前向传播", "权重矩阵", "矩阵形状", "隐藏层", "激活函数", "神经元", "output_dim"],
    ["反向传播", "Backpropagation", "链式法则", "梯度反传", "dL/d", "上游梯度", "计算图"],
    ["损失地形", "Loss Landscape", "鞍点", "局部极小", "逃离", "逃逸", "平坦区域", "噪声"],
    ["正则化", "L1", "L2", "Dropout", "过拟合", "权重衰减", "Batch Normalization", "BN层"],
    ["Adam", "SGD", "动量", "Momentum", "学习率", "优化器", "二阶矩", "收敛速度"]
  ],
  "EXT-05": [
    ["牛顿法", "拟牛顿", "BFGS", "逆 Hessian", "牛顿方向"],
    ["共轭梯度", "二阶方法", "共轭方向", "线搜索", "Krylov"],
    ["内点法", "对偶", "障碍函数", "KKT", "原始问题", "对偶问题"]
  ]
};

const questionOverrides = {
  "GH-03-formative-q1": "GH-03-K02",
  "GH-05-pre-q2": "GH-05-K01",
  "GH-05-pre-q5": "GH-05-K03",
  "GH-05-post-q6": "GH-05-K02",
  "GH-06-pre-q2": "GH-06-K01",
  "GH-08-pre-q1": "GH-08-K03",
  "GH-10-pre-q1": "GH-10-K01",
  "GH-10-pre-q2": "GH-10-K03",
  "GH-10-pre-q3": "GH-10-K03",
  "GH-11-pre-q2": "GH-11-K03",
  "GH-11-pre-q4": "GH-11-K03",
  "GH-12-pre-q1": "GH-12-K02",
  "GH-12-pre-q3": "GH-12-K04",
  "GH-13-pre-q2": "GH-13-K02",
  "GH-14-post-q3": "GH-14-K02",
  "GH-14-pre-q7": "GH-14-K01",
  "EXT-01-pre-q1": "EXT-01-K01",
  "EXT-01-pre-q4": "EXT-01-K01",
  "EXT-01-formative-q5": "EXT-01-K03",
  "EXT-02-pre-q1": "EXT-02-K02",
  "EXT-02-pre-q5": "EXT-02-K02",
  "EXT-02-pre-q6": "EXT-02-K02",
  "EXT-02-pre-q7": "EXT-02-K03",
  "EXT-02-pre-q9": "EXT-02-K05",
  "EXT-03-pre-q1": "EXT-03-K01",
  "EXT-03-pre-q5": "EXT-03-K03",
  "EXT-03-formative-q4": "EXT-03-K01",
  "EXT-03-post-q9": "EXT-03-K02",
  "EXT-04-pre-q1": "EXT-04-K01",
  "EXT-05-pre-q1": "EXT-05-K01",
  "EXT-05-pre-q6": "EXT-05-K03"
};

const coverageNameOverrides = {
  "GH-08-pre-q1": ["一元导数的几何意义（偏导数先修）"],
  "GH-10-pre-q1": ["单变量链式法则（多元链式法则先修）"],
  "GH-10-pre-q2": ["偏导数的几何意义（Jacobian 先修）"],
  "GH-11-pre-q2": ["梯度方向（二阶变化先修）"],
  "GH-11-pre-q4": ["二阶导数与弯曲方向（Hessian 先修）"],
  "GH-13-pre-q2": ["梯度方向（拉格朗日乘子先修）"],
  "EXT-01-pre-q1": ["导数与瞬时速度（微分方程先修）"],
  "EXT-01-pre-q4": ["导数方程与初值条件"],
  "EXT-02-pre-q1": ["坐标变换（线性变换先修）"],
  "EXT-03-post-q9": ["相关关系、因果关系与混杂变量（概率推理拓展）"],
  "EXT-05-pre-q1": ["梯度与 Hessian（牛顿法先修）"],
  "EXT-05-pre-q6": ["边界最优与有效约束（内点法先修）"]
};

const missingVisualPattern =
  /(?:如图所示|如下图|见下图|图中所示|图中阴影|图中标出|图中给出|四张图)/u;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sourceKey(value) {
  const raw = compact(value).toLowerCase();
  const match = raw.match(/^q0*(\d+)$/);
  return match ? `q${Number(match[1])}` : raw;
}

function questionSourceId(question, fallbackIndex = 0) {
  return compact(question.sourceId || question.id || `q${fallbackIndex + 1}`);
}

function questionOrdinal(question, fallbackIndex = 0) {
  const match = questionSourceId(question, fallbackIndex).match(/q0*(\d+)$/i);
  return match ? Math.max(0, Number(match[1]) - 1) : fallbackIndex;
}

function questionText(question) {
  return compact([
    question.question || question.prompt,
    ...(question.options || []).map((option) => option.label)
  ].join(" ")).toLowerCase();
}

function analysisText(question) {
  return compact([question.analysis, question.commentPrompt, question.referenceAnswer].join(" ")).toLowerCase();
}

function occurrenceCount(text, needle) {
  const target = needle.toLowerCase();
  let count = 0;
  let cursor = 0;
  while (target && count < 3) {
    const index = text.indexOf(target, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + target.length;
  }
  return count;
}

function keywordWeight(keyword) {
  if (keyword.length >= 6) return 18;
  if (keyword.length >= 4) return 14;
  if (keyword.length >= 2) return 9;
  return 4;
}

function semanticScore(question, knowledgePoint, module, knowledgeIndex, maxOrdinal) {
  const primary = questionText(question);
  const secondary = analysisText(question);
  const keywords = keywordGroups[module.id]?.[knowledgeIndex] || [];
  let score = 0;
  const override = questionOverrides[question.id];
  if (override) score += override === knowledgePoint.id ? 100 : -100;
  if (primary.includes(compact(knowledgePoint.name).toLowerCase())) score += 32;
  for (const keyword of keywords) {
    const weight = keywordWeight(keyword);
    score += occurrenceCount(primary, keyword) * weight;
    score += occurrenceCount(secondary, keyword) * weight * 0.35;
  }
  const linkedIds = [...primary.matchAll(/\[\[cq-unit:([^|\]]+)/g)].map((match) => match[1]);
  if (linkedIds.includes(knowledgePoint.id)) score += 7;
  const ordinal = questionOrdinal(question);
  const expectedIndex = Math.min(
    module.knowledgePoints.length - 1,
    Math.floor((ordinal * module.knowledgePoints.length) / Math.max(1, maxOrdinal + 1))
  );
  if (expectedIndex === knowledgeIndex) score += 2;
  return score;
}

function hasMediaReference(question) {
  return Boolean(
    question.image ||
      question.imageUrl ||
      question.media ||
      question.figure ||
      question.resourceRef ||
      question.sceneRef ||
      question.evidenceRef
  );
}

function needsMissingVisual(question) {
  return missingVisualPattern.test(compact(question.question || question.prompt)) && !hasMediaReference(question);
}

function qualityScore(question, current) {
  const text = compact(question.question || question.prompt);
  let score = current ? 30 : 0;
  if (text.length >= 18) score += 5;
  if (text.length <= 280) score += 2;
  if (question.hasAnswer !== false) score += 4;
  if ((question.options || []).length >= 3) score += 3;
  if (question.analysis) score += 2;
  if (needsMissingVisual(question)) score -= 100;
  return score;
}

function normalizeAnswers(question) {
  const answer = Array.isArray(question.answer)
    ? question.answer.map(String)
    : question.answer == null
      ? []
      : [String(question.answer)];
  let options = Array.isArray(question.options) ? question.options : [];
  const values = new Set(options.map((option) => String(option.value ?? "")));
  if (answer.length && answer.every((value) => /^[A-Z]$/i.test(value)) && answer.some((value) => !values.has(value))) {
    options = options.map((option, index) => ({ ...option, value: String.fromCharCode(65 + index) }));
  }
  return { answer, options };
}

function normalizeQuestion(question, module, phase, fallbackIndex, current = false) {
  const sourceId = questionSourceId(question, fallbackIndex);
  const slug = phaseSlug[phase];
  const id = String(question.id || "").startsWith(`${module.id}-${slug}-`)
    ? question.id
    : `${module.id}-${slug}-${sourceId}`;
  const { answer, options } = normalizeAnswers(question);
  return {
    ...question,
    id,
    sourceId,
    type: question.type === "text" || question.type === "short" ? "short_answer" : question.type,
    question: question.question || question.prompt || "",
    options,
    answer,
    moduleId: module.id,
    moduleTitle: module.title,
    __current: current,
    __quality: qualityScore(question, current),
    __ordinal: questionOrdinal(question, fallbackIndex)
  };
}

function bestPointForQuestion(question, module, maxOrdinal) {
  return module.knowledgePoints
    .map((point, pointIndex) => ({
      point,
      score: semanticScore(question, point, module, pointIndex, maxOrdinal)
    }))
    .sort((left, right) => right.score - left.score || left.point.id.localeCompare(right.point.id))[0];
}

function finalizeQuestion(question, point, selectionOrder, policy) {
  const concepts = coverageNameOverrides[question.id] || [point.name];
  const finalized = {
    ...question,
    knowledgePointIds: [point.id],
    knowledgePointNames: concepts,
    knowledgePointCoverageSource: "semantic-curation-v1",
    concepts,
    coachHint: {
      ...(question.coachHint || {}),
      concepts,
      knowledgePointIds: [point.id],
      reviewScene: point.name
    },
    selectionOrder,
    selectionPolicy: policy
  };
  delete finalized.__current;
  delete finalized.__quality;
  delete finalized.__ordinal;
  return finalized;
}

function curateModule(chapter, module) {
  const entries = [];
  for (const phase of phases) {
    const quiz = chapter.flow?.[phase];
    (quiz?.questions || []).forEach((question, index) => {
      if (question.moduleId !== module.id) return;
      entries.push({
        phase,
        quiz,
        index,
        question: normalizeQuestion(question, module, phase, index, true)
      });
    });
  }
  const candidates = entries.map((entry) => entry.question);
  const maxOrdinal = Math.max(0, ...candidates.map((question) => question.__ordinal));
  const lowConfidence = [];
  const coveredKnowledgePointIds = new Set();

  for (const entry of entries) {
    const match = bestPointForQuestion(entry.question, module, maxOrdinal);
    if (match.score < 3.5) {
      lowConfidence.push({
        questionId: entry.question.id,
        knowledgePoint: match.point.name,
        score: Number(match.score.toFixed(2))
      });
    }
    const selectionPolicy = entry.question.selectionPolicy || entry.quiz.selectionPolicy || "";
    coveredKnowledgePointIds.add(match.point.id);
    entry.quiz.questions[entry.index] = finalizeQuestion(
      entry.question,
      match.point,
      entry.question.selectionOrder || entry.index + 1,
      selectionPolicy
    );
    entry.quiz.knowledgePointPolicy =
      "不改变题目与题号；单题标注一个实际考查或明确说明的先修/拓展知识点，未直接测量的核心知识点作为覆盖缺口记录。";
  }

  return {
    chapterId: chapter.id,
    moduleId: module.id,
    questions: entries.length,
    uncoveredKnowledgePoints: (module.knowledgePoints || [])
      .filter((point) => !coveredKnowledgePointIds.has(point.id))
      .map((point) => ({ id: point.id, name: point.name })),
    lowConfidence
  };
}

function quizIdentity(route) {
  return (route.chapters || []).flatMap((chapter) =>
    phases.flatMap((phase) =>
      (chapter.flow?.[phase]?.questions || []).map((question) => ({
        chapterId: chapter.id,
        phase,
        id: question.id,
        sourceId: question.sourceId,
        moduleId: question.moduleId,
        type: question.type,
        question: question.question || question.prompt || "",
        options: question.options || [],
        answer: question.answer,
        points: question.points,
        selectionOrder: question.selectionOrder
      }))
    )
  );
}

function quizIdentityFingerprint(identity) {
  return crypto.createHash("sha256").update(identity).digest("hex");
}

function curateRoute(route) {
  const identityBefore = JSON.stringify(quizIdentity(route));
  const questionSetFingerprint = quizIdentityFingerprint(identityBefore);
  const reports = [];
  for (const chapter of route.chapters || []) {
    for (const module of chapter.modules || []) {
      reports.push(curateModule(chapter, module));
    }
  }
  const identityAfter = JSON.stringify(quizIdentity(route));
  const questionSetPreserved = identityAfter === identityBefore;
  if (!questionSetPreserved) {
    throw new Error("Quiz curation changed question identity, content, answers, scores, or order");
  }
  const coverageGaps = reports.flatMap((report) =>
    report.uncoveredKnowledgePoints.map((point) => ({
      chapterId: report.chapterId,
      moduleId: report.moduleId,
      knowledgePointId: point.id,
      knowledgePointName: point.name
    }))
  );
  const totalKnowledgePoints = (route.chapters || []).reduce(
    (total, chapter) => total + (chapter.modules || []).reduce(
      (moduleTotal, module) => moduleTotal + (module.knowledgePoints || []).length,
      0
    ),
    0
  );
  route.quizKnowledgePointCuration = {
    schemaVersion: "semantic-curation-v1",
    updatedAt: new Date().toISOString(),
    policy: "保持既有题目、题号、答案、分值和顺序不变；单题标注一个实际考查或明确说明的先修/拓展知识点，未直接测量的核心知识点作为覆盖缺口记录。",
    questionSetPreserved,
    questionSetFingerprint,
    modules: reports.length,
    totalKnowledgePoints,
    directlyCoveredKnowledgePoints: totalKnowledgePoints - coverageGaps.length,
    coverageGaps,
    selectionReplacements: []
  };
  return { reports, questionSetPreserved, questionSetFingerprint, coverageGaps };
}

const route = readJson(routePath);
const { reports, questionSetPreserved, questionSetFingerprint, coverageGaps } = curateRoute(route);
const summary = {
  route: path.relative(root, routePath).replace(/\\/g, "/"),
  write: shouldWrite,
  modules: reports.length,
  questions: reports.reduce((sum, report) => sum + report.questions, 0),
  retained: reports.reduce((sum, report) => sum + report.questions, 0),
  questionSetPreserved,
  questionSetFingerprint,
  replacements: [],
  coverageGaps,
  lowConfidence: reports.flatMap((report) =>
    report.lowConfidence.map((item) => ({ chapterId: report.chapterId, moduleId: report.moduleId, ...item }))
  )
};

if (shouldWrite) writeJson(routePath, route);
console.log(JSON.stringify(summary, null, 2));
