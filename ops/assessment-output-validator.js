"use strict";

const REQUIRED_EQUIVALENCE_FIELDS = [
  "presentationMode",
  "knownConditionCount",
  "operationCount",
  "symbolComplexity",
  "conclusionClass"
];

const FORBIDDEN_CONTENT = [
  /如图|下图|上图|见图/,
  /刚才的实验|课件中|学习场景中|按钮|拖动操作/,
  /示意性设计|实际趋近行为需结合题目设定|重新分析|自我纠正/
];

const MARKDOWN_TABLE_PATTERN = /(^|\n)\s*[^\n]*\|[^\n]*(\n|$)|---+\s*\|/;

function addError(errors, code, path, message) {
  errors.push({ code, path, message });
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseQuestion(entry, path, errors) {
  if (isObject(entry)) return entry;
  if (typeof entry !== "string") {
    addError(errors, "QUESTION_NOT_OBJECT", path, "题目必须是对象或包含题目对象的合法 JSON 字符串");
    return null;
  }
  try {
    const parsed = JSON.parse(entry);
    if (!isObject(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    addError(errors, "QUESTION_JSON_INVALID", path, "keyPoints 中的题目必须是可直接 JSON.parse 的对象字符串");
    return null;
  }
}

function questionEntries(outline) {
  return Array.isArray(outline?.keyPoints)
    ? outline.keyPoints
    : Array.isArray(outline?.questions)
      ? outline.questions
      : [];
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map((option, index) => {
    if (typeof option === "string") return { value: String.fromCharCode(65 + index), label: option };
    if (!isObject(option)) return { value: "", label: "" };
    return {
      value: String(option.value ?? option.id ?? String.fromCharCode(65 + index)).trim(),
      label: String(option.label ?? option.text ?? "").trim()
    };
  });
}

function normalizeAnswer(answer) {
  if (Array.isArray(answer)) return answer.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof answer !== "string") return [];
  return answer.split(/[，,、\s]+/).map((item) => item.trim()).filter(Boolean);
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function normalizeQuestionTemplate(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\\[a-z]+/g, "")
    .replace(/-?\d+(?:\.\d+)?/g, "数")
    .replace(/[a-z]+(?:\([^)]*\))?/g, "量")
    .replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function bigrams(value) {
  const result = new Set();
  for (let index = 0; index < value.length - 1; index += 1) result.add(value.slice(index, index + 2));
  return result;
}

function templateSimilarity(left, right) {
  const normalizedLeft = normalizeQuestionTemplate(left);
  const normalizedRight = normalizeQuestionTemplate(right);
  if (normalizedLeft.length < 12 || normalizedRight.length < 12) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  const leftBigrams = bigrams(normalizedLeft);
  const rightBigrams = bigrams(normalizedRight);
  let overlap = 0;
  for (const item of leftBigrams) if (rightBigrams.has(item)) overlap += 1;
  return (2 * overlap) / (leftBigrams.size + rightBigrams.size);
}

function validateWithinFormDiversity(questions, path, errors) {
  for (let left = 0; left < questions.length; left += 1) {
    for (let right = left + 1; right < questions.length; right += 1) {
      if (!questions[left] || !questions[right]) continue;
      const similarity = templateSimilarity(questions[left].question, questions[right].question);
      if (similarity >= 0.82) {
        addError(
          errors,
          "INTRA_FORM_TEMPLATE_REPETITION",
          `${path}[${left}],${path}[${right}]`,
          `同一试卷第 ${left + 1} 题与第 ${right + 1} 题在删除数字和变量后仍高度相似（${similarity.toFixed(2)}）`
        );
      }
    }
  }
}

function decimalPlaces(value) {
  const text = String(value);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

function signClass(value) {
  return Number(value) < 0 ? "negative" : "nonnegative";
}

function validateTableEvidence(question, path, errors) {
  const evidence = question.evidence;
  if (!isObject(evidence) || evidence.kind !== "two-sided-table") {
    if (isObject(question.equivalence?.evidence)) {
      addError(errors, "TABLE_EVIDENCE_MISPLACED", `${path}.equivalence.evidence`, "evidence 必须位于题目对象根层级，不得嵌套在 equivalence 中");
    }
    addError(errors, "TABLE_EVIDENCE_MISSING", `${path}.evidence`, "数表题必须提供 two-sided-table 结构化证据");
    return null;
  }
  const rows = Array.isArray(evidence.rows) ? evidence.rows : [];
  const targetX = Number(evidence.targetX);
  const targetY = Number(evidence.targetY);
  if (rows.length !== 6 || !Number.isFinite(targetX) || !Number.isFinite(targetY)) {
    addError(errors, "TABLE_SHAPE_INVALID", `${path}.evidence`, "数表必须包含 targetX、targetY 和恰好 6 行有限数值");
    return null;
  }
  const normalizedRows = rows.map((row) => ({ x: Number(row?.x), y: Number(row?.y) }));
  if (normalizedRows.some((row) => !Number.isFinite(row.x) || !Number.isFinite(row.y))) {
    addError(errors, "TABLE_VALUE_INVALID", `${path}.evidence.rows`, "数表的 x、y 必须都是有限数值");
    return null;
  }
  const left = normalizedRows.filter((row) => row.x < targetX);
  const right = normalizedRows.filter((row) => row.x > targetX);
  if (left.length !== 3 || right.length !== 3) {
    addError(errors, "TABLE_SIDES_INVALID", `${path}.evidence.rows`, "数表必须在 targetX 左右两侧各有 3 行数据");
  }
  for (const [sideName, sideRows] of [["left", left], ["right", right]]) {
    const approaching = [...sideRows].sort((a, b) => Math.abs(b.x - targetX) - Math.abs(a.x - targetX));
    const errorsToTarget = approaching.map((row) => Math.abs(row.y - targetY));
    for (let index = 1; index < errorsToTarget.length; index += 1) {
      if (errorsToTarget[index] >= errorsToTarget[index - 1]) {
        addError(errors, "TABLE_TREND_INCORRECT", `${path}.evidence.rows`, `${sideName} 侧数据没有随 x 接近 targetX 而更接近 targetY`);
        break;
      }
    }
  }
  const answer = normalizeAnswer(question.answer);
  if (String(evidence.correctOptionId || "").trim() !== answer[0]) {
    addError(errors, "TABLE_ANSWER_MISMATCH", `${path}.evidence.correctOptionId`, "数表证据标注的正确选项 ID 必须与题目答案一致");
  }
  return {
    rowCount: rows.length,
    xDecimals: normalizedRows.map((row) => decimalPlaces(row.x)),
    yDecimals: normalizedRows.map((row) => decimalPlaces(row.y)),
    xSigns: normalizedRows.map((row) => signClass(row.x)),
    ySigns: normalizedRows.map((row) => signClass(row.y))
  };
}

function validateQuestion(question, context, errors) {
  const { path, expectedId, expectedPoints, allowedKnowledgePoints, allowText } = context;
  if (!question) return null;
  for (const field of ["id", "type", "question", "answer", "analysis", "points", "knowledgePointIds", "cognitiveLevel", "estimatedSteps", "pairId", "equivalence"]) {
    if (question[field] === undefined || question[field] === null || question[field] === "") {
      addError(errors, "QUESTION_FIELD_MISSING", `${path}.${field}`, `缺少必填字段 ${field}`);
    }
  }
  if (question.id !== expectedId) addError(errors, "QUESTION_ID_INVALID", `${path}.id`, `题目 ID 必须为 ${expectedId}`);
  if (!allowText && question.type === "text") addError(errors, "TEXT_NOT_ALLOWED", `${path}.type`, "此题位不允许简答题");
  if (!['single', 'multiple', 'text'].includes(question.type)) addError(errors, "QUESTION_TYPE_INVALID", `${path}.type`, "题型必须为 single、multiple 或 text");
  if (Number(question.points) !== expectedPoints) addError(errors, "POINTS_INVALID", `${path}.points`, `本题必须为 ${expectedPoints} 分`);
  const kpIds = Array.isArray(question.knowledgePointIds) ? question.knowledgePointIds : [];
  if (kpIds.length !== 1 || !allowedKnowledgePoints.includes(kpIds[0])) {
    addError(errors, "KNOWLEDGE_POINT_INVALID", `${path}.knowledgePointIds`, "每题必须且只能标注一个允许的知识点 ID");
  }
  const options = normalizeOptions(question.options);
  const answer = normalizeAnswer(question.answer);
  if (question.type === "single" || question.type === "multiple") {
    if (!Array.isArray(question.answer)) addError(errors, "ANSWER_ARRAY_REQUIRED", `${path}.answer`, "选择题 answer 必须是选项 ID 数组");
    if (!Array.isArray(question.options) || question.options.some((option) => !isObject(option) || !String(option.value || "").trim() || !String(option.label || "").trim() || Object.hasOwn(option, "correct"))) {
      addError(errors, "OPTION_SCHEMA_INVALID", `${path}.options`, "options 必须只使用带 value、label 的对象，不得使用 correct 字段");
    }
    if (options.length !== 4) addError(errors, "OPTION_COUNT_INVALID", `${path}.options`, "选择题必须恰好有 4 个选项");
    const optionValues = new Set(options.map((option) => option.value));
    if (answer.some((value) => !optionValues.has(value))) addError(errors, "ANSWER_OPTION_INVALID", `${path}.answer`, "答案必须引用现有选项 value");
    if (question.type === "single" && answer.length !== 1) addError(errors, "SINGLE_ANSWER_COUNT", `${path}.answer`, "单选题必须恰好有 1 个正确项");
    if (question.type === "multiple" && (answer.length < 1 || answer.length > 3)) addError(errors, "MULTIPLE_ANSWER_COUNT", `${path}.answer`, "多选题必须有 1 至 3 个正确项");
  }
  if (question.type === "text") {
    const rubric = Array.isArray(question.rubric) ? question.rubric : [];
    if (!rubric.length && Array.isArray(question.equivalence?.rubric)) {
      addError(errors, "RUBRIC_MISPLACED", `${path}.equivalence.rubric`, "rubric 必须位于题目对象根层级，不得嵌套在 equivalence 中");
    }
    if (rubric.length === 0) addError(errors, "RUBRIC_MISSING", `${path}.rubric`, "简答题必须提供结构化评分点");
    const rubricTotal = rubric.reduce((sum, item) => sum + Number(item?.points || 0), 0);
    if (rubricTotal !== expectedPoints || rubric.some((item) => !Number.isInteger(Number(item?.points)) || Number(item.points) <= 0)) {
      addError(errors, "RUBRIC_POINTS_INVALID", `${path}.rubric`, `评分点必须使用正整数且合计为 ${expectedPoints}`);
    }
  }
  const combinedText = [question.question, question.analysis, ...options.map((option) => option.label)].join(" ");
  for (const pattern of FORBIDDEN_CONTENT) {
    if (pattern.test(combinedText)) addError(errors, "FORBIDDEN_CONTENT", path, `题目包含禁止表达：${pattern.source}`);
  }
  if (MARKDOWN_TABLE_PATTERN.test(String(question.question || ""))) {
    addError(errors, "MARKDOWN_TABLE_NOT_RENDERED", `${path}.question`, "OpenMAIC 测验题干不得使用 Markdown 表格，请改用两行纯文本数表");
  }
  if (/""|“”|‘’|_{2,}/.test(String(question.question || ""))) {
    addError(errors, "EMPTY_PLACEHOLDER", `${path}.question`, "题干含有空引号或未填充占位符");
  }
  const equivalence = isObject(question.equivalence) ? question.equivalence : {};
  const extraEquivalenceFields = Object.keys(equivalence).filter((field) => !REQUIRED_EQUIVALENCE_FIELDS.includes(field));
  if (extraEquivalenceFields.length) {
    addError(errors, "EQUIVALENCE_KEYS_INVALID", `${path}.equivalence`, `equivalence 含有不允许的字段：${extraEquivalenceFields.join(", ")}`);
  }
  for (const field of REQUIRED_EQUIVALENCE_FIELDS) {
    if (equivalence[field] === undefined || equivalence[field] === "") {
      addError(errors, "EQUIVALENCE_FIELD_MISSING", `${path}.equivalence.${field}`, `缺少等值签名字段 ${field}`);
    }
  }
  let tableProfile = null;
  if (equivalence.presentationMode === "table") tableProfile = validateTableEvidence(question, path, errors);
  return { ...question, options, answer, kpId: kpIds[0], equivalence, tableProfile };
}

function comparePairs(preQuestions, postQuestions, errors) {
  for (let index = 0; index < Math.min(preQuestions.length, postQuestions.length); index += 1) {
    const pre = preQuestions[index];
    const post = postQuestions[index];
    if (!pre || !post) continue;
    const path = `pair[${index + 1}]`;
    const comparisons = [
      ["pairId", pre.pairId, post.pairId],
      ["type", pre.type, post.type],
      ["points", Number(pre.points), Number(post.points)],
      ["knowledgePointId", pre.kpId, post.kpId],
      ["cognitiveLevel", pre.cognitiveLevel, post.cognitiveLevel],
      ["estimatedSteps", Number(pre.estimatedSteps), Number(post.estimatedSteps)],
      ["optionCount", pre.options.length, post.options.length]
    ];
    if (pre.type !== "text" && post.type !== "text") {
      comparisons.push(["correctAnswerCount", pre.answer.length, post.answer.length]);
    }
    for (const [field, left, right] of comparisons) {
      if (left !== right) addError(errors, "PAIR_MISMATCH", `${path}.${field}`, `A/B 配对题的 ${field} 不一致`);
    }
    for (const field of REQUIRED_EQUIVALENCE_FIELDS) {
      if (pre.equivalence[field] !== post.equivalence[field]) {
        addError(errors, "PAIR_EQUIVALENCE_MISMATCH", `${path}.equivalence.${field}`, `A/B 配对题的 ${field} 不一致`);
      }
    }
    const surfaceSimilarity = templateSimilarity(pre.question, post.question);
    if (surfaceSimilarity >= 0.86) {
      addError(
        errors,
        "PAIR_SURFACE_CLONE",
        `${path}.question`,
        `A/B 配对题删除数字和变量后仍高度相似（${surfaceSimilarity.toFixed(2)}），疑似仅换数值或变量`
      );
    }
    if (pre.tableProfile && post.tableProfile && JSON.stringify(pre.tableProfile) !== JSON.stringify(post.tableProfile)) {
      addError(errors, "PAIR_TABLE_PROFILE_MISMATCH", `${path}.evidence`, "A/B 配对数表的行数、小数位或正负号复杂度不一致");
    }
    if (pre.type === "text" && post.type === "text") {
      const preRubric = pre.rubric.map((item) => Number(item.points));
      const postRubric = post.rubric.map((item) => Number(item.points));
      if (JSON.stringify(preRubric) !== JSON.stringify(postRubric)) {
        addError(errors, "PAIR_RUBRIC_MISMATCH", `${path}.rubric`, "A/B 简答题的逐项评分分值不一致");
      }
    }
  }
}

function validateGh02Blueprint(parsedByPhase, errors) {
  const expectedConclusionClasses = {
    0: "reading_limit_from_table",
    1: "limit_not_in_table",
    3: "two_sided_limit_exists",
    9: "discontinuous"
  };
  for (const [phase, questions] of Object.entries(parsedByPhase)) {
    for (const [indexText, expectedClass] of Object.entries(expectedConclusionClasses)) {
      const index = Number(indexText);
      const question = questions[index];
      if (question && question.equivalence?.conclusionClass !== expectedClass) {
        addError(errors, "GH02_CONCLUSION_CLASS_INVALID", `$.${phase}.q${index + 1}.equivalence.conclusionClass`, `GH-02 P${String(index + 1).padStart(2, "0")} 的 conclusionClass 必须为 ${expectedClass}`);
      }
    }
    for (const index of [0, 1]) {
      const evidence = questions[index]?.evidence;
      const values = [evidence?.targetX, evidence?.targetY, ...(evidence?.rows || []).flatMap((row) => [row?.x, row?.y])];
      if (values.some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0)) {
        addError(errors, "GH02_TABLE_POSITIVE_VALUES_REQUIRED", `$.${phase}.q${index + 1}.evidence`, "GH-02 的 P01、P02 数表必须全部使用正数，以保持 A/B 符号复杂度一致");
      }
    }
    const rubricPoints = (questions[9]?.rubric || []).map((item) => Number(item?.points));
    if (JSON.stringify(rubricPoints) !== JSON.stringify([6, 6, 8])) {
      addError(errors, "GH02_RUBRIC_INVALID", `$.${phase}.q10.rubric`, "GH-02 P10 必须恰好使用 6、6、8 分三个评分点");
    }
  }
}

function validatePairedAssessment(payload, moduleDefinition) {
  const errors = [];
  const moduleId = moduleDefinition?.id;
  const allowedKnowledgePoints = (moduleDefinition?.knowledgePoints || []).map((point) => point.id);
  if (!isObject(payload)) addError(errors, "PAYLOAD_INVALID", "$", "输出必须是 JSON object");
  if (isObject(payload)) {
    const extraKeys = Object.keys(payload).filter((key) => !["languageDirective", "courseTitle", "outlines"].includes(key));
    if (extraKeys.length) addError(errors, "TOP_LEVEL_KEYS_INVALID", "$", `存在不允许的顶层键：${extraKeys.join(", ")}`);
  }
  const outlines = Array.isArray(payload?.outlines) ? payload.outlines : [];
  if (outlines.length !== 2) addError(errors, "OUTLINE_COUNT_INVALID", "$.outlines", "前后测必须恰好包含两个 quiz outline");
  const phases = ["pre", "post"];
  const parsedByPhase = {};
  phases.forEach((phase, outlineIndex) => {
    const outline = outlines[outlineIndex] || {};
    const outlinePath = `$.outlines[${outlineIndex}]`;
    if (outline.id !== `${moduleId}-${phase}`) addError(errors, "OUTLINE_ID_INVALID", `${outlinePath}.id`, `outline ID 必须为 ${moduleId}-${phase}`);
    if (outline.type !== "quiz") addError(errors, "OUTLINE_TYPE_INVALID", `${outlinePath}.type`, "outline type 必须为 quiz");
    const expectedTitle = `${phase === "pre" ? "前测" : "后测"}：${moduleDefinition.title}（${phase === "pre" ? "A" : "B"}卷）`;
    if (outline.title !== expectedTitle) addError(errors, "OUTLINE_TITLE_INVALID", `${outlinePath}.title`, `outline title 必须为 ${expectedTitle}`);
    if (Number(outline.order) !== outlineIndex + 1) addError(errors, "OUTLINE_ORDER_INVALID", `${outlinePath}.order`, `outline order 必须为 ${outlineIndex + 1}`);
    if (outline.difficulty !== "medium") addError(errors, "DIFFICULTY_INVALID", `${outlinePath}.difficulty`, "前后测 difficulty 必须为 medium");
    const quizConfigTypes = Array.isArray(outline.quizConfig?.questionTypes) ? outline.quizConfig.questionTypes : [];
    if (
      Number(outline.quizConfig?.questionCount) !== 10 ||
      outline.quizConfig?.difficulty !== "medium" ||
      !["single", "multiple", "text"].every((type) => quizConfigTypes.includes(type))
    ) {
      addError(errors, "QUIZ_CONFIG_INVALID", `${outlinePath}.quizConfig`, "前后测 quizConfig 必须声明 10 题、medium，并包含 single、multiple、text");
    }
    const entries = questionEntries(outline);
    if (entries.length !== 10) addError(errors, "QUESTION_COUNT_INVALID", `${outlinePath}.keyPoints`, "每卷必须恰好包含 10 道题");
    const parsed = entries.map((entry, questionIndex) => validateQuestion(
      parseQuestion(entry, `${outlinePath}.keyPoints[${questionIndex}]`, errors),
      {
        path: `${outlinePath}.keyPoints[${questionIndex}]`,
        expectedId: `${moduleId}-${phase}-q${questionIndex + 1}`,
        expectedPoints: questionIndex === 9 ? 20 : questionIndex >= 7 ? 12 : 8,
        allowedKnowledgePoints,
        allowText: questionIndex === 9
      },
      errors
    ));
    const types = parsed.map((question) => question?.type);
    if (!types.slice(0, 7).every((type) => type === "single") || !types.slice(7, 9).every((type) => type === "multiple") || types[9] !== "text") {
      addError(errors, "QUESTION_TYPE_DISTRIBUTION", `${outlinePath}.keyPoints`, "Q1-Q7 必须为单选题，Q8-Q9 必须为多选题，Q10 必须为简答题");
    }
    const pairIds = parsed.map((question) => question?.pairId);
    const expectedPairIds = parsed.map((question, index) => `P${String(index + 1).padStart(2, "0")}`);
    if (JSON.stringify(pairIds) !== JSON.stringify(expectedPairIds)) {
      addError(errors, "PAIR_ID_SEQUENCE_INVALID", `${outlinePath}.keyPoints`, "pairId 必须按 P01 至 P10 各出现一次且与题位一致");
    }
    const total = parsed.reduce((sum, question) => sum + Number(question?.points || 0), 0);
    if (total !== 100) addError(errors, "TOTAL_POINTS_INVALID", `${outlinePath}.keyPoints`, "每卷总分必须为 100 分");
    const normalizedQuestions = parsed.filter(Boolean).map((question) => normalizeText(question.question));
    if (new Set(normalizedQuestions).size !== normalizedQuestions.length) addError(errors, "DUPLICATE_QUESTION", `${outlinePath}.keyPoints`, "同一卷内不得出现重复题目");
    validateWithinFormDiversity(parsed, `${outlinePath}.keyPoints`, errors);
    const coverageCounts = parsed.filter(Boolean).reduce((counts, question) => {
      counts.set(question.kpId, (counts.get(question.kpId) || 0) + 1);
      return counts;
    }, new Map());
    for (const kpId of allowedKnowledgePoints) {
      if ((coverageCounts.get(kpId) || 0) < 2) addError(errors, "KNOWLEDGE_POINT_NOT_COVERED", `${outlinePath}.keyPoints`, `知识点 ${kpId} 至少需要两道题形成稳定测量`);
    }
    parsedByPhase[phase] = parsed;
  });
  comparePairs(parsedByPhase.pre || [], parsedByPhase.post || [], errors);
  if (moduleId === "GH-02") validateGh02Blueprint(parsedByPhase, errors);
  return { valid: errors.length === 0, errors };
}

function validateFormativeAssessment(payload, moduleDefinition, knowledgePointId) {
  const errors = [];
  const outlines = Array.isArray(payload?.outlines) ? payload.outlines : [];
  if (outlines.length !== 1) addError(errors, "OUTLINE_COUNT_INVALID", "$.outlines", "形成性测验必须恰好包含一个 quiz outline");
  const outline = outlines[0] || {};
  const point = (moduleDefinition?.knowledgePoints || []).find((item) => item.id === knowledgePointId);
  if (outline.id !== `${knowledgePointId}-check`) addError(errors, "OUTLINE_ID_INVALID", "$.outlines[0].id", `outline ID 必须为 ${knowledgePointId}-check`);
  if (outline.type !== "quiz") addError(errors, "OUTLINE_TYPE_INVALID", "$.outlines[0].type", "outline type 必须为 quiz");
  if (point && outline.title !== `即时检查：${point.name}`) addError(errors, "OUTLINE_TITLE_INVALID", "$.outlines[0].title", `outline title 必须为 即时检查：${point.name}`);
  if (Number(outline.order) !== 1) addError(errors, "OUTLINE_ORDER_INVALID", "$.outlines[0].order", "outline order 必须为 1");
  if (Number(outline.quizConfig?.questionCount) !== 2 || outline.quizConfig?.difficulty !== "medium") {
    addError(errors, "QUIZ_CONFIG_INVALID", "$.outlines[0].quizConfig", "形成性测验 quizConfig 必须声明 2 题且 difficulty=medium");
  }
  const entries = questionEntries(outline);
  if (entries.length !== 2) addError(errors, "QUESTION_COUNT_INVALID", "$.outlines[0].keyPoints", "形成性测验必须恰好有 2 题（1 道核心题 + 1 道诊断题）");
  const parsed = entries.map((entry, index) => validateQuestion(
    parseQuestion(entry, `$.outlines[0].keyPoints[${index}]`, errors),
    {
      path: `$.outlines[0].keyPoints[${index}]`,
      expectedId: `${knowledgePointId}-check-q${index + 1}`,
      expectedPoints: 10,
      allowedKnowledgePoints: [knowledgePointId],
      allowText: false
    },
    errors
  ));
  const types = parsed.map((question) => question?.type);
  if (types[0] !== "single" || types[1] !== "multiple") {
    addError(errors, "QUESTION_TYPE_DISTRIBUTION", "$.outlines[0].keyPoints", "形成性测验 Q1 必须为核心单选题，Q2 必须为诊断多选题");
  }
  const adaptiveRoles = parsed.map((question) => question?.adaptiveRole);
  if (adaptiveRoles[0] !== "core" || adaptiveRoles[1] !== "diagnostic") {
    addError(errors, "ADAPTIVE_ROLE_INVALID", "$.outlines[0].keyPoints", "Q1 adaptiveRole 必须为 core，Q2 必须为 diagnostic");
  }
  if (parsed.reduce((sum, question) => sum + Number(question?.points || 0), 0) !== 20) {
    addError(errors, "TOTAL_POINTS_INVALID", "$.outlines[0].keyPoints", "形成性测验题库总分必须为 20 分");
  }
  const moduleKpIds = new Set((moduleDefinition?.knowledgePoints || []).map((item) => item.id));
  if (!moduleKpIds.has(knowledgePointId)) addError(errors, "KNOWLEDGE_POINT_UNKNOWN", "$", `知识点 ${knowledgePointId} 不属于模块 ${moduleDefinition?.id}`);
  return { valid: errors.length === 0, errors };
}

module.exports = {
  validatePairedAssessment,
  validateFormativeAssessment,
  templateSimilarity
};
