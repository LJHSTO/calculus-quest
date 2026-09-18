(function initCalculusQuestCoursewareBridge() {
  if (window.top === window.self || window.__calculusQuestContextBridge) return;
  window.__calculusQuestContextBridge = true;

  const PARENT = window.parent;
  const HOVER_DELAY_MS = 120;
  const GRAPH_NODE_SELECTOR = "svg .node-group, svg #nodesGroup > g[data-id]";
  const rangeStarts = new WeakMap();
  const pointerStarts = new Map();
  const lastParameterInputAt = new WeakMap();
  const challengeAttempts = new Map();
  let picking = false;
  let singleShot = true;
  let hoverTimer = null;
  let hoverTarget = null;
  let selectedTarget = null;
  let listenersActive = false;
  let selectionReportTimer = null;
  let pickPreview = null;
  let coursewareLayoutRepairScheduled = false;
  const candidateElements = new Set();
  const noteFallbackElements = new Set();
  let renderedNotes = [];
  let renderedNoteRanges = [];
  const INTERACTIVE_ROLE_SELECTOR = [
    "[role='button']",
    "[role='slider']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='switch']",
    "[role='tab']",
    "[role='option']",
    "[role='img']"
  ].join(",");
  const CANDIDATE_SELECTOR = [
    "[data-cq-context-id]",
    "[data-context-id]",
    "[aria-label]",
    INTERACTIVE_ROLE_SELECTOR,
    "button",
    "a",
    "input",
    "select",
    "textarea",
    "label",
    "canvas",
    "svg",
    "img",
    "figure",
    "table"
  ].join(",");

  function compactText(value = "", limit = 280) {
    return String(value ?? "")
      .replace(/\u0000/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  }

  function compactMultiline(value = "", limit = 900) {
    return String(value ?? "")
      .replace(/\u0000/g, "")
      .replace(/\r\n?/g, "\n")
      .trim()
      .slice(0, limit);
  }

  function cleanVisibleLabel(value = "", limit = 280) {
    return compactText(value, limit)
      .replace(/^(?:(?:\p{Extended_Pictographic}|\uFE0F)|[~◇※⬡•])+\s*/gu, "")
      .trim();
  }

  function post(type, payload = {}) {
    PARENT.postMessage({ type, ...payload }, "*");
  }

  function reportChallengeResult(detail = {}) {
    const challengeId = compactText(
      detail.challengeId || detail.questionId || "courseware-challenge",
      120
    );
    const isCorrect = detail.isCorrect === true;
    const numericScore = Number(detail.score);
    const numericMaxScore = Number(detail.maxScore);
    const normalized = {
      challenge_id: challengeId,
      question_id: compactText(detail.questionId || challengeId, 120),
      is_correct: isCorrect,
      score: Number.isFinite(numericScore) ? numericScore : (isCorrect ? 1 : 0),
      max_score: Number.isFinite(numericMaxScore) ? numericMaxScore : 1,
      result: compactText(detail.result || (isCorrect ? "correct" : "incorrect"), 80)
    };

    if (typeof window.OpenMaicLearningEvidence?.recordChallenge === "function") {
      window.OpenMaicLearningEvidence.recordChallenge(normalized);
      return true;
    }

    const attemptNumber = (challengeAttempts.get(challengeId) || 0) + 1;
    challengeAttempts.set(challengeId, attemptNumber);
    post("maic_learning_event", {
      payload: {
        event_type: "challenge_result",
        ...normalized,
        attempt_id: compactText(
          detail.attemptId || challengeId + "-" + attemptNumber,
          180
        ),
        attempt_number: attemptNumber,
        timestamp: new Date().toISOString()
      }
    });
    return true;
  }

  Object.defineProperty(window, "__calculusQuestReportChallengeResult", {
    configurable: true,
    value: reportChallengeResult
  });

  function removeImportantInlineProperties(element, properties = []) {
    if (!element?.style) return false;
    let repaired = false;
    properties.forEach((property) => {
      if (element.style.getPropertyPriority(property) !== "important") return;
      element.style.removeProperty(property);
      repaired = true;
    });
    return repaired;
  }

  function repairRiskMasterLayout() {
    const container = document.querySelector("#game-container");
    const chart = document.querySelector("#capitalChart");
    const chartPanel = chart?.closest?.("#chart-panel");
    const mainArea = document.querySelector("#main-area");
    const contractArea = document.querySelector("#contract-area");
    const controls = document.querySelector("#controls-panel");
    const reserveSlider = document.querySelector("#reserve-slider");
    if (
      !container
      || !chart
      || !chartPanel
      || !mainArea
      || !contractArea
      || !controls
      || !reserveSlider
      || mainArea.parentElement !== container
      || controls.parentElement !== container
      || chartPanel.parentElement !== mainArea
      || contractArea.parentElement !== mainArea
      || !controls.contains(reserveSlider)
    ) return false;

    let repaired = false;
    repaired = removeImportantInlineProperties(container, [
      "display",
      "flex-direction",
      "flex-wrap",
      "align-items",
      "width",
      "max-width",
      "min-width",
      "min-height",
      "height",
      "max-height",
      "overflow"
    ]) || repaired;
    repaired = removeImportantInlineProperties(controls, [
      "flex",
      "width",
      "min-width",
      "max-width",
      "height",
      "min-height",
      "max-height",
      "align-self",
      "order",
      "margin",
      "overflow-x",
      "overflow-y"
    ]) || repaired;
    repaired = removeImportantInlineProperties(mainArea, [
      "flex",
      "width",
      "min-width",
      "min-height",
      "height",
      "max-height",
      "align-self",
      "order",
      "margin",
      "overflow"
    ]) || repaired;
    repaired = removeImportantInlineProperties(chartPanel, [
      "min-width",
      "min-height",
      "height",
      "max-height",
      "align-self"
    ]) || repaired;
    repaired = removeImportantInlineProperties(chart, [
      "display",
      "width",
      "height",
      "max-width",
      "max-height"
    ]) || repaired;

    [
      [container, "data-openmaic-responsive-layout"],
      [controls, "data-openmaic-responsive-panel"],
      [controls, "data-openmaic-overlay-panel"],
      [mainArea, "data-openmaic-responsive-canvas"]
    ].forEach(([element, attribute]) => {
      if (!element.hasAttribute(attribute)) return;
      element.removeAttribute(attribute);
      repaired = true;
    });
    return repaired;
  }

  function scheduleCoursewareLayoutRepair() {
    if (coursewareLayoutRepairScheduled) return;
    coursewareLayoutRepairScheduled = true;
    window.requestAnimationFrame(() => {
      repairDisplacementOverlays();
      repairAreaSimulationLayout();
      repairRiskMasterLayout();
      window.requestAnimationFrame(() => {
        repairAreaSimulationLayout();
        repairRiskMasterLayout();
      });
      window.setTimeout(() => {
        repairAreaSimulationLayout();
        repairRiskMasterLayout();
      }, 80);
      window.setTimeout(() => {
        repairAreaSimulationLayout();
        repairRiskMasterLayout();
        coursewareLayoutRepairScheduled = false;
      }, 380);
    });
  }

  function repairDisplacementOverlays() {
    if (!document.querySelector("#btn-forward") || !document.querySelector("#track-canvas")) return;
    // Exported controls create high stacking contexts; modal surfaces must be siblings.
    ["start-overlay", "level-overlay", "pause-overlay"].forEach((id) => {
      const overlay = document.getElementById(id);
      if (overlay && overlay.parentElement !== document.body) document.body.appendChild(overlay);
    });
  }

  function repairAreaSimulationLayout() {
    const container = document.querySelector(".app-container");
    const controls = container?.querySelector(":scope > #controls");
    const pane = container?.querySelector(":scope > #canvas-container");
    const canvas = pane?.querySelector(":scope > #canvas");
    if (!controls?.querySelector("#partition_count-slider") || !canvas) return;
    // The exported responsive helper otherwise stacks this scene and compresses its plot.
    const set = (element, values) => Object.entries(values).forEach(([key, value]) => {
      if (element.style.getPropertyValue(key) !== value
        || element.style.getPropertyPriority(key) !== "important") {
        element.style.setProperty(key, value, "important");
      }
    });
    const stacked = window.innerWidth < 600;
    // Embedded desktop panes can cross the export's mobile breakpoint. The
    // platform keeps controls in-flow, so its overlay toggle has no role here.
    const mobileToggle = document.querySelector("body > .mobile-toggle");
    if (mobileToggle) set(mobileToggle, { display: "none" });
    set(document.body, { margin: "0", height: `${window.innerHeight}px`, overflow: "hidden" });
    set(container, {
      display: "flex", "flex-direction": stacked ? "column" : "row",
      height: `${window.innerHeight}px`, "min-height": "0", "max-height": "none",
      overflow: "hidden", "align-items": "stretch"
    });
    set(controls, {
      flex: stacked ? "0 0 44%" : "0 0 280px", width: stacked ? "100%" : "280px",
      "min-width": "0", "max-width": "100%", height: "auto",
      "min-height": "0", "max-height": "100%", "overflow-y": "auto", order: "0",
      position: "relative", inset: "auto"
    });
    set(pane, {
      flex: "1 1 0px", width: "auto", height: "auto", "min-width": "0",
      "min-height": "0", "max-height": "100%", position: "relative", order: "1",
      overflow: "hidden"
    });
    set(canvas, {
      position: "absolute", inset: "0", width: "100%", height: "100%",
      "max-height": "none", "object-fit": "fill"
    });
  }

  function applyHostLayout(payload = {}) {
    const viewport = payload.viewport && typeof payload.viewport === "object"
      ? {
          width: Number(payload.viewport.width) || window.innerWidth,
          height: Number(payload.viewport.height) || window.innerHeight
        }
      : {
          width: window.innerWidth,
          height: window.innerHeight
        };
    const detail = {
      reason: compactText(payload.reason || "host-layout", 80),
      viewport,
      lessonCollapsed: Boolean(payload.lessonCollapsed),
      chapterCollapsed: Boolean(payload.chapterCollapsed)
    };
    window.__calculusQuestHostLayout = detail;
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new CustomEvent("cq:host-layout", { detail }));
    });
  }

  function elementFromNode(node) {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
  }

  function className(element) {
    const value = element?.className;
    if (typeof value === "string") return value;
    return value?.baseVal || "";
  }

  function excluded(element) {
    if (!element) return true;
    if (element.closest?.("[data-cq-no-question], script, style, template, noscript")) return true;
    const tag = element.tagName?.toLowerCase();
    return tag === "html" || tag === "body";
  }

  function graphNodeKey(element) {
    if (!element?.matches?.(GRAPH_NODE_SELECTOR)) return "";
    return element.dataset.node || element.dataset.nodeId || element.dataset.id || element.id || "";
  }

  function semanticId(element) {
    if (!element) return "";
    const explicit = element.getAttribute?.("data-cq-context-id")
      || element.getAttribute?.("data-context-id");
    if (explicit) return `interactive:data:${compactText(explicit, 160)}`;
    const nodeKey = graphNodeKey(element);
    if (nodeKey) return `interactive:node:${compactText(nodeKey, 160)}`;
    if (element.id) return `interactive:id:${compactText(element.id, 160)}`;
    const name = element.getAttribute?.("name");
    if (name) return `interactive:name:${compactText(name, 140)}`;
    const role = element.getAttribute?.("role");
    const label = element.getAttribute?.("aria-label") || element.getAttribute?.("title");
    if (role && label) return `interactive:role:${compactText(role, 40)}:${compactText(label, 100)}`;
    return "";
  }

  function labelFor(element) {
    if (!element) return "";
    const id = element.id;
    const labelByFor = id
      ? Array.from(document.querySelectorAll("label[for]")).find((label) => label.htmlFor === id)
      : null;
    const wrappingLabel = element.closest?.("label");
    const tag = element.tagName?.toLowerCase();
    return cleanVisibleLabel(
      element.getAttribute?.("data-cq-context-label")
      || element.getAttribute?.("aria-label")
      || element.getAttribute?.("title")
      || labelByFor?.textContent
      || wrappingLabel?.textContent
      || (graphNodeKey(element) ? element.querySelector?.(".node-label")?.textContent : "")
      || (tag === "canvas" ? "当前画布" : "")
      || (tag === "svg" ? "当前图形" : "")
      || element.getAttribute?.("alt")
      || element.textContent
      || element.getAttribute?.("placeholder")
      || element.getAttribute?.("name")
      || element.id
      || className(element)
      || tag
      || "互动对象",
      280
    );
  }

  function safeValue(element) {
    if (!element || !("value" in element)) return "";
    const tag = element.tagName?.toLowerCase();
    const type = String(element.getAttribute?.("type") || "").toLowerCase();
    if (type === "password") return element.value ? "已输入" : "空";
    if (type === "checkbox" || type === "radio") return element.checked ? "选中" : "未选中";
    if (tag === "select") return compactText(element.selectedOptions?.[0]?.textContent || element.value, 120);
    if (["range", "number", "color", "date", "time", "month", "week"].includes(type)) {
      return compactText(element.value, 120);
    }
    return "";
  }

  function rawLatex(element) {
    const host = element?.closest?.("[data-context-latex], .katex") || null;
    if (!host) return "";
    const explicit = host.getAttribute?.("data-context-latex");
    if (explicit) return compactMultiline(explicit, 600);
    return compactMultiline(
      host.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent || "",
      600
    );
  }

  function contextTarget(target) {
    const element = elementFromNode(target);
    if (!element || excluded(element)) return null;
    const candidate = element.closest?.([
      "[data-cq-context-id]",
      "[data-context-id]",
      "[aria-label]",
      INTERACTIVE_ROLE_SELECTOR,
      GRAPH_NODE_SELECTOR,
      "button",
      "a",
      "input",
      "select",
      "textarea",
      "label",
      "canvas",
      "svg",
      "img",
      "figure",
      "table"
    ].join(","));
    if (candidate && !excluded(candidate)) return candidate;
    return null;
  }

  function describe(element, kind = "") {
    const tag = element?.tagName?.toLowerCase() || "";
    const id = semanticId(element);
    const latex = rawLatex(element);
    const coarse = tag === "canvas" || (!id && ["svg", "figure"].includes(tag));
    return {
      schemaVersion: 1,
      kind: kind || (tag === "canvas" ? "viewport" : latex ? "formula" : "object"),
      scope: "interactive",
      semanticId: id,
      label: labelFor(element),
      excerpt: compactMultiline(element?.textContent || "", 900),
      latex,
      confidence: coarse ? "low" : id ? "medium" : "low",
      coarse,
      state: safeValue(element) ? {
        parameter: labelFor(element),
        oldValue: "",
        newValue: safeValue(element),
        min: compactText(element.min, 80),
        max: compactText(element.max, 80),
        action: ""
      } : null,
      createdAt: new Date().toISOString()
    };
  }

  function injectStyle() {
    if (document.getElementById("cq-context-bridge-style")) return;
    const style = document.createElement("style");
    style.id = "cq-context-bridge-style";
    style.textContent = [
      "@media(max-width:600px) {",
      "body:has(#diagram-svg) { display:flex !important; flex-direction:column !important; height:100dvh !important; overflow:hidden !important; }",
      "body:has(#diagram-svg) #main { flex:1 1 0 !important; min-height:0 !important; height:0 !important; }",
      "body:has(#diagram-svg) #header { min-height:48px !important; padding:6px !important; }",
      "body:has(#diagram-svg) #header button { min-width:64px !important; min-height:40px !important; white-space:nowrap !important; }",
      "body:has(#diagram-svg):has(#sidebar) #diagram-container { height:100% !important; max-height:100% !important; min-height:0 !important; }",
      "body:has(#diagram-svg) #diagram-svg { width:100% !important; height:100% !important; min-height:0 !important; max-height:100% !important; }",
      "body:has(#svgDiagram) #diagramArea { position:absolute !important; inset:0 !important; width:100vw !important; margin:0 !important; }",
      "body:has(#svgDiagram) #sidebar { position:fixed !important; inset:0 auto 0 0 !important; width:280px !important; z-index:2147483501 !important; }",
      "body:has(#svgDiagram) #sidebar.collapsed { transform:translateX(-100%) !important; visibility:hidden !important; }",
      "body:has(#svgDiagram) #toggleBtn { top:8px !important; left:auto !important; right:8px !important; }",
      "body:has(.main-wrap):has(#constant_C-slider) { display:flex !important; flex-direction:column !important; height:100dvh !important; overflow:hidden !important; }",
      "body:has(.main-wrap):has(#constant_C-slider) .main-wrap { flex:1 !important; height:0 !important; min-height:0 !important; overflow:hidden !important; }",
      "body:has(.main-wrap):has(#constant_C-slider) #canvasWrap { min-height:0 !important; }",
      "body:has(#width-slider):has(#game-canvas) { height:100dvh !important; overflow:hidden !important; }",
      "body:has(#width-slider):has(#game-canvas) #game-container { height:100dvh !important; min-height:0 !important; overflow:hidden !important; display:flex !important; flex-direction:column !important; }",
      "body:has(#width-slider):has(#game-canvas) #header { display:none !important; }",
      "body:has(#width-slider):has(#game-canvas) #game-container > div:has(> #game-canvas) { flex:1 1 0 !important; min-height:160px !important; height:auto !important; }",
      "body:has(#width-slider):has(#game-canvas) #controls-panel { flex:0 1 auto !important; max-height:210px !important; overflow-y:auto !important; }",
      "body:has(#width-slider):has(#game-canvas) .overlay-content { display:flex !important; flex-direction:column !important; padding:14px !important; }",
      "body:has(#width-slider):has(#game-canvas) #start-screen .overlay-content > :not(button):not(h2) { display:none !important; }",
      "body:has(#scale-canvas):has(#pieces-container) { height:100dvh !important; overflow:hidden !important; }",
      "body:has(#scale-canvas):has(#pieces-container) #game-container { height:100dvh !important; min-height:0 !important; overflow-y:auto !important; }",
      "body:has(#scale-canvas):has(#pieces-container) #scale-canvas { height:180px !important; min-height:180px !important; max-height:180px !important; }",
      "}",
      "body:has(#zoneDeterminate):has(#zoneError) #gameContainer { position:relative !important; width:100vw !important; height:100dvh !important; overflow:hidden !important; }",
      "body:has(#zoneDeterminate):has(#zoneError) #gameCanvas { position:absolute !important; inset:0 !important; width:100% !important; height:100% !important; min-height:0 !important; max-width:none !important; max-height:none !important; object-fit:fill !important; margin:0 !important; }",
      "body:has(#track-canvas):has(#btn-forward) #game-container { isolation:isolate !important; position:relative !important; z-index:0 !important; }",
      "body:has(#track-canvas):has(#btn-forward) :is(#start-overlay,#level-overlay,#pause-overlay,#result-overlay):not(.hidden) { position:fixed !important; inset:0 !important; z-index:2147483647 !important; display:flex !important; flex-direction:column !important; justify-content:safe center !important; align-items:center !important; overflow-y:auto !important; padding:16px !important; background:rgba(12,15,32,.97) !important; pointer-events:auto !important; }",
      "body:has(#track-canvas):has(#btn-forward) #result-overlay .result-card { box-sizing:border-box !important; width:min(680px,100%) !important; max-height:calc(100dvh - 32px) !important; padding:16px 24px !important; overflow:auto !important; pointer-events:auto !important; }",
      "body:has(#track-canvas):has(#btn-forward) #result-overlay :is(h2,.score,.stat,.explanation) { margin:6px 0 !important; padding:4px !important; }",
      "body:has(#track-canvas):has(#btn-forward) #result-btn { min-height:44px !important; position:sticky !important; bottom:0 !important; }",
      ".overlay .overlay-content, #startScreen .overlay-content, #start-screen .overlay-content, #start-overlay .overlay-content { box-sizing:border-box !important; width:min(760px,calc(100vw - 32px)) !important; max-width:calc(100vw - 32px) !important; max-height:calc(100dvh - 24px) !important; padding:20px 24px !important; overflow-y:auto !important; overscroll-behavior:contain !important; pointer-events:auto !important; }",
      ".overlay .overlay-content h1, .overlay .overlay-content h2 { font-size:24px !important; margin:0 0 12px !important; line-height:1.3 !important; }",
      ".overlay .overlay-content :is(p,li) { font-size:14px !important; line-height:1.55 !important; }",
      ".overlay .overlay-content > :is(ul,ol) { margin:12px 0 !important; padding:12px 12px 12px 32px !important; }",
      ".overlay .overlay-content > button { min-height:44px !important; margin-top:12px !important; position:sticky !important; bottom:0 !important; flex-shrink:0 !important; }",
      "body:has(#xSlider):has(#spawnBtn) #gameContainer { height:100dvh !important; min-height:0 !important; padding:8px !important; display:flex !important; flex-direction:column !important; overflow:hidden !important; }",
      "body:has(#xSlider):has(#spawnBtn) #canvasWrapper { flex:1 1 0 !important; height:auto !important; min-height:160px !important; max-height:none !important; overflow:hidden !important; }",
      "body:has(#xSlider):has(#spawnBtn) #gameCanvas { width:100% !important; height:100% !important; object-fit:fill !important; max-height:none !important; }",
      "body:has(#xSlider):has(#spawnBtn) :is(#header,#statsBar,#controls,#infoPanel) { flex:0 0 auto !important; padding:6px 10px !important; margin:3px 0 !important; }",
      "body:has(#xSlider):has(#spawnBtn) #header { display:none !important; }",
      ".cq-context-bridge-picking, .cq-context-bridge-picking * { cursor: crosshair !important; }",
      ".cq-context-bridge-picking .cq-context-bridge-candidate { outline: 1px dashed rgba(103,87,217,.58) !important; outline-offset: 2px !important; box-shadow:0 0 0 4px rgba(228,220,255,.12) !important; }",
      ".cq-context-bridge-picking canvas.cq-context-bridge-candidate, .cq-context-bridge-picking svg.cq-context-bridge-candidate, .cq-context-bridge-picking figure.cq-context-bridge-candidate, .cq-context-bridge-picking table.cq-context-bridge-candidate { outline:0 !important; box-shadow:inset 0 0 0 2px rgba(103,87,217,.36) !important; }",
      ".cq-context-bridge-hover { outline: 3px solid #6757d9 !important; outline-offset: 3px !important; box-shadow: 0 0 0 7px rgba(103,87,217,.12) !important; }",
      ".cq-context-bridge-selected { outline: 3px solid #6757d9 !important; outline-offset: 3px !important; box-shadow: 0 0 0 7px rgba(103,87,217,.16) !important; }",
      ".app-container:has(#partition_count-slider) #controls :is(.main-btn, .reset-btn) { padding:8px !important; font-size:14px !important; border-radius:6px !important; }",
      ".app-container:has(#partition_count-slider) #mainBtn.btn-restart { background:#6757d9 !important; box-shadow:none !important; animation:none !important; }",
      "body:has(#game-area):has(#graph-canvas) { height:100vh !important; min-height:0 !important; overflow:hidden !important; }",
      "body:has(#game-area):has(#graph-canvas) #game-container { height:100vh !important; max-width:none !important; min-height:0 !important; display:flex !important; flex-direction:column !important; overflow:hidden !important; padding:8px !important; }",
      "body:has(#game-area):has(#graph-canvas) #header, body:has(#game-area):has(#graph-canvas) #stats-bar, body:has(#game-area):has(#graph-canvas) #level-bar { flex:0 0 auto !important; }",
      "body:has(#game-area):has(#graph-canvas) #header { padding:6px !important; }",
      "body:has(#game-area):has(#graph-canvas) #header h1 { font-size:1.25em !important; }",
      "body:has(#game-area):has(#graph-canvas) #game-area { flex:1 1 auto !important; min-height:0 !important; height:auto !important; overflow:hidden !important; display:flex !important; flex-direction:column !important; margin:5px 0 !important; }",
      "body:has(#game-area):has(#graph-canvas) #graph-canvas { flex:1 1 220px !important; min-height:180px !important; height:auto !important; max-height:none !important; width:100% !important; }",
      "body:has(#game-area):has(#graph-canvas) #derivative-display, body:has(#game-area):has(#graph-canvas) #feedback-msg { flex:0 0 auto !important; margin:4px 0 !important; padding:6px !important; }",
      "body:has(#game-area):has(#graph-canvas) #cards-area { flex:0 0 auto !important; min-height:48px !important; margin:5px 0 !important; gap:5px !important; }",
      "body:has(#game-area):has(#graph-canvas) #cards-area .func-card { padding:6px 10px !important; font-size:.9em !important; min-width:80px !important; }",
      "body:has(#game-area):has(#graph-canvas) #c-badge-area, body:has(#game-area):has(#graph-canvas) #drop-zone, body:has(#game-area):has(#graph-canvas) #submit-area { flex:0 0 auto !important; margin:4px 0 !important; padding:7px !important; min-height:0 !important; }",
      "body:has(#game-area):has(#graph-canvas) #drop-zone { min-height:52px !important; }",
      "body:has(#game-area):has(#graph-canvas) #submit-area button { padding:7px 14px !important; min-height:34px !important; font-size:.9em !important; }",
      "body:has(#game-area):has(#graph-canvas) #submit-btn { background:#6757d9 !important; box-shadow:none !important; }",
      "#overlay:has(.start-btn), .overlay:has(.start-btn), #start-screen:has(.start-btn), #startScreen:has(.start-btn), .start-screen:has(.start-btn), .startScreen:has(.start-btn) { z-index:2147483600 !important; isolation:isolate !important; }",
      "#overlay:has(.start-btn) .overlay-content, .overlay:has(.start-btn) .overlay-content, #start-screen:has(.start-btn) > *, #startScreen:has(.start-btn) > *, .start-screen:has(.start-btn) > *, .startScreen:has(.start-btn) > * { position:relative !important; z-index:2147483601 !important; }",
      "#overlay:has(.start-btn) .start-btn, .overlay:has(.start-btn) .start-btn, #start-screen:has(.start-btn) .start-btn, #startScreen:has(.start-btn) .start-btn, .start-screen:has(.start-btn) .start-btn, .startScreen:has(.start-btn) .start-btn { position:relative !important; z-index:2147483602 !important; pointer-events:auto !important; }"
      + "\n::highlight(cq-learning-notes-amber) { background-color:rgba(246,183,60,.22); text-decoration:underline 2px #D28D13; text-underline-offset:3px; }"
      + "\n::highlight(cq-learning-notes-mint) { background-color:rgba(103,87,217,.2); text-decoration:underline 2px #6757d9; text-underline-offset:3px; }"
      + "\n::highlight(cq-learning-notes-blue) { background-color:rgba(112,176,255,.2); text-decoration:underline 2px #4E8ED9; text-underline-offset:3px; }"
      + "\n::highlight(cq-learning-notes-pink) { background-color:rgba(241,137,185,.2); text-decoration:underline 2px #D35F98; text-underline-offset:3px; }"
      + "\n.cq-learning-note-fallback { box-shadow:inset 0 -3px rgba(246,183,60,.38) !important; }"
      + "\n.cq-context-bridge-preview { position:fixed; z-index:2147483647; max-width:min(300px,calc(100vw - 20px)); border-radius:8px; background:#16324F; box-shadow:0 10px 28px rgba(8,32,47,.24); padding:7px 10px; color:#fff; font:700 12px/1.45 'Microsoft YaHei UI','Microsoft YaHei',sans-serif; pointer-events:none; }"
      + "\n.cq-context-bridge-preview[hidden] { display:none; }"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function clearHover() {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    hoverTarget?.classList?.remove("cq-context-bridge-hover");
    hoverTarget = null;
    if (pickPreview) pickPreview.hidden = true;
  }

  function ensurePickPreview() {
    if (pickPreview?.isConnected) return pickPreview;
    pickPreview = document.createElement("div");
    pickPreview.className = "cq-context-bridge-preview";
    pickPreview.hidden = true;
    pickPreview.setAttribute("aria-hidden", "true");
    document.body.appendChild(pickPreview);
    return pickPreview;
  }

  function kindLabel(element) {
    const tag = element?.tagName?.toLowerCase() || "";
    const type = String(element?.getAttribute?.("type") || "").toLowerCase();
    if (rawLatex(element)) return "公式";
    if (tag === "label") return "控件说明";
    if (tag === "input" && type === "range") return "滑块";
    if (tag === "select") return "选项菜单";
    if (tag === "textarea") return "输入区域";
    if (tag === "input") return "互动控件";
    if (tag === "button" || element?.getAttribute?.("role") === "button") return "操作按钮";
    if (tag === "canvas") return "当前画面";
    if (tag === "svg") return "图形";
    if (tag === "img") return "图片";
    return "课件内容";
  }

  function showPickPreview(element) {
    const preview = ensurePickPreview();
    const label = compactText(labelFor(element), 92);
    preview.textContent = label ? `${kindLabel(element)} · ${label}` : kindLabel(element);
    preview.hidden = false;
    const rect = element.getBoundingClientRect();
    const width = Math.min(300, Math.max(120, preview.offsetWidth || 180));
    const left = Math.min(
      Math.max(8, rect.left + Math.min(rect.width / 2, 80) - 18),
      Math.max(8, window.innerWidth - width - 8)
    );
    const top = rect.top > 68
      ? Math.max(8, rect.top - (preview.offsetHeight || 32) - 8)
      : Math.min(window.innerHeight - 44, rect.bottom + 8);
    preview.style.left = `${Math.round(left)}px`;
    preview.style.top = `${Math.round(top)}px`;
  }

  function markCandidates() {
    candidateElements.forEach((element) => element.classList.remove("cq-context-bridge-candidate"));
    candidateElements.clear();
    Array.from(document.querySelectorAll(CANDIDATE_SELECTOR)).forEach((element) => {
      if (excluded(element)) return;
      if (!element.getClientRects?.().length) return;
      element.classList.add("cq-context-bridge-candidate");
      candidateElements.add(element);
    });
  }

  function clearCandidates() {
    candidateElements.forEach((element) => element.classList.remove("cq-context-bridge-candidate"));
    candidateElements.clear();
  }

  function clearSelected() {
    selectedTarget?.classList?.remove("cq-context-bridge-selected");
    selectedTarget = null;
  }

  function pinSelected(element) {
    clearSelected();
    selectedTarget = element || null;
    selectedTarget?.classList?.add("cq-context-bridge-selected");
  }

  function onPointerOver(event) {
    const target = contextTarget(event.target);
    if (!target || target === hoverTarget) return;
    clearHover();
    hoverTimer = window.setTimeout(() => {
      hoverTarget = target;
      hoverTarget.classList.add("cq-context-bridge-hover");
      showPickPreview(hoverTarget);
    }, HOVER_DELAY_MS);
  }

  function onPointerOut(event) {
    const target = contextTarget(event.target);
    if (!target || target !== hoverTarget) {
      if (!hoverTarget) clearTimeout(hoverTimer);
      return;
    }
    const related = elementFromNode(event.relatedTarget);
    if (related && target.contains(related)) return;
    clearHover();
  }

  function stopPicking(reason = "cancelled") {
    if (!picking && !listenersActive) return;
    picking = false;
    document.documentElement.classList.remove("cq-context-bridge-picking");
    clearHover();
    clearCandidates();
    if (listenersActive) {
      listenersActive = false;
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("click", onPickClick, true);
      document.removeEventListener("keydown", onPickKeyDown, true);
    }
    post("cq:context-pick-state", { active: false, reason });
  }

  function onPickClick(event) {
    if (!picking) return;
    const target = contextTarget(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    pinSelected(target);
    post("cq:context-picked", {
      contextRef: describe(target)
    });
    if (singleShot) stopPicking("selected");
  }

  function onPickKeyDown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    stopPicking("escape");
  }

  function beginPicking(config = {}) {
    singleShot = config.singleShot !== false;
    picking = true;
    injectStyle();
    document.documentElement.classList.add("cq-context-bridge-picking");
    markCandidates();
    if (!listenersActive) {
      listenersActive = true;
      document.addEventListener("pointerover", onPointerOver, true);
      document.addEventListener("pointerout", onPointerOut, true);
      document.addEventListener("click", onPickClick, true);
      document.addEventListener("keydown", onPickKeyDown, true);
    }
    post("cq:context-pick-state", { active: true });
  }

  function findBySemanticId(value = "") {
    const id = String(value || "");
    if (id.startsWith("interactive:node:")) {
      const key = id.slice("interactive:node:".length);
      return Array.from(document.querySelectorAll(GRAPH_NODE_SELECTOR))
        .find((element) => compactText(graphNodeKey(element), 160) === key) || null;
    }
    if (id.startsWith("interactive:id:")) {
      return document.getElementById(id.slice("interactive:id:".length));
    }
    if (id.startsWith("interactive:name:")) {
      const name = id.slice("interactive:name:".length);
      return Array.from(document.querySelectorAll("[name]")).find((element) => element.getAttribute("name") === name) || null;
    }
    if (id.startsWith("interactive:data:")) {
      const dataId = id.slice("interactive:data:".length);
      return Array.from(document.querySelectorAll("[data-cq-context-id], [data-context-id]")).find((element) => (
        element.getAttribute("data-cq-context-id") === dataId
        || element.getAttribute("data-context-id") === dataId
      )) || null;
    }
    return null;
  }

  function selectionLatex(range) {
    const start = elementFromNode(range?.startContainer);
    const end = elementFromNode(range?.endContainer);
    const startLatex = rawLatex(start);
    const endLatex = rawLatex(end);
    return startLatex && startLatex === endLatex ? startLatex : "";
  }

  function selectionLocator(range, host) {
    if (!range || !host || !host.contains?.(elementFromNode(range.startContainer))) return null;
    if (!host.contains?.(elementFromNode(range.endContainer))) return null;
    try {
      const before = document.createRange();
      before.selectNodeContents(host);
      before.setEnd(range.startContainer, range.startOffset);
      const startOffset = before.toString().length;
      const exact = String(range.toString() || "").slice(0, 900);
      const hostText = String(host.textContent || "");
      before.detach?.();
      return {
        source: "iframe",
        semanticId: semanticId(host),
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

  function noteHost(locator = {}) {
    return findBySemanticId(locator.semanticId) || document.body;
  }

  function noteTextNodes(host) {
    if (!host) return [];
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!node.nodeValue || !parent || parent.closest("script, style, template, noscript")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
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

  function noteRangeFromOffsets(host, startOffset, endOffset) {
    const start = Number(startOffset);
    const end = Number(endOffset);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return null;
    const nodes = noteTextNodes(host);
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
      const range = document.createRange();
      range.setStart(startNode, startInNode);
      range.setEnd(endNode, endInNode);
      return range;
    } catch {
      return null;
    }
  }

  function noteRange(locator = {}) {
    const host = noteHost(locator);
    const exact = String(locator.exact || "");
    const hostText = String(host?.textContent || "");
    const startOffset = Number(locator.startOffset);
    const endOffset = Number(locator.endOffset);
    if (
      Number.isInteger(startOffset)
      && Number.isInteger(endOffset)
      && startOffset >= 0
      && endOffset > startOffset
      && (!exact || hostText.slice(startOffset, endOffset) === exact)
    ) {
      const ranged = noteRangeFromOffsets(host, startOffset, endOffset);
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
    return candidates.length
      ? noteRangeFromOffsets(host, candidates[0].index, candidates[0].index + exact.length)
      : null;
  }

  function renderNoteHighlights(notes = []) {
    renderedNotes = Array.isArray(notes) ? notes.filter(Boolean) : [];
    ["amber", "mint", "blue", "pink"].forEach((color) => {
      try { CSS.highlights?.delete?.(`cq-learning-notes-${color}`); } catch {}
    });
    noteFallbackElements.forEach((element) => element.classList.remove("cq-learning-note-fallback"));
    noteFallbackElements.clear();
    renderedNoteRanges = [];
    const rangesByColor = new Map([
      ["amber", []],
      ["mint", []],
      ["blue", []],
      ["pink", []]
    ]);
    renderedNotes.forEach((note) => {
      const range = noteRange(note?.locator || {});
      if (range) {
        const color = rangesByColor.has(note.color) ? note.color : "amber";
        rangesByColor.get(color).push(range);
        renderedNoteRanges.push({ note, range });
        return;
      }
      const host = noteHost(note?.locator || {});
      if (host && host !== document.body) {
        host.classList.add("cq-learning-note-fallback");
        noteFallbackElements.add(host);
      }
    });
    if (CSS.highlights && typeof Highlight === "function") {
      rangesByColor.forEach((ranges, color) => {
        if (!ranges.length) return;
        try { CSS.highlights.set(`cq-learning-notes-${color}`, new Highlight(...ranges)); } catch {}
      });
    }
  }

  function reportNoteAtPoint(event) {
    const hit = renderedNoteRanges.find(({ range }) => Array.from(range.getClientRects?.() || []).some((rect) => (
      event.clientX >= rect.left - 3
      && event.clientX <= rect.right + 3
      && event.clientY >= rect.top - 3
      && event.clientY <= rect.bottom + 3
    )));
    if (!hit) return false;
    const rect = hit.range.getBoundingClientRect();
    post("cq:note-open", {
      noteId: hit.note.id,
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      }
    });
    return true;
  }

  function restoreNote(note = {}) {
    const range = noteRange(note.locator || {});
    const target = elementFromNode(range?.startContainer) || noteHost(note.locator || {});
    target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }

  function reportSelection() {
    if (picking) return;
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount < 1 || selection.isCollapsed) return;
    const excerpt = compactMultiline(selection.toString(), 900);
    if (!excerpt) return;
    const range = selection.getRangeAt(0);
    const host = contextTarget(range.startContainer) || elementFromNode(range.startContainer);
    if (!host) return;
    const rect = range.getBoundingClientRect();
    const latex = selectionLatex(range);
    post("cq:text-selection", {
      contextRef: {
        ...describe(host, latex ? "formula" : "text"),
        excerpt,
        latex
      },
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      },
      locator: selectionLocator(range, host)
    });
  }

  function scheduleSelectionReport(event) {
    const point = Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)
      ? { clientX: event.clientX, clientY: event.clientY }
      : null;
    window.clearTimeout(selectionReportTimer);
    selectionReportTimer = window.setTimeout(() => {
      selectionReportTimer = null;
      const selection = window.getSelection?.();
      if ((!selection || selection.isCollapsed) && point && reportNoteAtPoint(point)) return;
      reportSelection();
    }, 0);
  }

  function handleSelectionKeyUp(event) {
    if (!event.shiftKey && event.key !== "Shift") return;
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed) return;
    scheduleSelectionReport();
  }

  function parameterName(element) {
    return cleanVisibleLabel(
      element.getAttribute?.("data-cq-parameter")
      || element.getAttribute?.("aria-label")
      || element.getAttribute?.("title")
      || labelFor(element)
      || element.getAttribute?.("name")
      || element.id
      || "参数",
      120
    );
  }

  function rememberParameterStart(event) {
    const target = event.target?.closest?.("input[type='range'], input[type='number'], select");
    if (!target || rangeStarts.has(target)) return;
    rangeStarts.set(target, compactText(target.value, 120));
  }

  function reportParameterCommit(event) {
    const target = event.target?.closest?.("input[type='range'], input[type='number'], select");
    if (!target) return;
    const oldValue = rangeStarts.get(target) || "";
    const newValue = compactText(target.value, 120);
    rangeStarts.delete(target);
    if (oldValue === newValue && target.tagName?.toLowerCase() !== "select") return;
    const parameter = parameterName(target);
    post("cq:interaction", {
      eventType: "parameter_commit",
      contextRef: {
        ...describe(target, "interaction"),
        label: parameter,
        state: {
          parameter,
          oldValue,
          newValue,
          min: compactText(target.min, 80),
          max: compactText(target.max, 80),
          action: ""
        }
      }
    });
  }

  function interactionTarget(target) {
    const element = elementFromNode(target);
    if (!element || excluded(element)) return null;
    return contextTarget(element)
      || element.closest?.("[draggable='true'], .piece, .tile, .card, .draggable, .drag-item, .drag-card")
      || element;
  }

  function interactionPayload(element, extra = {}) {
    return {
      tag: element?.tagName?.toLowerCase() || "",
      id: compactText(element?.id || "", 120),
      className: compactText(className(element), 160),
      role: compactText(element?.getAttribute?.("role") || "", 80),
      label: labelFor(element),
      ...extra
    };
  }

  function reportInteraction(eventType, element, extra = {}, persist = true) {
    if (!element || picking) return;
    post("cq:interaction", {
      eventType,
      persist,
      contextRef: describe(element, "interaction"),
      payload: interactionPayload(element, extra)
    });
  }

  function reportClick(event) {
    const target = interactionTarget(event.target);
    if (!target) return;
    reportInteraction("interactive_click", target, {
      detail: Number(event.detail || 0)
    });
  }

  function rememberPointerStart(event) {
    rememberParameterStart(event);
    const target = interactionTarget(event.target);
    if (!target) return;
    pointerStarts.set(event.pointerId || 0, {
      at: Date.now(),
      x: event.clientX,
      y: event.clientY,
      target
    });
  }

  function reportPointerEnd(event) {
    const key = event.pointerId || 0;
    const start = pointerStarts.get(key);
    pointerStarts.delete(key);
    if (!start) return;
    const distance = Math.round(Math.hypot(event.clientX - start.x, event.clientY - start.y));
    if (distance < 8) return;
    reportInteraction("interactive_drag_end", start.target, {
      distance,
      durationMs: Math.max(0, Date.now() - start.at)
    });
  }

  function clearPointerStart(event) {
    pointerStarts.delete(event.pointerId || 0);
  }

  function reportParameterInput(event) {
    const target = event.target?.closest?.("input[type='range'], input[type='number'], select");
    if (!target) return;
    const now = Date.now();
    const last = lastParameterInputAt.get(target) || 0;
    if (now - last < 500) return;
    lastParameterInputAt.set(target, now);
    const parameter = parameterName(target);
    post("cq:interaction", {
      eventType: "parameter_change",
      persist: false,
      contextRef: {
        ...describe(target, "interaction"),
        label: parameter,
        state: {
          parameter,
          oldValue: rangeStarts.get(target) || "",
          newValue: compactText(target.value, 120),
          min: compactText(target.min, 80),
          max: compactText(target.max, 80),
          action: ""
        }
      },
      payload: interactionPayload(target)
    });
  }

  function reportGenericChange(event) {
    const target = interactionTarget(event.target);
    if (!target || target.matches?.("input[type='range'], input[type='number'], select")) return;
    reportInteraction("interactive_change", target);
  }

  function reportSubmit(event) {
    const target = event.target?.closest?.("form") || interactionTarget(event.target);
    if (target) reportInteraction("interactive_submit", target);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== PARENT || !event.data || typeof event.data !== "object") return;
    const type = String(event.data.type || "");
    if (type === "cq:context-pick-begin") {
      beginPicking(event.data);
    } else if (type === "cq:context-pick-cancel") {
      stopPicking("parent-cancel");
    } else if (type === "cq:context-clear") {
      clearSelected();
    } else if (type === "cq:context-restore") {
      const target = findBySemanticId(event.data.semanticId);
      if (target) pinSelected(target);
    } else if (type === "cq:notes-sync") {
      renderNoteHighlights(event.data.notes);
    } else if (type === "cq:note-restore") {
      restoreNote(event.data.note || {});
    } else if (type === "cq:host-layout") {
      applyHostLayout(event.data);
    }
  });

  document.addEventListener("pointerup", scheduleSelectionReport, true);
  document.addEventListener("mouseup", scheduleSelectionReport, true);
  document.addEventListener("keyup", handleSelectionKeyUp, true);
  document.addEventListener("click", reportClick, true);
  document.addEventListener("pointerdown", rememberPointerStart, true);
  document.addEventListener("pointerup", reportPointerEnd, true);
  document.addEventListener("pointercancel", clearPointerStart, true);
  document.addEventListener("keydown", rememberParameterStart, true);
  document.addEventListener("input", reportParameterInput, true);
  document.addEventListener("change", reportParameterCommit, true);
  document.addEventListener("change", reportGenericChange, true);
  document.addEventListener("submit", reportSubmit, true);
  document.addEventListener("click", scheduleCoursewareLayoutRepair, true);
  window.addEventListener("resize", scheduleCoursewareLayoutRepair);
  window.addEventListener("cq:host-layout", scheduleCoursewareLayoutRepair);
  window.addEventListener("openmaic:courseware-layout", scheduleCoursewareLayoutRepair);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleCoursewareLayoutRepair, { once: true });
  }

  injectStyle();
  scheduleCoursewareLayoutRepair();
  window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  post("cq:bridge-ready", {
    version: 5,
    title: compactText(document.title || "", 180)
  });
})();
