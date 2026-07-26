const ANNOUNCEMENT_LEVELS = new Set(["update", "maintenance", "important"]);

function announcementError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function cleanAnnouncementText(value, limit, multiline = false) {
  const source = String(value ?? "").replace(/\u0000/g, "");
  const normalized = multiline
    ? source.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n")
    : source.replace(/\s+/g, " ");
  return normalized.trim().slice(0, limit);
}

function optionalIso(value, fieldName) {
  const source = String(value || "").trim();
  if (!source) return "";
  const timestamp = Date.parse(source);
  if (!Number.isFinite(timestamp)) {
    throw announcementError(
      "announcement_time_invalid",
      `${fieldName}不是有效的日期时间。`
    );
  }
  return new Date(timestamp).toISOString();
}

function sanitizeAnnouncementInput(input = {}) {
  const title = cleanAnnouncementText(input.title, 80);
  const content = cleanAnnouncementText(input.content, 2000, true);
  const level = ANNOUNCEMENT_LEVELS.has(String(input.level || "").trim())
    ? String(input.level).trim()
    : "update";
  const startsAt = optionalIso(input.startsAt, "生效时间");
  const expiresAt = optionalIso(input.expiresAt, "失效时间");

  if (!title) {
    throw announcementError("announcement_title_required", "请输入公告标题。");
  }
  if (!content) {
    throw announcementError("announcement_content_required", "请输入公告正文。");
  }
  if (startsAt && expiresAt && expiresAt <= startsAt) {
    throw announcementError(
      "announcement_time_range_invalid",
      "失效时间必须晚于生效时间。"
    );
  }

  return {
    title,
    content,
    level,
    pinned: input.pinned === true || Number(input.pinned || 0) === 1,
    startsAt,
    expiresAt
  };
}

function assertPublishableAnnouncement(announcement = {}, now = new Date()) {
  const nowIso = now.toISOString();
  if (announcement.expires_at && announcement.expires_at <= nowIso) {
    throw announcementError(
      "announcement_already_expired",
      "失效时间已经过去，请调整后再发布。"
    );
  }
}

function publicAnnouncement(row = {}) {
  return {
    id: row.id || "",
    title: row.title || "",
    content: row.content || "",
    level: ANNOUNCEMENT_LEVELS.has(row.level) ? row.level : "update",
    pinned: Number(row.pinned || 0) === 1,
    startsAt: row.starts_at || "",
    expiresAt: row.expires_at || "",
    publishedAt: row.published_at || "",
    updatedAt: row.updated_at || row.published_at || ""
  };
}

function adminAnnouncement(row = {}) {
  return {
    ...publicAnnouncement(row),
    status: ["draft", "published", "withdrawn"].includes(row.status)
      ? row.status
      : "draft",
    createdAt: row.created_at || ""
  };
}

module.exports = {
  sanitizeAnnouncementInput,
  assertPublishableAnnouncement,
  publicAnnouncement,
  adminAnnouncement
};
