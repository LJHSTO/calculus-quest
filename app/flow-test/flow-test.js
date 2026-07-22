(() => {
  "use strict";

  const TYPE_LABELS = {
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
    resourceResults: new Map()
  };

  const BASE_PATH = (() => {
    const pathname = window.location.pathname.replace(/\/+/g, "/");
    const pageName = "/flow-test.html";
    if (!pathname.endsWith(pageName)) return "";
    return pathname.slice(0, -pageName.length).replace(/\/$/, "");
  })();

  const els = {
    chapterCount: document.getElementById("chapter-count"),
    chapterList: document.getElementById("chapter-list"),
    chapterId: document.getElementById("chapter-id"),
    chapterTitle: document.getElementById("chapter-title"),
    chapterMetrics: document.getElementById("chapter-metrics"),
    phaseStrip: document.getElementById("phase-strip"),
    knowledgeList: document.getElementById("knowledge-list"),
    modalityTabs: document.getElementById("modality-tabs"),
    resourceKind: document.getElementById("resource-kind"),
    resourceTitle: document.getElementById("resource-title"),
    resourceMeta: document.getElementById("resource-meta"),
    resourceFrame: document.getElementById("resource-frame"),
    frameEmpty: document.getElementById("frame-empty"),
    openResource: document.getElementById("open-resource"),
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
    return appUrl(`resources/${candidate.root}/${candidate.file}`);
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
      { label: `前测 ${quizCount(chapter, "preQuiz")}`, quiz: true },
      { label: `知识点 ${knowledgeCount}`, quiz: false },
      { label: `形成测验 ${quizCount(chapter, "formativeQuiz")}`, quiz: true },
      { label: `后测 ${quizCount(chapter, "postQuiz")}`, quiz: true }
    ];
    els.phaseStrip.innerHTML = phases.map((phase, index) => (
      `${index ? '<span class="phase-arrow">›</span>' : ""}<span class="phase-node${phase.quiz ? " is-quiz" : ""}">${escapeHtml(phase.label)}</span>`
    )).join("");
  }

  function renderKnowledgeList(chapter) {
    els.knowledgeList.innerHTML = (chapter.modules || []).map((module) => `
      <section class="module-section">
        <h3 class="module-heading">${escapeHtml(module.title)}</h3>
        ${(module.knowledgePoints || []).map((knowledgePoint) => `
          <button class="knowledge-row${state.knowledgePoint?.id === knowledgePoint.id ? " is-active" : ""}" type="button" data-kp-id="${escapeHtml(knowledgePoint.id)}">
            <span class="knowledge-name">${escapeHtml(knowledgePoint.name)}</span>
            <span class="modality-count">${(knowledgePoint.resourceCandidates || []).length} 种表征</span>
          </button>
        `).join("")}
      </section>
    `).join("");
    els.knowledgeList.querySelectorAll("[data-kp-id]").forEach((button) => {
      button.addEventListener("click", () => selectKnowledgePoint(button.dataset.kpId));
    });
  }

  function selectChapter(chapterId) {
    const chapter = (state.route?.chapters || []).find((item) => item.id === chapterId);
    if (!chapter) return;
    state.chapter = chapter;
    const knowledge = chapterKnowledgePoints(chapter);
    els.chapterId.textContent = chapter.extension ? "扩展章节" : "主线章节";
    els.chapterTitle.textContent = chapter.title;
    els.chapterMetrics.innerHTML = `<span>${chapter.modules?.length || 0} 模块</span><span>${knowledge.length} 知识点</span>`;
    renderPhaseStrip(chapter, knowledge.length);
    renderChapters();
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
    state.knowledgePoint = entry.knowledgePoint;
    const resources = entry.knowledgePoint.resourceCandidates || [];
    state.resource = resources.find((candidate) => candidate.type === state.resource?.type) || resources[0] || null;
    renderKnowledgeList(state.chapter);
    renderResource();
  }

  function selectResource(index) {
    const resource = (state.knowledgePoint?.resourceCandidates || [])[index];
    if (!resource) return;
    state.resource = resource;
    renderResource();
  }

  function resourceState(candidate) {
    return state.resourceResults.get(resourceUrl(candidate)) || "pending";
  }

  function renderResource() {
    const resources = state.knowledgePoint?.resourceCandidates || [];
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
      els.frameEmpty.hidden = false;
      els.openResource.classList.add("is-disabled");
      els.openResource.href = "#";
      return;
    }

    const url = resourceUrl(state.resource);
    const status = resourceState(state.resource);
    els.resourceKind.textContent = TYPE_LABELS[state.resource.type] || state.resource.type || "互动课件";
    els.resourceTitle.textContent = state.resource.title || state.knowledgePoint.name;
    els.resourceMeta.innerHTML = `
      <span class="resource-path">${escapeHtml(url)}</span>
      <span class="resource-state${status === "ok" ? " is-ok" : status === "error" ? " is-error" : ""}">${status === "ok" ? "可用" : status === "error" ? "失败" : "载入中"}</span>
    `;
    els.openResource.href = url;
    els.openResource.classList.remove("is-disabled");
    els.frameEmpty.hidden = true;
    els.resourceFrame.hidden = false;
    if (els.resourceFrame.getAttribute("src") !== url) els.resourceFrame.src = url;
  }

  els.resourceFrame.addEventListener("load", () => {
    if (!state.resource) return;
    state.resourceResults.set(resourceUrl(state.resource), "ok");
    renderResource();
  });
  els.resourceFrame.addEventListener("error", () => {
    if (!state.resource) return;
    state.resourceResults.set(resourceUrl(state.resource), "error");
    renderResource();
  });

  function allResources() {
    const resources = (state.route?.chapters || []).flatMap((chapter) => (
      chapterKnowledgePoints(chapter).flatMap((entry) => entry.knowledgePoint.resourceCandidates || [])
    ));
    const unique = new Map();
    resources.forEach((candidate) => unique.set(resourceUrl(candidate), candidate));
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
        const url = resourceUrl(candidate);
        try {
          const response = await fetch(url, { method: "HEAD", cache: "no-store" });
          const ok = response.ok;
          state.resourceResults.set(url, ok ? "ok" : "error");
          if (ok) passed += 1;
        } catch {
          state.resourceResults.set(url, "error");
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

  async function init() {
    setGate("route", "busy", "加载中");
    try {
      const [route, kgResponse] = await Promise.all([
        fetchJson(appUrl("api/course/multi-scene-learning-route")),
        fetchJson(appUrl("api/learning/kg"))
      ]);
      state.route = route;
      state.graph = kgResponse.kg;
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
