(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AssistantContent = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Assistant prose has Markdown structure. Unlike authored question-bank
  // fragments it must never be interpreted as implicit TeX across lines.
  function inline(source, math, allowStrong = true) {
    let out = "", i = 0;
    while (i < source.length) {
      if (source[i] === "\\" && /[$*`\\]/.test(source[i + 1] || "")) {
        out += escape(source[i + 1]); i += 2; continue;
      }
      if (source[i] === "`") {
        const end = source.indexOf("`", i + 1);
        if (end > i + 1 && !source.slice(i, end).includes("\n")) {
          out += "<code>" + escape(source.slice(i + 1, end)) + "</code>"; i = end + 1; continue;
        }
      }
      let open = "", close = "", display = false;
      if (source.startsWith("$$", i)) { open = close = "$$"; display = true; }
      else if (source.startsWith("\\[", i)) { open = "\\["; close = "\\]"; display = true; }
      else if (source.startsWith("\\(", i)) { open = "\\("; close = "\\)"; }
      else if (source[i] === "$") { open = close = "$"; }
      if (open) {
        let end = source.indexOf(close, i + open.length);
        while (end >= 0 && source[end - 1] === "\\" && close[0] !== "\\") end = source.indexOf(close, end + close.length);
        if (end > i + open.length && (display || !source.slice(i, end).includes("\n"))) {
          const raw = source.slice(i, end + close.length), tex = source.slice(i + open.length, end);
          try {
            out += math ? math(tex, display) : '<span class="assistant-math-literal">' + escape(raw) + "</span>";
          } catch (_) { out += '<span class="assistant-math-literal">' + escape(raw) + "</span>"; }
          i = end + close.length; continue;
        }
      }
      if (allowStrong && source.startsWith("**", i)) {
        const end = source.indexOf("**", i + 2);
        if (end > i + 2 && !source.slice(i, end).includes("\n")) {
          out += "<strong>" + inline(source.slice(i + 2, end), math, false) + "</strong>"; i = end + 2; continue;
        }
      }
      out += source[i] === "\n" ? "<br>" : escape(source[i]); i++;
    }
    return out;
  }
  function renderToString(value, options = {}) {
    const source = String(value || "").replace(/\r\n?/g, "\n");
    if (options.streaming) return "<p>" + escape(source).replace(/\n/g, "<br>") + "</p>";
    const math = options.math, lines = source.split("\n");
    const list = text => text.match(/^\s{0,3}(?:(\d{1,6})[.)]|([-+*]))\s+(.+)$/);
    let out = "", i = 0;
    while (i < lines.length) {
      if (!lines[i].trim()) { i++; continue; }
      if (/^\s{0,3}```/.test(lines[i])) {
        const block = []; i++;
        while (i < lines.length && !/^\s{0,3}```\s*$/.test(lines[i])) block.push(lines[i++]);
        if (i < lines.length) i++;
        out += "<pre><code>" + escape(block.join("\n")) + "</code></pre>"; continue;
      }
      const marker = list(lines[i]);
      if (marker) {
        const ordered = Boolean(marker[1]), tag = ordered ? "ol" : "ul";
        out += "<" + tag + (ordered ? ' start="' + Number(marker[1]) + '"' : "") + ">";
        while (i < lines.length) {
          const item = list(lines[i]); if (!item || Boolean(item[1]) !== ordered) break;
          let text = item[3]; i++;
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !list(lines[i])) text += "\n" + lines[i++].trim();
          out += "<li>" + inline(text, math) + "</li>";
        }
        out += "</" + tag + ">"; continue;
      }
      const paragraph = [lines[i++]];
      while (i < lines.length && lines[i].trim() && !list(lines[i]) && !/^\s{0,3}```/.test(lines[i])) paragraph.push(lines[i++]);
      out += "<p>" + inline(paragraph.join("\n"), math) + "</p>";
    }
    return out;
  }
  function renderInto(element, value, options = {}) {
    const katex = element.ownerDocument.defaultView?.katex;
    const math = katex ? (tex, displayMode) => katex.renderToString(tex, { displayMode, throwOnError: true, trust: false, maxExpand: 1000, strict: "warn" }) : null;
    element.innerHTML = renderToString(value, { ...options, math });
  }
  return { renderToString, renderInto };
});
