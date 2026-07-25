(() => {
  "use strict";

  const TYPE_LABELS = {
    slide: "Slide 讲解页",
    simulation: "拖动实验",
    game: "误解修复",
    mindMap: "关系图",
    diagram: "关系图",
    visualization3d: "空间视角"
  };

  const state = {
    route: null,
    graph: null,
    chapter: null,
    knowledgePoint: null,
    resource: null,
    quizQuestion: null,
    resourceResults: new Map(),
    slideZoom: 1
  };

  const COURSEWARE_RESOURCE_VERSION = "20260726-audited-cw-v5";

  const BASE_PATH = (() => {
    const pathname = window.location.pathname.replace(/\/+/g, "/");
    const match = pathname.match(/^(.*)\/flow-test(?:\.html)?\/?$/);
    return match ? match[1].replace(/\/$/, "") : "";
  })();

  const els = {
    chapterCount: document.getElementById("chapter-count"),
    chapterList: document.getElementById("chapter-list"),
    chapterId: document.getElementById("chapter-id"),
    chapterTitle: document.getElementById("chapter-title"),
    chapterMetrics: document.getElementById("chapter-metrics"),
    phaseStrip: document.getElementById("phase-strip"),
    knowledgeList: document.getElementById("knowledge-list"),
    quizList: document.getElementById("quiz-list"),
    quizCount: document.getElementById("quiz-count"),
    modalityTabs: document.getElementById("modality-tabs"),
    resourceKind: document.getElementById("resource-kind"),
    resourceTitle: document.getElementById("resource-title"),
    resourceMeta: document.getElementById("resource-meta"),
    resourceFrame: document.getElementById("resource-frame"),
    slideFrame: document.getElementById("slide-frame"),
    quizPreview: document.getElementById("quiz-preview"),
    frameEmpty: document.getElementById("frame-empty"),
    slideZoomOut: document.getElementById("slide-zoom-out"),
    slideZoomValue: document.getElementById("slide-zoom-value"),
    slideZoomIn: document.getElementById("slide-zoom-in"),
    slideZoomFit: document.getElementById("slide-zoom-fit"),
    slideFullscreen: document.getElementById("slide-fullscreen"),
    viewerPane: document.querySelector(".viewer-pane"),
    checkResources: document.getElementById("check-resources"),
    liveStatus: document.getElementById("live-status")
  };

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[char]);
  }

  function encodedPath(value = "") {
    return String(value).replace(/\\/g, "/").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }

  function appUrl(value = "") {
    const path = encodedPath(value);
    return `${BASE_PATH}/${path}` || "/";
  }

  function resourceUrl(candidate) {
    if (!candidate || candidate.type === "slide") return "";
    const url = appUrl(`resources/${candidate.root}/${candidate.file}`);
    return `${url}${url.includes("?") ? "&" : "?"}v=${COURSEWARE_RESOURCE_VERSION}`;
  }

  function resourceKey(candidate) {
    if (!candidate) return "";
    if (candidate.type !== "slide") return resourceUrl(candidate);
    return `slide:${candidate.sceneOrder || 0}:${candidate.slide?.canvas?.id || candidate.title || "unknown"}`;
  }

  function resourceRootForKnowledgePoint(knowledgePoint) {
    if (knowledgePoint?.resourceRoot) return knowledgePoint.resourceRoot;
    const candidateRoot = knowledgePoint?.resourceCandidates?.find((candidate) => candidate?.root)?.root;
    if (candidateRoot) return candidateRoot;
    const entry = state.chapter
      ? chapterKnowledgePoints(state.chapter).find((item) => item.knowledgePoint.id === knowledgePoint?.id)
      : state.route?.chapters
        ?.flatMap((chapter) => chapterKnowledgePoints(chapter))
        .find((item) => item.knowledgePoint.id === knowledgePoint?.id);
    return entry?.module?.source?.resourceRoot || "";
  }

  function slideResource(knowledgePoint) {
    const slide = knowledgePoint?.slide;
    if (!slide?.canvas) return null;
    return {
      type: "slide",
      title: slide.title || `${knowledgePoint.name} · Slide 讲解页`,
      sceneOrder: slide.sceneOrder || 0,
      resourceRoot: resourceRootForKnowledgePoint(knowledgePoint),
      slide
    };
  }

  function resourcesForKnowledgePoint(knowledgePoint) {
    return [slideResource(knowledgePoint), ...(knowledgePoint?.resourceCandidates || [])].filter(Boolean);
  }

  function setGate(name, status, text) {
    const node = document.querySelector(`[data-gate="${name}"]`);
    if (!node) return;
    node.classList.remove("is-ok", "is-error", "is-busy");
    if (status) node.classList.add(`is-${status}`);
    node.querySelector("span:last-child").textContent = text;
  }

  function announce(text) {
    els.liveStatus.textContent = text;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`${url} 返回 HTTP ${response.status}`);
    return response.json();
  }

  function graphMatchesRoute(route, graph) {
    const routeIds = new Set((route.chapters || []).map((chapter) => chapter.id));
    const graphIds = new Set((graph.chapters || []).map((chapter) => chapter.id));
    return routeIds.size === graphIds.size && [...routeIds].every((id) => graphIds.has(id));
  }

  function chapterKnowledgePoints(chapter) {
    return (chapter.modules || []).flatMap((module) => (
      (module.knowledgePoints || []).map((knowledgePoint) => ({ module, knowledgePoint }))
    ));
  }

  function renderChapters() {
    const chapters = state.route?.chapters || [];
    els.chapterCount.textContent = String(chapters.length);
    els.chapterList.innerHTML = chapters.map((chapter) => `
      <button class="chapter-button${state.chapter?.id === chapter.id ? " is-active" : ""}" type="button" data-chapter-id="${escapeHtml(chapter.id)}">
        <span class="chapter-code">${chapter.extension ? "扩展" : `第 ${Number(chapter.order || 0)} 章`}</span>
        <span class="chapter-label">${escapeHtml(chapter.title)}</span>
      </button>
    `).join("");
    els.chapterList.querySelectorAll("[data-chapter-id]").forEach((button) => {
      button.addEventListener("click", () => selectChapter(button.dataset.chapterId));
    });
  }

  function quizCount(chapter, key) {
    return (chapter.flow?.[key]?.questions || []).length;
  }

  function renderPhaseStrip(chapter, knowledgeCount) {
    const phases = [
      { label: `前测 ${quizCount(chapter, "preQuiz")}`, quiz: true, key: "preQuiz" },
      { label: `知识点 ${knowledgeCount}`, quiz: false },
      { label: `形成测验 ${quizCount(chapter, "formativeQuiz")}`, quiz: true, key: "formativeQuiz" },
      { label: `后测 ${quizCount(chapter, "postQuiz")}`, quiz: true, key: "postQuiz" }
    ];
    els.phaseStrip.innerHTML = phases.map((phase, index) => {
      const node = phase.quiz
        ? `<button class="phase-node is-quiz" type="button" data-quiz-phase="${phase.key}">${escapeHtml(phase.label)}</button>`
        : `<span class="phase-node">${escapeHtml(phase.label)}</span>`;
      return `${index ? '<span class="phase-arrow">›</span>' : ""}${node}`;
    }).join("");
    els.phaseStrip.querySelectorAll("[data-quiz-phase]").forEach((button) => {
      button.addEventListener("click", () => focusQuizPhase(button.dataset.quizPhase));
    });
  }

  function renderKnowledgeList(chapter) {
    els.knowledgeList.innerHTML = (chapter.modules || []).map((module) => `
      <section class="module-section">
        <h3 class="module-heading">${escapeHtml(module.title)}</h3>
        ${(module.knowledgePoints || []).map((knowledgePoint) => `
          <button class="knowledge-row${state.knowledgePoint?.id === knowledgePoint.id ? " is-active" : ""}" type="button" data-kp-id="${escapeHtml(knowledgePoint.id)}">
            <span class="knowledge-name">${escapeHtml(knowledgePoint.name)}</span>
            <span class="modality-count">${resourcesForKnowledgePoint(knowledgePoint).length} 种资源</span>
          </button>
        `).join("")}
      </section>
    `).join("");
    els.knowledgeList.querySelectorAll("[data-kp-id]").forEach((button) => {
      button.addEventListener("click", () => selectKnowledgePoint(button.dataset.kpId));
    });
  }

  function quizQuestionText(question) {
    return question?.question || question?.prompt || question?.title || question?.text || "未命名题目";
  }

  function quizAnswerText(question) {
    const values = Array.isArray(question?.answer) ? question.answer : question?.answer ? [question.answer] : [];
    return values.map((value) => {
      const option = (question.options || []).find((item) => item.value === value);
      return option ? `${value}. ${option.label}` : String(value);
    }).join("；") || "未提供标准答案";
  }

  function quizTypeLabel(type) {
    return ({ single: "单选", multiple: "多选", text: "简答", short_answer: "简答" })[type] || type || "未知题型";
  }

  function quizPhaseLabel(key) {
    return ({ preQuiz: "前测", formativeQuiz: "形成测验", postQuiz: "后测" })[key] || "测验";
  }

  function quizKnowledgePointLabels(question, chapter) {
    const names = question?.knowledgePointNames || question?.knowledge_point_names || [];
    if (Array.isArray(names) && names.length) {
      return [...new Set(names.map((name) => String(name || "").trim()).filter(Boolean))];
    }
    const ids = question?.knowledgePointIds || question?.knowledge_point_ids || [];
    const lookup = new Map(
      chapterKnowledgePoints(chapter).map(({ knowledgePoint }) => [knowledgePoint.id, knowledgePoint.name])
    );
    const labels = (Array.isArray(ids) ? ids : [ids])
      .map((id) => lookup.get(String(id || "").trim()))
      .filter(Boolean);
    return [...new Set(labels)];
  }

  function renderQuizList(chapter) {
    const phases = [
      ["preQuiz", "前测"],
      ["formativeQuiz", "形成测验"],
      ["postQuiz", "后测"]
    ];
    const total = phases.reduce((sum, [key]) => sum + quizCount(chapter, key), 0);
    els.quizCount.textContent = `${total} 题`;
    els.quizList.innerHTML = phases.map(([key, label]) => {
      const quiz = chapter.flow?.[key] || {};
      const questions = quiz.questions || [];
      return `
        <section class="quiz-phase" data-quiz-phase-section="${key}">
          <div class="quiz-phase-heading"><strong>${escapeHtml(label)}</strong><span>${questions.length} 题</span></div>
          <div class="quiz-question-list">
            ${questions.map((question, index) => `
              <button class="quiz-question-row${state.quizQuestion?.key === key && state.quizQuestion?.index === index ? " is-active" : ""}" type="button" data-quiz-key="${key}" data-quiz-index="${index}">
                <span class="quiz-number">${index + 1}</span>
                <span class="quiz-question-text">${escapeHtml(quizQuestionText(question))}</span>
                <span class="quiz-type">${escapeHtml(quizTypeLabel(question.type))}</span>
              </button>
            `).join("")}
          </div>
        </section>
      `;
    }).join("");
    els.quizList.querySelectorAll("[data-quiz-key]").forEach((button) => {
      button.addEventListener("click", () => selectQuizQuestion(button.dataset.quizKey, Number(button.dataset.quizIndex)));
    });
  }

  function focusQuizPhase(key) {
    const target = els.quizList.querySelector(`[data-quiz-phase-section="${key}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    target?.querySelector("[data-quiz-key]")?.focus();
  }

  function selectQuizQuestion(key, index) {
    const questions = state.chapter?.flow?.[key]?.questions || [];
    const question = questions[index];
    if (!question) return;
    const authoritative = state.route?.chapters
      ?.flatMap((chapter) => chapter.flow?.[key]?.questions || [])
      .find((candidate) => candidate.id === question.id) || question;
    state.quizQuestion = { key, index, question: authoritative };
    state.resource = null;
    renderQuizList(state.chapter);
    renderKnowledgeList(state.chapter);
    renderResource();
    announce(`${key} 第 ${index + 1} 题已加载。`);
  }

  function selectChapter(chapterId) {
    const chapter = (state.route?.chapters || []).find((item) => item.id === chapterId);
    if (!chapter) return;
    state.chapter = chapter;
    state.quizQuestion = null;
    const knowledge = chapterKnowledgePoints(chapter);
    els.chapterId.textContent = chapter.extension ? "扩展章节" : "主线章节";
    els.chapterTitle.textContent = chapter.title;
    els.chapterMetrics.innerHTML = `<span>${chapter.modules?.length || 0} 模块</span><span>${knowledge.length} 知识点</span>`;
    renderPhaseStrip(chapter, knowledge.length);
    renderChapters();
    renderQuizList(chapter);
    const preferredId = state.knowledgePoint && knowledge.some((item) => item.knowledgePoint.id === state.knowledgePoint.id)
      ? state.knowledgePoint.id
      : knowledge[0]?.knowledgePoint.id;
    if (preferredId) selectKnowledgePoint(preferredId);
    else {
      state.knowledgePoint = null;
      state.resource = null;
      renderKnowledgeList(chapter);
      renderResource();
    }
  }

  function selectKnowledgePoint(knowledgePointId) {
    const entry = chapterKnowledgePoints(state.chapter).find((item) => item.knowledgePoint.id === knowledgePointId);
    if (!entry) return;
    state.knowledgePoint = {
      ...entry.knowledgePoint,
      resourceRoot: entry.module?.source?.resourceRoot || ""
    };
    state.quizQuestion = null;
    const resources = resourcesForKnowledgePoint(state.knowledgePoint);
    state.resource = resources.find((candidate) => candidate.type === state.resource?.type) || resources[0] || null;
    renderKnowledgeList(state.chapter);
    renderQuizList(state.chapter);
    renderResource();
  }

  function selectResource(index) {
    const resource = resourcesForKnowledgePoint(state.knowledgePoint)[index];
    if (!resource) return;
    state.quizQuestion = null;
    state.resource = resource;
    renderQuizList(state.chapter);
    renderResource();
  }

  function resourceState(candidate) {
    return state.resourceResults.get(resourceKey(candidate)) || "pending";
  }

  function slideStructureState(candidate) {
    const canvas = candidate?.slide?.canvas;
    return canvas && Number(canvas.viewportSize) > 0 && Array.isArray(canvas.elements) ? "ok" : "error";
  }

  function safeSlideMarkup(value = "") {
    return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  }

  function renderInlineMath(value = "") {
    const text = String(value ?? "");
    if (typeof window.katex === "undefined") return escapeHtml(text);
    const parts = [];
    let last = 0;
    const re = /\$([^$]+)\$/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match.index > last) parts.push(escapeHtml(text.slice(last, match.index)));
      try {
        parts.push(window.katex.renderToString(match[1], {
          throwOnError: false,
          displayMode: false,
          trust: false,
          maxExpand: 1000
        }));
      } catch {
        parts.push(escapeHtml(match[0]));
      }
      last = match.index + match[0].length;
    }
    if (last < text.length) parts.push(escapeHtml(text.slice(last)));
    return parts.join("");
  }

  function renderMathInHtml(value = "") {
    const sanitized = safeSlideMarkup(value);
    if (typeof window.katex === "undefined") return sanitized;
    return sanitized.replace(/\$([^$]+)\$/g, (_, math) => {
      try {
        return window.katex.renderToString(math, {
          throwOnError: false,
          displayMode: false,
          trust: false,
          maxExpand: 1000
        });
      } catch {
        return escapeHtml(`$${math}$`);
      }
    });
  }

  function renderSlideTextContent(value = "") {
    const content = String(value ?? "");
    return /<[a-zA-Z][^>]*>/.test(content)
      ? renderMathInHtml(content)
      : renderInlineMath(content);
  }

  function slideImageSrc(src = "", resourceRoot = "") {
    if (!src) return "";
    const raw = String(src);
    const classroomMedia = raw.match(/^\/api\/classroom-media\/[^/]+\/media\/(.+)$/i);
    if (classroomMedia && resourceRoot) return appUrl(`resources/${resourceRoot}/media/${classroomMedia[1]}`);
    if (/^(data:|https?:|\/)/i.test(raw)) return raw;
    if (resourceRoot && /^media\//i.test(raw)) return appUrl(`resources/${resourceRoot}/${raw}`);
    if (resourceRoot && raw.startsWith("gen_img_")) return appUrl(`resources/${resourceRoot}/media/${raw}.png`);
    if (raw.startsWith("gen_img_")) return appUrl(`resources/open-maic/${raw}.png`);
    return appUrl(`resources/${resourceRoot || "open-maic"}/${raw}`);
  }

  function slideSvgId(value = "line") {
    return String(value || "line").replace(/[^a-zA-Z0-9_-]/g, "-");
  }

  function renderSlideTable(element) {
    const rows = element.data || [];
    const border = element.outline?.color || "#d9d9d9";
    const cellMinHeight = Math.max(slideNumber(element.cellMinHeight, 0), 0);
    const colWidths = Array.isArray(element.colWidths) ? element.colWidths : [];
    const naturalHeight = Math.max(slideNumber(element.height, 0), cellMinHeight * rows.length);
    return `<table class="slide-table" style="border-color:${escapeHtml(border)};min-height:${naturalHeight}px">${colWidths.length
      ? `<colgroup>${colWidths.map((width) => `<col style="width:${slideNumber(Number(width) * 100)}%" />`).join("")}</colgroup>`
      : ""}<tbody>${rows.map((row) => `<tr${cellMinHeight ? ` style="height:${cellMinHeight}px"` : ""}>${(row || []).map((cell) => {
        const style = cell?.style || {};
        const cellStyle = `background:${escapeHtml(style.backcolor || "transparent")};color:${escapeHtml(style.color || "inherit")};text-align:${escapeHtml(style.align || "left")};font-weight:${style.bold ? 800 : 500};${style.fontsize ? `font-size:${slideNumber(style.fontsize, 16)}px;` : ""}${cellMinHeight ? `min-height:${cellMinHeight}px;` : ""}`;
        const attrs = [`style="${cellStyle}"`];
        if (cell?.colspan > 1) attrs.push(`colspan="${cell.colspan}"`);
        if (cell?.rowspan > 1) attrs.push(`rowspan="${cell.rowspan}"`);
        return `<td ${attrs.join(" ")}>${renderSlideTextContent(cell?.text || "")}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function slideNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Number(number.toFixed(3)) : fallback;
  }

  function renderSlidePreview(slide = {}, resourceRoot = "") {
    const canvas = slide.canvas || {};
    const width = slideNumber(canvas.viewportSize, 1000);
    const height = slideNumber(width * slideNumber(canvas.viewportRatio, 0.5625), 562.5);
    const background = canvas.background?.color || canvas.theme?.backgroundColor || "#fff";
    const elements = (canvas.elements || []).map((element, index) => {
      const left = slideNumber(element.left);
      const top = slideNumber(element.top);
      const w = Math.max(1, slideNumber(element.width, 1));
      const h = Math.max(1, slideNumber(element.height, 1));
      const rotate = slideNumber(element.rotate);
      const style = `left:${left}px;top:${top}px;width:${w}px;height:${h}px;transform:rotate(${rotate}deg);color:${escapeHtml(element.defaultColor || "inherit")};`;
      if (element.type === "text") {
        return `<div class="flow-slide-element slide-element flow-slide-text slide-text" style="${style}"><div class="slide-fit-content slide-text-content" data-slide-fit>${renderSlideTextContent(element.content || "")}</div></div>`;
      }
      if (element.type === "shape") {
        const viewBox = Array.isArray(element.viewBox) ? element.viewBox : [1, 1];
        const outline = element.outline || {};
        const dash = outline.style === "dashed" ? ' stroke-dasharray="6 4"' : "";
        return `<svg class="flow-slide-element slide-element slide-shape" style="${style}" viewBox="0 0 ${slideNumber(viewBox[0], 1)} ${slideNumber(viewBox[1], 1)}" preserveAspectRatio="none" aria-hidden="true"><path d="${escapeHtml(element.path || "")}" fill="${escapeHtml(element.fill || "#e9edf5")}" stroke="${escapeHtml(outline.color || "none")}" stroke-width="${slideNumber(outline.width, 0)}"${dash}></path></svg>`;
      }
      if (element.type === "image") {
        return `<img class="flow-slide-element slide-element" alt="" src="${escapeHtml(slideImageSrc(element.src, resourceRoot))}" style="${style};object-fit:contain;" />`;
      }
      if (element.type === "line") {
        const start = Array.isArray(element.start) ? element.start : [0, 0];
        const end = Array.isArray(element.end) ? element.end : [w, h];
        const markerId = `flow-slide-arrow-${slideSvgId(element.id || `${left}-${top}-${index}`)}`;
        const points = Array.isArray(element.points) ? element.points : ["", ""];
        const markerStart = points[0] === "arrow" ? ` marker-start="url(#${markerId})"` : "";
        const markerEnd = points[1] === "arrow" ? ` marker-end="url(#${markerId})"` : "";
        const dash = element.style === "dashed" ? ' stroke-dasharray="8 6"' : "";
        const marker = markerStart || markerEnd ? `<defs><marker id="${markerId}" markerWidth="4" markerHeight="4" refX="8.5" refY="5" viewBox="0 0 10 10" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 Z" fill="${escapeHtml(element.color || "#94a3b8")}"></path></marker></defs>` : "";
        return `<svg class="flow-slide-line slide-element slide-vector slide-line" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${marker}<line x1="${slideNumber((element.left || 0) + (start[0] || 0))}" y1="${slideNumber((element.top || 0) + (start[1] || 0))}" x2="${slideNumber((element.left || 0) + (end[0] || 0))}" y2="${slideNumber((element.top || 0) + (end[1] || 0))}" stroke="${escapeHtml(element.color || "#94a3b8")}" stroke-width="${Math.max(1, slideNumber(element.width, 2))}" stroke-linecap="round"${dash}${markerStart}${markerEnd}></line></svg>`;
      }
      if (element.type === "latex") {
        let html = escapeHtml(element.latex || "");
        if (element.latex && typeof window.katex !== "undefined") {
          try {
            html = window.katex.renderToString(element.latex, { throwOnError: false, displayMode: true, trust: false, maxExpand: 1000 });
          } catch {
            html = safeSlideMarkup(element.html || html);
          }
        } else {
          html = safeSlideMarkup(element.html || html);
        }
        return `<div class="flow-slide-element slide-element flow-slide-latex slide-latex" style="${style}color:${escapeHtml(element.color || "inherit")};"><div class="slide-fit-content slide-latex-content" data-slide-fit>${html}</div></div>`;
      }
      if (element.type === "table") {
        return `<div class="flow-slide-element slide-element flow-slide-table slide-table-wrap" style="${style}"><div class="slide-fit-content slide-table-content" data-slide-fit>${renderSlideTable(element)}</div></div>`;
      }
      return `<span class="flow-slide-unknown" data-order="${index}"></span>`;
    }).join("");
    return `<div class="flow-slide-wrap" data-slide-width="${width}" data-slide-height="${height}" style="--slide-render-width:${width}px;--slide-render-height:${height}px"><div class="flow-slide-stage" style="width:${width}px;height:${height}px;background:${escapeHtml(background)}">${elements}</div></div>`;
  }

  function fitSlidePreviewContents(wrap) {
    wrap?.querySelectorAll?.("[data-slide-fit]").forEach((content) => {
      const host = content.parentElement;
      if (!host?.clientWidth || !host.clientHeight) return;
      content.style.setProperty("--slide-content-scale", "1");
      content.style.setProperty("--slide-content-x", "0px");
      content.style.setProperty("--slide-content-y", "0px");
      const naturalWidth = Math.max(content.scrollWidth, content.offsetWidth, 1);
      const naturalHeight = Math.max(content.scrollHeight, content.offsetHeight, 1);
      const scale = Math.min(1, host.clientWidth / naturalWidth, host.clientHeight / naturalHeight);
      const centered = host.classList.contains("flow-slide-latex") || host.classList.contains("slide-latex");
      const offsetX = centered ? Math.max(0, (host.clientWidth - naturalWidth * scale) / 2) : 0;
      const offsetY = centered ? Math.max(0, (host.clientHeight - naturalHeight * scale) / 2) : 0;
      content.style.setProperty("--slide-content-scale", String(Number(scale.toFixed(6))));
      content.style.setProperty("--slide-content-x", `${slideNumber(offsetX)}px`);
      content.style.setProperty("--slide-content-y", `${slideNumber(offsetY)}px`);
    });
  }

  function syncSlidePreviewScale() {
    const wrap = els.slideFrame.querySelector(".flow-slide-wrap");
    const stage = wrap?.querySelector(".flow-slide-stage");
    if (!wrap || !stage || els.slideFrame.hidden) return;
    const baseWidth = Number(wrap.dataset.slideWidth) || 1000;
    const baseHeight = Number(wrap.dataset.slideHeight) || 562.5;
    const availableWidth = Math.max(120, els.slideFrame.clientWidth - 36);
    const availableHeight = Math.max(120, els.slideFrame.clientHeight - 36);
    const fitScale = Math.min(1, availableWidth / baseWidth, availableHeight / baseHeight);
    const scale = Math.max(0.25, Math.min(3, fitScale * state.slideZoom));
    const renderWidth = Number((baseWidth * scale).toFixed(3));
    const renderHeight = Number((baseHeight * scale).toFixed(3));
    wrap.style.width = `${renderWidth}px`;
    wrap.style.height = `${renderHeight}px`;
    wrap.style.setProperty("--slide-render-width", `${renderWidth}px`);
    wrap.style.setProperty("--slide-render-height", `${renderHeight}px`);
    stage.style.setProperty("--flow-slide-scale", String(Number(scale.toFixed(6))));
    fitSlidePreviewContents(wrap);
    els.slideZoomValue.textContent = `${Math.round(state.slideZoom * 100)}%`;
  }

  function setViewerControls({ slide = false, fullscreen = false } = {}) {
    [els.slideZoomOut, els.slideZoomIn, els.slideZoomFit].forEach((button) => {
      if (button) button.disabled = !slide;
    });
    if (els.slideFullscreen) els.slideFullscreen.disabled = !fullscreen;
    if (els.slideZoomValue) els.slideZoomValue.textContent = `${Math.round(state.slideZoom * 100)}%`;
  }

  function changeSlideZoom(delta) {
    if (els.slideFrame.hidden) return;
    state.slideZoom = Math.max(0.5, Math.min(3, Number((state.slideZoom + delta).toFixed(2))));
    syncSlidePreviewScale();
  }

  function clearLocalFullscreen() {
    els.viewerPane.classList.remove("is-local-fullscreen");
    document.body.classList.remove("is-viewer-local-fullscreen");
    els.slideFullscreen.textContent = "⛶";
    els.slideFullscreen.setAttribute("aria-label", "全屏查看课件");
    els.slideFullscreen.setAttribute("title", "全屏查看");
  }

  function setLocalFullscreen() {
    els.viewerPane.classList.add("is-local-fullscreen");
    document.body.classList.add("is-viewer-local-fullscreen");
    els.slideFullscreen.textContent = "×";
    els.slideFullscreen.setAttribute("aria-label", "退出全屏");
    els.slideFullscreen.setAttribute("title", "退出全屏");
    requestAnimationFrame(syncSlidePreviewScale);
  }

  async function toggleViewerFullscreen() {
    if (!state.resource && !state.quizQuestion) return;
    if (els.viewerPane.classList.contains("is-local-fullscreen")) {
      clearLocalFullscreen();
      return;
    }
    if (document.fullscreenElement === els.viewerPane) {
      await document.exitFullscreen?.();
      return;
    }
    try {
      if (typeof els.viewerPane.requestFullscreen !== "function") throw new Error("当前浏览器不支持全屏 API");
      await els.viewerPane.requestFullscreen();
    } catch (error) {
      setLocalFullscreen();
      announce(`浏览器全屏不可用，已切换为页面全屏：${error.message}`);
    }
    requestAnimationFrame(syncSlidePreviewScale);
  }

  function renderQuizPreview(question) {
    const coverage = quizKnowledgePointLabels(question, state.chapter);
    const options = (question.options || []).map((option) => `<li><b>${escapeHtml(option.value || "")}</b><span>${escapeHtml(option.label || "")}</span></li>`).join("");
    const answer = quizAnswerText(question);
    return `
      <article class="quiz-detail">
        <div class="quiz-detail-meta"><span>${escapeHtml(quizTypeLabel(question.type))}</span><span>${escapeHtml(String(question.points ?? ""))} 分</span><span>${escapeHtml(question.id || "")}</span></div>
        <h3>${escapeHtml(quizQuestionText(question))}</h3>
        ${options ? `<ol class="quiz-options">${options}</ol>` : ""}
        <div class="quiz-answer"><strong>标准答案</strong><p>${escapeHtml(answer)}</p></div>
        <div class="quiz-analysis"><strong>解析</strong><p>${escapeHtml(question.analysis || "暂无解析")}</p></div>
        ${coverage.length ? `<div class="quiz-coverage"><strong>覆盖知识点</strong><p>${escapeHtml(coverage.join("、"))}</p></div>` : ""}
      </article>
    `;
  }

  function renderResource() {
    if (state.quizQuestion) {
      els.modalityTabs.innerHTML = "";
      els.resourceKind.textContent = "Quiz 题目检查";
      els.resourceTitle.textContent = `${quizPhaseLabel(state.quizQuestion.key)} · 第 ${state.quizQuestion.index + 1} 题`;
      els.resourceMeta.innerHTML = "<span class=\"resource-path\">来自当前章节 route 的权威题目</span><span class=\"resource-state is-ok\">已载入</span>";
      els.frameEmpty.hidden = true;
      els.resourceFrame.hidden = true;
      els.resourceFrame.removeAttribute("src");
      els.slideFrame.hidden = true;
      els.quizPreview.hidden = false;
      els.quizPreview.innerHTML = renderQuizPreview(state.quizQuestion.question);
      setViewerControls({ fullscreen: true });
      return;
    }

    const resources = resourcesForKnowledgePoint(state.knowledgePoint);
    els.modalityTabs.innerHTML = resources.map((candidate, index) => `
      <button class="modality-tab${candidate === state.resource ? " is-active" : ""}" type="button" role="tab" aria-selected="${candidate === state.resource}" data-resource-index="${index}">
        ${escapeHtml(TYPE_LABELS[candidate.type] || candidate.title || candidate.type)}
      </button>
    `).join("");
    els.modalityTabs.querySelectorAll("[data-resource-index]").forEach((button) => {
      button.addEventListener("click", () => selectResource(Number(button.dataset.resourceIndex)));
    });

    if (!state.resource) {
      els.resourceKind.textContent = "资源预览";
      els.resourceTitle.textContent = state.knowledgePoint?.name || "选择一个知识点";
      els.resourceMeta.innerHTML = "";
      els.resourceFrame.hidden = true;
      els.resourceFrame.removeAttribute("src");
      els.slideFrame.hidden = true;
      els.quizPreview.hidden = true;
      els.frameEmpty.hidden = false;
      setViewerControls();
      return;
    }

    const url = resourceUrl(state.resource);
    const status = state.resource.type === "slide" ? slideStructureState(state.resource) : resourceState(state.resource);
    els.resourceKind.textContent = TYPE_LABELS[state.resource.type] || state.resource.type || "互动课件";
    els.resourceTitle.textContent = state.resource.title || state.knowledgePoint.name;
    els.resourceMeta.innerHTML = `
      <span class="resource-path">${escapeHtml(state.resource.type === "slide" ? `route.slide.canvas · scene ${state.resource.sceneOrder || "?"}` : url)}</span>
      <span class="resource-state${status === "ok" ? " is-ok" : status === "error" ? " is-error" : ""}">${status === "ok" ? "可用" : status === "error" ? "失败" : "载入中"}</span>
    `;
    els.frameEmpty.hidden = true;
    els.quizPreview.hidden = true;
    if (state.resource.type === "slide") {
      els.resourceFrame.hidden = true;
      els.resourceFrame.removeAttribute("src");
      els.slideFrame.hidden = false;
      els.slideFrame.innerHTML = renderSlidePreview(state.resource.slide, state.resource.resourceRoot);
      setViewerControls({ slide: true, fullscreen: true });
      requestAnimationFrame(syncSlidePreviewScale);
      return;
    }
    setViewerControls({ fullscreen: true });
    els.slideFrame.hidden = true;
    els.resourceFrame.hidden = false;
    if (els.resourceFrame.getAttribute("src") !== url) els.resourceFrame.src = url;
  }

  els.resourceFrame.addEventListener("load", () => {
    if (!state.resource) return;
    state.resourceResults.set(resourceKey(state.resource), "ok");
    renderResource();
  });
  els.resourceFrame.addEventListener("error", () => {
    if (!state.resource) return;
    state.resourceResults.set(resourceKey(state.resource), "error");
    renderResource();
  });

  function allResources() {
    const resources = (state.route?.chapters || []).flatMap((chapter) => (
      chapterKnowledgePoints(chapter).flatMap((entry) => resourcesForKnowledgePoint(entry.knowledgePoint))
    ));
    const unique = new Map();
    resources.forEach((candidate) => unique.set(resourceKey(candidate), candidate));
    return [...unique.values()];
  }

  async function checkAllResources() {
    const resources = allResources();
    if (!resources.length) return;
    els.checkResources.disabled = true;
    setGate("resources", "busy", `0/${resources.length}`);
    let cursor = 0;
    let passed = 0;
    const worker = async () => {
      while (cursor < resources.length) {
        const candidate = resources[cursor++];
        const key = resourceKey(candidate);
        try {
          if (candidate.type === "slide") {
            const ok = slideStructureState(candidate) === "ok";
            state.resourceResults.set(key, ok ? "ok" : "error");
            if (ok) passed += 1;
            setGate("resources", "busy", `${cursor}/${resources.length}`);
            continue;
          }
          const url = resourceUrl(candidate);
          const response = await fetch(url, { method: "HEAD", cache: "no-store" });
          const ok = response.ok;
          state.resourceResults.set(key, ok ? "ok" : "error");
          if (ok) passed += 1;
        } catch {
          state.resourceResults.set(key, "error");
        }
        setGate("resources", "busy", `${cursor}/${resources.length}`);
      }
    };
    await Promise.all(new Array(Math.min(10, resources.length)).fill(null).map(worker));
    const failed = resources.length - passed;
    setGate("resources", failed ? "error" : "ok", failed ? `${failed} 失败` : `${passed} 可用`);
    els.checkResources.disabled = false;
    renderResource();
    announce(`资源检查完成，${passed} 个可用，${failed} 个失败。`);
  }

  els.checkResources.addEventListener("click", checkAllResources);
  window.addEventListener("resize", syncSlidePreviewScale);
  els.resourceFrame.setAttribute("allow", "fullscreen; autoplay");
  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement !== els.viewerPane) clearLocalFullscreen();
    const active = document.fullscreenElement === els.viewerPane;
    els.slideFullscreen.textContent = active ? "×" : "⛶";
    els.slideFullscreen.setAttribute("aria-label", active ? "退出全屏" : "全屏查看课件");
    els.slideFullscreen.setAttribute("title", active ? "退出全屏" : "全屏查看");
    requestAnimationFrame(syncSlidePreviewScale);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.viewerPane.classList.contains("is-local-fullscreen")) clearLocalFullscreen();
  });
  els.slideZoomOut.addEventListener("click", () => changeSlideZoom(-0.25));
  els.slideZoomIn.addEventListener("click", () => changeSlideZoom(0.25));
  els.slideZoomFit.addEventListener("click", () => {
    state.slideZoom = 1;
    syncSlidePreviewScale();
  });
  els.slideFullscreen.addEventListener("click", toggleViewerFullscreen);

  async function init() {
    setGate("route", "busy", "加载中");
    try {
      const [route, kgResponse] = await Promise.all([
        fetchJson(appUrl("data/multi-scene-learning-route.json")),
        fetchJson(appUrl("data/knowledge-graph.json"))
      ]);
      state.route = route;
      state.graph = kgResponse.kg || kgResponse;
      const chapters = route.chapters || [];
      setGate("route", chapters.length ? "ok" : "error", `${chapters.length} 章`);
      const matches = graphMatchesRoute(route, state.graph || {});
      setGate("kg", matches ? "ok" : "error", matches ? `${state.graph.nodes?.length || 0} 节点` : "章节失配");
      if (!chapters.length) throw new Error("课程路线没有章节");
      selectChapter(chapters[0].id);
      announce("课程流程检视已加载，与学生学习状态相互独立。");
    } catch (error) {
      setGate("route", "error", "加载失败");
      setGate("kg", "error", "不可用");
      els.chapterTitle.textContent = "课程流程检视无法启动";
      els.knowledgeList.innerHTML = `<div class="error-band">${escapeHtml(error.message)}</div>`;
      announce(error.message);
    }
  }

  init();
})();
