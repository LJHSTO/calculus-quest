(function initCoursewareContextCore(global, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (global && global.document) global.CoursewareContextCore = Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : this, function coursewareContextFactory() {
  const SCHEMA_VERSION = 1;
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
      return [
        "解释题意",
        "给我一级提示",
        "检查我的第一步",
        "这个选项表达了什么？"
      ];
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
    let hoverTimer = null;
    let listenersActive = false;

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
    }

    function clearSelectedElement() {
      if (selectedElement) selectedElement.classList.remove("cq-context-selected");
      selectedElement = null;
      currentFrames().forEach((frame) => {
        frame.classList.remove("cq-context-selected");
        postFrame(frame, { type: "cq:context-clear" });
      });
    }

    function elementContextTarget(target) {
      const root = resolveRoot();
      const sidebar = resolveSidebarRoot();
      const element = elementFromNode(target);
      if (!root || !element || !root.contains(element)) return null;
      if (sidebar?.contains?.(element)) return null;
      if (isQuestionExcluded(element)) return null;
      return element.closest?.(
        "[data-context-id], [data-question], .slide-element, "
        + ".question-card fieldset label, iframe.embed-frame, [data-courseware-frame], "
        + "[data-slide-canvas], .quiz-card, .resource-body"
      ) || null;
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
      doc.removeEventListener("pointerover", onPickPointerOver, true);
      doc.removeEventListener("pointerout", onPickPointerOut, true);
      doc.removeEventListener("click", onPickClick, true);
      doc.removeEventListener("keydown", onPickKeyDown, true);
      resolveRoot()?.classList.remove("cq-context-picking");
      clearHover();
      sendPickStateToFrames(false);
      notify("onPickingChange", { active: false, state: picker.getState() });
    }

    function activatePickListeners() {
      if (listenersActive) return;
      listenersActive = true;
      doc.addEventListener("pointerover", onPickPointerOver, true);
      doc.addEventListener("pointerout", onPickPointerOut, true);
      doc.addEventListener("click", onPickClick, true);
      doc.addEventListener("keydown", onPickKeyDown, true);
      resolveRoot()?.classList.add("cq-context-picking");
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

    function onPickPointerOver(event) {
      const target = elementContextTarget(event.target);
      if (!target || target === hoveredElement) return;
      clearHover();
      hoverTimer = win.setTimeout(() => {
        hoveredElement = target;
        hoveredElement.classList.add("cq-context-hover");
      }, 120);
    }

    function onPickPointerOut(event) {
      const target = elementContextTarget(event.target);
      if (!target || target !== hoveredElement) {
        if (!hoveredElement) clearTimeout(hoverTimer);
        return;
      }
      const related = elementFromNode(event.relatedTarget);
      if (related && target.contains(related)) return;
      clearHover();
    }

    function onPickClick(event) {
      if (picker.getState().phase !== "picking") return;
      const target = elementContextTarget(event.target);
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
      const payload = { contextRef: ref, rect: selectionRect(range), source: "document" };
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
      const parameter = rawState.parameter || rawState.param || value.parameter || value.param || value.label || "参数";
      recentInteraction = normalizeContextRef({
        ...contextDefaults(),
        kind: "interaction",
        scope: "interactive",
        semanticId: value.semanticId || "",
        label: value.label || `刚才调整了 ${parameter}`,
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
          source: "iframe"
        });
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
        removeFallbackOverlays();
        win.removeEventListener("message", handleBridgeMessage);
        doc.removeEventListener("pointerup", handleDocumentPointerUp, true);
        doc.removeEventListener("keyup", handleDocumentKeyUp, true);
      }
    };
  }

  return {
    SCHEMA_VERSION,
    compactText,
    contextThreadKey,
    createBrowserController,
    createObjectPickStateMachine,
    isQuestionExcluded,
    normalizeContextRef,
    suggestionsForContext
  };
});
