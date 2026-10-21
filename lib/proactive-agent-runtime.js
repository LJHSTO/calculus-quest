"use strict";
const crypto = require("node:crypto");

// One database, same participant identity. No API key or external push service.
function createRuntime({ db, clock = Date.now, canPrepare = () => true }) {
  let initialized = false;
  const sql = () => {
    const d = db.getDbSync();
    if (!initialized) {
      d.run(`CREATE TABLE IF NOT EXISTS agent_tasks (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, scope TEXT NOT NULL, generation INTEGER NOT NULL,
        kind TEXT NOT NULL, status TEXT NOT NULL, due_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        payload_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS agent_tasks_owner ON agent_tasks(user_id,scope,status);
        CREATE TABLE IF NOT EXISTS agent_permissions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, scope TEXT NOT NULL, capability TEXT NOT NULL,
        status TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS agent_memory (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, scope TEXT NOT NULL, generation INTEGER NOT NULL,
        source_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE UNIQUE INDEX IF NOT EXISTS agent_memory_source ON agent_memory(user_id,source_id);
        CREATE TABLE IF NOT EXISTS agent_action_receipts (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, scope TEXT NOT NULL, permission_id TEXT NOT NULL,
        source_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE UNIQUE INDEX IF NOT EXISTS agent_action_source ON agent_action_receipts(user_id,source_id);`);
      initialized = true;
    }
    return d;
  };
  const all = (query,args=[]) => {
    const stmt=sql().prepare(query), rows=[];
    try {stmt.bind(args);while(stmt.step())rows.push(stmt.getAsObject());}finally{stmt.free();}
    return rows;
  };
  const at = () => new Date(clock()).toISOString();
  const save = () => db.saveNow();
  const task = row => row ? {...row,payload:JSON.parse(row.payload_json),payload_json:undefined} : null;
  function permission(user,scope,capability) {
    return all("SELECT * FROM agent_permissions WHERE user_id=? AND scope=? AND capability=? AND status='granted' AND expires_at>? ORDER BY created_at DESC LIMIT 1",[user,scope,capability,at()])[0] || null;
  }
  function settle(id,user,status,reason) {
    const row=all("SELECT * FROM agent_tasks WHERE id=? AND user_id=?",[id,user])[0];
    if(!row || !["queued","ready"].includes(row.status))return null;
    const payload={...JSON.parse(row.payload_json),resolutionReason:reason,resolvedAt:at()};
    sql().run("UPDATE agent_tasks SET status=?,payload_json=?,updated_at=? WHERE id=?",[status,JSON.stringify(payload),at(),id]);save();
    return task({...row,status,payload_json:JSON.stringify(payload)});
  }
  function schedule({user,scope,generation,kind,dueMs,ttlMs,payload}) {
    const existing=all("SELECT * FROM agent_tasks WHERE user_id=? AND scope=? AND generation=? AND kind=? AND status IN ('queued','ready') AND expires_at>? LIMIT 1",[user,scope,generation,kind,at()])[0];
    if(existing)return task(existing);
    const id=crypto.randomUUID(),created=at();
    sql().run("INSERT INTO agent_tasks VALUES (?,?,?,?,?,?,?,?,?,?,?)",[id,user,scope,generation,kind,"queued",
      new Date(clock()+dueMs).toISOString(),new Date(clock()+ttlMs).toISOString(),JSON.stringify(payload),created,created]);save();
    return task(all("SELECT * FROM agent_tasks WHERE id=?",[id])[0]);
  }
  function tick() {
    let changes=false;
    for(const row of all("SELECT * FROM agent_tasks WHERE status IN ('queued','ready')")) {
      if(!canPrepare(row.user_id,row.scope,row.generation)) {settle(row.id,row.user_id,"cancelled","current_authority_or_generation_changed");continue;}
      if(row.expires_at<=at()) {settle(row.id,row.user_id,"expired","ttl_expired");continue;}
      if(row.kind==="review" && !permission(row.user_id,row.scope,"prepare_review")) {
        settle(row.id,row.user_id,"cancelled","permission_expired_or_revoked");continue;
      }
      if(row.status!=="queued" || row.due_at>at())continue;
      const payload=JSON.parse(row.payload_json);
      payload.preparedAt=at();
      payload.preparation="approved-template-v1";
      if(row.kind==="review")payload.message="上次在这个知识点留下了一次独立检查记录。方便时可回到课件，先独立回忆判断方法，再决定是否需要帮助。";
      sql().run("UPDATE agent_tasks SET status='ready',payload_json=?,updated_at=? WHERE id=?",[JSON.stringify(payload),at(),row.id]);changes=true;
    }
    if(changes)save();
  }
  return {
    tick,schedule,settle,permission,
    delayed(user,scope,generation) {tick();return task(all("SELECT * FROM agent_tasks WHERE user_id=? AND scope=? AND generation=? AND kind='delayed_hint' AND status IN ('queued','ready') ORDER BY created_at DESC LIMIT 1",[user,scope,generation])[0]);},
    cancelStale(user,generation) {for(const r of all("SELECT * FROM agent_tasks WHERE user_id=? AND generation<>? AND status IN ('queued','ready')",[user,generation]))settle(r.id,user,"cancelled","learning_generation_changed");},
    grant(user,scope,capability,hours=24) {
      if(!["open_hint","prepare_review"].includes(capability))throw new Error("不支持该授权范围");
      if(!Number.isFinite(hours)||hours<1||hours>168)throw new Error("授权期限须为 1–168 小时");
      const prior=permission(user,scope,capability);if(prior)return prior;
      const id=crypto.randomUUID(),stamp=at();
      sql().run("INSERT INTO agent_permissions VALUES (?,?,?,?,?,?,?,?)",[id,user,scope,capability,"granted",new Date(clock()+hours*3600000).toISOString(),stamp,stamp]);save();
      return permission(user,scope,capability);
    },
    revoke(user,id) {
      sql().run("UPDATE agent_permissions SET status='revoked',updated_at=? WHERE id=? AND user_id=?",[at(),id,user]);
      const grant=all("SELECT * FROM agent_permissions WHERE id=? AND user_id=?",[id,user])[0];
      if(grant?.capability==="prepare_review")for(const r of all("SELECT * FROM agent_tasks WHERE user_id=? AND scope=? AND kind='review' AND status IN ('queued','ready')",[user,grant.scope]))settle(r.id,user,"cancelled","permission_revoked");
      save();
    },
    openHint(user,scope,sourceId) {
      const grant=permission(user,scope,"open_hint");if(!grant)return null;
      const prior=all("SELECT * FROM agent_action_receipts WHERE user_id=? AND source_id=?",[user,sourceId])[0];
      if(prior)return prior.status==="applied"?prior:null;
      const id=crypto.randomUUID(),stamp=at();
      sql().run("INSERT INTO agent_action_receipts VALUES (?,?,?,?,?,?,?,?)",[id,user,scope,grant.id,sourceId,"applied",stamp,stamp]);save();
      return all("SELECT * FROM agent_action_receipts WHERE id=?",[id])[0];
    },
    undo(user,id) {sql().run("UPDATE agent_action_receipts SET status='undone',updated_at=? WHERE id=? AND user_id=? AND status='applied'",[at(),id,user]);save();},
    remember({user,scope,generation,sourceId,outcome,reviewHours=24}) {
      if(all("SELECT id FROM agent_memory WHERE user_id=? AND source_id=?",[user,sourceId]).length)return;
      const payload={outcome,sourceKind:"server_verified_independent_check",masteryClaim:false};
      sql().run("INSERT INTO agent_memory VALUES (?,?,?,?,?,?,?)",[crypto.randomUUID(),user,scope,generation,sourceId,JSON.stringify(payload),at()]);save();
      if(permission(user,scope,"prepare_review"))schedule({user,scope,generation,kind:"review",dueMs:reviewHours*3600000,
        ttlMs:(reviewHours+168)*3600000,payload:{sourceId,...payload}});
    },
    state(user,generation) {
      this.cancelStale(user,generation);tick();
      return {version:"persistent-agent-v1",delivery:"same-account-in-app",offlinePreparation:"server-must-remain-running",
        tasks:all("SELECT * FROM agent_tasks WHERE user_id=? AND generation=? ORDER BY created_at DESC LIMIT 40",[user,generation]).map(task),
        permissions:all("SELECT * FROM agent_permissions WHERE user_id=? AND status='granted' AND expires_at>?",[user,at()]),
        actions:all("SELECT * FROM agent_action_receipts WHERE user_id=? ORDER BY created_at DESC LIMIT 20",[user]),
        memory:all("SELECT * FROM agent_memory WHERE user_id=? AND generation=? ORDER BY created_at DESC LIMIT 60",[user,generation])
          .map(r=>({...r,payload:JSON.parse(r.payload_json),payload_json:undefined})),calibrated:false};
    }
  };
}
module.exports={createRuntime};
