(function attachAdminPresentation(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.AdminPresentation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAdminPresentation() {
  const internalCourseIdPatterns = [
    /\bV\d+-[CX]\d+(?:-[A-Za-z0-9]+)*\b/gi,
    /\bGH-\d+(?:-[A-Za-z0-9]+)*\b/gi,
    /\bEXT-\d+(?:-[A-Za-z0-9]+)*\b/gi,
    /\b[A-Z]\d+[a-z]?-(?:scene-\d+|chapter)\b/gi
  ];

  function clean(value = "") {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function publicCourseText(value = "", fallback = "") {
    let text = clean(value);
    internalCourseIdPatterns.forEach((pattern) => {
      text = text.replace(pattern, " ");
    });
    text = text
      .replace(/^[\s·|/\\,，;；:：_-]+/, "")
      .replace(/[\s·|/\\,，;；:：_-]+$/, "")
      .replace(/\s*([·：])\s*/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    return text || clean(fallback);
  }

  function sceneTypeLabel(value = "") {
    const key = clean(value);
    return ({
      slide: "讲解页",
      simulation: "动手调一调",
      game: "找错并改正",
      mindMap: "知识怎么连",
      diagram: "知识怎么连",
      visualization3d: "换个角度看",
      courseware: "互动课件",
      interactive: "互动课件",
      quiz: "测验"
    })[key] || publicCourseText(key, "课件");
  }

  function knowledgeSceneLabel(knowledgePoint = "", sceneType = "", sceneLabel = "") {
    const point = publicCourseText(knowledgePoint, "未命名知识点");
    const explicitScene = publicCourseText(sceneLabel, "");
    const scene = explicitScene || (clean(sceneType) ? sceneTypeLabel(sceneType) : "历史记录未包含场景");
    return `${point} · ${scene}`;
  }

  function questionDisplayLabel(questionId = "", phase = "") {
    const phaseLabel = ({
      pre: "前测",
      formative: "形成性测验",
      post: "后测"
    })[clean(phase)] || "测验";
    const match = clean(questionId).match(/(?:^|[-_])Q(?:UESTION)?[-_]?(\d+)$/i);
    return match ? `${phaseLabel}第 ${Number(match[1])} 题` : `${phaseLabel}题目`;
  }

  function questionInteractionLabel(meta = {}) {
    const order = Number(meta.order);
    const questionLabel = Number.isFinite(order) && order > 0
      ? questionDisplayLabel(`Q${Math.floor(order)}`, meta.phase)
      : questionDisplayLabel(meta.questionId || meta.id || "", meta.phase);
    const moduleTitle = publicCourseText(meta.moduleTitle, "");
    const questionText = clean(meta.questionText || meta.question || "");
    const excerpt = questionText.length > 42 ? `${questionText.slice(0, 42)}...` : questionText;
    return `${moduleTitle ? `${moduleTitle} · ` : ""}${questionLabel}${excerpt ? `「${excerpt}」` : ""}`;
  }

  function questionTypeLabel(value = "") {
    const key = clean(value).toLowerCase();
    return ({
      single: "单选题",
      multiple: "多选题",
      short_answer: "简答题",
      true_false: "判断题",
      numeric: "数值题"
    })[key] || publicCourseText(key, "未分类题型");
  }

  function feedbackContentHtml(content = "", escapeHtml = (value) => value) {
    const text = String(content || "").trim();
    return `<p class="feedback-body">${escapeHtml(text)}</p>`;
  }

  function riskLevelLabel(value = "") {
    const key = clean(value).toLowerCase();
    return ({
      high: "高风险",
      medium: "中风险",
      low: "低风险"
    })[key] || publicCourseText(key, "未判定");
  }

  function coachActionLabel(value = "") {
    const key = clean(value).toLowerCase();
    const label = ({
      alternate_scene: "换一种表征重学",
      make_interactive: "切换到互动场景",
      remediate: "换表征重学",
      review: "回看复习",
      select_knowledge: "自主勾选知识点",
      review_knowledge: "回看知识点",
      unskip_knowledge: "补学已跳过内容",
      review_and_unskip_knowledge: "回看并补学知识点",
      extend: "进入拓展学习",
      extension: "进入一步拓展",
      extension_chapter: "进入扩展章节",
      skip: "跳过已掌握内容",
      continue: "继续主线",
      continue_mainline: "继续主线",
      same_concept_scene_choice: "同一知识簇内换场景",
      keep: "保留当前学习项",
      learn: "继续学习",
      proceed: "继续下一步"
    })[key];
    if (label) return label;
    if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(key)) return "其他学习选择";
    return publicCourseText(value, "未记录");
  }

  function plannerReasonLabel(value = "") {
    const key = clean(value).toLowerCase();
    return ({
      same_concept_cluster: "属于同一知识簇",
      different_representation: "采用不同表征",
      remediation_fit: "符合补学需要",
      engagement_recovery: "有助于恢复参与度",
      extension_fit: "符合拓展目标",
      high_friction_support: "针对高操作摩擦提供支持",
      weak_concept_match: "匹配薄弱概念",
      current_scene: "当前学习场景",
      planner_ranked: "由 Planner 综合排序"
    })[key] || publicCourseText(key, "其他排序依据");
  }

  function plannerReasonsText(value = "") {
    const values = Array.isArray(value)
      ? value
      : String(value || "").split(/[;+|，、]/);
    return values
      .map((item) => plannerReasonLabel(item))
      .filter(Boolean)
      .filter((item, index, list) => list.indexOf(item) === index)
      .join("、");
  }

  function qaStatusLabel(value) {
    if (value === true || value === 1 || value === "pass") return "通过";
    if (value === false || value === 0 || value === "check") return "需检查";
    return "未记录";
  }

  function durationSortValue(text = "") {
    const value = clean(text).toLowerCase();
    if (!value) return null;
    let milliseconds = 0;
    let matched = false;
    const units = [
      [/(-?\d+(?:\.\d+)?)\s*(?:小时|h)/i, 60 * 60 * 1000],
      [/(-?\d+(?:\.\d+)?)\s*(?:分钟|分|min)/i, 60 * 1000],
      [/(-?\d+(?:\.\d+)?)\s*(?:秒|s)/i, 1000],
      [/(-?\d+(?:\.\d+)?)\s*ms\b/i, 1]
    ];
    units.forEach(([pattern, multiplier]) => {
      const match = value.match(pattern);
      if (!match) return;
      matched = true;
      milliseconds += Number(match[1]) * multiplier;
    });
    return matched ? milliseconds : null;
  }

  function tableSortToken(value = "") {
    const text = clean(value).replace(/\u00a0/g, " ");
    if (!text || /^(?:-|—|暂无|未记录|未判定)$/.test(text)) {
      return { type: "empty", value: "" };
    }

    const duration = durationSortValue(text);
    if (duration !== null) return { type: "number", value: duration };

    const dateMatch = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (dateMatch) {
      const [, year, month, day, hour = "0", minute = "0", second = "0"] = dateMatch;
      return {
        type: "date",
        value: Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
      };
    }

    const numeric = text
      .replace(/,/g, "")
      .match(/^[+]?(-?\d+(?:\.\d+)?)\s*(?:%|分|次|条|个|人|字)?(?:\s*\/\s*-?\d+(?:\.\d+)?)?/);
    if (numeric) return { type: "number", value: Number(numeric[1]) };

    return { type: "text", value: text.toLocaleLowerCase("zh-CN") };
  }

  function compareTableValues(left, right, direction = "asc") {
    const a = tableSortToken(left);
    const b = tableSortToken(right);
    if (a.type === "empty" && b.type === "empty") return 0;
    if (a.type === "empty") return 1;
    if (b.type === "empty") return -1;
    const multiplier = direction === "desc" ? -1 : 1;
    if (a.type === b.type && ["number", "date"].includes(a.type)) {
      return (a.value - b.value) * multiplier;
    }
    return String(a.value).localeCompare(String(b.value), "zh-CN", {
      numeric: true,
      sensitivity: "base"
    }) * multiplier;
  }

  return {
    publicCourseText,
    sceneTypeLabel,
    knowledgeSceneLabel,
    questionDisplayLabel,
    questionInteractionLabel,
    questionTypeLabel,
    feedbackContentHtml,
    riskLevelLabel,
    coachActionLabel,
    plannerReasonLabel,
    plannerReasonsText,
    qaStatusLabel,
    tableSortToken,
    compareTableValues
  };
});
