(function initCoursewareContextCore(global, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (global && global.document) global.CoursewareContextCore = Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : this, function coursewareContextFactory() {
  const SCHEMA_VERSION = 1;
  const BRIDGE_VERSION = "20260813-v8";
  const CONTEXT_KINDS = new Set([
    "unit",
    "text",
    "formula",
    "object",
    "quiz",
    "quiz-option",
    "interaction",
    "viewport"
  ]);
  const CONTEXT_SCOPES = new Set(["lesson", "slide", "quiz", "interactive"]);
  const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);
  const NOTE_HIGHLIGHT_NAMES = new Map([
    ["amber", "cq-learning-notes-amber"],
    ["mint", "cq-learning-notes-mint"],
    ["blue", "cq-learning-notes-blue"],
    ["pink", "cq-learning-notes-pink"]
  ]);
  const QUESTION_EXCLUSION_SELECTOR = [
    ".resource-toolbar",
    ".player-top",
    ".agentic-coach-panel",
    ".coach-strip",
    ".bottom-next-wrapper",
    ".knowledge-audio-slot",
    "[data-knowledge-audio-slot]",
    "[data-cq-no-question]",
    "[data-resource-fullscreen]",
    "[data-knowledge-scene-fullscreen]",
    "[data-submit-quiz]"
  ].join(", ");
  const QUESTION_TARGET_SELECTOR = [
    "[data-context-id]",
    "[data-question]",
    ".slide-element",
    ".question-card fieldset label",
    "iframe.embed-frame",
    "[data-courseware-frame]",
    "[data-slide-canvas]",
    ".quiz-card"
  ].join(", ");

  function compactText(value = "", limit = 240) {
    return String(value ?? "")
      .replace(/\u0000/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  }

  function compactMultiline(value = "", limit = 800) {
    return String(value ?? "")
      .replace(/\u0000/g, "")
      .replace(/\r\n?/g, "\n")
      .trim()
      .slice(0, limit);
  }

  const INTERACTION_LABELS = new Map([
    ["h", "步长 h"],
    ["hslider", "步长 h"],
    ["stepsize", "步长"],
    ["step", "步长"],
    ["deltax", "横向间隔 Δx"],
    ["dx", "横向间隔 Δx"],
    ["delta", "变化量 Δ"],
    ["epsilon", "误差范围 ε"],
    ["eps", "误差范围 ε"],
    ["angle", "观察角度"],
    ["angleslider", "观察角度"],
    ["theta", "旋转角度 θ"],
    ["rotation", "旋转角度"],
    ["rotate", "旋转角度"],
    ["zoom", "缩放比例"],
    ["scale", "缩放比例"],
    ["speed", "变化速度"],
    ["time", "时间"],
    ["x", "横坐标 x"],
    ["y", "纵坐标 y"]
  ]);
  const SCENE_LABELS = new Map([
    ["simulation", "动手实验"],
    ["game", "误解挑战"],
    ["mindmap", "关系图"],
    ["visualization3d", "空间视角"]
  ]);

  function friendlyInteractionLabel(value = "") {
    const raw = compactText(value, 160)
      .replace(/^interactive:(?:id|name|data|role):/i, "")
      .replace(/^(?:刚才)?(?:调整了|改变了|设置了)\s*/u, "")
      .replace(/^[^\p{L}\p{N}Δδεθλμ]+/gu, "")
      .trim();
    if (!raw) return "交互参数";
    if (/[\p{Script=Han}]/u.test(raw)) return raw;
    const key = raw
      .normalize("NFKC")
      .toLowerCase()
      .replace(/(?:slider|range|input|control|selector)$/i, (suffix) => suffix.toLowerCase())
      .replace(/[^a-z0-9Δδεθλμ]+/gu, "");
    const alias = INTERACTION_LABELS.get(key);
    if (alias) return alias;
    const readable = raw
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_:./-]+/g, " ")
      .replace(/\b(?:slider|range|input|control|selector)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    return readable ? `参数 ${readable}` : "交互参数";
  }

  function formatInteractionChange(state = {}) {
    const oldValue = compactText(state.oldValue ?? state.old, 120);
    const newValue = compactText(state.newValue ?? state.new, 120);
    if (oldValue && newValue && oldValue !== newValue) {
      return `从 ${oldValue} 调整为 ${newValue}`;
    }
    if (newValue) return `当前值为 ${newValue}`;
    return compactText(state.action, 180) || "已记录本次操作";
  }

  function friendlySceneLabel(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const unitLabel = compactText(source.unitLabel, 180);
    let title = compactText(source.resourceTitle || source.title, 180)
      .replace(/^GH-\d+-/i, "")
      .replace(/^(?:(?:\p{Extended_Pictographic}|\uFE0F)|[~◇※⬡•])+\s*/gu, "")
      .replace(/拖动实验/g, "动手调一调")
      .replace(/误解修复挑战|误解挑战/g, "找错并改正")
      .replace(/关系图/g, "知识怎么连")
      .replace(/空间视角/g, "换个角度看");
    if (unitLabel && title.startsWith(unitLabel)) {
      title = title.slice(unitLabel.length).replace(/^[：:·\s—–-]+/u, "");
    }
    if (title) return title;
    const sceneType = compactText(source.sceneType || source.type, 80)
      .normalize("NFKC")
      .toLowerCase();
    return SCENE_LABELS.get(sceneType) || "当前课件";
  }

  function normalizeLauncherPlacement(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const ratio = Number(source.topRatio);
    return {
      side: source.side === "left" ? "left" : "right",
      topRatio: Number(Math.min(0.88, Math.max(0.12, Number.isFinite(ratio) ? ratio : 0.5)).toFixed(4)),
      compact: Boolean(source.compact)
    };
  }

  function cleanId(value = "", limit = 180) {
    return String(value ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/[^\p{L}\p{N}_.:@/-]/gu, "-")
      .slice(0, limit);
  }

  function normalizeInteractionState(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return {
      parameter: compactText(value.parameter || value.param, 120),
      oldValue: compactText(value.oldValue ?? value.old, 120),
      newValue: compactText(value.newValue ?? value.new, 120),
      min: compactText(value.min, 80),
      max: compactText(value.max, 80),
      action: compactText(value.action, 160)
    };
  }

  function normalizeContextRef(input = {}, defaults = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const fallback = defaults && typeof defaults === "object" ? defaults : {};
    const kind = CONTEXT_KINDS.has(source.kind) ? source.kind
      : CONTEXT_KINDS.has(fallback.kind) ? fallback.kind
        : "unit";
    const scope = CONTEXT_SCOPES.has(source.scope) ? source.scope
      : CONTEXT_SCOPES.has(fallback.scope) ? fallback.scope
        : kind === "quiz" || kind === "quiz-option" ? "quiz"
          : kind === "interaction" || kind === "viewport" ? "interactive"
            : "lesson";
    const confidence = CONFIDENCE_LEVELS.has(source.confidence) ? source.confidence
      : CONFIDENCE_LEVELS.has(fallback.confidence) ? fallback.confidence
        : source.semanticId ? "high"
          : "medium";
    const createdAtSource = source.createdAt || fallback.createdAt;
    const createdAt = Number.isFinite(Date.parse(createdAtSource || ""))
      ? new Date(createdAtSource).toISOString()
      : new Date().toISOString();
    const state = normalizeInteractionState(source.state || fallback.state);

    return {
      schemaVersion: SCHEMA_VERSION,
      kind,
      scope,
      chapterId: cleanId(source.chapterId || fallback.chapterId),
      unitId: cleanId(source.unitId || fallback.unitId),
      unitLabel: compactText(source.unitLabel || fallback.unitLabel, 180),
      knowledgePointId: cleanId(source.knowledgePointId || fallback.knowledgePointId),
      knowledgePointLabel: compactText(source.knowledgePointLabel || fallback.knowledgePointLabel, 180),
      sceneType: cleanId(source.sceneType || fallback.sceneType, 80),
      resourceFingerprint: cleanId(source.resourceFingerprint || fallback.resourceFingerprint, 160),
      semanticId: cleanId(source.semanticId || fallback.semanticId),
      questionId: cleanId(source.questionId || fallback.questionId),
      optionValue: compactText(source.optionValue || fallback.optionValue, 40),
      label: compactText(source.label || fallback.label, 260),
      excerpt: compactMultiline(source.excerpt || fallback.excerpt, 900),
      latex: compactMultiline(source.latex || fallback.latex, 600),
      confidence,
      coarse: confidence === "low" || Boolean(source.coarse || fallback.coarse),
      state,
      createdAt
    };
  }

  function contextThreadKey(contextRef = {}, fallback = {}) {
    const normalized = normalizeContextRef(contextRef, fallback);
    if (normalized.knowledgePointId) return `knowledge:${normalized.knowledgePointId}`;
    if (normalized.unitId) return `unit:${normalized.unitId}`;
    if (normalized.chapterId) return `chapter:${normalized.chapterId}`;
    return "course:general";
  }

  function suggestionsForContext(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    if (source.scope === "quiz" && !source.quizSubmitted) {
      return [];
    }
    if (source.scope === "quiz" && source.quizSubmitted) {
      return [
        "给我完整解析",
        "为什么其他选项不成立？",
        "我错在了哪一步？",
        "再出一道类似题"
      ];
    }
    if (source.kind === "interaction" || source.kind === "viewport") {
      return [
        "这个变化为什么会发生？",
        "我应该观察哪里？",
        "为什么变化看起来不明显？",
        "下一步怎么验证？"
      ];
    }
    if (source.kind === "formula") {
      return [
        "这个公式每一项是什么意思？",
        "用图像解释",
        "举个数值例子",
        "它和当前知识点有什么关系？"
      ];
    }
    if (source.kind === "text" || source.kind === "object") {
      return [
        "为什么是这样？",
        "用图像解释",
        "举个数值例子",
        "我应该怎么验证？"
      ];
    }
    return [
      "用自己的话解释这个知识点",
      "给我一个具体例子",
      "我最容易误解哪里？",
      "带我做一次自检"
    ];
  }

  function createObjectPickStateMachine(options = {}) {
    const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
    let state = {
      phase: "idle",
      singleShot: true,
      startedAt: "",
      reason: ""
    };

    function update(next) {
      state = Object.freeze({ ...state, ...next });
      onChange(state);
      return state;
    }

    return {
      getState() {
        return state;
      },
      begin(config = {}) {
        return update({
          phase: "picking",
          singleShot: config.singleShot !== false,
          startedAt: new Date().toISOString(),
          reason: ""
        });
      },
      consume(value) {
        if (state.phase !== "picking") return null;
        if (state.singleShot) {
          update({
            phase: "idle",
            startedAt: "",
            reason: "selected"
          });
        }
        return value;
      },
      cancel(reason = "cancelled") {
        if (state.phase !== "picking") return false;
        update({
          phase: "idle",
          startedAt: "",
          reason: compactText(reason, 80)
        });
        return true;
      }
    };
  }

  function elementFromNode(node) {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
  }

  function rawLatexFromElement(element) {
    const host = element?.closest?.("[data-context-latex], .katex") || null;
    if (!host) return "";
    if (host.dataset?.contextLatex) return compactMultiline(host.dataset.contextLatex, 600);
    const annotation = host.querySelector?.('annotation[encoding="application/x-tex"]');
    return compactMultiline(annotation?.textContent || "", 600);
  }

  function rawLatexFromRange(range) {
    if (!range) return "";
    const start = elementFromNode(range.startContainer);
    const end = elementFromNode(range.endContainer);
    const startLatex = rawLatexFromElement(start);
    const endLatex = rawLatexFromElement(end);
    if (startLatex && startLatex === endLatex) return startLatex;
    const common = elementFromNode(range.commonAncestorContainer);
    const annotations = Array.from(
      common?.querySelectorAll?.('annotation[encoding="application/x-tex"]') || []
    ).map((node) => compactMultiline(node.textContent || "", 300)).filter(Boolean);
    return Array.from(new Set(annotations)).join(" ").slice(0, 600);
  }

  function domScopeForElement(element) {
    if (element?.closest?.(".quiz-resource, .quiz-card, [data-context-scope='quiz']")) return "quiz";
    if (element?.closest?.("iframe, .iframe-container, [data-context-scope='interactive']")) return "interactive";
    if (element?.closest?.(".slide-wrap, [data-slide-canvas], [data-context-scope='slide']")) return "slide";
    return "lesson";
  }

  function domLabelForElement(element) {
    if (!element) return "";
    return compactText(
      element.dataset?.contextLabel
      || element.getAttribute?.("aria-label")
      || element.getAttribute?.("title")
      || (element.tagName?.toLowerCase() === "canvas" ? "当前画面" : "")
      || (element.tagName?.toLowerCase() === "svg" ? "图形对象" : "")
      || element.textContent
      || element.getAttribute?.("alt")
      || element.getAttribute?.("name")
      || element.id
      || "",
      260
    );
  }

  function isQuestionExcluded(element) {
    return Boolean(element?.closest?.(QUESTION_EXCLUSION_SELECTOR));
  }

  function createBrowserController(options = {}) {
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    const win = options.window || (typeof window !== "undefined" ? window : null);
    if (!doc || !win) throw new Error("CoursewareContext requires a browser document");

    const resolveRoot = () => typeof options.root === "function"
      ? options.root()
      : options.root || doc.querySelector("#lesson-player");
    const resolveSidebarRoot = () => typeof options.sidebarRoot === "function"
      ? options.sidebarRoot()
      : options.sidebarRoot || null;
    const currentCourseMeta = () => {
      const value = typeof options.getCourseMeta === "function" ? options.getCourseMeta() : {};
      return value && typeof value === "object" ? value : {};
    };
    const picker = createObjectPickStateMachine();
    const bridgeFrames = new WeakSet();
    const fallbackOverlays = new Set();
    let recentInteraction = null;
    let selectedContext = null;
    let selectedElement = null;
    let hoveredElement = null;
    let pendingHoverElement = null;
    let hoverTimer = null;
    let listenersActive = false;
    let pickPreview = null;
    const candidateElements = new Set();
    const noteFallbackElements = new Set();
    let renderedNotes = [];
    let renderedNoteRanges = [];

    function notify(name, payload) {
      const handler = options[name];
      if (typeof handler === "function") handler(payload);
    }

    function trustedFrameForSource(source) {
      if (!source) return null;
      return Array.from(resolveRoot()?.querySelectorAll?.("iframe") || [])
        .find((frame) => frame.contentWindow === source) || null;
    }

    function postFrame(frame, payload) {
      try {
        frame?.contentWindow?.postMessage(payload, "*");
      } catch {}
    }

    function currentFrames() {
      return Array.from(resolveRoot()?.querySelectorAll?.("iframe.embed-frame, iframe[data-courseware-frame]") || []);
    }

    function contextDefaults(extra = {}) {
      const meta = currentCourseMeta();
      return {
        chapterId: meta.chapterId || "",
        unitId: meta.unitId || "",
        unitLabel: meta.unitLabel || "",
        knowledgePointId: meta.knowledgePointId || "",
        knowledgePointLabel: meta.knowledgePointLabel || "",
        sceneType: meta.sceneType || "",
        resourceFingerprint: meta.resourceFingerprint || "",
        ...extra
      };
    }

    function clearHover() {
      clearTimeout(hoverTimer);
      hoverTimer = null;
      if (hoveredElement) hoveredElement.classList.remove("cq-context-hover");
      hoveredElement = null;
      pendingHoverElement = null;
      if (pickPreview) pickPreview.hidden = true;
    }

    function contextKindLabel(contextRef = {}, element = null) {
      if (contextRef.kind === "formula") return "公式";
      if (contextRef.kind === "text") return "文字";
      if (contextRef.kind === "quiz-option") return "选项";
      if (contextRef.kind === "quiz") return "题目";
      if (contextRef.kind === "viewport") return "当前画面";
      if (element?.classList?.contains("slide-table-wrap")) return "表格";
      if (element?.tagName?.toLowerCase() === "img") return "图片";
      if (element?.classList?.contains("slide-line")) return "连线";
      if (element?.classList?.contains("slide-shape")) return "图形";
      return "课件内容";
    }

    function ensurePickPreview() {
      if (pickPreview?.isConnected) return pickPreview;
      pickPreview = doc.createElement("div");
      pickPreview.className = "cq-context-preview";
      pickPreview.hidden = true;
      pickPreview.setAttribute("aria-hidden", "true");
      doc.body.appendChild(pickPreview);
      return pickPreview;
    }

    function rectContainsPoint(rect, point, padding = 0) {
      if (!rect || !point) return false;
      const x = Number(point.clientX);
      const y = Number(point.clientY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      return x >= Number(rect.left || 0) - padding
        && x <= Number(rect.right || rect.left || 0) + padding
        && y >= Number(rect.top || 0) - padding
        && y <= Number(rect.bottom || rect.top || 0) + padding;
    }

    function usableClientRect(rect) {
      return Boolean(
        rect
        && Number.isFinite(Number(rect.left))
        && Number.isFinite(Number(rect.top))
        && (Number(rect.width) > 0 || Number(rect.height) > 0)
      );
    }

    function textClientRects(element) {
      const content = element?.querySelector?.(".slide-text-content");
      if (!content || typeof doc.createRange !== "function") return [];
      const range = doc.createRange();
      range.selectNodeContents(content);
      const rects = Array.from(range.getClientRects?.() || []).filter(usableClientRect);
      range.detach?.();
      return rects;
    }

    function slideCandidateProfile(element) {
      if (!element?.classList?.contains("slide-element")) return null;
      if (element.classList.contains("slide-line")) {
        const rect = element.querySelector?.("line")?.getBoundingClientRect?.();
        return usableClientRect(rect) ? { rects: [rect], padding: 7, priority: 2 } : null;
      }
      if (element.classList.contains("slide-shape")) {
        const rect = element.querySelector?.("path")?.getBoundingClientRect?.();
        return usableClientRect(rect) ? { rects: [rect], padding: 4, priority: 1 } : null;
      }
      if (element.classList.contains("slide-text")) {
        const rects = textClientRects(element);
        return rects.length ? { rects, padding: 5, priority: 0 } : null;
      }
      if (element.classList.contains("slide-latex")) {
        const rect = element.querySelector?.(".katex")?.getBoundingClientRect?.()
          || element.getBoundingClientRect?.();
        return usableClientRect(rect) ? { rects: [rect], padding: 5, priority: 0 } : null;
      }
      const rect = element.getBoundingClientRect?.();
      return usableClientRect(rect) ? { rects: [rect], padding: 2, priority: 1 } : null;
    }

    function slideCandidateAtPoint(point) {
      const matches = [];
      candidateElements.forEach((element) => {
        const profile = slideCandidateProfile(element);
        if (!profile) return;
        profile.rects.forEach((rect) => {
          if (!rectContainsPoint(rect, point, profile.padding)) return;
          const width = Math.max(1, Number(rect.width || 0) + profile.padding * 2);
          const height = Math.max(1, Number(rect.height || 0) + profile.padding * 2);
          matches.push({
            element,
            rect,
            score: profile.priority * 1_000_000_000 + width * height
          });
        });
      });
      matches.sort((left, right) => left.score - right.score);
      return matches[0] || null;
    }

    function showPickPreview(element, point = null) {
      const contextRef = contextFromElement(element);
      if (!contextRef) return;
      const preview = ensurePickPreview();
      const kind = contextKindLabel(contextRef, element);
      const label = compactText(contextRef.label || contextRef.excerpt, 92);
      preview.textContent = label ? `${kind} · ${label}` : kind;
      preview.hidden = false;
      const precise = slideCandidateAtPoint(point);
      const rect = precise?.element === element
        ? precise.rect
        : element.getBoundingClientRect();
      const width = Math.min(300, Math.max(120, preview.offsetWidth || 180));
      const left = Math.min(
        Math.max(10, rect.left + Math.min(rect.width / 2, 80) - 20),
        Math.max(10, win.innerWidth - width - 10)
      );
      const preferAbove = rect.top > 76;
      const top = preferAbove
        ? Math.max(10, rect.top - (preview.offsetHeight || 34) - 9)
        : Math.min(win.innerHeight - 48, rect.bottom + 9);
      preview.style.left = `${Math.round(left)}px`;
      preview.style.top = `${Math.round(top)}px`;
    }

    function markQuestionCandidates() {
      candidateElements.forEach((element) => element.classList.remove("cq-context-candidate"));
      candidateElements.clear();
      const root = resolveRoot();
      Array.from(root?.querySelectorAll?.(QUESTION_TARGET_SELECTOR) || []).forEach((element) => {
        if (isQuestionExcluded(element)) return;
        element.classList.add("cq-context-candidate");
        candidateElements.add(element);
      });
    }

    function clearQuestionCandidates() {
      candidateElements.forEach((element) => element.classList.remove("cq-context-candidate"));
      candidateElements.clear();
    }

    function clearSelectedElement() {
      if (selectedElement) selectedElement.classList.remove("cq-context-selected");
      selectedElement = null;
      currentFrames().forEach((frame) => {
        frame.classList.remove("cq-context-selected");
        postFrame(frame, { type: "cq:context-clear" });
      });
    }

    function elementContextTarget(target, point = null) {
      const root = resolveRoot();
      const sidebar = resolveSidebarRoot();
      const element = elementFromNode(target);
      if (!root || !element || !root.contains(element)) return null;
      if (sidebar?.contains?.(element)) return null;
      if (isQuestionExcluded(element)) return null;
      const slideCanvas = element.closest?.("[data-slide-canvas]");
      if (slideCanvas && point) {
        const precise = slideCandidateAtPoint(point);
        return precise?.element || slideCanvas;
      }
      return element.closest?.(QUESTION_TARGET_SELECTOR) || null;
    }

    function contextFromElement(element) {
      if (!element) return null;
      const scope = element.dataset?.contextScope || domScopeForElement(element);
      const questionCard = element.closest?.("[data-question]");
      const latex = element.dataset?.contextLatex || rawLatexFromElement(element);
      const tag = element.tagName?.toLowerCase() || "";
      const isFrame = tag === "iframe";
      const isCoarse = isFrame || tag === "canvas" || element.dataset?.contextConfidence === "low";
      const semanticId = element.dataset?.contextId
        || (questionCard?.dataset?.question ? `quiz:${questionCard.dataset.question}` : "")
        || element.id
        || "";
      const optionValue = element.dataset?.contextOption
        || element.querySelector?.("[data-choice-answer]")?.value
        || "";
      const kind = element.dataset?.contextKind
        || (scope === "quiz" && optionValue ? "quiz-option" : "")
        || (scope === "quiz" ? "quiz" : "")
        || (isFrame || tag === "canvas" ? "viewport" : "")
        || (latex ? "formula" : "object");
      return normalizeContextRef({
        ...contextDefaults(),
        kind,
        scope,
        semanticId,
        questionId: element.dataset?.contextQuestion || questionCard?.dataset?.question || "",
        optionValue,
        label: domLabelForElement(element),
        excerpt: compactMultiline(element.dataset?.contextText || element.textContent || "", 900),
        latex,
        confidence: isCoarse ? "low" : semanticId ? "high" : "medium",
        coarse: isCoarse
      });
    }

    function pinElement(element) {
      clearSelectedElement();
      selectedElement = element || null;
      selectedElement?.classList.add("cq-context-selected");
    }

    function removeFallbackOverlays() {
      fallbackOverlays.forEach((overlay) => overlay.remove());
      fallbackOverlays.clear();
    }

    function fallbackOverlayForFrame(frame) {
      const host = frame.parentElement;
      if (!host || host.querySelector(":scope > .cq-frame-pick-fallback")) return;
      const overlay = doc.createElement("button");
      overlay.type = "button";
      overlay.className = "cq-frame-pick-fallback";
      overlay.dataset.contextId = frame.dataset.contextId || `interactive-frame:${currentCourseMeta().sceneType || "current"}`;
      overlay.dataset.contextKind = "viewport";
      overlay.dataset.contextScope = "interactive";
      overlay.dataset.contextConfidence = "low";
      overlay.dataset.contextLabel = frame.title || "当前互动课件画面";
      overlay.setAttribute("aria-label", `选择${frame.title || "当前互动课件画面"}作为提问上下文`);
      overlay.innerHTML = "<span>选择当前画面</span><small>定位较粗</small>";
      host.appendChild(overlay);
      fallbackOverlays.add(overlay);
    }

    function sendPickStateToFrames(active) {
      currentFrames().forEach((frame) => {
        if (bridgeFrames.has(frame)) {
          postFrame(frame, {
            type: active ? "cq:context-pick-begin" : "cq:context-pick-cancel",
            singleShot: true
          });
        } else if (active) {
          fallbackOverlayForFrame(frame);
        }
      });
      if (!active) removeFallbackOverlays();
    }

    function deactivatePickListeners() {
      if (!listenersActive) return;
      listenersActive = false;
      doc.removeEventListener("pointermove", onPickPointerMove, true);
      doc.removeEventListener("click", onPickClick, true);
      doc.removeEventListener("keydown", onPickKeyDown, true);
      resolveRoot()?.classList.remove("cq-context-picking");
      clearHover();
      clearQuestionCandidates();
      sendPickStateToFrames(false);
      notify("onPickingChange", { active: false, state: picker.getState() });
    }

    function activatePickListeners() {
      if (listenersActive) return;
      listenersActive = true;
      doc.addEventListener("pointermove", onPickPointerMove, true);
      doc.addEventListener("click", onPickClick, true);
      doc.addEventListener("keydown", onPickKeyDown, true);
      resolveRoot()?.classList.add("cq-context-picking");
      markQuestionCandidates();
      sendPickStateToFrames(true);
      notify("onPickingChange", { active: true, state: picker.getState() });
    }

    function finishPickedContext(contextRef, element = null) {
      const consumed = picker.consume(normalizeContextRef(contextRef, contextDefaults()));
      if (!consumed) return null;
      selectedContext = consumed;
      if (element) pinElement(element);
      deactivatePickListeners();
      notify("onContext", consumed);
      return consumed;
    }

    function onPickPointerMove(event) {
      const target = elementContextTarget(event.target, event);
      if (target === hoveredElement || target === pendingHoverElement) return;
      clearHover();
      if (!target) return;
      pendingHoverElement = target;
      const point = { clientX: event.clientX, clientY: event.clientY };
      hoverTimer = win.setTimeout(() => {
        pendingHoverElement = null;
        hoveredElement = target;
        hoveredElement.classList.add("cq-context-hover");
        showPickPreview(hoveredElement, point);
      }, 120);
    }

    function onPickClick(event) {
      if (picker.getState().phase !== "picking") return;
      const target = elementContextTarget(event.target, event);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      finishPickedContext(contextFromElement(target), target);
    }

    function onPickKeyDown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelObjectPick("escape");
    }

    function selectionRect(range, frame = null, bridgeRect = null) {
      const rect = bridgeRect || range?.getBoundingClientRect?.();
      if (!rect) return null;
      const frameRect = frame?.getBoundingClientRect?.();
      return {
        left: Number(rect.left || 0) + Number(frameRect?.left || 0),
        top: Number(rect.top || 0) + Number(frameRect?.top || 0),
        right: Number(rect.right || rect.left || 0) + Number(frameRect?.left || 0),
        bottom: Number(rect.bottom || rect.top || 0) + Number(frameRect?.top || 0),
        width: Number(rect.width || 0),
        height: Number(rect.height || 0)
      };
    }

    function selectionLocator(range, host, source = "document") {
      if (!range || !host || !host.contains?.(elementFromNode(range.startContainer))) return null;
      if (!host.contains?.(elementFromNode(range.endContainer))) return null;
      try {
        const before = doc.createRange();
        before.selectNodeContents(host);
        before.setEnd(range.startContainer, range.startOffset);
        const startOffset = before.toString().length;
        const exact = String(range.toString() || "").slice(0, 900);
        const hostText = String(host.textContent || "");
        before.detach?.();
        return {
          source: source === "iframe" ? "iframe" : "document",
          semanticId: compactText(
            host.dataset?.contextId
            || (host.dataset?.question ? `quiz:${host.dataset.question}` : ""),
            180
          ),
          exact,
          prefix: hostText.slice(Math.max(0, startOffset - 64), startOffset),
          suffix: hostText.slice(startOffset + exact.length, startOffset + exact.length + 64),
          startOffset,
          endOffset: startOffset + exact.length
        };
      } catch {
        return null;
      }
    }

    function noteHost(locator = {}, scopeRoot = resolveRoot()) {
      if (!scopeRoot) return null;
      const semanticId = compactText(locator.semanticId, 180);
      if (!semanticId) return scopeRoot;
      const escape = win.CSS?.escape
        ? win.CSS.escape(semanticId)
        : semanticId.replace(/["\\]/g, "\\$&");
      return scopeRoot.querySelector?.(`[data-context-id="${escape}"]`) || scopeRoot;
    }

    function textNodes(host) {
      if (!host) return [];
      const walker = doc.createTreeWalker(host, win.NodeFilter?.SHOW_TEXT || 4, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!node.nodeValue || !parent || parent.closest("script, style, template, noscript")) {
            return win.NodeFilter?.FILTER_REJECT || 2;
          }
          return win.NodeFilter?.FILTER_ACCEPT || 1;
        }
      });
      const nodes = [];
      let current = walker.nextNode();
      while (current) {
        nodes.push(current);
        current = walker.nextNode();
      }
      return nodes;
    }

    function rangeFromOffsets(host, startOffset, endOffset) {
      const start = Number(startOffset);
      const end = Number(endOffset);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return null;
      const nodes = textNodes(host);
      let cursor = 0;
      let startNode = null;
      let endNode = null;
      let startInNode = 0;
      let endInNode = 0;
      for (const node of nodes) {
        const length = node.nodeValue.length;
        if (!startNode && start >= cursor && start <= cursor + length) {
          startNode = node;
          startInNode = start - cursor;
        }
        if (end >= cursor && end <= cursor + length) {
          endNode = node;
          endInNode = end - cursor;
          break;
        }
        cursor += length;
      }
      if (!startNode || !endNode) return null;
      try {
        const range = doc.createRange();
        range.setStart(startNode, startInNode);
        range.setEnd(endNode, endInNode);
        return range;
      } catch {
        return null;
      }
    }

    function rangeForLocator(locator = {}, scopeRoot = resolveRoot()) {
      const host = noteHost(locator, scopeRoot);
      if (!host) return null;
      const exact = String(locator.exact || "");
      let startOffset = Number(locator.startOffset);
      let endOffset = Number(locator.endOffset);
      const hostText = String(host.textContent || "");
      if (
        Number.isInteger(startOffset)
        && Number.isInteger(endOffset)
        && startOffset >= 0
        && endOffset > startOffset
        && (!exact || hostText.slice(startOffset, endOffset) === exact)
      ) {
        const ranged = rangeFromOffsets(host, startOffset, endOffset);
        if (ranged) return ranged;
      }
      if (!exact) return null;
      const prefix = String(locator.prefix || "");
      const suffix = String(locator.suffix || "");
      const candidates = [];
      let cursor = 0;
      while (cursor <= hostText.length - exact.length) {
        const index = hostText.indexOf(exact, cursor);
        if (index < 0) break;
        let score = 0;
        if (prefix && hostText.slice(Math.max(0, index - prefix.length), index).endsWith(prefix)) score += 2;
        if (suffix && hostText.slice(index + exact.length, index + exact.length + suffix.length).startsWith(suffix)) score += 2;
        candidates.push({ index, score });
        cursor = index + Math.max(1, exact.length);
      }
      candidates.sort((left, right) => right.score - left.score || left.index - right.index);
      if (!candidates.length) return null;
      startOffset = candidates[0].index;
      endOffset = startOffset + exact.length;
      return rangeFromOffsets(host, startOffset, endOffset);
    }

    function clearNoteHighlights() {
      NOTE_HIGHLIGHT_NAMES.forEach((name) => {
        try { win.CSS?.highlights?.delete?.(name); } catch {}
      });
      noteFallbackElements.forEach((element) => element.classList.remove("cq-learning-note-fallback"));
      noteFallbackElements.clear();
      renderedNoteRanges = [];
    }

    function renderNotes(notes = []) {
      renderedNotes = Array.isArray(notes) ? notes.filter(Boolean) : [];
      clearNoteHighlights();
      const rangesByColor = new Map([
        ["amber", []],
        ["mint", []],
        ["blue", []],
        ["pink", []]
      ]);
      renderedNotes.forEach((note) => {
        if (note.locator?.source === "iframe") return;
        const range = rangeForLocator(note.locator || {});
        if (range) {
          const color = rangesByColor.has(note.color) ? note.color : "amber";
          rangesByColor.get(color).push(range);
          renderedNoteRanges.push({ note, range });
          return;
        }
        const host = noteHost(note.locator || {});
        if (host && host !== resolveRoot()) {
          host.classList.add("cq-learning-note-fallback");
          noteFallbackElements.add(host);
        }
      });
      if (win.CSS?.highlights && typeof win.Highlight === "function") {
        rangesByColor.forEach((ranges, color) => {
          if (!ranges.length) return;
          try {
            win.CSS.highlights.set(NOTE_HIGHLIGHT_NAMES.get(color), new win.Highlight(...ranges));
          } catch {}
        });
      }
      const frameNotes = renderedNotes
        .filter((note) => note.locator?.source === "iframe")
        .map((note) => ({
          id: compactText(note.id, 180),
          color: ["amber", "mint", "blue", "pink"].includes(note.color) ? note.color : "amber",
          locator: note.locator
        }));
      currentFrames().forEach((frame) => {
        if (bridgeFrames.has(frame)) {
          postFrame(frame, { type: "cq:notes-sync", notes: frameNotes });
        }
      });
      return renderedNoteRanges.length;
    }

    function noteAtPoint(clientX, clientY) {
      return renderedNoteRanges.find(({ range }) => Array.from(range.getClientRects?.() || []).some((rect) => (
        clientX >= rect.left - 3
        && clientX <= rect.right + 3
        && clientY >= rect.top - 3
        && clientY <= rect.bottom + 3
      ))) || null;
    }

    function restoreNote(note = {}) {
      const locator = note.locator || {};
      if (locator.source === "iframe") {
        currentFrames().forEach((frame) => {
          if (bridgeFrames.has(frame)) {
            frame.scrollIntoView?.({ behavior: "smooth", block: "center" });
            postFrame(frame, { type: "cq:note-restore", note: { id: note.id || "", locator } });
          }
        });
      } else {
        const range = rangeForLocator(locator);
        const element = elementFromNode(range?.startContainer) || noteHost(locator);
        element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      }
      if (note.contextRef) restoreContext(note.contextRef);
      return Boolean(note.contextRef || locator.exact);
    }

    function captureTextSelection(selection = win.getSelection?.()) {
      if (!selection || selection.rangeCount < 1 || selection.isCollapsed) return null;
      const excerpt = compactMultiline(selection.toString(), 900);
      if (!excerpt) return null;
      const range = selection.getRangeAt(0);
      const start = elementFromNode(range.startContainer);
      const end = elementFromNode(range.endContainer);
      const root = resolveRoot();
      const sidebar = resolveSidebarRoot();
      if (
        !root?.contains?.(start)
        || sidebar?.contains?.(start)
        || isQuestionExcluded(start)
        || isQuestionExcluded(end)
      ) return null;
      const host = start.closest?.("[data-context-id], [data-question], .slide-element, .question-card, .resource-body") || start;
      const latex = rawLatexFromRange(range);
      const ref = normalizeContextRef({
        ...contextDefaults(),
        kind: latex ? "formula" : "text",
        scope: host.dataset?.contextScope || domScopeForElement(host),
        semanticId: host.dataset?.contextId || (host.dataset?.question ? `quiz:${host.dataset.question}` : ""),
        questionId: host.dataset?.contextQuestion || host.closest?.("[data-question]")?.dataset?.question || "",
        label: host.dataset?.contextLabel || domLabelForElement(host),
        excerpt,
        latex,
        confidence: host.dataset?.contextId || host.dataset?.question ? "high" : "medium"
      });
      const payload = {
        contextRef: ref,
        rect: selectionRect(range),
        source: "document",
        locator: selectionLocator(range, host, "document")
      };
      notify("onTextSelection", payload);
      return payload;
    }

    function beginObjectPick(config = {}) {
      picker.begin({ singleShot: config.singleShot !== false });
      activatePickListeners();
      return picker.getState();
    }

    function cancelObjectPick(reason = "cancelled") {
      const changed = picker.cancel(reason);
      deactivatePickListeners();
      return changed;
    }

    function captureRecentInteraction() {
      if (!recentInteraction) return null;
      const current = currentCourseMeta();
      if (recentInteraction.unitId && current.unitId && recentInteraction.unitId !== current.unitId) return null;
      const age = Date.now() - Date.parse(recentInteraction.createdAt || "");
      if (!Number.isFinite(age) || age > 10 * 60 * 1000) return null;
      return recentInteraction;
    }

    function updateRecentInteraction(value = {}) {
      const rawState = value.state || value.value || {};
      const parameter = friendlyInteractionLabel(
        rawState.parameter || rawState.param || value.parameter || value.param || value.label || "参数"
      );
      recentInteraction = normalizeContextRef({
        ...contextDefaults(),
        kind: "interaction",
        scope: "interactive",
        semanticId: value.semanticId || "",
        label: parameter,
        excerpt: value.excerpt || "",
        confidence: value.confidence || (value.semanticId ? "medium" : "low"),
        state: {
          parameter,
          oldValue: rawState.oldValue ?? rawState.old ?? "",
          newValue: rawState.newValue ?? rawState.new ?? value.currentValue ?? "",
          min: rawState.min ?? "",
          max: rawState.max ?? "",
          action: rawState.action || value.action || ""
        }
      });
      notify("onRecentInteraction", recentInteraction);
      return recentInteraction;
    }

    function restoreContext(contextRef) {
      const ref = normalizeContextRef(contextRef, contextDefaults());
      selectedContext = ref;
      clearSelectedElement();
      const root = resolveRoot();
      if (ref.semanticId && root?.querySelector) {
        const escape = win.CSS?.escape
          ? win.CSS.escape(ref.semanticId)
          : ref.semanticId.replace(/["\\]/g, "\\$&");
        const element = root.querySelector(`[data-context-id="${escape}"]`);
        if (element) pinElement(element);
      }
      currentFrames().forEach((frame) => {
        if (bridgeFrames.has(frame)) {
          postFrame(frame, {
            type: "cq:context-restore",
            semanticId: ref.semanticId
          });
        }
      });
      return ref;
    }

    function handleBridgeMessage(event) {
      const frame = trustedFrameForSource(event.source);
      if (!frame || !event.data || typeof event.data !== "object") return;
      const type = String(event.data.type || "");
      if (!type.startsWith("cq:")) return;

      if (type === "cq:context-pick-state") {
        if (event.data.active === false && picker.getState().phase === "picking") {
          cancelObjectPick(event.data.reason || "iframe-cancel");
        }
        return;
      }

      if (type === "cq:bridge-ready") {
        bridgeFrames.add(frame);
        frame.dataset.cqContextBridge = "ready";
        frame.parentElement?.querySelector(":scope > .cq-frame-pick-fallback")?.remove();
        if (picker.getState().phase === "picking") {
          postFrame(frame, { type: "cq:context-pick-begin", singleShot: true });
        }
        postFrame(frame, {
          type: "cq:notes-sync",
          notes: renderedNotes
            .filter((note) => note.locator?.source === "iframe")
            .map((note) => ({
              id: compactText(note.id, 180),
              color: ["amber", "mint", "blue", "pink"].includes(note.color) ? note.color : "amber",
              locator: note.locator
            }))
        });
        return;
      }

      if (type === "cq:text-selection") {
        const ref = normalizeContextRef(event.data.contextRef || {}, contextDefaults({
          scope: "interactive",
          sceneType: frame.dataset.contextSceneType || currentCourseMeta().sceneType || ""
        }));
        notify("onTextSelection", {
          contextRef: ref,
          rect: selectionRect(null, frame, event.data.rect || null),
          source: "iframe",
          locator: event.data.locator && typeof event.data.locator === "object"
            ? { ...event.data.locator, source: "iframe" }
            : null
        });
        return;
      }

      if (type === "cq:note-open") {
        const note = renderedNotes.find((item) => item.id === String(event.data.noteId || ""));
        if (note) {
          notify("onNoteSelect", {
            note,
            rect: selectionRect(null, frame, event.data.rect || null),
            source: "iframe"
          });
        }
        return;
      }

      if (type === "cq:context-picked" && picker.getState().phase === "picking") {
        frame.classList.add("cq-context-selected");
        finishPickedContext(event.data.contextRef || {
          kind: "viewport",
          scope: "interactive",
          label: frame.title || "当前互动课件画面",
          confidence: "low"
        });
        return;
      }

      if (type === "cq:interaction" && event.data.eventType === "parameter_commit") {
        updateRecentInteraction(event.data.contextRef || event.data.payload || {});
      }
    }

    function handleDocumentPointerUp(event) {
      if (picker.getState().phase === "picking") return;
      if (resolveSidebarRoot()?.contains?.(event.target)) return;
      const selection = win.getSelection?.();
      if (!selection || selection.isCollapsed) {
        const hit = noteAtPoint(event.clientX, event.clientY);
        if (hit) {
          const rect = hit.range.getBoundingClientRect();
          notify("onNoteSelect", { note: hit.note, rect, source: "document" });
          return;
        }
      }
      win.setTimeout(() => captureTextSelection(), 0);
    }

    function handleDocumentKeyUp(event) {
      if (!event.shiftKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      win.setTimeout(() => captureTextSelection(), 0);
    }

    win.addEventListener("message", handleBridgeMessage);
    doc.addEventListener("pointerup", handleDocumentPointerUp, true);
    doc.addEventListener("keyup", handleDocumentKeyUp, true);

    return {
      captureTextSelection,
      beginObjectPick,
      captureRecentInteraction,
      cancelObjectPick,
      restoreContext,
      restoreNote,
      renderNotes,
      updateRecentInteraction,
      getCurrentContext() {
        return selectedContext;
      },
      getPickState() {
        return picker.getState();
      },
      clearContext() {
        selectedContext = null;
        clearSelectedElement();
      },
      syncUnit() {
        const current = currentCourseMeta();
        if (selectedContext?.unitId && current.unitId && selectedContext.unitId !== current.unitId) {
          selectedContext = null;
          clearSelectedElement();
        }
        if (recentInteraction?.unitId && current.unitId && recentInteraction.unitId !== current.unitId) {
          recentInteraction = null;
          notify("onRecentInteraction", null);
        }
        cancelObjectPick("unit-change");
      },
      destroy() {
        cancelObjectPick("destroy");
        clearSelectedElement();
        clearNoteHighlights();
        removeFallbackOverlays();
        clearQuestionCandidates();
        pickPreview?.remove();
        pickPreview = null;
        win.removeEventListener("message", handleBridgeMessage);
        doc.removeEventListener("pointerup", handleDocumentPointerUp, true);
        doc.removeEventListener("keyup", handleDocumentKeyUp, true);
      }
    };
  }

  return {
    BRIDGE_VERSION,
    SCHEMA_VERSION,
    compactText,
    contextThreadKey,
    createBrowserController,
    createObjectPickStateMachine,
    formatInteractionChange,
    friendlyInteractionLabel,
    friendlySceneLabel,
    isQuestionExcluded,
    normalizeLauncherPlacement,
    normalizeContextRef,
    suggestionsForContext
  };
});
