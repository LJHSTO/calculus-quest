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
  let announcements = [];
  let eventSource = null;
  let pollTimer = null;
  let reconnectTimer = null;

  function readSeen() {
    try {
      const value = JSON.parse(localStorage.getItem(seenStorageKey) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function writeSeen(seen) {
    try {
      const activeIds = new Set(announcements.map((announcement) => announcement.id));
      const compact = Object.fromEntries(
        Object.entries(seen)
          .filter(([id]) => activeIds.has(id))
          .slice(-100)
      );
      localStorage.setItem(seenStorageKey, JSON.stringify(compact));
    } catch {}
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

  function formatTime(value = "") {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function setPanelOpen(open) {
    elements.panel.hidden = !open;
    elements.toggle.setAttribute("aria-expanded", open ? "true" : "false");
    elements.toggle.setAttribute("aria-label", open ? "关闭系统公告" : "打开系统公告");
    if (open) {
      markAllRead();
      elements.panel.querySelector(".announcement-item")?.focus?.();
    }
  }

  function markAnnouncementRead(announcement) {
    if (!announcement?.id) return;
    const seen = readSeen();
    seen[announcement.id] = announcement.updatedAt;
    writeSeen(seen);
    render();
  }

  function markAllRead() {
    const seen = readSeen();
    announcements.forEach((announcement) => {
      seen[announcement.id] = announcement.updatedAt;
    });
    writeSeen(seen);
    render();
  }

  function createAnnouncementItem(announcement, seen) {
    const article = document.createElement("article");
    article.className = `announcement-item${isUnread(announcement, seen) ? " is-unread" : ""}`;
    article.tabIndex = -1;

    const head = document.createElement("div");
    head.className = "announcement-item-head";
    const title = document.createElement("h2");
    title.textContent = announcement.title;
    const level = document.createElement("span");
    level.className = "announcement-item-level";
    level.dataset.level = announcement.level;
    level.textContent = levelLabel(announcement.level);
    head.append(title, level);

    const content = document.createElement("p");
    content.textContent = announcement.content;

    const meta = document.createElement("div");
    meta.className = "announcement-item-meta";
    const time = document.createElement("span");
    time.textContent = `发布于 ${formatTime(announcement.publishedAt || announcement.updatedAt)}`;
    meta.appendChild(time);
    if (announcement.pinned) {
      const pinned = document.createElement("span");
      pinned.textContent = "置顶";
      meta.appendChild(pinned);
    }

    article.append(head, content, meta);
    return article;
  }

  function renderList(seen) {
    elements.list.replaceChildren();
    if (!announcements.length) {
      const empty = document.createElement("div");
      empty.className = "announcement-empty-state";
      const title = document.createElement("strong");
      title.textContent = "暂无公告";
      const copy = document.createElement("span");
      copy.textContent = "最新更新会在这里出现。";
      empty.append(title, copy);
      elements.list.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    announcements.forEach((announcement) => {
      fragment.appendChild(createAnnouncementItem(announcement, seen));
    });
    elements.list.appendChild(fragment);
  }

  function renderBanner(seen) {
    const featured = announcements.find(
      (announcement) => isUnread(announcement, seen) && (announcement.pinned || announcement.level === "important")
    );
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
    elements.bannerContent.textContent = featured.content.replace(/\s+/g, " ").trim();
  }

  function render() {
    const seen = readSeen();
    const unreadCount = announcements.filter((announcement) => isUnread(announcement, seen)).length;
    elements.badge.hidden = unreadCount === 0;
    elements.badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    elements.summary.textContent = unreadCount ? `${unreadCount} 条未读` : "已查看全部公告";
    elements.markRead.disabled = unreadCount === 0;
    renderList(seen);
    renderBanner(seen);
  }

  function applyPayload(payload = {}) {
    announcements = Array.isArray(payload.announcements)
      ? payload.announcements.filter((announcement) => announcement?.id)
      : [];
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

  elements.toggle.addEventListener("click", () => {
    setPanelOpen(elements.panel.hidden);
  });

  elements.markRead.addEventListener("click", markAllRead);
  elements.bannerOpen.addEventListener("click", () => setPanelOpen(true));
  elements.bannerClose.addEventListener("click", () => {
    const announcement = announcements.find(
      (item) => item.id === elements.banner.dataset.announcementId
    );
    markAnnouncementRead(announcement);
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
    if (event.key !== "Escape" || elements.panel.hidden) return;
    setPanelOpen(false);
    elements.toggle.focus();
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
