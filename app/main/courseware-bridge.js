(function initCalculusQuestCoursewareBridge() {
  if (window.top === window.self || window.__calculusQuestContextBridge) return;
  window.__calculusQuestContextBridge = true;

  const PARENT = window.parent;
  const HOVER_DELAY_MS = 120;
  const rangeStarts = new WeakMap();
  let picking = false;
  let singleShot = true;
  let hoverTimer = null;
  let hoverTarget = null;
  let selectedTarget = null;
  let listenersActive = false;

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

  function post(type, payload = {}) {
    PARENT.postMessage({ type, ...payload }, "*");
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

  function semanticId(element) {
    if (!element) return "";
    const explicit = element.getAttribute?.("data-cq-context-id")
      || element.getAttribute?.("data-context-id");
    if (explicit) return `interactive:data:${compactText(explicit, 160)}`;
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
    return compactText(
      element.getAttribute?.("data-cq-context-label")
      || element.getAttribute?.("aria-label")
      || element.getAttribute?.("title")
      || labelByFor?.textContent
      || wrappingLabel?.textContent
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
      "[role]",
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
      "table",
      "[id]"
    ].join(","));
    if (candidate && !excluded(candidate)) return candidate;
    return element !== document.documentElement && element !== document.body ? element : null;
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
      ".cq-context-bridge-picking, .cq-context-bridge-picking * { cursor: crosshair !important; }",
      ".cq-context-bridge-hover { outline: 3px solid #0B8F8A !important; outline-offset: 3px !important; }",
      ".cq-context-bridge-selected { outline: 3px solid #0B8F8A !important; outline-offset: 3px !important; box-shadow: 0 0 0 7px rgba(11,143,138,.16) !important; }"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function clearHover() {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    hoverTarget?.classList?.remove("cq-context-bridge-hover");
    hoverTarget = null;
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
      }
    });
  }

  function parameterName(element) {
    return compactText(
      element.getAttribute?.("data-cq-parameter")
      || element.getAttribute?.("aria-label")
      || element.getAttribute?.("title")
      || element.getAttribute?.("name")
      || element.id
      || labelFor(element)
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
        label: `刚才调整了 ${parameter}`,
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
    }
  });

  document.addEventListener("pointerup", () => window.setTimeout(reportSelection, 0), true);
  document.addEventListener("pointerdown", rememberParameterStart, true);
  document.addEventListener("keydown", rememberParameterStart, true);
  document.addEventListener("change", reportParameterCommit, true);

  injectStyle();
  post("cq:bridge-ready", {
    version: 1,
    title: compactText(document.title || "", 180)
  });
})();
