(function setupSystemAnnouncements() {
  const elements = {
    center: document.getElementById("system-announcement-center"),
    toggle: document.getElementById("announcement-toggle"),
    badge: document.getElementById("announcement-unread-count"),
    panel: document.getElementById("announcement-panel"),
    summary: document.getElementById("announcement-panel-summary"),
    markRead: document.getElementById("announcement-mark-read"),
    list: document.getElementById("announcement-list"),
    banner: document.getElementById("announcement-banner"),
    bannerType: document.getElementById("announcement-banner-type"),
    bannerTitle: document.getElementById("announcement-banner-title"),
    bannerContent: document.getElementById("announcement-banner-content"),
    bannerOpen: document.getElementById("announcement-banner-open"),
    bannerClose: document.getElementById("announcement-banner-close")
  };

  if (!elements.center || !elements.toggle || !elements.panel || !elements.list) return;

  const seenStorageKey = "cq-system-announcements-seen";
  const dismissedStorageKey = "cq-system-announcements-dismissed";
  const filterStorageKey = "cq-system-announcements-filter";
  const filterDefinitions = [
    { key: "all", label: "全部" },
    { key: "unread", label: "未读" },
    { key: "read", label: "已读" },
    { key: "pinned", label: "置顶" }
  ];

  let announcements = [];
  let eventSource = null;
  let pollTimer = null;
  let reconnectTimer = null;
  let detailAnnouncementId = "";
  let detailReturnTarget = null;
  let activeFilter = sessionStorage.getItem(filterStorageKey) || "all";
  if (!filterDefinitions.some((filter) => filter.key === activeFilter)) activeFilter = "all";

  function readMap(storage, key) {
    try {
      const value = JSON.parse(storage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function writeMap(storage, key, value) {
    try {
      const activeIds = new Set(announcements.map((announcement) => announcement.id));
      const compact = Object.fromEntries(
        Object.entries(value)
          .filter(([id]) => activeIds.has(id))
          .slice(-100)
      );
      storage.setItem(key, JSON.stringify(compact));
    } catch {}
  }

  function readSeen() {
    return readMap(localStorage, seenStorageKey);
  }

  function writeSeen(seen) {
    writeMap(localStorage, seenStorageKey, seen);
  }

  function readDismissed() {
    return readMap(sessionStorage, dismissedStorageKey);
  }

  function writeDismissed(dismissed) {
    writeMap(sessionStorage, dismissedStorageKey, dismissed);
  }

  function isUnread(announcement, seen = readSeen()) {
    return Boolean(announcement?.id && seen[announcement.id] !== announcement.updatedAt);
  }

  function levelLabel(level) {
    return ({
      update: "功能更新",
      maintenance: "维护通知",
      important: "重要通知"
    })[level] || "功能更新";
  }

  function formatTime(value = "", includeYear = false) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleString("zh-CN", {
      ...(includeYear ? { year: "numeric" } : {}),
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function plainAnnouncementText(value = "") {
    return String(value || "")
      .replace(/^#{2,3}\s+/gm, "")
      .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, "")
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compactText(value = "", limit = 78) {
    const text = plainAnnouncementText(value);
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}…`;
  }

  function appendAnnouncementInline(parent, value = "") {
    const text = String(value || "");
    const boldPattern = /\*\*([^*\n]+)\*\*/g;
    let offset = 0;
    let match;
    while ((match = boldPattern.exec(text))) {
      if (match.index > offset) {
        parent.appendChild(document.createTextNode(text.slice(offset, match.index)));
      }
      const strong = document.createElement("strong");
      strong.textContent = match[1];
      parent.appendChild(strong);
      offset = match.index + match[0].length;
    }
    if (offset < text.length) {
      parent.appendChild(document.createTextNode(text.slice(offset)));
    }
  }

  function renderAnnouncementContent(container, value = "") {
    const fragment = document.createDocumentFragment();
    const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
    let paragraphLines = [];
    let list = null;
    let listType = "";

    function flushParagraph() {
      if (!paragraphLines.length) return;
      const paragraph = document.createElement("p");
      paragraphLines.forEach((line, index) => {
        if (index) paragraph.appendChild(document.createElement("br"));
        appendAnnouncementInline(paragraph, line);
      });
      fragment.appendChild(paragraph);
      paragraphLines = [];
    }

    function flushList() {
      if (!list) return;
      fragment.appendChild(list);
      list = null;
      listType = "";
    }

    function appendListItem(type, text) {
      flushParagraph();
      if (!list || listType !== type) {
        flushList();
        list = document.createElement(type);
        listType = type;
      }
      const item = document.createElement("li");
      appendAnnouncementInline(item, text);
      list.appendChild(item);
    }

    lines.forEach((sourceLine) => {
      const line = sourceLine.trimEnd();
      if (!line.trim()) {
        flushParagraph();
        flushList();
        return;
      }

      const heading = line.match(/^(#{2,3})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        const node = document.createElement(heading[1].length === 2 ? "h3" : "h4");
        appendAnnouncementInline(node, heading[2]);
        fragment.appendChild(node);
        return;
      }

      const unordered = line.match(/^\s*[-*]\s+(.+)$/);
      if (unordered) {
        appendListItem("ul", unordered[1]);
        return;
      }

      const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
      if (ordered) {
        appendListItem("ol", ordered[1]);
        return;
      }

      flushList();
      paragraphLines.push(line);
    });

    flushParagraph();
    flushList();
    container.replaceChildren(fragment);
  }

  function createBadge(text, className, value = "") {
    const badge = document.createElement("span");
    badge.className = className;
    badge.textContent = text;
    if (value) badge.dataset.value = value;
    return badge;
  }

  function filterCounts(seen) {
    const unread = announcements.filter((announcement) => isUnread(announcement, seen)).length;
    return {
      all: announcements.length,
      unread,
      read: announcements.length - unread,
      pinned: announcements.filter((announcement) => announcement.pinned).length
    };
  }

  function createFilterBar() {
    const bar = document.createElement("div");
    bar.className = "announcement-filters";
    bar.setAttribute("role", "tablist");
    bar.setAttribute("aria-label", "公告筛选");

    filterDefinitions.forEach((filter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "announcement-filter";
      button.dataset.announcementFilter = filter.key;
      button.setAttribute("role", "tab");
      button.innerHTML = `<span>${filter.label}</span><strong>0</strong>`;
      button.addEventListener("click", () => {
        activeFilter = filter.key;
        sessionStorage.setItem(filterStorageKey, activeFilter);
        render();
      });
      bar.appendChild(button);
    });

    elements.panel.insertBefore(bar, elements.list);
    elements.filters = bar;
  }

  function createDetailDialog() {
    const backdrop = document.createElement("div");
    backdrop.className = "announcement-detail-backdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <section class="announcement-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="announcement-detail-title">
        <header class="announcement-detail-header">
          <div class="announcement-detail-badges" id="announcement-detail-badges"></div>
          <button class="announcement-detail-close" type="button" aria-label="关闭公告详情">×</button>
        </header>
        <div class="announcement-detail-body">
          <h2 id="announcement-detail-title"></h2>
          <p class="announcement-detail-meta" id="announcement-detail-meta"></p>
          <div class="announcement-detail-content" id="announcement-detail-content"></div>
        </div>
        <footer class="announcement-detail-footer">
          <button class="announcement-detail-done" type="button">我已阅读</button>
        </footer>
      </section>
    `;
    document.body.appendChild(backdrop);

    elements.detailBackdrop = backdrop;
    elements.detailDialog = backdrop.querySelector(".announcement-detail-dialog");
    elements.detailBadges = backdrop.querySelector("#announcement-detail-badges");
    elements.detailTitle = backdrop.querySelector("#announcement-detail-title");
    elements.detailMeta = backdrop.querySelector("#announcement-detail-meta");
    elements.detailContent = backdrop.querySelector("#announcement-detail-content");
    elements.detailClose = backdrop.querySelector(".announcement-detail-close");
    elements.detailDone = backdrop.querySelector(".announcement-detail-done");

    elements.detailClose.addEventListener("click", closeDetail);
    elements.detailDone.addEventListener("click", closeDetail);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeDetail();
    });
  }

  function setPanelOpen(open, options = {}) {
    elements.panel.hidden = !open;
    elements.toggle.setAttribute("aria-expanded", open ? "true" : "false");
    elements.toggle.setAttribute("aria-label", open ? "关闭系统公告" : "打开系统公告");
    if (open && options.focus !== false) {
      window.requestAnimationFrame(() => {
        elements.filters?.querySelector('[aria-selected="true"]')?.focus();
      });
    }
  }

  function markAnnouncementRead(announcement, options = {}) {
    if (!announcement?.id) return false;
    const seen = readSeen();
    const changed = seen[announcement.id] !== announcement.updatedAt;
    seen[announcement.id] = announcement.updatedAt;
    writeSeen(seen);
    if (changed && options.render !== false) render();
    return changed;
  }

  function markAllRead() {
    const seen = readSeen();
    announcements.forEach((announcement) => {
      seen[announcement.id] = announcement.updatedAt;
    });
    writeSeen(seen);
    render();
  }

  function dismissBanner(announcement) {
    if (!announcement?.id) return;
    const dismissed = readDismissed();
    dismissed[announcement.id] = announcement.updatedAt;
    writeDismissed(dismissed);
    renderBanner(readSeen());
  }

  function fillDetail(announcement) {
    elements.detailBadges.replaceChildren();
    elements.detailBadges.append(
      createBadge(levelLabel(announcement.level), "announcement-item-level", announcement.level),
      createBadge("已读", "announcement-read-state", "read")
    );
    if (announcement.pinned) {
      elements.detailBadges.appendChild(
        createBadge("置顶", "announcement-pin-state", "pinned")
      );
    }
    elements.detailTitle.textContent = announcement.title;
    elements.detailMeta.textContent = `发布于 ${formatTime(
      announcement.publishedAt || announcement.updatedAt,
      true
    )}`;
    renderAnnouncementContent(elements.detailContent, announcement.content);
  }

  function openDetail(announcement, returnTarget = null) {
    if (!announcement) return;
    detailAnnouncementId = announcement.id;
    detailReturnTarget = returnTarget instanceof HTMLElement ? returnTarget : elements.toggle;
    markAnnouncementRead(announcement, { render: false });
    fillDetail(announcement);
    setPanelOpen(false, { focus: false });
    elements.detailBackdrop.hidden = false;
    document.body.classList.add("announcement-detail-is-open");
    render();
    window.requestAnimationFrame(() => elements.detailClose.focus());
  }

  function closeDetail() {
    if (!elements.detailBackdrop || elements.detailBackdrop.hidden) return;
    elements.detailBackdrop.hidden = true;
    document.body.classList.remove("announcement-detail-is-open");
    detailAnnouncementId = "";
    const focusTarget = detailReturnTarget;
    detailReturnTarget = null;
    focusTarget?.focus?.();
  }

  function createAnnouncementItem(announcement, seen) {
    const unread = isUnread(announcement, seen);
    const article = document.createElement("article");
    article.className = [
      "announcement-item",
      unread ? "is-unread" : "is-read",
      announcement.pinned ? "is-pinned" : ""
    ].filter(Boolean).join(" ");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "announcement-item-open";
    button.setAttribute("aria-label", `${unread ? "未读" : "已读"}公告：${announcement.title}，查看详情`);

    const badges = document.createElement("div");
    badges.className = "announcement-item-badges";
    badges.append(
      createBadge(unread ? "未读" : "已读", "announcement-read-state", unread ? "unread" : "read"),
      createBadge(levelLabel(announcement.level), "announcement-item-level", announcement.level)
    );
    if (announcement.pinned) {
      badges.appendChild(createBadge("置顶", "announcement-pin-state", "pinned"));
    }

    const title = document.createElement("h2");
    title.textContent = announcement.title;

    const summary = document.createElement("p");
    summary.className = "announcement-item-summary";
    summary.textContent = compactText(announcement.content);

    const footer = document.createElement("div");
    footer.className = "announcement-item-footer";
    const time = document.createElement("span");
    time.textContent = formatTime(announcement.publishedAt || announcement.updatedAt);
    const action = document.createElement("strong");
    action.textContent = "查看详情";
    footer.append(time, action);

    button.append(badges, title, summary, footer);
    button.addEventListener("click", () => openDetail(announcement, button));
    article.appendChild(button);
    return article;
  }

  function filteredRows(seen) {
    if (activeFilter === "unread") {
      return announcements.filter((announcement) => isUnread(announcement, seen));
    }
    if (activeFilter === "read") {
      return announcements.filter((announcement) => !isUnread(announcement, seen));
    }
    if (activeFilter === "pinned") {
      return announcements.filter((announcement) => announcement.pinned);
    }
    return announcements;
  }

  function announcementModules(seen) {
    if (activeFilter !== "all") {
      const definition = filterDefinitions.find((filter) => filter.key === activeFilter);
      return [{
        key: activeFilter,
        title: `${definition?.label || "公告"}公告`,
        rows: filteredRows(seen)
      }];
    }

    const pinned = announcements.filter((announcement) => announcement.pinned);
    const regular = announcements.filter((announcement) => !announcement.pinned);
    return [
      {
        key: "pinned",
        title: "置顶公告",
        rows: pinned
      },
      {
        key: "unread",
        title: "未读公告",
        rows: regular.filter((announcement) => isUnread(announcement, seen))
      },
      {
        key: "read",
        title: "已读公告",
        rows: regular.filter((announcement) => !isUnread(announcement, seen))
      }
    ].filter((module) => module.rows.length);
  }

  function renderFilters(seen) {
    const counts = filterCounts(seen);
    elements.filters?.querySelectorAll("[data-announcement-filter]").forEach((button) => {
      const key = button.dataset.announcementFilter;
      const active = key === activeFilter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
      const count = button.querySelector("strong");
      if (count) count.textContent = String(counts[key] || 0);
    });
  }

  function renderEmptyState() {
    const definition = filterDefinitions.find((filter) => filter.key === activeFilter);
    const empty = document.createElement("div");
    empty.className = "announcement-empty-state";
    const title = document.createElement("strong");
    title.textContent = activeFilter === "all"
      ? "暂无公告"
      : `暂无${definition?.label || ""}公告`;
    const copy = document.createElement("span");
    copy.textContent = activeFilter === "unread"
      ? "你已经查看了全部公告。"
      : activeFilter === "pinned"
        ? "当前没有置顶公告。"
        : "最新更新会在这里出现。";
    empty.append(title, copy);
    elements.list.appendChild(empty);
  }

  function renderList(seen) {
    elements.list.replaceChildren();
    const modules = announcementModules(seen);
    if (!modules.length) {
      renderEmptyState();
      return;
    }

    const fragment = document.createDocumentFragment();
    modules.forEach((module) => {
      const section = document.createElement("section");
      section.className = `announcement-module announcement-module-${module.key}`;

      const heading = document.createElement("div");
      heading.className = "announcement-module-heading";
      const title = document.createElement("strong");
      title.textContent = module.title;
      const count = document.createElement("span");
      count.textContent = `${module.rows.length} 条`;
      heading.append(title, count);

      const items = document.createElement("div");
      items.className = "announcement-module-items";
      module.rows.forEach((announcement) => {
        items.appendChild(createAnnouncementItem(announcement, seen));
      });

      section.append(heading, items);
      fragment.appendChild(section);
    });
    elements.list.appendChild(fragment);
  }

  function renderBanner(seen) {
    const dismissed = readDismissed();
    const featured = announcements.find((announcement) => (
      isUnread(announcement, seen)
      && (announcement.pinned || announcement.level === "important")
      && dismissed[announcement.id] !== announcement.updatedAt
    ));
    if (!featured) {
      elements.banner.hidden = true;
      elements.banner.removeAttribute("data-announcement-id");
      return;
    }
    elements.banner.hidden = false;
    elements.banner.dataset.level = featured.level;
    elements.banner.dataset.announcementId = featured.id;
    elements.bannerType.textContent = levelLabel(featured.level);
    elements.bannerTitle.textContent = featured.title;
    elements.bannerContent.textContent = compactText(featured.content, 96);
  }

  function render() {
    const seen = readSeen();
    const counts = filterCounts(seen);
    elements.badge.hidden = counts.unread === 0;
    elements.badge.textContent = counts.unread > 99 ? "99+" : String(counts.unread);
    elements.summary.textContent = `${counts.unread} 条未读 · ${counts.pinned} 条置顶 · 共 ${counts.all} 条`;
    elements.markRead.disabled = counts.unread === 0;
    renderFilters(seen);
    renderList(seen);
    renderBanner(seen);
  }

  function applyPayload(payload = {}) {
    announcements = Array.isArray(payload.announcements)
      ? payload.announcements.filter((announcement) => announcement?.id)
      : [];

    if (detailAnnouncementId) {
      const detailAnnouncement = announcements.find(
        (announcement) => announcement.id === detailAnnouncementId
      );
      if (detailAnnouncement) {
        markAnnouncementRead(detailAnnouncement, { render: false });
        fillDetail(detailAnnouncement);
      } else {
        closeDetail();
      }
    }
    render();
  }

  async function fetchAnnouncements() {
    try {
      const response = await fetch(new URL("api/announcements", document.baseURI), {
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`公告接口返回 ${response.status}`);
      applyPayload(await response.json());
    } catch (error) {
      console.warn("System announcements refresh failed:", error.message);
    }
  }

  function connectStream() {
    if (!("EventSource" in window) || eventSource) return;
    clearTimeout(reconnectTimer);
    eventSource = new EventSource(new URL("api/announcements/stream", document.baseURI));
    eventSource.addEventListener("announcements", (event) => {
      try {
        applyPayload(JSON.parse(event.data || "{}"));
      } catch (error) {
        console.warn("System announcement event ignored:", error.message);
      }
    });
    eventSource.addEventListener("error", () => {
      eventSource?.close();
      eventSource = null;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectStream, 10000);
    });
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (document.visibilityState === "visible") fetchAnnouncements();
    }, 60000);
  }

  createFilterBar();
  createDetailDialog();

  elements.toggle.addEventListener("click", () => {
    setPanelOpen(elements.panel.hidden);
  });

  elements.markRead.addEventListener("click", markAllRead);
  elements.bannerOpen.addEventListener("click", () => {
    const announcement = announcements.find(
      (item) => item.id === elements.banner.dataset.announcementId
    );
    openDetail(announcement, elements.bannerOpen);
  });
  elements.bannerClose.addEventListener("click", () => {
    const announcement = announcements.find(
      (item) => item.id === elements.banner.dataset.announcementId
    );
    dismissBanner(announcement);
  });

  document.addEventListener("click", (event) => {
    if (
      elements.panel.hidden
      || elements.center.contains(event.target)
      || elements.banner.contains(event.target)
    ) return;
    setPanelOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!elements.detailBackdrop.hidden) {
      closeDetail();
      return;
    }
    if (!elements.panel.hidden) {
      setPanelOpen(false);
      elements.toggle.focus();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fetchAnnouncements();
  });

  window.addEventListener("beforeunload", () => {
    eventSource?.close();
    clearInterval(pollTimer);
    clearTimeout(reconnectTimer);
  });

  fetchAnnouncements();
  connectStream();
  startPolling();
})();
