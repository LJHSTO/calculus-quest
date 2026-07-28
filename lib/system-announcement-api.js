const crypto = require("crypto");
const systemAnnouncements = require("./system-announcements");

const subscribers = new Set();

function queryOne(database, sql, params = []) {
  const statement = database.prepare(sql);
  statement.bind(params);
  const row = statement.step() ? statement.getAsObject() : null;
  statement.free();
  return row;
}

function queryAll(database, sql, params = []) {
  const statement = database.prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

function ensureSchema(database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS system_announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'update',
      status TEXT NOT NULL DEFAULT 'draft',
      pinned INTEGER NOT NULL DEFAULT 0,
      starts_at TEXT DEFAULT '',
      expires_at TEXT DEFAULT '',
      published_at TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_announcements_status_time ON system_announcements(status, starts_at, expires_at)"
  );
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_announcements_updated ON system_announcements(updated_at)"
  );
  database.run(`
    CREATE TABLE IF NOT EXISTS system_announcement_reads (
      user_id TEXT NOT NULL REFERENCES users(id),
      announcement_id TEXT NOT NULL REFERENCES system_announcements(id) ON DELETE CASCADE,
      announcement_updated_at TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (user_id, announcement_id)
    )
  `);
  database.run(
    "CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON system_announcement_reads(user_id, read_at)"
  );
}

function getAnnouncement(database, id) {
  return queryOne(database, "SELECT * FROM system_announcements WHERE id = ?", [id]);
}

function listAnnouncements(database, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 500));
  if (options.activeOnly) {
    const currentIso = String(options.currentIso || new Date().toISOString());
    return queryAll(
      database,
      `SELECT *
       FROM system_announcements
       WHERE status = 'published'
         AND (COALESCE(starts_at, '') = '' OR starts_at <= ?)
         AND (COALESCE(expires_at, '') = '' OR expires_at > ?)
       ORDER BY pinned DESC,
         CASE level WHEN 'important' THEN 0 WHEN 'maintenance' THEN 1 ELSE 2 END,
         published_at DESC, updated_at DESC
       LIMIT ?`,
      [currentIso, currentIso, limit]
    );
  }
  return queryAll(
    database,
    `SELECT *
     FROM system_announcements
     ORDER BY updated_at DESC, created_at DESC
     LIMIT ?`,
    [limit]
  );
}

function insertAnnouncement(database, record) {
  database.run(
    `INSERT INTO system_announcements
      (id, title, content, level, status, pinned, starts_at, expires_at,
       published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.title,
      record.content,
      record.level || "update",
      record.status || "draft",
      record.pinned ? 1 : 0,
      record.starts_at || "",
      record.expires_at || "",
      record.published_at || "",
      record.created_at,
      record.updated_at
    ]
  );
  return getAnnouncement(database, record.id);
}

function updateAnnouncement(database, record) {
  database.run(
    `UPDATE system_announcements
     SET title = ?, content = ?, level = ?, pinned = ?, starts_at = ?,
         expires_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      record.title,
      record.content,
      record.level || "update",
      record.pinned ? 1 : 0,
      record.starts_at || "",
      record.expires_at || "",
      record.updated_at,
      record.id
    ]
  );
  return getAnnouncement(database, record.id);
}

function setAnnouncementStatus(database, id, status, updatedAt) {
  const publishedAt = status === "published" ? updatedAt : "";
  database.run(
    `UPDATE system_announcements
     SET status = ?, published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END,
         updated_at = ?
     WHERE id = ?`,
    [status, status, publishedAt, updatedAt, id]
  );
  return getAnnouncement(database, id);
}

function deleteAnnouncement(database, id) {
  const existing = getAnnouncement(database, id);
  if (!existing) return false;
  database.run("DELETE FROM system_announcement_reads WHERE announcement_id = ?", [id]);
  database.run("DELETE FROM system_announcements WHERE id = ?", [id]);
  return true;
}

function isActiveAnnouncement(row = {}, currentIso = new Date().toISOString()) {
  return row.status === "published"
    && (!row.starts_at || row.starts_at <= currentIso)
    && (!row.expires_at || row.expires_at > currentIso);
}

function readVersionsFor(database, userId, rows = []) {
  if (!userId || !rows.length) return {};
  const ids = rows.map((row) => row.id).filter(Boolean);
  if (!ids.length) return {};
  const placeholders = ids.map(() => "?").join(", ");
  const receipts = queryAll(
    database,
    `SELECT announcement_id, announcement_updated_at
     FROM system_announcement_reads
     WHERE user_id = ? AND announcement_id IN (${placeholders})`,
    [userId, ...ids]
  );
  const currentVersions = new Map(rows.map((row) => [row.id, row.updated_at || ""]));
  return Object.fromEntries(
    receipts
      .filter((receipt) => (
        currentVersions.get(receipt.announcement_id) === receipt.announcement_updated_at
      ))
      .map((receipt) => [receipt.announcement_id, receipt.announcement_updated_at])
  );
}

function saveReadReceipt(database, userId, announcement, readAt) {
  database.run(
    `INSERT OR REPLACE INTO system_announcement_reads
      (user_id, announcement_id, announcement_updated_at, read_at)
     VALUES (?, ?, ?, ?)`,
    [userId, announcement.id, announcement.updated_at || "", readAt]
  );
}

function activePayload(database, options = {}) {
  const currentIso = new Date().toISOString();
  const rows = listAnnouncements(database, {
    activeOnly: true,
    currentIso,
    limit: 20
  });
  const participantId = String(options.participantId || "").trim();
  return {
    announcements: rows.map(systemAnnouncements.publicAnnouncement),
    updatedAt: currentIso,
    ...(participantId
      ? {
          readState: {
            participantId,
            versions: readVersionsFor(database, participantId, rows)
          }
        }
      : {})
  };
}

function writeEvent(response, payload) {
  if (response.writableEnded || response.destroyed) return false;
  response.write(`event: announcements\ndata: ${JSON.stringify(payload)}\n\n`);
  return true;
}

function broadcast(database) {
  const payload = activePayload(database);
  for (const subscriber of subscribers) {
    try {
      if (!writeEvent(subscriber.response, payload)) {
        clearInterval(subscriber.heartbeat);
        subscribers.delete(subscriber);
      }
    } catch {
      clearInterval(subscriber.heartbeat);
      subscribers.delete(subscriber);
    }
  }
}

function openStream(request, response, database) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  response.flushHeaders?.();
  response.write("retry: 10000\n\n");
  writeEvent(response, activePayload(database));

  const subscriber = {
    response,
    heartbeat: setInterval(() => {
      if (response.writableEnded || response.destroyed) return;
      response.write(": keepalive\n\n");
    }, 25000)
  };
  subscriber.heartbeat.unref?.();
  subscribers.add(subscriber);

  const close = () => {
    clearInterval(subscriber.heartbeat);
    subscribers.delete(subscriber);
  };
  request.once("close", close);
  response.once("close", close);
  response.once("error", close);
}

function closeStreams() {
  for (const subscriber of subscribers) {
    clearInterval(subscriber.heartbeat);
    try { subscriber.response.end(); } catch {}
  }
  subscribers.clear();
}

async function handle(context) {
  const {
    req,
    res,
    url,
    db,
    authenticate,
    checkAdmin,
    readJsonBody,
    sendJson
  } = context;
  const database = db.getDbSync();

  if (req.method === "GET" && url.pathname === "/api/announcements") {
    const auth = authenticate(req);
    sendJson(res, 200, {
      ok: true,
      ...activePayload(database, {
        participantId: auth?.participant?.id || ""
      })
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/announcements/stream") {
    openStream(req, res, database);
    return true;
  }

  const readMatch = url.pathname.match(/^\/api\/announcements\/([^/]+)\/read$/);
  if (readMatch && req.method === "POST") {
    const auth = authenticate(req);
    if (!auth) {
      sendJson(res, 401, { ok: false, message: "请先登录。" });
      return true;
    }
    const announcementId = decodeURIComponent(readMatch[1]);
    const announcement = getAnnouncement(database, announcementId);
    const currentIso = new Date().toISOString();
    if (!announcement || !isActiveAnnouncement(announcement, currentIso)) {
      sendJson(res, 404, {
        ok: false,
        code: "announcement_not_active",
        message: "公告不存在或当前不可阅读。"
      });
      return true;
    }
    saveReadReceipt(database, auth.participant.id, announcement, currentIso);
    db.saveNow();
    sendJson(res, 200, {
      ok: true,
      readState: {
        participantId: auth.participant.id,
        versions: {
          [announcement.id]: announcement.updated_at || ""
        }
      }
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/announcements/read-all") {
    const auth = authenticate(req);
    if (!auth) {
      sendJson(res, 401, { ok: false, message: "请先登录。" });
      return true;
    }
    const currentIso = new Date().toISOString();
    const rows = listAnnouncements(database, {
      activeOnly: true,
      currentIso,
      limit: 20
    });
    rows.forEach((announcement) => {
      saveReadReceipt(database, auth.participant.id, announcement, currentIso);
    });
    db.saveNow();
    sendJson(res, 200, {
      ok: true,
      readState: {
        participantId: auth.participant.id,
        versions: readVersionsFor(database, auth.participant.id, rows)
      }
    });
    return true;
  }

  if (!url.pathname.startsWith("/api/admin/announcements")) return false;
  if (!checkAdmin(req)) {
    sendJson(res, 403, { ok: false, message: "需要管理员密码。" });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/announcements") {
    sendJson(res, 200, {
      ok: true,
      announcements: listAnnouncements(database, { limit: 200 })
        .map(systemAnnouncements.adminAnnouncement),
      currentTime: new Date().toISOString()
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/announcements") {
    const body = await readJsonBody(req);
    const input = systemAnnouncements.sanitizeAnnouncementInput(body);
    const timestamp = new Date().toISOString();
    const announcement = insertAnnouncement(database, {
      id: crypto.randomUUID(),
      title: input.title,
      content: input.content,
      level: input.level,
      status: "draft",
      pinned: input.pinned,
      starts_at: input.startsAt,
      expires_at: input.expiresAt,
      published_at: "",
      created_at: timestamp,
      updated_at: timestamp
    });
    db.saveNow();
    sendJson(res, 201, {
      ok: true,
      announcement: systemAnnouncements.adminAnnouncement(announcement)
    });
    return true;
  }

  const actionMatch = url.pathname.match(
    /^\/api\/admin\/announcements\/([^/]+)\/(publish|withdraw)$/
  );
  if (actionMatch && req.method === "POST") {
    const announcementId = decodeURIComponent(actionMatch[1]);
    const action = actionMatch[2];
    const existing = getAnnouncement(database, announcementId);
    if (!existing) {
      sendJson(res, 404, {
        ok: false,
        code: "announcement_not_found",
        message: "公告不存在或已删除。"
      });
      return true;
    }
    if (action === "publish") {
      systemAnnouncements.assertPublishableAnnouncement(existing);
    }
    const updated = setAnnouncementStatus(
      database,
      announcementId,
      action === "publish" ? "published" : "withdrawn",
      new Date().toISOString()
    );
    db.saveNow();
    broadcast(database);
    sendJson(res, 200, {
      ok: true,
      announcement: systemAnnouncements.adminAnnouncement(updated)
    });
    return true;
  }

  const announcementMatch = url.pathname.match(/^\/api\/admin\/announcements\/([^/]+)$/);
  if (announcementMatch && ["PUT", "DELETE"].includes(req.method)) {
    const announcementId = decodeURIComponent(announcementMatch[1]);
    const existing = getAnnouncement(database, announcementId);
    if (!existing) {
      sendJson(res, 404, {
        ok: false,
        code: "announcement_not_found",
        message: "公告不存在或已删除。"
      });
      return true;
    }
    if (req.method === "DELETE") {
      deleteAnnouncement(database, announcementId);
      db.saveNow();
      if (existing.status === "published") broadcast(database);
      sendJson(res, 200, { ok: true, deleted: true, announcementId });
      return true;
    }

    const body = await readJsonBody(req);
    const input = systemAnnouncements.sanitizeAnnouncementInput(body);
    if (existing.status === "published") {
      systemAnnouncements.assertPublishableAnnouncement({
        ...existing,
        starts_at: input.startsAt,
        expires_at: input.expiresAt
      });
    }
    const updated = updateAnnouncement(database, {
      id: announcementId,
      title: input.title,
      content: input.content,
      level: input.level,
      pinned: input.pinned,
      starts_at: input.startsAt,
      expires_at: input.expiresAt,
      updated_at: new Date().toISOString()
    });
    db.saveNow();
    if (updated.status === "published") broadcast(database);
    sendJson(res, 200, {
      ok: true,
      announcement: systemAnnouncements.adminAnnouncement(updated)
    });
    return true;
  }

  sendJson(res, 405, { ok: false, message: "公告接口不支持这个操作。" });
  return true;
}

module.exports = {
  ensureSchema,
  handle,
  closeStreams
};
