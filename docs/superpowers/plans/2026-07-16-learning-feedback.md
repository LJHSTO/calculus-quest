# Learning Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single learning-reflection note with a durable student feedback workflow and a complete, non-redundant administrator feedback view without deleting or rewriting historical learning records.

**Architecture:** Add a dedicated `feedback` table and validation module, expose authenticated student submission and administrator query endpoints, and keep feedback content out of learning snapshots and analytics payloads. Add a standalone student feedback view plus a pure courseware-target builder, then add a compact administrator feedback tab and targeted layout/data-accuracy fixes.

**Tech Stack:** Native JavaScript, Node.js `http`, `sql.js`, HTML/CSS, Node `assert`, PowerShell, Playwright browser smoke tests.

---

## File map

New files:

- `lib/feedback.js`: server-side feedback type allowlist, input normalization, and validation.
- `app/main/feedback-config.js`: registers the `feedback` view before `core.js` restores `currentView`.
- `app/main/feedback-targets.js`: pure UMD helper that builds global/current/sibling courseware feedback targets.
- `app/main/feedback.js`: student feedback rendering, selection, submission, and status handling.
- `ops/test-learning-feedback.js`: domain/database regression tests.
- `ops/test-feedback-api.js`: real HTTP authentication, submission, and administrator query tests against a temporary database.
- `ops/test-feedback-targets.js`: pure target-builder tests.
- `ops/test-feedback-static.js`: student/admin markup and responsive-layout regression assertions.

Modified files:

- `db.js`: additive schema migration, feedback insert/query functions, accurate user event count.
- `server.js`: student feedback POST and administrator feedback GET routes.
- `index.html`: fourth navigation item, standalone feedback view, remove editable reflection card, load feedback scripts.
- `app/main/navigation.js`: refresh feedback targets when the feedback view becomes active.
- `app/main/progress.js`: stop dereferencing the removed reflection textarea.
- `app/main/bootstrap.js`: remove the obsolete save-note handler.
- `styles.css`: feedback form, draggable target strip, selected/focus/error/success states, narrow-screen layout.
- `admin.html`: feedback tab, move overview metrics into overview, remove duplicate daily chart, clearer table labels.
- `admin/admin.js`: load/render/filter/export feedback, show accurate event count.
- `admin/admin.css`: feedback table/toolbar styles and responsive tab/chart/header rules.
- `docs/research-work-log.md`: append commands, results, limitations, and final commit identifiers without replacing existing content.

The existing dirty changes in `index.html`, `app/main/data.js`, `app/main/core.js`, `package.json`, and unrelated recovery paths are user-owned. Do not stage them accidentally. The implementation avoids modifying `data.js`, `core.js`, and `package.json`; `index.html` must be staged with an index-only patch containing only feedback hunks.

### Task 1: Protect the dirty-worktree baseline

**Files:**
- Read: `index.html`
- Read: `app/main/data.js`
- Read: `app/main/core.js`
- Read: `package.json`
- Create ignored snapshots under: `.superpowers/implementation-baseline/learning-feedback/`

- [ ] **Step 1: Record the current branch, upstream, and dirty paths**

Run:

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
```

Expected: branch `codex/recover-worktree-20260712`; the command must show the existing recovery changes before feature edits begin.

- [ ] **Step 2: Copy only overlapping target files into the ignored baseline directory**

Run:

```powershell
$baseline = ".superpowers/implementation-baseline/learning-feedback"
New-Item -ItemType Directory -Force -Path $baseline | Out-Null
Copy-Item -LiteralPath index.html -Destination (Join-Path $baseline "index.html")
Copy-Item -LiteralPath app/main/navigation.js -Destination (Join-Path $baseline "navigation.js")
Copy-Item -LiteralPath app/main/progress.js -Destination (Join-Path $baseline "progress.js")
Copy-Item -LiteralPath app/main/bootstrap.js -Destination (Join-Path $baseline "bootstrap.js")
```

Expected: snapshots exist under ignored `.superpowers/`; no tracked file changes.

- [ ] **Step 3: Confirm no staged changes are present**

Run:

```powershell
git diff --cached --name-only
```

Expected: empty output.

### Task 2: Write failing domain and database tests

**Files:**
- Create: `ops/test-learning-feedback.js`
- Test later: `lib/feedback.js`
- Modify later: `db.js`

- [ ] **Step 1: Create the failing test**

Create `ops/test-learning-feedback.js` with this structure:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-feedback-db-"));
process.env.DB_PATH = path.join(tmpDir, "feedback.db");

const db = require("../db");
let feedbackModule = {};
try {
  feedbackModule = require("../lib/feedback");
} catch {}
assert.equal(typeof feedbackModule.normalizeFeedbackInput, "function", "normalizeFeedbackInput must exist");
assert.equal(typeof db.insertFeedback, "function", "db.insertFeedback must exist");
assert.equal(typeof db.feedbackDashboard, "function", "db.feedbackDashboard must exist");
const { normalizeFeedbackInput } = feedbackModule;

async function main() {
  await db.getDb();
  const now = new Date().toISOString();

  const empty = normalizeFeedbackInput({ feedbackType: "learning_content", content: "   " });
  assert.equal(empty.ok, false);
  assert.equal(empty.code, "feedback_content_required");

  const invalidType = normalizeFeedbackInput({ feedbackType: "unknown", content: "建议" });
  assert.equal(invalidType.ok, false);
  assert.equal(invalidType.code, "feedback_type_invalid");

  const normalized = normalizeFeedbackInput({
    feedbackType: "courseware",
    content: "  拖动滑块后图像没有变化。  ",
    targetScope: "courseware",
    chapterId: "V14-C1",
    moduleId: "V14-C1-M1",
    unitId: "V14-C1-M1-KP1",
    knowledgePoint: "函数与变化",
    sceneType: "simulation",
    resourceFile: "demo.html",
    resourceTitle: "函数变化拖动实验",
    currentView: "feedback"
  });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.content, "拖动滑块后图像没有变化。");

  db.upsertUser("u-feedback", "反馈学生", now, now);
  db.insertEvent({ id: "event-before", user_id: "u-feedback", type: "unit_enter", payload: {}, created_at: now });
  db.insertSnapshot({ id: "snapshot-before", user_id: "u-feedback", reason: "test", data: { completed: ["u1"], note: "历史反思保留" }, created_at: now });

  db.insertFeedback({
    id: "feedback-global",
    user_id: "u-feedback",
    ...normalizeFeedbackInput({
      feedbackType: "platform",
      content: "希望按钮更明显。",
      targetScope: "global",
      currentView: "feedback"
    }).value,
    created_at: now
  });
  db.insertFeedback({
    id: "feedback-courseware",
    user_id: "u-feedback",
    ...normalized.value,
    created_at: new Date(Date.now() + 1000).toISOString()
  });

  const dashboard = db.feedbackDashboard({});
  assert.equal(dashboard.summary.total, 2);
  assert.equal(dashboard.summary.courseware, 1);
  assert.equal(dashboard.summary.users, 1);
  assert.equal(dashboard.rows[0].content, "拖动滑块后图像没有变化。");
  assert.equal(dashboard.rows[0].nickname, "反馈学生");

  const filtered = db.feedbackDashboard({ feedbackType: "platform" });
  assert.deepEqual(filtered.rows.map((row) => row.id), ["feedback-global"]);

  const detail = db.userDetail("u-feedback", {});
  assert.equal(detail.eventCount, 1);

  db.clearLearningDataForUser("u-feedback");
  assert.equal(db.feedbackDashboard({ query: "希望按钮" }).summary.total, 1);

  db.saveNow();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("learning feedback database tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node ops/test-learning-feedback.js
```

Expected: FAIL with the assertion `normalizeFeedbackInput must exist` or `db.insertFeedback must exist`; the failure must be caused by the unimplemented feature.

### Task 3: Implement validation and additive database persistence

**Files:**
- Create: `lib/feedback.js`
- Modify: `db.js`
- Test: `ops/test-learning-feedback.js`

- [ ] **Step 1: Add the validation module**

Implement `lib/feedback.js` with the stable interface used by the test:

```js
const FEEDBACK_TYPES = new Set(["learning_content", "courseware", "platform", "other"]);

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function invalid(code, message) {
  return { ok: false, code, message };
}

function normalizeFeedbackInput(input = {}) {
  const feedbackType = cleanText(input.feedbackType, 40);
  const rawContent = String(input.content || "").trim();
  if (!FEEDBACK_TYPES.has(feedbackType)) {
    return invalid("feedback_type_invalid", "请选择有效的反馈类型。");
  }
  if (!rawContent) {
    return invalid("feedback_content_required", "请填写反馈内容。");
  }
  if (rawContent.length > 2000) {
    return invalid("feedback_content_too_long", "反馈内容不能超过 2000 个字符。");
  }

  const requestedScope = cleanText(input.targetScope, 20);
  const targetScope = feedbackType === "courseware" && requestedScope === "courseware"
    ? "courseware"
    : "global";

  return {
    ok: true,
    value: {
      feedback_type: feedbackType,
      content: rawContent,
      target_scope: targetScope,
      chapter_id: cleanText(input.chapterId, 120),
      module_id: cleanText(input.moduleId, 160),
      unit_id: cleanText(input.unitId, 200),
      knowledge_point: cleanText(input.knowledgePoint, 300),
      scene_type: targetScope === "courseware" ? cleanText(input.sceneType, 80) : "",
      resource_file: targetScope === "courseware" ? cleanText(input.resourceFile, 500) : "",
      resource_title: targetScope === "courseware" ? cleanText(input.resourceTitle, 500) : "",
      current_view: cleanText(input.currentView, 40)
    }
  };
}

module.exports = { FEEDBACK_TYPES, normalizeFeedbackInput };
```

- [ ] **Step 2: Add the schema without changing historical tables**

In `initSchema()` in `db.js`, add:

```js
d.run(`
  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    feedback_type TEXT NOT NULL,
    content TEXT NOT NULL,
    target_scope TEXT NOT NULL DEFAULT 'global',
    chapter_id TEXT DEFAULT '',
    module_id TEXT DEFAULT '',
    unit_id TEXT DEFAULT '',
    knowledge_point TEXT DEFAULT '',
    scene_type TEXT DEFAULT '',
    resource_file TEXT DEFAULT '',
    resource_title TEXT DEFAULT '',
    current_view TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )
`);
d.run("CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at)");
d.run("CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id)");
d.run("CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(feedback_type)");
```

Do not add `DELETE FROM feedback` to `clearLearningDataForUser()`.

- [ ] **Step 3: Add insert and dashboard query functions**

Add `insertFeedback(record)` and `feedbackDashboard(filters)` to `db.js`:

```js
function insertFeedback(record) {
  execute(
    `INSERT INTO feedback
      (id, user_id, feedback_type, content, target_scope, chapter_id, module_id,
       unit_id, knowledge_point, scene_type, resource_file, resource_title,
       current_view, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.user_id,
      record.feedback_type,
      record.content,
      record.target_scope || "global",
      record.chapter_id || "",
      record.module_id || "",
      record.unit_id || "",
      record.knowledge_point || "",
      record.scene_type || "",
      record.resource_file || "",
      record.resource_title || "",
      record.current_view || "",
      record.created_at
    ]
  );
}

function feedbackDashboard(filters = {}) {
  const df = dateFilter("f.created_at", filters);
  const where = [`1=1${df.clause}`];
  const params = [...df.params];
  const feedbackType = String(filters.feedbackType || "").trim();
  const targetScope = String(filters.targetScope || "").trim();
  const query = String(filters.query || "").trim();
  const limit = Math.max(1, Math.min(Number(filters.limit || 1000), 1000));

  if (feedbackType) {
    where.push("f.feedback_type = ?");
    params.push(feedbackType);
  }
  if (targetScope) {
    where.push("f.target_scope = ?");
    params.push(targetScope);
  }
  if (query) {
    const like = `%${query}%`;
    where.push(`(
      COALESCE(u.nickname, '') LIKE ? OR f.content LIKE ? OR
      f.resource_title LIKE ? OR f.knowledge_point LIKE ?
    )`);
    params.push(like, like, like, like);
  }

  const whereSql = where.join(" AND ");
  const summaryRow = queryOne(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN f.feedback_type = 'courseware' THEN 1 ELSE 0 END) as courseware,
       COUNT(DISTINCT f.user_id) as users
     FROM feedback f
     LEFT JOIN users u ON u.id = f.user_id
     WHERE ${whereSql}`,
    params
  );
  const rows = queryAll(
    `SELECT f.*, COALESCE(u.nickname, '') as nickname
     FROM feedback f
     LEFT JOIN users u ON u.id = f.user_id
     WHERE ${whereSql}
     ORDER BY f.created_at DESC
     LIMIT ?`,
    [...params, limit]
  );

  return {
    summary: {
      total: Number(summaryRow?.total || 0),
      courseware: Number(summaryRow?.courseware || 0),
      users: Number(summaryRow?.users || 0)
    },
    rows
  };
}
```

Export both functions from `module.exports`.

- [ ] **Step 4: Correct user-detail event totals**

In `userDetail(userId, dates)`, retain the recent `events LIMIT 200` list but add a separate `COUNT(*)` query with the same date filter:

```js
const eventCount = queryOne(
  `SELECT COUNT(*) as count FROM events WHERE user_id = ?${evDf.clause}`,
  [userId, ...evDf.params]
).count || 0;

return { user, quizResults, events, eventCount, chapterSummary };
```

- [ ] **Step 5: Run the database test and verify GREEN**

Run:

```powershell
node ops/test-learning-feedback.js
```

Expected: `learning feedback database tests passed`.

- [ ] **Step 6: Commit only backend domain/database paths**

Run the required checks, then stage only:

```powershell
git status --short
git add -- lib/feedback.js db.js ops/test-learning-feedback.js
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: persist learning feedback"
```

Expected staged paths: exactly `lib/feedback.js`, `db.js`, and `ops/test-learning-feedback.js`.

### Task 4: Add failing real HTTP API tests

**Files:**
- Create: `ops/test-feedback-api.js`
- Modify later: `server.js`

- [ ] **Step 1: Create the integration test**

The test must:

1. Allocate a free localhost port with `node:net`.
2. Spawn `node server.js <port>` with a temporary `DB_PATH`, `ADMIN_TOKEN=cq-feedback-admin-test`, `HOST=127.0.0.1`, and `LLM_PROVIDER=mock`.
3. Wait for `/api/health`.
4. Assert unauthenticated `POST /api/learning/feedback` returns 401.
5. Register a unique user through `/api/auth/register` and capture its token.
6. Assert invalid type, blank content, and 2001-character content return 400.
7. Submit one global platform feedback and one concrete courseware feedback.
8. Assert an incorrect admin token returns 403.
9. Assert `GET /api/admin/stats/feedback` with the correct token returns both full bodies and their user/courseware context.
10. Assert `?type=courseware` returns only the courseware row.
11. Terminate only the spawned child process in `finally` and remove the temporary database directory.

Use this request helper:

```js
async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(baseUrl + pathname, {
    method: options.method || "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
```

- [ ] **Step 2: Run the API test and verify RED**

Run:

```powershell
node ops/test-feedback-api.js
```

Expected: FAIL because `POST /api/learning/feedback` and `GET /api/admin/stats/feedback` do not exist.

### Task 5: Implement student and administrator feedback APIs

**Files:**
- Modify: `server.js`
- Test: `ops/test-feedback-api.js`

- [ ] **Step 1: Import the validator**

Near the existing module imports:

```js
const feedback = require("./lib/feedback");
```

- [ ] **Step 2: Add the authenticated student endpoint**

Add `POST /api/learning/feedback` before the generic learning-event routes:

```js
if (req.method === "POST" && url.pathname === "/api/learning/feedback") {
  const body = await readJsonBody(req);
  const auth = authenticate(req, body);
  if (!auth) {
    sendJson(res, 401, { ok: false, message: "请先登录。" });
    return;
  }
  const normalized = feedback.normalizeFeedbackInput(body);
  if (!normalized.ok) {
    sendJson(res, 400, normalized);
    return;
  }
  const feedbackId = crypto.randomUUID();
  const timestamp = nowIso();
  db.insertFeedback({
    id: feedbackId,
    user_id: auth.participant.id,
    ...normalized.value,
    created_at: timestamp
  });
  db.insertEvent({
    id: crypto.randomUUID(),
    user_id: auth.participant.id,
    type: "feedback_submit",
    payload: {
      feedbackId,
      feedbackType: normalized.value.feedback_type,
      targetScope: normalized.value.target_scope,
      contentLength: normalized.value.content.length
    },
    created_at: timestamp
  });
  sendJson(res, 200, { ok: true, feedbackId, createdAt: timestamp });
  return;
}
```

The event payload must not contain `content`.

- [ ] **Step 3: Add the administrator query endpoint**

Add `GET /api/admin/stats/feedback` with existing admin authentication and date-range handling:

```js
if (req.method === "GET" && url.pathname === "/api/admin/stats/feedback") {
  if (!checkAdmin(req)) {
    sendJson(res, 403, { ok: false, message: "需要管理员密码。" });
    return;
  }
  const dates = getDateRange(url);
  sendJson(res, 200, {
    ok: true,
    data: db.feedbackDashboard({
      ...dates,
      feedbackType: url.searchParams.get("type") || "",
      targetScope: url.searchParams.get("scope") || "",
      query: url.searchParams.get("q") || "",
      limit: 1000
    })
  });
  return;
}
```

- [ ] **Step 4: Run the API and database suites**

Run:

```powershell
node ops/test-learning-feedback.js
node ops/test-feedback-api.js
node --check server.js
```

Expected: both tests pass and syntax check exits 0.

- [ ] **Step 5: Commit only API paths**

```powershell
git status --short
git add -- server.js ops/test-feedback-api.js
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: expose learning feedback APIs"
```

Expected staged paths: exactly `server.js` and `ops/test-feedback-api.js`.

### Task 6: Build the courseware-target model test first

**Files:**
- Create: `ops/test-feedback-targets.js`
- Create later: `app/main/feedback-targets.js`

- [ ] **Step 1: Write the target-builder test**

Test these behaviors with plain fixtures and injected helpers:

- global target is always first;
- the currently selected legal courseware is second and marked `isCurrent`;
- sibling candidates for the same knowledge unit follow;
- duplicate `resourceFile` candidates collapse to one row;
- missing candidates are omitted;
- an absent/non-knowledge unit returns only the global target.

Use the desired API:

```js
let targetModule = {};
try {
  targetModule = require("../app/main/feedback-targets");
} catch {}
assert.equal(typeof targetModule.buildCoursewareFeedbackTargets, "function", "target builder must exist");
const { buildCoursewareFeedbackTargets } = targetModule;

const unit = {
  id: "V14-C1-M1-KP1",
  type: "knowledge",
  chapterId: "V14-C1",
  moduleId: "V14-C1-M1",
  label: "函数与变化"
};
const types = [
  { id: "simulation", label: "动手调一调" },
  { id: "game", label: "挑战一下" },
  { id: "mindMap", label: "关系图" }
];
const candidates = {
  simulation: { file: "simulation.html", title: "函数拖动实验" },
  game: { file: "game.html", title: "函数挑战" },
  mindMap: { file: "game.html", title: "重复资源" }
};

const rows = buildCoursewareFeedbackTargets({
  unit,
  types,
  selectedTypeId: "simulation",
  candidateForType: (typeId) => candidates[typeId] || null,
  cleanTitle: (candidate) => candidate.title
});

assert.deepEqual(rows.map((row) => row.id), [
  "global",
  "courseware:simulation:simulation.html",
  "courseware:game:game.html"
]);
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node ops/test-feedback-targets.js
```

Expected: FAIL with the assertion `target builder must exist`.

- [ ] **Step 3: Implement the UMD helper**

Create `app/main/feedback-targets.js`:

```js
(function attachFeedbackTargets(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.FeedbackTargets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFeedbackTargetsApi() {
  function buildCoursewareFeedbackTargets(options = {}) {
    const unit = options.unit;
    const globalTarget = {
      id: "global",
      targetScope: "global",
      label: "全局课件反馈",
      description: "不针对某一个课件",
      isCurrent: !unit,
      chapterId: unit?.chapterId || "",
      moduleId: unit?.moduleId || "",
      unitId: unit?.id || "",
      knowledgePoint: unit?.label || "",
      sceneType: "",
      resourceFile: "",
      resourceTitle: ""
    };
    if (!unit || unit.type !== "knowledge") return [globalTarget];

    const types = Array.isArray(options.types) ? options.types : [];
    const selectedTypeId = String(options.selectedTypeId || "");
    const orderedTypes = [
      ...types.filter((type) => type.id === selectedTypeId),
      ...types.filter((type) => type.id !== selectedTypeId)
    ];
    const seenFiles = new Set();
    const concrete = [];

    for (const type of orderedTypes) {
      const candidate = options.candidateForType?.(type.id);
      const resourceFile = String(candidate?.file || "");
      if (!resourceFile || seenFiles.has(resourceFile)) continue;
      seenFiles.add(resourceFile);
      const resourceTitle = String(options.cleanTitle?.(candidate, unit) || candidate.title || resourceFile);
      concrete.push({
        id: `courseware:${type.id}:${resourceFile}`,
        targetScope: "courseware",
        label: resourceTitle,
        description: type.label || type.title || type.id,
        isCurrent: type.id === selectedTypeId,
        chapterId: unit.chapterId || "",
        moduleId: unit.moduleId || "",
        unitId: unit.id || "",
        knowledgePoint: unit.label || "",
        sceneType: type.id || "",
        resourceFile,
        resourceTitle
      });
    }

    return [globalTarget, ...concrete];
  }

  return { buildCoursewareFeedbackTargets };
});
```

The helper returns objects with:

```js
{
  id,
  targetScope,
  label,
  description,
  isCurrent,
  chapterId,
  moduleId,
  unitId,
  knowledgePoint,
  sceneType,
  resourceFile,
  resourceTitle
}
```

Deduplicate concrete courseware targets by `resourceFile`, put the selected type first, and never invent a candidate.

- [ ] **Step 4: Run and verify GREEN**

```powershell
node ops/test-feedback-targets.js
```

Expected: `feedback target tests passed`.

### Task 7: Add the student feedback view test first

**Files:**
- Create: `ops/test-feedback-static.js`
- Create later: `app/main/feedback-config.js`
- Create later: `app/main/feedback.js`
- Modify later: `index.html`
- Modify later: `app/main/navigation.js`
- Modify later: `app/main/progress.js`
- Modify later: `app/main/bootstrap.js`
- Modify later: `styles.css`

- [ ] **Step 1: Add failing static integration assertions**

Read files with explicit UTF-8. Use an empty string for a not-yet-created file so RED is an assertion failure rather than an `ENOENT` test error:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (relative) => {
  const file = path.join(root, relative);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
};

const index = read("index.html");
const navigation = read("app/main/navigation.js");
const feedbackJs = read("app/main/feedback.js");
const styles = read("styles.css");
```

Then assert:

```js
assert.match(index, /data-view="feedback">反馈<\/button>/);
assert.match(index, /id="feedback-view"/);
assert.doesNotMatch(index, /id="reflection-note"/);
assert.doesNotMatch(index, /id="save-note"/);
assert.ok(index.indexOf("app/main/feedback-config.js") < index.indexOf("app/main/core.js"));
assert.ok(index.indexOf("app/main/feedback-targets.js") < index.indexOf("app/main/feedback.js"));
assert.match(navigation, /renderFeedbackPage/);
assert.match(feedbackJs, /pointerdown/);
assert.match(feedbackJs, /aria-pressed/);
assert.match(styles, /\.feedback-target-strip/);
assert.match(styles, /scroll-snap-type:\s*x/);
```

- [ ] **Step 2: Run and verify RED**

```powershell
node ops/test-feedback-static.js
```

Expected: FAIL on the missing navigation button/view/scripts.

### Task 8: Implement the student feedback view

**Files:**
- Create: `app/main/feedback-config.js`
- Create: `app/main/feedback.js`
- Modify: `index.html`
- Modify: `app/main/navigation.js`
- Modify: `app/main/progress.js`
- Modify: `app/main/bootstrap.js`
- Modify: `styles.css`
- Test: `ops/test-feedback-targets.js`
- Test: `ops/test-feedback-static.js`

- [ ] **Step 1: Register the view before state restoration**

`app/main/feedback-config.js`:

```js
// Register the standalone feedback view before core.js restores currentView.
validViews.add("feedback");
```

Load it in `index.html` immediately after `data.js` and before `core.js`.

- [ ] **Step 2: Add the navigation button and standalone form**

Add `<button class="nav-button" type="button" data-view="feedback">反馈</button>` after “记录”.

Replace the reflection card in `progress-view` with no feedback form, update the page description, and add this sibling section:

```html
<section id="feedback-view" class="view">
  <div class="page feedback-page">
    <div class="page-heading">
      <p class="eyebrow">学习问题反馈</p>
      <h1>告诉我们哪里可以做得更好</h1>
      <p>反馈会保存给管理员查看，不会改变你的学习路径或测验结果。</p>
    </div>
    <form id="learning-feedback-form" class="feedback-form-card">
      <fieldset class="feedback-type-fieldset">
        <legend>反馈类型</legend>
        <div class="feedback-type-grid">
          <label><input type="radio" name="feedback-type" value="learning_content" checked /><span><b>学习内容</b><small>讲解、题目或知识点建议</small></span></label>
          <label><input type="radio" name="feedback-type" value="courseware" /><span><b>课件反馈</b><small>互动、显示或操作问题</small></span></label>
          <label><input type="radio" name="feedback-type" value="platform" /><span><b>平台功能</b><small>导航、账号或使用体验</small></span></label>
          <label><input type="radio" name="feedback-type" value="other" /><span><b>其他建议</b><small>其他想告诉我们的内容</small></span></label>
        </div>
      </fieldset>
      <section id="courseware-feedback-targets" class="feedback-target-panel" hidden>
        <div>
          <h2>选择反馈对象</h2>
          <p>默认是你刚才学习的课件，也可以拖动选择全局反馈或同知识点其他课件。</p>
        </div>
        <div id="feedback-target-strip" class="feedback-target-strip" role="group" aria-label="课件反馈对象"></div>
      </section>
      <label class="feedback-content-label" for="feedback-content">反馈正文</label>
      <textarea id="feedback-content" maxlength="2000" rows="9" required placeholder="请描述遇到的问题、建议，以及你原本希望看到的结果。"></textarea>
      <div class="feedback-form-meta">
        <span id="feedback-char-count">0 / 2000</span>
        <span id="feedback-form-status" role="status" aria-live="polite"></span>
      </div>
      <button class="button primary" id="submit-feedback" type="submit">提交反馈</button>
    </form>
  </div>
</section>
```

Load `feedback-targets.js` and `feedback.js` before `bootstrap.js`.

- [ ] **Step 3: Implement form behavior**

`app/main/feedback.js` must expose `renderFeedbackPage()` globally. Use this concrete state and payload flow:

```js
const feedbackUiState = {
  targets: [],
  selectedTargetId: "",
  submitting: false
};

function currentFeedbackType() {
  return document.querySelector('input[name="feedback-type"]:checked')?.value || "learning_content";
}

function feedbackTargetsForCurrentUnit() {
  const unit = getUnit(currentUnitId);
  const types = unit?.type === "knowledge" ? knowledgeInteractionTypes(unit) : [];
  const selectedTypeId = unit?.type === "knowledge" ? selectedKnowledgeSceneType(unit) : "";
  return FeedbackTargets.buildCoursewareFeedbackTargets({
    unit,
    types,
    selectedTypeId,
    candidateForType: (typeId) => knowledgeResourceCandidate(unit, typeId),
    cleanTitle: (candidate) => cleanStudentResourceTitle(candidate.title || candidate.file, unit.label)
  });
}

function selectedFeedbackTarget() {
  return feedbackUiState.targets.find((target) => target.id === feedbackUiState.selectedTargetId)
    || feedbackUiState.targets[0]
    || { id: "global", targetScope: "global" };
}

function renderFeedbackTargets() {
  const strip = document.querySelector("#feedback-target-strip");
  if (!strip) return;
  strip.innerHTML = feedbackUiState.targets.map((target) => `
    <button class="feedback-target-option" type="button"
      data-feedback-target="${escapeHtml(target.id)}"
      aria-pressed="${target.id === feedbackUiState.selectedTargetId ? "true" : "false"}">
      <strong>${escapeHtml(target.label)}</strong>
      <span>${escapeHtml(target.description || "")}</span>
      ${target.isCurrent ? "<small>当前课件</small>" : ""}
    </button>
  `).join("");
}

function renderFeedbackPage() {
  feedbackUiState.targets = feedbackTargetsForCurrentUnit();
  const current = feedbackUiState.targets.find((target) => target.isCurrent && target.targetScope === "courseware");
  const selectedStillValid = feedbackUiState.targets.some((target) => target.id === feedbackUiState.selectedTargetId);
  if (!selectedStillValid) feedbackUiState.selectedTargetId = current?.id || "global";
  document.querySelector("#courseware-feedback-targets").hidden = currentFeedbackType() !== "courseware";
  renderFeedbackTargets();
}

async function submitLearningFeedback(event) {
  event.preventDefault();
  if (feedbackUiState.submitting) return;
  const contentNode = document.querySelector("#feedback-content");
  const statusNode = document.querySelector("#feedback-form-status");
  const submitButton = document.querySelector("#submit-feedback");
  const content = contentNode.value.trim();
  if (!content) {
    statusNode.dataset.tone = "error";
    statusNode.textContent = "请填写反馈内容。";
    contentNode.focus();
    return;
  }
  const target = currentFeedbackType() === "courseware"
    ? selectedFeedbackTarget()
    : { targetScope: "global" };
  feedbackUiState.submitting = true;
  submitButton.disabled = true;
  statusNode.dataset.tone = "";
  statusNode.textContent = "正在提交…";
  try {
    await apiRequest("/api/learning/feedback", {
      feedbackType: currentFeedbackType(),
      content,
      targetScope: target.targetScope || "global",
      chapterId: target.chapterId || currentChapterId || "",
      moduleId: target.moduleId || "",
      unitId: target.unitId || currentUnitId || "",
      knowledgePoint: target.knowledgePoint || getUnit(currentUnitId)?.label || "",
      sceneType: target.sceneType || "",
      resourceFile: target.resourceFile || "",
      resourceTitle: target.resourceTitle || "",
      currentView
    });
    contentNode.value = "";
    contentNode.dispatchEvent(new Event("input"));
    statusNode.dataset.tone = "ok";
    statusNode.textContent = "反馈已提交，谢谢你的建议。";
  } catch (error) {
    statusNode.dataset.tone = "error";
    statusNode.textContent = error.message || "提交失败，请稍后重试。";
  } finally {
    feedbackUiState.submitting = false;
    submitButton.disabled = false;
  }
}
```

Attach `change`, `input`, `click`, and `submit` listeners once at script load. The target click handler sets `selectedTargetId` and calls `renderFeedbackTargets()`. The input listener sets `#feedback-char-count` to `${value.length} / 2000`.

Add real mouse/stylus dragging in addition to native touch scrolling:

```js
const feedbackTargetStrip = document.querySelector("#feedback-target-strip");
let feedbackDrag = null;
feedbackTargetStrip?.addEventListener("pointerdown", (event) => {
  feedbackDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    scrollLeft: feedbackTargetStrip.scrollLeft,
    moved: false
  };
  feedbackTargetStrip.setPointerCapture(event.pointerId);
});
feedbackTargetStrip?.addEventListener("pointermove", (event) => {
  if (!feedbackDrag || feedbackDrag.pointerId !== event.pointerId) return;
  const delta = event.clientX - feedbackDrag.startX;
  if (Math.abs(delta) > 5) feedbackDrag.moved = true;
  feedbackTargetStrip.scrollLeft = feedbackDrag.scrollLeft - delta;
});
feedbackTargetStrip?.addEventListener("pointerup", (event) => {
  if (!feedbackDrag || feedbackDrag.pointerId !== event.pointerId) return;
  feedbackTargetStrip.releasePointerCapture(event.pointerId);
  window.setTimeout(() => { feedbackDrag = null; }, 0);
});
```

The target click handler must return without selecting when `feedbackDrag?.moved` is true.

The implementation must:

- build target rows from `getUnit(currentUnitId)`, `knowledgeInteractionTypes`, `selectedKnowledgeSceneType`, `knowledgeResourceCandidate`, and `cleanStudentResourceTitle`;
- default to the current concrete target when available, otherwise global;
- render buttons with `aria-pressed`, selected text, and `scroll-snap-align`;
- reveal the target block only for `courseware`;
- keep typed text on failed submission;
- disable the submit button while awaiting `apiRequest("/api/learning/feedback", payload)`;
- clear only the textarea on success;
- never write the feedback body into `state.note`, `learningSnapshot()`, or analytics payloads.

The submitted payload must use the selected target fields and current `currentView`.

- [ ] **Step 4: Remove obsolete reflection behavior safely**

- In `progress.js`, remove or guard `els.reflectionNote.value = state.note || ""`.
- In `bootstrap.js`, remove the `#save-note` click handler.
- Keep `state.note` and snapshot-load compatibility untouched so historical snapshots still parse.
- In `navigation.js`, call `renderFeedbackPage()` from `renderAll()` and after switching to the feedback view, guarded with `typeof renderFeedbackPage === "function"`.

- [ ] **Step 5: Add accessible responsive styles**

Add styles for the form card, type cards, horizontal target strip, selected target, textarea, counter, and status tones. The strip must use:

```css
.feedback-target-strip {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
}
.feedback-target-option {
  flex: 0 0 min(260px, 82vw);
  scroll-snap-align: start;
}
.feedback-target-option[aria-pressed="true"] {
  border-color: var(--teal);
  box-shadow: 0 0 0 3px rgba(21, 141, 121, 0.14);
}
```

- [ ] **Step 6: Run student tests and syntax checks**

```powershell
node ops/test-feedback-targets.js
node ops/test-feedback-static.js
node --check app/main/feedback-config.js
node --check app/main/feedback-targets.js
node --check app/main/feedback.js
node --check app/main/navigation.js
node --check app/main/progress.js
node --check app/main/bootstrap.js
```

Expected: all pass.

- [ ] **Step 7: Stage only feature hunks**

Stage clean/new files normally:

```powershell
git add -- app/main/feedback-config.js app/main/feedback-targets.js app/main/feedback.js app/main/navigation.js app/main/progress.js app/main/bootstrap.js styles.css ops/test-feedback-targets.js ops/test-feedback-static.js
```

Do not run `git add index.html`. Build an index-only patch under ignored `.superpowers/` containing only:

- the new feedback navigation button;
- the progress-copy/reflection-card removal;
- the new `feedback-view`;
- the three feedback script tags.

Apply it with:

```powershell
git apply --cached -- .superpowers/staging/learning-feedback-index.patch
```

Then verify the staged `index.html` diff does not contain the pre-existing KaTeX cache-buster changes.

- [ ] **Step 8: Commit the student view**

```powershell
git status --short
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only
git diff --cached -- index.html
git commit -m "feat: add student feedback panel"
```

### Task 9: Add the administrator feedback/static tests first

**Files:**
- Extend: `ops/test-feedback-static.js`
- Modify later: `admin.html`
- Modify later: `admin/admin.js`
- Modify later: `admin/admin.css`

- [ ] **Step 1: Add failing assertions**

Assert:

```js
assert.match(adminHtml, /data-tab="feedback">问题反馈<\/button>/);
assert.match(adminHtml, /id="tab-feedback"/);
assert.match(adminHtml, /id="table-feedback"/);
assert.ok(adminHtml.indexOf('id="overview-metrics"') > adminHtml.indexOf('id="tab-overview"'));
assert.doesNotMatch(adminHtml, /id="chart-activity-daily"/);
assert.match(adminHtml, /测验提交/);
assert.match(adminHtml, /测验覆盖单元/);
assert.match(adminJs, /detail\.eventCount/);
assert.match(adminJs, /fetchStats\("feedback"/);
assert.match(adminCss, /#table-feedback/);
assert.match(adminCss, /overflow-x:\s*auto/);
```

- [ ] **Step 2: Run and verify RED**

```powershell
node ops/test-feedback-static.js
```

Expected: FAIL on missing feedback tab and existing duplicate activity chart.

### Task 10: Implement the administrator feedback tab and cleanup

**Files:**
- Modify: `admin.html`
- Modify: `admin/admin.js`
- Modify: `admin/admin.css`
- Test: `ops/test-feedback-static.js`
- Test: `ops/test-feedback-api.js`

- [ ] **Step 1: Restructure administrator markup**

- Move `<div class="metric-row" id="overview-metrics"></div>` inside `tab-overview`.
- Add a “问题反馈” tab after “用户详情”.
- Add `tab-feedback` with this structure:

```html
<div id="tab-feedback" class="tab-content hidden">
  <div class="metric-row" id="feedback-metrics"></div>
  <div class="chart-card full-width">
    <div class="feedback-toolbar">
      <label>类型
        <select id="feedback-type-filter">
          <option value="">全部类型</option>
          <option value="learning_content">学习内容</option>
          <option value="courseware">课件反馈</option>
          <option value="platform">平台功能</option>
          <option value="other">其他建议</option>
        </select>
      </label>
      <label>对象
        <select id="feedback-scope-filter">
          <option value="">全部对象</option>
          <option value="global">全局反馈</option>
          <option value="courseware">具体课件</option>
        </select>
      </label>
      <label class="feedback-search-label">搜索
        <input id="feedback-query-filter" type="search" placeholder="学生、正文、课件或知识点" />
      </label>
      <button class="btn btn-sm btn-outline" id="export-feedback-csv" type="button">导出 CSV</button>
    </div>
    <div class="table-wrap feedback-table-wrap">
      <table id="table-feedback">
        <thead><tr><th>时间</th><th>学生</th><th>类型</th><th>反馈对象</th><th>学习位置</th><th>反馈正文</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
</div>
```

- Remove the duplicate daily chart card from `tab-activity`.
- Rename user-table headings to “测验提交” and “测验覆盖单元”.

The feedback table headings must be: 时间、学生、类型、反馈对象、学习位置、反馈正文.

- [ ] **Step 2: Load and render feedback data**

Extend `loadAll()` with `fetchStats("feedback", "", signal)`, cache `feedback.rows`, and call `renderFeedbackDashboard(feedback)`.

`renderFeedbackDashboard` and its local filter must follow this shape:

```js
let cachedFeedbackRows = [];

const feedbackTypeLabels = {
  learning_content: "学习内容",
  courseware: "课件反馈",
  platform: "平台功能",
  other: "其他建议"
};

function visibleFeedbackRows() {
  const type = document.getElementById("feedback-type-filter")?.value || "";
  const scope = document.getElementById("feedback-scope-filter")?.value || "";
  const query = (document.getElementById("feedback-query-filter")?.value || "").trim().toLowerCase();
  return cachedFeedbackRows.filter((row) => {
    if (type && row.feedback_type !== type) return false;
    if (scope && row.target_scope !== scope) return false;
    if (!query) return true;
    return [
      row.nickname, row.user_id, row.content, row.resource_title,
      row.knowledge_point, row.chapter_id, row.unit_id
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function renderFeedbackDashboard(data = {}) {
  if (Array.isArray(data.rows)) cachedFeedbackRows = data.rows;
  const rows = visibleFeedbackRows();
  const metrics = document.getElementById("feedback-metrics");
  metrics.innerHTML = `
    <div class="metric-card highlight"><div class="label">总反馈数</div><div class="value">${rows.length}</div><div class="sub">当前日期与筛选范围</div></div>
    <div class="metric-card"><div class="label">课件反馈数</div><div class="value">${rows.filter((row) => row.feedback_type === "courseware").length}</div><div class="sub">具体课件与全局课件建议</div></div>
    <div class="metric-card good"><div class="label">反馈学生数</div><div class="value">${new Set(rows.map((row) => row.user_id)).size}</div><div class="sub">提交过反馈的学生</div></div>
  `;

  const tbody = document.querySelector("#table-feedback tbody");
  if (!rows.length) {
    tbody.innerHTML = "<tr><td colspan='6'>当前筛选条件下暂无问题反馈。</td></tr>";
    return;
  }
  tbody.innerHTML = rows.map((row) => {
    const target = row.target_scope === "courseware"
      ? (row.resource_title || row.resource_file || "具体课件")
      : "全局反馈";
    const location = [row.knowledge_point, row.unit_id].filter(Boolean).map((value) => esc(value)).join("<br>");
    return `<tr>
      <td class="nowrap">${esc(shortDateTime(row.created_at))}</td>
      <td><strong>${esc(row.nickname || "未命名")}</strong><br><span class="muted">${esc((row.user_id || "").slice(-8))}</span></td>
      <td><span class="badge badge-blue">${esc(feedbackTypeLabels[row.feedback_type] || row.feedback_type)}</span></td>
      <td>${esc(target)}${row.scene_type ? `<br><span class="muted">${esc(row.scene_type)}</span>` : ""}</td>
      <td>${location || "—"}</td>
      <td class="feedback-content-cell"><details class="feedback-details"><summary>${esc(String(row.content || "").slice(0, 90))}</summary><p>${esc(row.content || "")}</p></details></td>
    </tr>`;
  }).join("");
}
```

When rendering `location`, escape each value before joining; do not insert raw database strings. The final implementation must:

- recompute the three visible metrics from locally filtered rows;
- filter by type, scope, and one combined user/content/resource keyword;
- escape all user content with the existing `esc()`;
- render long content inside `<details class="feedback-details">`;
- show a six-column empty state when no rows match.

- [ ] **Step 3: Add CSV export without truncating content**

Use the existing CSV download helper. Export:

```js
[
  "时间", "学生", "用户ID", "类型", "目标范围", "章节ID", "模块ID",
  "单元ID", "知识点", "场景类型", "课件标题", "课件资源", "反馈正文"
]
```

The table may visually collapse long text; CSV must contain the full `content`.

- [ ] **Step 4: Correct user detail**

Replace `${detail.events.length}` with `${detail.eventCount}` in the “总事件数” row.

- [ ] **Step 5: Add non-redundant responsive styling**

- Feedback toolbar wraps and uses the existing visual language.
- `#table-feedback` has a sensible minimum width and the content column can wrap.
- Under 820px, tabs become one horizontal scrolling row rather than multiple wrapped rows.
- Under 760px, `.chart-grid` and `.chart-grid.cols-3` become one column with `min-width: 0`.
- Header status controls wrap without overlapping the title.

- [ ] **Step 6: Run tests**

```powershell
node ops/test-feedback-static.js
node ops/test-feedback-api.js
node --check admin/admin.js
```

Expected: all pass.

- [ ] **Step 7: Commit administrator changes**

```powershell
git status --short
git add -- admin.html admin/admin.js admin/admin.css
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: show learning feedback in admin"
```

### Task 11: Full automated and browser verification

**Files:**
- Verify all implementation files
- Do not write to the real database

- [ ] **Step 1: Run strict UTF-8 decoding**

Use Python only as a read-only verifier:

```powershell
@'
from pathlib import Path
paths = [
    "index.html", "admin.html", "styles.css", "admin/admin.css",
    "app/main/feedback-config.js", "app/main/feedback-targets.js",
    "app/main/feedback.js", "app/main/navigation.js",
    "app/main/progress.js", "app/main/bootstrap.js",
    "admin/admin.js", "server.js", "db.js", "lib/feedback.js",
]
for name in paths:
    Path(name).read_bytes().decode("utf-8", errors="strict")
print(f"utf8_ok files={len(paths)}")
'@ | python -
```

Expected: `utf8_ok files=16`.

- [ ] **Step 2: Run syntax checks required by AGENTS.md**

```powershell
node --check server.js
Get-ChildItem app/main -Filter *.js | ForEach-Object { node --check $_.FullName }
Get-ChildItem lib -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
node --check admin/admin.js
```

Expected: every command exits 0.

- [ ] **Step 3: Run focused and existing suites**

```powershell
node ops/test-learning-feedback.js
node ops/test-feedback-api.js
node ops/test-feedback-targets.js
node ops/test-feedback-static.js
npm run kg:test
npm run flow:test
npm run katex:test
```

Expected: all pass. If any existing suite fails, diagnose before continuing; do not attribute it to the dirty worktree without evidence.

- [ ] **Step 4: Start an isolated smoke server**

First inspect port ownership:

```powershell
Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

Do not stop an existing service. Start the feature smoke on a free port such as 8876 with a temporary `DB_PATH`, and record the spawned PID. Use `Start-Process -WindowStyle Hidden`.

- [ ] **Step 5: Run Playwright smoke**

Use the `playwright` skill and verify:

1. Register a temporary learner.
2. Open the fourth “反馈” navigation page.
3. Submit a global platform feedback.
4. Visit a knowledge courseware, return to feedback, confirm current courseware is preselected.
5. Drag/scroll the selector and submit a courseware feedback.
6. Confirm success state and cleared body.
7. Open administrator page, authenticate with the temporary admin token.
8. Confirm both feedback rows, full text, user, type, courseware title, learning context, filters, and CSV control.
9. At desktop and narrow viewport, confirm no tab overlap, form clipping, or unexpected horizontal page overflow.
10. Check console and network errors, ignoring only known browser-extension `content_main.js` noise.

- [ ] **Step 6: Stop only the recorded smoke process**

Verify the PID command line contains this workspace's `server.js` and the chosen smoke port before calling `Stop-Process -Id <pid>`.

### Task 12: GitHub/main audit, work log, and final submission

**Files:**
- Append: `docs/research-work-log.md`
- Verify: all committed feature paths

- [ ] **Step 1: Refresh and inspect GitHub authority**

Run:

```powershell
git fetch origin
git rev-parse origin/main
git log -5 --oneline --decorate origin/main
git log -5 --oneline --decorate HEAD
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
```

Expected: no diff-check errors. Review every committed feature diff for accidental inclusion of recovery assets, secrets, database files, or visual-companion output.

- [ ] **Step 2: Re-run tests after the fetch/audit**

Run the full commands from Task 11 again if any code changed during audit. Completion claims require fresh output.

- [ ] **Step 3: Append the research work log**

Append a dated section containing:

- design commit `cd72ec6`;
- implementation commit hashes;
- database/API/UI/browser commands and results;
- confirmation that feedback survives learning-progress reset;
- confirmation that no real database was used;
- GitHub `origin/main` hash checked;
- any remaining limitation, especially the 1000-row admin cap.

Because `docs/research-work-log.md` is currently untracked and contains pre-existing recovery history, do not stage the whole file into this feature commit unless the user explicitly approves that broader documentation boundary.

- [ ] **Step 4: Final staging audit**

```powershell
git status --short
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only
git log --oneline --decorate -8
```

Expected: no pending feature code is unstaged; unrelated recovery changes remain untouched. Never use `git add .`.

- [ ] **Step 5: Report exact outcome**

Report:

- the student and admin behavior now available;
- preservation of historical learning records;
- exact automated/browser verification evidence;
- GitHub/main audit result;
- implementation commit hashes;
- unrelated dirty paths left untouched;
- whether the research log remains intentionally unstaged.
