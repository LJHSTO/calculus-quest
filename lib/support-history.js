"use strict";
const crypto=require('node:crypto');
const json=value=>{try{return JSON.parse(value||'{}');}catch{return {};}};

// A cycle can contain several different replies. Keep the reply and its
// visibility receipt together even when the cycle advances to the next reply.
function createStore({db}){
  let initialized=false,dirty=false;
  function sql(){const d=db.getDbSync();if(!initialized){d.run(`CREATE TABLE IF NOT EXISTS learner_support_rounds(
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,cycle_id TEXT NOT NULL,round INTEGER NOT NULL,
    document TEXT NOT NULL,UNIQUE(user_id,cycle_id,round));`);initialized=true;}return d;}
  function rows(query,args=[]){const s=sql().prepare(query);try{s.bind(args);const out=[];while(s.step())out.push(s.getAsObject());return out;}finally{s.free();}}
  function exists(name){return rows("SELECT name FROM sqlite_master WHERE type='table' AND name=?",[name]).length>0;}
  function research(user){
    const run=exists('three_arm_runs')?json(rows('SELECT document FROM three_arm_runs WHERE id=?',[user])[0]?.document):{};
    return run.id?{runId:run.id,studyId:run.studyId,kind:run.mode,arm:run.arm,protocolFingerprint:run.protocolFingerprint||null}:{kind:'engineering-demonstration'};
  }
  function put(user,c,round,input){
    if(!Number.isInteger(round)||round<1)return null;
    const id=c.id+':'+round,old=json(rows('SELECT document FROM learner_support_rounds WHERE id=? AND user_id=?',[id,user])[0]?.document);
    const content=input.content||old.content||null;
    const next={...old,id,userId:user,cycleId:c.id,round,scope:c.scope,sceneType:c.sceneType||'slide',generation:c.generation,
      profileRevision:c.profileRevision,contentVersion:c.contentVersion||null,spec:old.spec||input.spec||null,research:old.research||research(user),
      offeredAt:old.offeredAt||input.offeredAt||null,content,
      contentHash:old.contentHash||content?.audit?.contentHash||(content?crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex'):null),
      exposure:old.exposure||input.exposure||null,responses:old.responses||[],restored:old.id?old.restored:Boolean(input.restored)};
    if(input.response&&!next.responses.some(r=>r.id===input.response.id))next.responses=[...next.responses,input.response];
    if(JSON.stringify(next)!==JSON.stringify(old)){sql().run('INSERT INTO learner_support_rounds VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document',[id,user,c.id,round,JSON.stringify(next)]);dirty=true;}
    return next;
  }
  function capture(user,c,eventType,extra={}){
    if(!c.rounds||!c.content)return;
    put(user,c,c.rounds,{content:c.content,spec:c.supportSpec,offeredAt:c.offeredAt,exposure:c.exposure,
      response:['accepted','feedback','closed','check_result','postponed'].includes(eventType)?{id:eventType+':'+c.revision,action:eventType,at:c.updatedAt,...extra}:null});
  }
  function hydrate(user,input=[]){
    const cycles=exists('learner_support_cycles')?rows('SELECT payload_json FROM learner_support_cycles WHERE user_id=? ORDER BY rowid',[user]).map(r=>json(r.payload_json)):input;
    const byId=new Map(cycles.map(c=>[c.id,c]));for(const c of input)byId.set(c.id,c);
    // Older releases kept each offered reply and receipt in the event log.
    // Restore only observed facts; an offered reply is never assumed visible.
    const events=exists('events')?rows('SELECT id,payload,created_at FROM events WHERE user_id=? ORDER BY created_at,rowid',[user]):[];
    const counters=new Map();
    for(const row of events){const p=json(row.payload),d=p.data||{},c=byId.get(d.cycleId);if(!c||!String(p.eventType).startsWith('support_cycle_'))continue;
      if(p.eventType==='support_cycle_offered'){
        const round=Number.isInteger(d.round)?d.round:(counters.get(c.id)||0)+1;counters.set(c.id,round);
        put(user,c,round,{content:d.content||null,offeredAt:d.at||row.created_at,restored:true});
      }else if(p.eventType==='support_cycle_exposed'){
        const round=Number.isInteger(d.round)?d.round:counters.get(c.id);
        put(user,c,round,{exposure:{at:d.at||row.created_at,round,source:'restored_visibility_receipt',visibleMs:1000,minimumFraction:.5},restored:true});
      }else if(['support_cycle_accepted','support_cycle_feedback','support_cycle_closed','support_cycle_check_result','support_cycle_postponed'].includes(p.eventType)){
        const action=p.eventType.replace('support_cycle_','');
        put(user,c,Number.isInteger(d.round)?d.round:counters.get(c.id),{response:{id:d.revision? action+':'+d.revision:row.id,action,at:d.at||row.created_at,...d},restored:true});
      }
    }
    for(const c of byId.values())if(c.rounds&&c.content)put(user,c,c.rounds,{content:c.content,offeredAt:c.offeredAt,exposure:c.exposure});
    const all=rows('SELECT document FROM learner_support_rounds WHERE user_id=? ORDER BY cycle_id,round',[user]).map(r=>json(r.document));
    if(dirty){db.saveNow();dirty=false;}
    return [...byId.values()].map(c=>({...c,roundRecords:all.filter(r=>r.cycleId===c.id)}));
  }
  return {capture,hydrate,research};
}
module.exports={createStore};
