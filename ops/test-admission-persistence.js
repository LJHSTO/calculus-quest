'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'cq-admission-'));
const database=path.join(dir,'synthetic.db'),writes=path.join(dir,'writes.txt'),fault=path.join(dir,'fail-write');
async function main(){
 const SQL=await require('sql.js')();
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const preload=path.join(dir,'disk-probe.cjs');
 fs.writeFileSync(preload,`const fs=require('node:fs'),original=fs.renameSync;fs.renameSync=(a,b)=>{if(b===process.env.DB_PATH){if(fs.existsSync(${JSON.stringify(fault)}))throw Object.assign(Error('synthetic disk full'),{code:'ENOSPC'});fs.appendFileSync(${JSON.stringify(writes)},'1\\n');}return original(a,b);};`);
 const child=spawn(process.execPath,['--require',preload,'server.js',String(port)],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DB_PATH:database,HOST:'127.0.0.1',NODE_ENV:'test',MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',LEARNER_ONBOARDING_REQUIRED:'true',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',PROACTIVE_EXPERIMENT_ID:'synthetic-admission',RATE_LIMIT_MAX:'5000'}});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const base=`http://127.0.0.1:${port}`,count=()=>fs.readFileSync(writes,'utf8').trim().split('\n').length;
 const read=q=>{const d=new SQL.Database(fs.readFileSync(database));try{return d.exec(q)[0].values[0][0];}finally{d.close();}};
 const register=async i=>{const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json','X-Study-Arm':'B'},body:JSON.stringify({nickname:'合成入场'+i,password:'synthetic-admission-password'})});return {status:r.status,body:await r.json()};};
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}assert.equal(child.exitCode,null,logs);await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
  const before=count(),results=await Promise.all([0,1,2].map(register));
  assert.ok(results.every(r=>r.status===200&&r.body.token));
  assert.ok(count()-before<=2,'三个注册及内部轮次、偏好写入应合并，实际落盘次数='+(count()-before));
  assert.equal(read('SELECT COUNT(*) FROM three_arm_runs'),3,'回执前实验轮次必须落盘');
  assert.equal(read('SELECT COUNT(*) FROM learner_preferences'),3,'回执前初始配置必须落盘');
  assert.equal(read('SELECT COUNT(*) FROM sessions'),3,'回执前登录会话必须落盘');
  const oldUsers=read('SELECT COUNT(*) FROM users');fs.writeFileSync(fault,'1');
  const failed=await register(3);assert.equal(failed.status,500);assert.equal(failed.body.ok,false);assert.equal(failed.body.token,undefined);
  assert.equal(read('SELECT COUNT(*) FROM users'),oldUsers,'写入失败保留原数据库且不能返回成功');
  console.log('通过：注册与初始轮次配置合并落盘、成功回执前完整持久化、磁盘失败返回500且不泄露会话、旧库保留');
 }finally{
  child.kill('SIGKILL');await new Promise(resolve=>child.exitCode!==null||child.signalCode!==null?resolve():child.once('exit',resolve));
  // Only remove the explicit synthetic files created by this test.
  for(const name of ['synthetic.db','synthetic.db.tmp','synthetic.db.lock','writes.txt','fail-write','disk-probe.cjs']){const p=path.join(dir,name);if(fs.existsSync(p))fs.unlinkSync(p);}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
