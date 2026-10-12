(function initQuestionMath(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.QuestionMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createQuestionMath() {
  "use strict";

  const EXPLICIT_MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g;
  const SPECIAL_IMPLICIT_RE = /∫\(\s*([^()，。；;]+?)\s*到\s*([^()，。；;]+?)\s*\)(?:\s*[A-Za-z0-9\u00b2\u00b3\u00b9\u02b0-\u02ff\u0370-\u03ff\u1d00-\u1d7f\u2070-\u209f\u2190-\u22ff\u27c0-\u27ef\u2980-\u29ff()[\]{}_^'=+\-−*/·×÷<>,.:%|\\]+)?|[A-Za-z]\((?:[^()\r\n]*[\u3400-\u9fff][^()\r\n]*)\)(?:\s*(?:=|≈|<|>|≤|≥)\s*[0-9./%]+)?/gu;
  const IMPLICIT_RUN_RE = /[A-Za-z0-9\u00b2\u00b3\u00b9\u02b0-\u02ff\u0370-\u03ff\u1d00-\u1d7f\u2070-\u209f\u2190-\u22ff\u27c0-\u27ef\u2980-\u29ff()[\]{}_^'=+\-−*/·×÷<>,.:%|\\\s]+/gu;
  const HTML_LIKE_RE = /<\/?[A-Za-z][^>]*>/;
  const MATH_SYMBOL_RE = /[∂∇∫√∞≤≥≈≠±×÷·−→←↔⊙⊗∑∏^_=+*/<>%]/u;
  const GREEK_OR_SCRIPT_RE = /[\u00b2\u00b3\u00b9\u02b0-\u02ff\u0370-\u03ff\u1d00-\u1d7f\u2070-\u209f]/u;
  const COMMON_MATH_TOKEN_RE = /^(?:d[utvx]|uv|Qp|np)$/;

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function balanced(value, left, right) {
    let depth = 0;
    for (const char of value) {
      if (char === left) depth += 1;
      if (char === right) depth -= 1;
      if (depth < 0) return false;
    }
    return depth === 0;
  }

  function hasBalancedDelimiters(value = "") {
    return balanced(value, "(", ")")
      && balanced(value, "[", "]")
      && balanced(value, "{", "}");
  }

  function isImplicitMathCandidate(value = "") {
    const candidate = String(value).trim();
    if (!candidate || HTML_LIKE_RE.test(candidate)) return false;
    if (!hasBalancedDelimiters(candidate)) return false;
    if (MATH_SYMBOL_RE.test(candidate) || GREEK_OR_SCRIPT_RE.test(candidate)) return true;
    if (/^[A-Za-z]$/.test(candidate)) return true;
    if (/^[A-Za-z][0-9]+$/.test(candidate)) return true;
    if (/^[A-Za-z][A-Za-z0-9]*['′]?\s*\([^()]*\)$/.test(candidate)) return true;
    if (/^\[[^\]]*[,，][^\]]*\]$/.test(candidate)) return true;
    if (/^\([^()]*\d[^()]*[,，][^()]*\)$/.test(candidate)) return true;
    if (/(?:\d\s*[A-Za-z]|[A-Za-z]\s*\d)/.test(candidate)) return true;
    if (COMMON_MATH_TOKEN_RE.test(candidate)) return true;
    return false;
  }

  function pushText(segments, value) {
    if (!value) return;
    const previous = segments[segments.length - 1];
    if (previous?.type === "text") previous.value += value;
    else segments.push({ type: "text", value });
  }

  function pushImplicitRun(segments, run) {
    const leading = run.match(/^\s*/u)?.[0] || "";
    const trailing = run.match(/\s*$/u)?.[0] || "";
    const start = leading.length;
    const end = run.length - trailing.length;
    let candidate = run.slice(start, end);
    let danglingSuffix = "";
    while (candidate && !hasBalancedDelimiters(candidate)) {
      const dangling = candidate.match(/(\s*[\(\[\{])$/u)?.[0] || "";
      if (!dangling) break;
      danglingSuffix = dangling + danglingSuffix;
      candidate = candidate.slice(0, -dangling.length);
    }
    pushText(segments, leading);
    if (isImplicitMathCandidate(candidate)) {
      segments.push({
        type: "math",
        value: candidate,
        raw: candidate,
        displayMode: false,
        implicit: true
      });
    } else {
      pushText(segments, candidate);
    }
    pushText(segments, danglingSuffix);
    pushText(segments, trailing);
  }

  function segmentGenericImplicit(value = "") {
    const text = String(value);
    const segments = [];
    let last = 0;
    IMPLICIT_RUN_RE.lastIndex = 0;
    let match;
    while ((match = IMPLICIT_RUN_RE.exec(text)) !== null) {
      if (match.index > last) pushText(segments, text.slice(last, match.index));
      pushImplicitRun(segments, match[0]);
      last = match.index + match[0].length;
    }
    if (last < text.length) pushText(segments, text.slice(last));
    return segments;
  }

  function segmentImplicit(value = "") {
    const text = String(value);
    const segments = [];
    let last = 0;
    SPECIAL_IMPLICIT_RE.lastIndex = 0;
    let match;
    while ((match = SPECIAL_IMPLICIT_RE.exec(text)) !== null) {
      if (match.index > last) {
        segmentGenericImplicit(text.slice(last, match.index)).forEach((entry) => (
          entry.type === "text" ? pushText(segments, entry.value) : segments.push(entry)
        ));
      }
      const raw = match[0].trimEnd();
      const trailing = match[0].slice(raw.length);
      segments.push({
        type: "math",
        value: raw,
        raw,
        displayMode: false,
        implicit: true
      });
      pushText(segments, trailing);
      last = match.index + match[0].length;
    }
    if (last < text.length) {
      segmentGenericImplicit(text.slice(last)).forEach((entry) => (
        entry.type === "text" ? pushText(segments, entry.value) : segments.push(entry)
      ));
    }
    return segments;
  }

  function segment(value = "") {
    const text = String(value ?? "");
    const segments = [];
    let last = 0;
    EXPLICIT_MATH_RE.lastIndex = 0;
    let match;
    while ((match = EXPLICIT_MATH_RE.exec(text)) !== null) {
      if (match.index > last) {
        segmentImplicit(text.slice(last, match.index)).forEach((entry) => (
          entry.type === "text" ? pushText(segments, entry.value) : segments.push(entry)
        ));
      }
      const displayMode = Boolean(match[1] || match[2]);
      const math = match[1] || match[2] || match[3] || match[4] || "";
      segments.push({
        type: "math",
        value: math,
        raw: match[0],
        displayMode,
        implicit: false
      });
      last = match.index + match[0].length;
    }
    if (last < text.length) {
      segmentImplicit(text.slice(last)).forEach((entry) => (
        entry.type === "text" ? pushText(segments, entry.value) : segments.push(entry)
      ));
    }
    return segments;
  }

  function normalizeSquareRoots(value = "") {
    return value.replace(
      /√\s*(\([^()]*\)|[A-Za-z0-9\u00b2\u00b3\u00b9\u02b0-\u02ff\u0370-\u03ff][A-Za-z0-9\u00b2\u00b3\u00b9\u02b0-\u02ff\u0370-\u03ff\u2070-\u209f_{}^]*)/gu,
      "\\sqrt{$1}"
    );
  }

  function normalizeLatex(value = "") {
    let result = String(value).trim();
    result = result.replace(
      /^([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)/u,
      (_, superscript) => {
        const normalized = Array.from(superscript)
          .map((char) => ({
            "⁰": "0",
            "¹": "1",
            "²": "2",
            "³": "3",
            "⁴": "4",
            "⁵": "5",
            "⁶": "6",
            "⁷": "7",
            "⁸": "8",
            "⁹": "9",
            "⁺": "+",
            "⁻": "-"
          })[char] || char)
          .join("");
        return `{}^{${normalized}}`;
      }
    );
    result = result.replace(
      /∫\(\s*([^()，。；;]+?)\s*到\s*([^()，。；;]+?)\s*\)/gu,
      "\\int_{$1}^{$2}"
    );
    result = result.replace(
      /∫\s*\[\s*([^,\]]+?)\s*,\s*([^\]]+?)\s*\]/gu,
      "\\int_{$1}^{$2}"
    );
    result = normalizeSquareRoots(result);
    if (/[∩∪∅∈∉]/u.test(result)) {
      result = result.replace(/\{([^{}]+)\}/g, "\\{$1\\}");
    }
    if (/[\u3400-\u9fff]/u.test(result)) {
      result = result
        .replace(/[\u3400-\u9fff]+/gu, (text) => `\\text{${text}}`)
        .replaceAll("|", "\\mid ");
    }
    result = result
      .replaceAll("−", "-")
      .replaceAll("×", "\\times ")
      .replaceAll("÷", "\\div ")
      .replaceAll("·", "\\cdot ")
      .replaceAll("⊙", "\\odot ")
      .replaceAll("⊗", "\\otimes ")
      .replaceAll("∩", "\\cap ")
      .replaceAll("∪", "\\cup ")
      .replaceAll("∅", "\\varnothing ")
      .replaceAll("∈", "\\in ")
      .replaceAll("∉", "\\notin ")
      .replaceAll("≠", "\\ne ")
      .replace(/(\d(?:\.\d+)?)%/g, "$1\\%")
      .replace(/\b(sin|cos|tan|ln|log|exp)\s*(?=\()/g, "\\$1 ")
      .replace(/\b([A-Za-z])_hat_([A-Za-z0-9]+)\b/g, "\\hat{$1}_{$2}")
      .replace(/\b([A-Za-z])_([A-Za-z]{2,})\b/g, "$1_{\\mathrm{$2}}");
    return result;
  }

  function renderMathSegment(entry, katexApi, options = {}) {
    const source = normalizeLatex(entry.value);
    try {
      const html = katexApi.renderToString(source, {
        throwOnError: true,
        strict: "error",
        displayMode: entry.displayMode === true,
        trust: false,
        maxExpand: 1000,
        ...(options.katex || {})
      });
      const displayClass = entry.displayMode ? " is-display" : "";
      return `<span class="question-math-fragment${displayClass}">${html}</span>`;
    } catch {
      return escapeHtml(entry.raw || entry.value);
    }
  }

  function renderToString(value = "", katexApi = null, options = {}) {
    const text = String(value ?? "");
    if (!katexApi || typeof katexApi.renderToString !== "function") return escapeHtml(text);
    return segment(text)
      .map((entry) => (
        entry.type === "math"
          ? renderMathSegment(entry, katexApi, options)
          : escapeHtml(entry.value)
      ))
      .join("");
  }

  function renderInto(element, value = "", katexApi = null, options = {}) {
    if (!element) return element;
    element.innerHTML = renderToString(value, katexApi, options);
    return element;
  }

  function hasImplicitMath(value = "") {
    return segmentImplicit(String(value ?? "")).some((entry) => entry.type === "math");
  }

  function hasMath(value = "") {
    return segment(String(value ?? "")).some((entry) => entry.type === "math");
  }

  return Object.freeze({
    escapeHtml,
    hasImplicitMath,
    hasMath,
    isImplicitMathCandidate,
    normalizeLatex,
    renderInto,
    renderToString,
    segment
  });
});
