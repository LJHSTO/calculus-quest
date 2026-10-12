(function installOpenMaicSlide(global) {
  "use strict";
  const frames = new Map();

  function mount(host, canvas, unit, resourceRoot) {
    if (!host || !canvas?.elements?.length) return;
    for (const [frame, entry] of frames) {
      if (!frame.isConnected) {
        clearTimeout(entry.timeout);
        frames.delete(frame);
      }
    }
    const slide = structuredClone(canvas);
    function resolveMedia(value) {
      if (!value || typeof value !== "object") return;
      for (const [key, entry] of Object.entries(value)) {
        if (["src", "poster"].includes(key) && typeof entry === "string" && entry) {
          value[key] = new URL(slideImageSrc(entry, unit.chapterId, resourceRoot), document.baseURI).href;
        } else if (entry && typeof entry === "object") resolveMedia(entry);
      }
    }
    resolveMedia(slide);
    for (const element of slide.elements) {
      if (element.type === "text" && typeof element.content === "string") {
        element.content = renderSlideTextContent(element.content);
      }
      if (element.type === "shape" && typeof element.text?.content === "string") {
        element.text.content = renderSlideTextContent(element.text.content);
      }
      if (element.type === "table") {
        for (const row of element.data || []) {
          for (const cell of row || []) {
            if (typeof cell.text === "string") cell.text = renderSlideTextContent(cell.text);
          }
        }
      }
    }
    const frame = document.createElement("iframe");
    frame.className = "embed-frame openmaic-slide-frame";
    frame.dataset.openmaicSlide = slide.id || unit.id;
    frame.dataset.contextScope = "slide";
    frame.title = `${unit.label} · OpenMAIC 讲解`;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("allow", "autoplay");
    const entry = {
      host, slide, context: { chapterId: unit.chapterId, unitId: unit.id, unitLabel: unit.label },
      elementRefs: Object.fromEntries(slide.elements.map((element, index) => [
        element.id, `slide:${slideSvgId(slide.id || "canvas")}:${slideSvgId(element.id || `${element.type || "element"}-${index + 1}`)}`
      ])),
      timeout: null
    };
    frames.set(frame, entry);
    host.dataset.openmaicState = "loading";
    const loading = document.createElement("span");
    loading.className = "openmaic-slide-loading";
    loading.setAttribute("role", "status");
    loading.textContent = "课件加载中…";
    host.append(loading);
    frame.src = new URL("assets/openmaic-classroom/frame.html", document.baseURI).href;
    host.append(frame);
    entry.timeout = setTimeout(() => {
      if (host.dataset.openmaicState === "loading" && frame.isConnected) host.dataset.openmaicState = "fallback";
    }, 20000);
  }

  global.addEventListener("message", (event) => {
    const pair = Array.from(frames).find(([frame]) => frame.isConnected && frame.contentWindow === event.source);
    if (!pair || !event.data || typeof event.data !== "object") return;
    const [frame, entry] = pair;
    if (event.data.type === "cq:openmaic-ready") {
      frame.contentWindow.postMessage({ type: "cq:openmaic-slide-load", slide: entry.slide, context: entry.context, elementRefs: entry.elementRefs }, "*");
    } else if (event.data.type === "cq:openmaic-rendered" && event.data.slideId === entry.slide.id) {
      clearTimeout(entry.timeout);
      // Once a fallback is visible, a late renderer must not replace the lesson.
      if (entry.host.dataset.openmaicState === "loading") entry.host.dataset.openmaicState = "ready";
    } else if (event.data.type === "cq:openmaic-render-error") {
      clearTimeout(entry.timeout);
      entry.host.dataset.openmaicState = "fallback";
    }
  });
  global.OpenMaicSlide = Object.freeze({ mount });
})(window);
