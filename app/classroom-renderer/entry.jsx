import React from "react";
import { createRoot } from "react-dom/client";
import { SlideCanvas } from "@openmaic/renderer";

const root = createRoot(document.getElementById("slide"));
let model = null;
let picking = false;
let noteRanges = [];
const post = (payload) => parent.postMessage(payload, "*");

function plain(value) {
  const doc = new DOMParser().parseFromString(String(value || ""), "text/html");
  return doc.body.textContent.trim().slice(0, 1200);
}

function elementContext(element) {
  return {
    kind: element.type === "latex" ? "formula" : element.type === "text" ? "text" : "object",
    scope: "slide", semanticId: model.elementRefs?.[element.id] || element.id,
    elementId: element.id,
    label: plain(element.content || element.latex || element.text) || `课件${element.type === "image" ? "图像" : "元素"}`,
    excerpt: plain(element.content || element.latex || element.text),
    latex: element.latex || "",
    confidence: "high",
    coarse: false,
    ...(model.context || {})
  };
}

function elementForSemanticId(semanticId) {
  const rawId = Object.keys(model?.elementRefs || {}).find((id) => model.elementRefs[id] === semanticId)
    || model?.slide?.elements?.find((element) => element.id === semanticId)?.id;
  return rawId ? document.getElementById(`slide-element-${rawId}`) : null;
}

function textRange(exact, semanticId) {
  if (!exact) return null;
  const host = semanticId
    ? elementForSemanticId(semanticId)
    : document.getElementById("slide");
  if (!host) return null;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.parentElement?.closest("script,style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodes = [];
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node, offset: text.length });
    text += node.textContent;
  }
  const start = text.indexOf(exact);
  if (start < 0) return null;
  const end = start + exact.length;
  const first = nodes.find((entry) => entry.offset + entry.node.length > start);
  const last = nodes.find((entry) => entry.offset + entry.node.length >= end);
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.node, start - first.offset);
  range.setEnd(last.node, end - last.offset);
  return range;
}

function syncNotes(notes) {
  noteRanges = (Array.isArray(notes) ? notes : []).slice(0, 500).map((note) => ({
    note, range: textRange(note.locator?.exact, note.locator?.semanticId)
  })).filter((entry) => entry.range);
  if (!globalThis.CSS?.highlights || !globalThis.Highlight) return;
  for (const color of ["amber", "mint", "blue", "pink"]) {
    CSS.highlights.set(`note-${color}`, new Highlight(...noteRanges.filter((entry) => entry.note.color === color).map((entry) => entry.range)));
  }
}

class RenderBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { post({ type: "cq:openmaic-render-error" }); }
  render() { return this.state.failed ? <p>课件暂时无法显示</p> : this.props.children; }
}

function Canvas() {
  React.useEffect(() => {
    let cancelled = false;
    const slideId = model.slide.id;
    (async () => {
      await document.fonts.ready;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      if (cancelled) return;
      post({ type: "cq:openmaic-rendered", slideId });
      post({ type: "cq:bridge-ready" });
    })();
    return () => { cancelled = true; };
  }, []);
  return <SlideCanvas slide={model.slide} canvasPercentage={100} chrome={false}
    onElementClick={(element, event) => {
      if (!picking) return;
      event.preventDefault();
      event.stopPropagation();
      picking = false;
      document.body.classList.remove("picking");
      post({ type: "cq:context-picked", contextRef: elementContext(element) });
    }} />;
}

window.addEventListener("message", (event) => {
  if (event.source !== parent || !event.data || typeof event.data !== "object") return;
  const message = event.data;
  if (message.type === "cq:openmaic-slide-load" && message.slide && Array.isArray(message.slide.elements)) {
    model = message;
    root.render(<RenderBoundary key={message.slide.id}><Canvas /></RenderBoundary>);
  }
  if (message.type === "cq:context-pick-begin") {
    picking = true;
    document.body.classList.add("picking");
  }
  if (message.type === "cq:context-pick-cancel") {
    picking = false;
    document.body.classList.remove("picking");
  }
  if (message.type === "cq:context-restore") {
    document.querySelectorAll(".reference-selected").forEach((node) => node.classList.remove("reference-selected"));
    if (message.semanticId) elementForSemanticId(message.semanticId)?.firstElementChild?.classList.add("reference-selected");
  }
  if (message.type === "cq:notes-sync") syncNotes(message.notes);
  if (message.type === "cq:note-restore") {
    const range = noteRanges.find((entry) => entry.note.id === message.note?.id)?.range
      || textRange(message.note?.locator?.exact, message.note?.locator?.semanticId);
    if (range && globalThis.CSS?.highlights && globalThis.Highlight) CSS.highlights.set("note-active", new Highlight(range));
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !picking) return;
  picking = false;
  document.body.classList.remove("picking");
  post({ type: "cq:context-pick-state", active: false, reason: "escape" });
});
document.addEventListener("mouseup", (event) => {
  if (picking || !model) return;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    const hit = noteRanges.find((entry) => Array.from(entry.range.getClientRects()).some((rect) =>
      event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom));
    if (hit) post({ type: "cq:note-open", noteId: hit.note.id, rect: hit.range.getBoundingClientRect().toJSON() });
    return;
  }
  const excerpt = selection.toString().trim().slice(0, 1200);
  if (!excerpt) return;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode?.parentElement;
  const elementId = anchor?.closest(".slide-element")?.id.slice("slide-element-".length);
  const semanticId = model.elementRefs?.[elementId] || "";
  post({
    type: "cq:text-selection",
    contextRef: { kind: "text", scope: "slide", semanticId, excerpt, label: excerpt.slice(0, 80), confidence: "high", ...(model.context || {}) },
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    locator: { source: "iframe", semanticId, exact: excerpt }
  });
});
post({ type: "cq:openmaic-ready" });
