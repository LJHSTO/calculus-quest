(function setupAnnouncementAdmin() {
  const elements = {
    form: document.getElementById("announcement-form"),
    id: document.getElementById("announcement-id"),
    title: document.getElementById("announcement-title"),
    content: document.getElementById("announcement-content"),
    level: document.getElementById("announcement-level"),
    pinned: document.getElementById("announcement-pinned"),
    startsAt: document.getElementById("announcement-starts-at"),
    expiresAt: document.getElementById("announcement-expires-at"),
    charCount: document.getElementById("announcement-char-count"),
    status: document.getElementById("announcement-form-status"),
    editorTitle: document.getElementById("announcement-editor-title"),
    editorNote: document.getElementById("announcement-editor-note"),
    save: document.getElementById("announcement-save-btn"),
    publish: document.getElementById("announcement-publish-btn"),
    withdraw: document.getElementById("announcement-withdraw-btn"),
    newButton: document.getElementById("announcement-new-btn"),
    refresh: document.getElementById("announcement-refresh-btn"),
    summary: document.getElementById("announcement-list-summary"),
    list: document.getElementById("announcement-admin-list")
  };

  if (!elements.form || !elements.list) return;

  const contentLimit = Number(elements.content.maxLength) > 0
    ? Number(elements.content.maxLength)
    : 5000;
  let announcements = [];
  let currentAnnouncement = null;
  let loading = false;

  function escapeText(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(message = "", tone = "muted") {
    elements.status.textContent = message;
    elements.status.dataset.tone = tone;
  }

  function setBusy(busy) {
    loading = busy;
    [elements.save, elements.publish, elements.withdraw, elements.newButton, elements.refresh]
      .filter(Boolean)
      .forEach((button) => {
        button.disabled = busy;
      });
  }

  function toLocalInput(value = "") {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }

  function toIso(value = "") {
    if (!value) return "";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : "";
  }

  function formatTime(value = "") {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function displayStatus(announcement) {
    if (announcement.status === "draft") return { key: "draft", label: "草稿" };
    if (announcement.status === "withdrawn") return { key: "withdrawn", label: "已撤回" };
    const now = Date.now();
    const startsAt = Date.parse(announcement.startsAt || "");
    const expiresAt = Date.parse(announcement.expiresAt || "");
    if (Number.isFinite(startsAt) && startsAt > now) return { key: "scheduled", label: "待生效" };
    if (Number.isFinite(expiresAt) && expiresAt <= now) return { key: "expired", label: "已失效" };
    return { key: "published", label: "已发布" };
  }

  function levelLabel(level) {
    return ({
      update: "功能更新",
      maintenance: "维护通知",
      important: "重要通知"
    })[level] || "功能更新";
  }

  function formPayload() {
    return {
      title: elements.title.value.trim(),
      content: elements.content.value.trim(),
      level: elements.level.value,
      pinned: elements.pinned.checked,
      startsAt: toIso(elements.startsAt.value),
      expiresAt: toIso(elements.expiresAt.value)
    };
  }

  async function request(path, options = {}) {
    const requestHeaders = options.body === undefined ? {} : { "Content-Type": "application/json" };
    const headers = window.CQAdminAuth?.headers
      ? window.CQAdminAuth.headers(requestHeaders)
      : (adminToken ? { ...requestHeaders, Authorization: `Bearer ${adminToken}` } : requestHeaders);
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.message || "公告操作失败，请稍后重试。");
      error.status = response.status;
      error.code = payload.code || "";
      throw error;
    }
    return payload;
  }

  function resetForm() {
    currentAnnouncement = null;
    elements.form.reset();
    elements.id.value = "";
    elements.level.value = "update";
    elements.editorTitle.textContent = "新建公告";
    elements.editorNote.textContent = "先保存草稿，确认内容后再发布。";
    elements.save.textContent = "保存草稿";
    elements.publish.classList.remove("hidden");
    elements.publish.textContent = "发布公告";
    elements.withdraw.classList.add("hidden");
    elements.charCount.textContent = `0 / ${contentLimit}`;
    setStatus("");
    renderList();
    elements.title.focus();
  }

  function selectAnnouncement(announcement) {
    currentAnnouncement = announcement;
    elements.id.value = announcement.id;
    elements.title.value = announcement.title;
    elements.content.value = announcement.content;
    elements.level.value = announcement.level;
    elements.pinned.checked = announcement.pinned;
    elements.startsAt.value = toLocalInput(announcement.startsAt);
    elements.expiresAt.value = toLocalInput(announcement.expiresAt);
    elements.charCount.textContent = `${announcement.content.length} / ${contentLimit}`;
    const status = displayStatus(announcement);
    elements.editorTitle.textContent = `编辑：${announcement.title}`;
    elements.editorNote.textContent = announcement.status === "published"
      ? "这条公告已发布，保存修改后会立即同步并重新标记为未读。"
      : "可继续编辑，也可以直接发布。";
    elements.save.textContent = announcement.status === "published" ? "保存并同步" : "保存修改";
    elements.publish.classList.toggle("hidden", announcement.status === "published");
    elements.publish.textContent = announcement.status === "withdrawn" ? "重新发布" : "发布公告";
    elements.withdraw.classList.toggle("hidden", announcement.status !== "published");
    setStatus(`${status.label} · 最近更新 ${formatTime(announcement.updatedAt)}`);
    renderList();
    elements.title.focus();
  }

  function renderSummary() {
    const totals = announcements.reduce((result, announcement) => {
      const key = displayStatus(announcement).key;
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
    elements.summary.innerHTML = [
      `共 ${announcements.length} 条`,
      `已发布 ${totals.published || 0} 条`,
      `待生效 ${totals.scheduled || 0} 条`,
      `草稿 ${totals.draft || 0} 条`
    ].map((text) => `<span>${text}</span>`).join("");
  }

  function itemTimeText(announcement) {
    const parts = [];
    if (announcement.startsAt) parts.push(`生效：${formatTime(announcement.startsAt)}`);
    if (announcement.expiresAt) parts.push(`失效：${formatTime(announcement.expiresAt)}`);
    if (!parts.length) parts.push(`更新：${formatTime(announcement.updatedAt)}`);
    return parts.join(" · ");
  }

  function renderList() {
    renderSummary();
    if (!announcements.length) {
      elements.list.innerHTML = '<div class="announcement-empty">还没有公告，先从左侧新建一条。</div>';
      return;
    }
    elements.list.innerHTML = announcements.map((announcement) => {
      const status = displayStatus(announcement);
      const selected = currentAnnouncement?.id === announcement.id;
      const publishAction = announcement.status === "published"
        ? '<button class="btn btn-sm btn-outline" type="button" data-announcement-action="withdraw">撤回</button>'
        : '<button class="btn btn-sm btn-primary" type="button" data-announcement-action="publish">发布</button>';
      return `
        <article class="announcement-admin-item${selected ? " is-selected" : ""}" data-announcement-id="${escapeText(announcement.id)}">
          <div class="announcement-admin-item-head">
            <h4>${escapeText(announcement.title)}</h4>
            <span class="announcement-status" data-status="${status.key}">${status.label}</span>
          </div>
          <div class="announcement-admin-meta">
            <span class="announcement-level" data-level="${escapeText(announcement.level)}">${levelLabel(announcement.level)}</span>
            ${announcement.pinned ? '<span class="announcement-status" data-status="scheduled">已置顶</span>' : ""}
          </div>
          <p>${escapeText(announcement.content)}</p>
          <span class="announcement-admin-time">${escapeText(itemTimeText(announcement))}</span>
          <div class="announcement-admin-actions">
            <button class="btn btn-sm btn-outline" type="button" data-announcement-action="edit">编辑</button>
            ${publishAction}
            <button class="btn btn-sm btn-outline announcement-danger" type="button" data-announcement-action="delete">删除</button>
          </div>
        </article>
      `;
    }).join("");
  }

  async function load(options = {}) {
    const hasAccess = window.CQAdminAuth?.hasAccess?.() || Boolean(adminToken);
    if (!hasAccess || (loading && options.force !== true)) return;
    const previousLoading = loading;
    setBusy(true);
    try {
      const payload = await request("/api/admin/announcements");
      announcements = Array.isArray(payload.announcements) ? payload.announcements : [];
      if (currentAnnouncement) {
        currentAnnouncement = announcements.find((item) => item.id === currentAnnouncement.id) || null;
      }
      renderList();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(previousLoading);
    }
  }

  async function saveAnnouncement() {
    const id = elements.id.value;
    const payload = await request(
      id ? `/api/admin/announcements/${encodeURIComponent(id)}` : "/api/admin/announcements",
      {
        method: id ? "PUT" : "POST",
        body: formPayload()
      }
    );
    currentAnnouncement = payload.announcement;
    await load({ force: true });
    selectAnnouncement(
      announcements.find((announcement) => announcement.id === payload.announcement.id)
        || payload.announcement
    );
    return currentAnnouncement;
  }

  async function runAction(announcement, action) {
    if (!announcement || loading) return;
    setBusy(true);
    try {
      if (action === "edit") {
        selectAnnouncement(announcement);
        return;
      }
      if (action === "delete") {
        const confirmed = window.confirm(`确定删除公告“${announcement.title}”吗？此操作不可撤销。`);
        if (!confirmed) return;
        await request(`/api/admin/announcements/${encodeURIComponent(announcement.id)}`, {
          method: "DELETE"
        });
        if (currentAnnouncement?.id === announcement.id) resetForm();
        await load({ force: true });
        setStatus("公告已删除。", "success");
        return;
      }
      await request(
        `/api/admin/announcements/${encodeURIComponent(announcement.id)}/${action}`,
        { method: "POST", body: {} }
      );
      await load({ force: true });
      const updated = announcements.find((item) => item.id === announcement.id);
      if (updated) selectAnnouncement(updated);
      setStatus(action === "publish" ? "公告已发布并实时同步。" : "公告已撤回。", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  elements.content.addEventListener("input", () => {
    elements.charCount.textContent = `${elements.content.value.length} / ${contentLimit}`;
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (loading) return;
    setBusy(true);
    try {
      const saved = await saveAnnouncement();
      setStatus(
        saved.status === "published" ? "修改已同步给在线学生。" : "草稿已保存。",
        "success"
      );
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  });

  elements.publish.addEventListener("click", async () => {
    if (loading) return;
    setBusy(true);
    try {
      const saved = await saveAnnouncement();
      await request(`/api/admin/announcements/${encodeURIComponent(saved.id)}/publish`, {
        method: "POST",
        body: {}
      });
      await load({ force: true });
      const published = announcements.find((announcement) => announcement.id === saved.id);
      if (published) selectAnnouncement(published);
      setStatus("公告已发布并实时同步。", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  });

  elements.withdraw.addEventListener("click", () => {
    runAction(currentAnnouncement, "withdraw");
  });

  elements.newButton.addEventListener("click", resetForm);
  elements.refresh.addEventListener("click", load);
  document.getElementById("refresh-btn")?.addEventListener("click", load);

  elements.list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-announcement-action]");
    const item = event.target.closest("[data-announcement-id]");
    if (!button || !item) return;
    const announcement = announcements.find((entry) => entry.id === item.dataset.announcementId);
    runAction(announcement, button.dataset.announcementAction);
  });

  window.CQAnnouncementAdmin = { load };
  if (!document.getElementById("app")?.classList.contains("hidden")) {
    queueMicrotask(load);
  }
})();
