"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs"), path = require("node:path");
const { getStudy, listStudies, digest } = require("./catalog");
const materials = require("./materials");
const engine = require("./session");
const { participantAllocation } = require("../study-allocation");
const { PROTECTED } = require("./policy");

const fail = (code, message, status = 409) => { throw Object.assign(new Error(message), { code, status }); };
const idPattern = /^[A-Za-z0-9_-]{8,100}$/;
const allowedActions = new Set(["baseline_submit", "quiz_submit", "probe_submit", "context", "begin_t1", "begin_outcome", "accept", "offer_exposed",
  "decline", "later", "close_help", "revoke", "pause", "resume", "end_learning_session", "feedback_submit", "next_point", "begin_return",
  "survey_submit", "case_submit", "design_submit", "begin_retention", "withdraw", "save_draft", "common_feedback"]);

function createResearchSites({ db, configuration = {}, implementationDigest = "unit-fixture", clock = Date.now }) {
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) throw new Error("研究站配置格式无效");
  let initialized = false;
  function sql() {
    const store = db.getDbSync();
    if (!initialized) {
      store.run(`CREATE TABLE IF NOT EXISTS research_site_protocols (
        id TEXT PRIMARY KEY, study_id TEXT NOT NULL, mode TEXT NOT NULL, fingerprint TEXT NOT NULL,
        protocol_json TEXT NOT NULL, allocation_seed TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS research_site_sessions (
        protocol_id TEXT NOT NULL, user_id TEXT NOT NULL, session_id TEXT NOT NULL UNIQUE,
        allocated INTEGER NOT NULL DEFAULT 0, stage TEXT NOT NULL, revision INTEGER NOT NULL,
        state_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        PRIMARY KEY(protocol_id,user_id));
        CREATE TABLE IF NOT EXISTS research_site_events (
        id TEXT PRIMARY KEY, protocol_id TEXT NOT NULL, user_id TEXT NOT NULL,
        request_id TEXT NOT NULL, sequence INTEGER NOT NULL, at INTEGER NOT NULL, event_json TEXT NOT NULL);
        CREATE UNIQUE INDEX IF NOT EXISTS research_site_event_request ON research_site_events(protocol_id,user_id,request_id,sequence);
        CREATE TABLE IF NOT EXISTS research_site_process (
        id TEXT PRIMARY KEY, protocol_id TEXT NOT NULL, user_id TEXT NOT NULL, at INTEGER NOT NULL, event_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS research_site_reviews (
        id TEXT PRIMARY KEY, protocol_id TEXT NOT NULL, session_id TEXT NOT NULL,
        item_id TEXT NOT NULL, reviewer_id TEXT NOT NULL, at INTEGER NOT NULL, review_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS research_site_demo_archive (
        session_id TEXT PRIMARY KEY, protocol_id TEXT NOT NULL, user_id TEXT NOT NULL, archived_at INTEGER NOT NULL, state_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS research_site_raters (
        token_hash TEXT PRIMARY KEY, protocol_id TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);`);
      initialized = true; db.saveNow();
    }
    return store;
  }
  function rows(query, values = []) {
    const statement = sql().prepare(query); statement.bind(values); const result = [];
    try { while (statement.step()) result.push(statement.getAsObject()); } finally { statement.free(); }
    return result;
  }
  function transaction(fn) {
    const store = sql(); store.run("BEGIN IMMEDIATE");
    try { const result = fn(store); store.run("COMMIT"); db.saveNow(); return result; }
    catch (error) { try { store.run("ROLLBACK"); } catch {} throw error; }
  }
  function protocol(studyId, mode = "demo") {
    const study = getStudy(studyId);
    if (!study || !["demo", "formal"].includes(mode)) fail("research_site_not_found", "研究入口不存在。", 404);
    const configurationEntry = configuration.protocols?.[studyId] || {};
    const required = ["id", "institution", "responsiblePerson", "contact", "retentionPolicy", "withdrawalPolicy", "approvalReference", "reviewedBy", "reviewedAt", "consentVersion", "analysisPlanVersion", "expectedDuration", "compensationPolicy", "aiProcessingInfo"];
    const missing = required.filter(k => typeof configurationEntry[k] !== "string" || !configurationEntry[k].trim()
      || /待填写|尚未|PLACEHOLDER|TODO/.test(configurationEntry[k]));
    if (!idPattern.test(configurationEntry.id || "")) missing.push("validProtocolId");
    if (!["approved", "exempt"].includes(configurationEntry.approvalStatus)) missing.push("approvalStatus");
    if (configurationEntry.materialFingerprint !== materials.fingerprint) missing.push("materialReviewFingerprint");
    const ready = missing.length === 0;
    const consent = mode === "formal" ? {
      institution: configurationEntry.institution || "尚未填写", responsiblePerson: configurationEntry.responsiblePerson || "尚未填写",
      contact: configurationEntry.contact || "尚未填写", retentionPolicy: configurationEntry.retentionPolicy || "尚未填写",
      withdrawalPolicy: configurationEntry.withdrawalPolicy || "尚未填写", approvalReference: configurationEntry.approvalReference || "尚未提供",
      expectedDuration: configurationEntry.expectedDuration || "尚未填写", compensationPolicy: configurationEntry.compensationPolicy || "尚未填写", aiProcessingInfo: configurationEntry.aiProcessingInfo || "尚未填写",
      voluntary: "参加自愿，可跳过问卷或退出，不影响课程成绩或其他正常学习机会。没有保证某种帮助一定改善学习。",
      risks: "学习和测量需要投入时间，可能感到疲劳、困难或被打断；可以暂停休息或退出。AI回复可能有误，开放文字请勿填写身份、健康或其他无关隐私信息。",
      assignment: study.id === "design-space" ? "案例呈现次序由系统分配。" : "前测后由系统随机分配一种支持策略，两种策略均可拒绝帮助。",
      purpose: study.id === "design-space" ? "研究六维设计空间是否有助于解释主动学习支持案例、发现边界和设计策略。案例为明确标注的合成情境，不能用其覆盖性证明框架完整。" : "研究不同主动学习支持方式的使用体验与独立学习表现。系统可能提出帮助，你可以拒绝、暂停或退出。",
      collected: study.id === "design-space" ? ["经验条目", "案例分类及理由", "策略设计文本", "框架使用反馈"] : ["题目回答及把握程度", "课件操作与时间", "浏览器窗口尺寸及显示状态", "帮助候选、询问、显示及选择", "需要与时机反馈", "问卷", "自愿使用的AI对话"],
      optional: "使用外部模型进行对话、将脱敏记录用于后续模型评测分别征求同意。",
      courseEligibility: study.id === "design-space" ? "已满18岁、有教育、学习系统或HCI研究经验的研究者或教师。" : "已满18岁、尚未系统学习极限的大一学生。",
      procedure: study.id === "design-space" ? "阅读六维定义、独立编码四个合成情境、设计策略并说明遗漏。随后由研究者开展访谈；本流程不测量学习效果。" : study.id === "memory" ? "本次学习、至少24小时后回访，以及后测72小时后的保持测量。" : "本次学习与独立测量，以及后测72小时后的保持测量。"
    } : {
      purpose: "此入口用于体验和检查研究流程，记录明确标为演示数据，不计入正式样本。",
      optional: "可选择是否使用真实模型对话。演示中的缩短等待时间不能用于真人实验。",
      collected: ["体验操作、回答与可选对话"], contact: "通过平台研究负责人反馈问题"
    };
    const description = { study, mode, materialFingerprint: materials.fingerprint, implementationDigest,
      consentVersion: mode === "formal" ? configurationEntry.consentVersion || "not-ready" : "demo-consent-v1", consent,
      review: mode === "formal" ? { ...Object.fromEntries(required.map(k => [k, configurationEntry[k] || null])), approvalStatus: configurationEntry.approvalStatus || null } : null };
    const fingerprint = digest(description);
    return { ...description, id: mode === "formal" ? configurationEntry.id || `${studyId}-unconfigured` : `${studyId}-demo-${fingerprint.slice(0, 16)}`,
      fingerprint, readiness: { ready: mode === "demo" || ready, missing: mode === "formal" ? missing : [],
        status: mode === "demo" ? "demonstration" : ready ? configurationEntry.status || "closed" : "configuration_required" } };
  }
  function archive(p, now) {
    const old = rows("SELECT fingerprint FROM research_site_protocols WHERE id=?", [p.id])[0];
    if (old && old.fingerprint !== p.fingerprint) fail("research_protocol_drift", "该协议编号已有不同材料或代码版本，请使用新的研究编号。");
    if (!old) sql().run("INSERT INTO research_site_protocols VALUES (?,?,?,?,?,?,?)", [p.id, p.study.id, p.mode, p.fingerprint, JSON.stringify(p), crypto.randomBytes(32).toString("hex"), now]);
  }
  function load(userId, p) {
    const row = rows("SELECT state_json FROM research_site_sessions WHERE protocol_id=? AND user_id=?", [p.id, String(userId)])[0];
    return row ? JSON.parse(row.state_json) : null;
  }
  function save(store, state, events, requestId, now) {
    store.run(`INSERT INTO research_site_sessions (protocol_id,user_id,session_id,allocated,stage,revision,state_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(protocol_id,user_id) DO UPDATE SET allocated=excluded.allocated,stage=excluded.stage,
      revision=excluded.revision,state_json=excluded.state_json,updated_at=excluded.updated_at`,
    [state.protocolId, String(state.userId), state.id, state.allocation ? 1 : 0, state.phase, state.revision, JSON.stringify(state), state.createdAt, now]);
    events.forEach((e, i) => store.run("INSERT INTO research_site_events VALUES (?,?,?,?,?,?,?)",
      [crypto.randomUUID(), state.protocolId, String(state.userId), requestId, i, now, JSON.stringify({ ...e, sessionId: state.id })]));
  }
  function validateRequestId(id) { if (typeof id !== "string" || !idPattern.test(id)) fail("research_request_id_required", "操作编号无效，请刷新后重试。", 400); }
  function unchanged(p) {
    const old = rows("SELECT fingerprint FROM research_site_protocols WHERE id=?", [p.id])[0];
    if (old && old.fingerprint !== p.fingerprint) fail("research_protocol_drift", "协议已变化，旧参与者记录不会自动迁入新条件。");
  }
  const api = {
    list() { return listStudies().map(s => ({ id: s.id, title: s.title, dimensions: s.dimensions,
      priority: s.priority, url: `/studies/${s.id}/`, formal: protocol(s.id, "formal").readiness })); },
    specification: protocol,
    state(userId, studyId, mode = "demo") {
      const p = protocol(studyId, mode); unchanged(p);
      return engine.publicView(load(userId, p), p, clock());
    },
    restartDemo(userId, studyId, input = {}) {
      const p = protocol(studyId, "demo"), now = clock(); validateRequestId(input.requestId);
      return transaction(store => {
        archive(p, now); const old = load(userId, p);
        if(old&&rows("SELECT id FROM research_site_events WHERE protocol_id=? AND user_id=? AND request_id=? LIMIT 1",[p.id,String(userId),input.requestId]).length)
          return {...engine.publicView(old,p,now),duplicate:true};
        if (old) {
          store.run("INSERT OR IGNORE INTO research_site_demo_archive VALUES (?,?,?,?,?)", [old.id, p.id, String(userId), now, JSON.stringify(old)]);
          store.run("DELETE FROM research_site_sessions WHERE protocol_id=? AND user_id=?", [p.id, String(userId)]);
        }
        const s = engine.createSession({ userId: String(userId), protocol: p, mode: "demo", consent: input.consent, now });
        save(store, s, [{ type: "demo_restarted", previousSession: old?.id || null, at: now }], input.requestId, now);
        return engine.publicView(s, p, now);
      });
    },
    start(userId, studyId, mode, input = {}) {
      const p = protocol(studyId, mode), now = clock();
      validateRequestId(input.requestId);
      if (mode === "formal" && (!p.readiness.ready || p.readiness.status !== "recruiting"))
        fail("research_not_recruiting", "该方向暂未开放正式参与；可以先使用体验入口。", 403);
      if(mode === "formal" && studyId === "placement" && (!Number.isFinite(input.display?.width) || !Number.isFinite(input.display?.height) || input.display.width < 1280 || input.display.height < 720))
        fail("research_display_requirement","呈现位置研究需使用至少1280×720的桌面浏览器窗口，请调整后开始。",400);
      return transaction(store => {
        archive(p, now);
        const old = load(userId, p); if (old) return engine.publicView(old, p, now);
        if (mode === "formal") {
          const previous = rows("SELECT s.protocol_id FROM research_site_sessions s JOIN research_site_protocols p ON p.id=s.protocol_id WHERE s.user_id=? AND p.mode='formal'", [String(userId)]);
          if (previous.length) fail("research_prior_participation", "此账号已经参加过使用相同课程的正式研究，请联系负责人，不能重复计作新的独立参与者。");
        }
        const s = engine.createSession({ userId: String(userId), protocol: p, mode, consent: input.consent, now });
        s.initialDisplay = input.display ? { width:Number(input.display.width)||null,height:Number(input.display.height)||null,pixelRatio:Number(input.display.pixelRatio)||null,source:"client_report" } : null;
        save(store, s, [{ type: "consent", at: now, consent: s.consent, dataClass: s.dataClass }], input.requestId, now);
        return engine.publicView(s, p, now);
      });
    },
    act(userId, studyId, mode, input = {}) {
      const p = protocol(studyId, mode), now = clock(); validateRequestId(input.requestId); unchanged(p);
      if (!allowedActions.has(input.action)) fail("research_action_invalid", "不支持这项操作。", 400);
      if (mode === "formal" && p.readiness.status === "paused" && !["withdraw", "save_draft"].includes(input.action)) fail("research_paused", "研究暂时暂停，请联系负责人。", 503);
      return transaction(store => {
        const previous = load(userId, p); if (!previous) fail("research_not_started", "请先阅读说明并开始。");
        if (rows("SELECT id FROM research_site_events WHERE protocol_id=? AND user_id=? AND request_id=? LIMIT 1", [p.id, String(userId), input.requestId]).length)
          return { ...engine.publicView(previous, p, now), duplicate: true };
        const result = engine.applyAction(previous, p, input, now, {
          allocate: () => {
            const seed = rows("SELECT allocation_seed FROM research_site_protocols WHERE id=?", [p.id])[0].allocation_seed;
            const ordinal = rows("SELECT COUNT(*) AS n FROM research_site_sessions WHERE protocol_id=? AND allocated=1", [p.id])[0].n;
            const allocation = participantAllocation({ seed, stratum: "unstratified", ordinal });
            return { ...allocation, ordinal, stratum: "unstratified", arm: p.study.arms[allocation.conditionIndex] };
          }
        });
        save(store, result.state, result.events, input.requestId, now);
        return engine.publicView(result.state, p, now);
      });
    },
    recordProcess(userId, studyId, mode, input = {}) {
      const p = protocol(studyId, mode); unchanged(p); const s = load(userId, p);
      if (!s || s.phase === "withdrawn") fail("research_not_active", "本研究没有可记录的活动会话。");
      validateRequestId(input.eventId);
      const allowed = ["page_visibility", "resource_open", "resource_close", "fullscreen", "viewport_change", "pointer_activity", "input_activity", "courseware_semantic", "network_recovery", "focus_return"];
      const targetIndex=materials.points.indexOf(input.scope);
      if (!allowed.includes(input.type) || targetIndex<0 || targetIndex!==s.index&&!s.units[targetIndex].probes.t0 || input.sessionId&&input.sessionId!==s.id) fail("research_process_invalid", "事件不属于已到达的研究内容或当前会话。", 400);
      const payload = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload) ? input.payload : {};
      if (Buffer.byteLength(JSON.stringify(payload)) > 8000) fail("research_process_too_large", "事件内容过长。", 400);
      const forbidden = /password|token|cookie|authorization|secret/i;
      const hasSecret = value => value && typeof value === "object" && Object.entries(value).some(([k, v]) => forbidden.test(k) || hasSecret(v));
      if (hasSecret(payload)) fail("research_process_sensitive", "事件包含不允许记录的字段。", 400);
      const at = clock(), id = digest([p.id, String(userId), input.eventId]);
      sql().run("INSERT OR IGNORE INTO research_site_process VALUES (?,?,?,?,?)", [id, p.id, String(userId), at,
        JSON.stringify({ type: input.type, sessionId: s.id, scope: input.scope, receivedPhase: s.phase, clientPhase:String(input.clientPhase||"").slice(0,50), serverAt: at,
          clientAt: Number.isFinite(input.clientAt) ? input.clientAt : null, source: "client_report_not_knowledge_evidence", payload })]);
      const inserted = sql().getRowsModified() > 0; db.saveNow(); return { recorded: true, duplicate: !inserted };
    },
    protects(userId) {
      return rows("SELECT s.state_json FROM research_site_sessions s JOIN research_site_protocols p ON p.id=s.protocol_id WHERE s.user_id=? AND p.mode='formal' AND s.stage NOT IN ('complete','withdrawn')", [String(userId)])
        .some(r => PROTECTED.has(JSON.parse(r.state_json).phase) || ["return_probe", "return_outcome"].includes(JSON.parse(r.state_json).phase));
    },
    dialogueContext(userId, studyId, mode) {
      const p = protocol(studyId, mode); unchanged(p); const s = load(userId, p);
      if (!s || api.protects(userId) || !["explore", "after_t1", "explore_return"].includes(s.phase) || !s.consent.externalModel)
        fail("research_dialogue_unavailable", "当前阶段未允许模型对话。", 403);
      return { protocol: p, revision: s.revision, sessionId: s.id, scope: materials.points[s.index],
        lesson: materials.lesson(s.index), confirmedEvidence: s.units[s.index].probes,
        previous: s.conversation.filter(c => c.scope === materials.points[s.index]).slice(-6) };
    },
    commitDialogue(userId, studyId, mode, context, turn) {
      const p = protocol(studyId, mode), now = clock();
      return transaction(store => {
        const s = load(userId, p);
        if (!s || s.id !== context.sessionId || s.revision !== context.revision || !["explore", "after_t1", "explore_return"].includes(s.phase))
          fail("research_dialogue_stale", "学习阶段已变化，这次回复不会显示在新的任务里。");
        const saved = { id: crypto.randomUUID(), at: now, scope: context.scope, ...turn };
        s.conversation.push(saved); s.revision++; s.lastSeen = now;
        save(store, s, [{ type: "dialogue", at: now, turn: saved }], saved.id, now);
        return engine.publicView(s, p, now);
      });
    },
    recordDialogueFailure(userId,studyId,mode,context,details) {
      const p=protocol(studyId,mode),now=clock(),s=load(userId,p);if(!s||s.phase==="withdrawn")return;
      transaction(store=>store.run("INSERT INTO research_site_events VALUES (?,?,?,?,?,?,?)",[crypto.randomUUID(),p.id,String(userId),crypto.randomUUID(),0,now,
        JSON.stringify({type:"dialogue_failure",at:now,sessionId:context.sessionId,scope:context.scope,requestRevision:context.revision,code:details.code,durationMs:details.durationMs,source:"model_call_not_delivered"})]));
    },
    reviewQueue(studyId, mode = "formal") {
      const p = protocol(studyId, mode); unchanged(p);
      const items = [];
      for (const row of rows("SELECT state_json FROM research_site_sessions WHERE protocol_id=?", [p.id])) {
        const s = JSON.parse(row.state_json); if (s.phase === "withdrawn") continue;
        for (const [phase, quiz] of Object.entries(s.quizzes)) for (const answer of quiz.results || []) {
          if (answer.status !== "pending_blind_review") continue;
          const item = materials.publicQuiz(phase).items.find(q => q.id === answer.itemId);
          const blindId = digest([p.id, s.id, answer.itemId]);
          items.push({ blindId, prompt: item?.prompt, response: answer.response, rubric: answer.rubric,
            referenceAnswer: answer.referenceAnswer, maxScore: answer.maxScore,
            reviews: rows("SELECT reviewer_id,at,review_json FROM research_site_reviews WHERE protocol_id=? AND session_id=? AND item_id=? ORDER BY at", [p.id, s.id, answer.itemId])
              .map(r => ({ reviewer: r.reviewer_id, at: r.at, ...JSON.parse(r.review_json) })) });
        }
      }
      return { protocolId: p.id, instruction: "独立评分后再比较分歧。此页隐藏组别、姓名和测量阶段；原始评分不覆盖。", items: items.sort((a, b) => a.blindId.localeCompare(b.blindId)) };
    },
    issueRater(studyId, mode, name) {
      if (typeof name !== "string" || !name.trim() || name.length > 100) fail("research_rater_name", "请填写100字以内的评分者编号。", 400);
      const p = protocol(studyId,mode), token=crypto.randomBytes(32).toString("base64url");
      if (rows("SELECT name FROM research_site_raters WHERE protocol_id=? AND name=? AND revoked=0",[p.id,name.trim()]).length)
        fail("research_rater_duplicate", "此协议已有该评分者编号，请为不同教师使用不同编号。", 409);
      return transaction(store=>{archive(p,clock());store.run("INSERT INTO research_site_raters VALUES (?,?,?,?,0)",[digest(token),p.id,name.trim(),clock()]);return {token,name:name.trim(),protocolId:p.id};});
    },
    raterIdentity(studyId,mode,token) {
      const p=protocol(studyId,mode);unchanged(p);
      const row=rows("SELECT name FROM research_site_raters WHERE token_hash=? AND protocol_id=? AND revoked=0",[digest(String(token||"")),p.id])[0];
      if(!row)fail("research_rater_forbidden","评分凭据无效或不属于此协议。",403);return row.name;
    },
    raterQueue(studyId,mode,token) {
      const name=api.raterIdentity(studyId,mode,token),queue=api.reviewQueue(studyId,mode);
      return {...queue,reviewer:name,items:queue.items.map(item=>({...item,reviews:item.reviews.filter(r=>r.reviewer===name)}))};
    },
    submitReview(studyId, mode, reviewerId, input = {}) {
      const p = protocol(studyId, mode), item = api.reviewQueue(studyId, mode).items.find(i => i.blindId === input.blindId);
      if (!item || typeof reviewerId !== "string" || !reviewerId.trim() || reviewerId.length > 100
        || typeof input.score !== "number" || !Number.isFinite(input.score) || input.score < 0 || input.score > item.maxScore
        || typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 3000)
        fail("research_review_invalid", "请填写有效的评分、依据和评分者编号。", 400);
      return transaction(store => {
        for (const row of rows("SELECT state_json FROM research_site_sessions WHERE protocol_id=?", [p.id])) {
          const s = JSON.parse(row.state_json);
          for (const quiz of Object.values(s.quizzes)) for (const answer of quiz.results || []) {
            if (digest([p.id, s.id, answer.itemId]) !== input.blindId) continue;
            const id = crypto.randomUUID(), at = clock();
            store.run("INSERT INTO research_site_reviews VALUES (?,?,?,?,?,?,?)", [id, p.id, s.id, answer.itemId, reviewerId.trim(), at,
              JSON.stringify({ score: input.score, reason: input.reason.trim(), status: "independent_review_not_adjudicated" })]);
            return { recorded: true, id, at };
          }
        }
        fail("research_review_not_found", "该评分对象已不可用。");
      });
    },
    exportStudy(studyId, mode = "formal", { benchmarkOnly = false } = {}) {
      const p = protocol(studyId, mode); unchanged(p);
      const record = rows("SELECT allocation_seed FROM research_site_protocols WHERE id=?", [p.id])[0];
      const pseudonym = uid => crypto.createHmac("sha256", record?.allocation_seed || p.fingerprint).update(String(uid)).digest("hex").slice(0, 20);
      const sessions = rows("SELECT state_json FROM research_site_sessions WHERE protocol_id=?", [p.id]).map(r => JSON.parse(r.state_json))
        .filter(s => s.phase !== "withdrawn" && (!benchmarkOnly || s.consent.futureBenchmark));
      const included = new Set(sessions.map(s => s.userId));
      const includedSessions = new Set(sessions.map(s => s.id));
      const currentRecord = r => included.has(r.user_id) && includedSessions.has(JSON.parse(r.event_json).sessionId);
      const project = (r, field) => ({ participant: pseudonym(r.user_id), at: r.at, record: JSON.parse(r[field]) });
      return { schemaVersion: "research-sites-export-v1", generatedAt: clock(), protocol: p,
        dataClass: mode === "formal" ? "consented_human_study" : "demonstration_not_research", benchmarkOnly,
        sessions: sessions.map(({ userId, ...s }) => ({ participant: pseudonym(userId), ...s })),
        events: rows("SELECT * FROM research_site_events WHERE protocol_id=? ORDER BY at,rowid", [p.id]).filter(currentRecord).map(r => project(r, "event_json")),
        process: rows("SELECT * FROM research_site_process WHERE protocol_id=? ORDER BY at,rowid", [p.id]).filter(currentRecord).map(r => project(r, "event_json")),
        reviews: rows("SELECT * FROM research_site_reviews WHERE protocol_id=? ORDER BY at,rowid", [p.id])
          .filter(r => sessions.some(s => s.id === r.session_id)).map(({ user_id, review_json, ...r }) => ({ ...r, review: JSON.parse(review_json) })) };
    }
  };
  return api;
}

function configurationFromEnvironment(env = process.env) {
  if (!env.RESEARCH_SITES_CONFIG_FILE) return {};
  return JSON.parse(fs.readFileSync(path.resolve(env.RESEARCH_SITES_CONFIG_FILE), "utf8"));
}
module.exports = { createResearchSites, configurationFromEnvironment };
