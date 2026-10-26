'use strict';
const crypto=require('node:crypto'),contract=require('../app/shared/learner-preferences');
const controls=require('./research-controls');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function createStore({db}) {
  let initialized=false;
  function sql(){const d=db.getDbSync();if(!initialized){d.run(`CREATE TABLE IF NOT EXISTS learner_preferences(user_id TEXT PRIMARY KEY,document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS learner_preference_history(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,at TEXT NOT NULL,document TEXT NOT NULL);`);initialized=true;}return d;}
  function read(user){const s=sql().prepare('SELECT document FROM learner_preferences WHERE user_id=?');try{s.bind([user]);return s.step()?JSON.parse(s.getAsObject().document):null;}finally{s.free();}}
  function save(user,input){const old=read(user);if(input.expectedRevision!==(old?.revision||0))throw Object.assign(new Error('另一页面已修改设置，请重新读取后再保存'),{status:409});
    const answers=contract.validate(input.answers,{experimental:input.experimental===true}),profile=controls.validate(contract.profile(answers,controls.defaults));
    const record={revision:(old?.revision||0)+1,at:new Date().toISOString(),version:contract.version,answers,profile,hash:hash(profile),kind:'learner_preferences',configurationWindow:input.configurationWindow||null,defaultProvenance:contract.configurationPolicy.defaultProvenance,selectionSource:input.selectionSource==='defaults_button'?'defaults_button':'reviewed_choices',elapsedMs:Number.isFinite(input.elapsedMs)?Math.max(0,Math.min(input.elapsedMs,86400000)):null};
    sql().run('INSERT OR REPLACE INTO learner_preferences VALUES(?,?)',[user,JSON.stringify(record)]);
    sql().run('INSERT INTO learner_preference_history VALUES(?,?,?,?)',[crypto.randomUUID(),user,record.at,JSON.stringify(record)]);db.saveNow();return record;
  }
  return {read,save};
}
module.exports={createStore,contract};
