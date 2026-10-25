'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
async function main(){
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(root,'output/shared-network-'));
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),base=`http://127.0.0.1:${port}`;
 const log=fs.openSync(path.join(dir,'server.log'),'w'),child=spawn(process.execPath,['server.js',String(port)],{cwd:root,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_POLICY_MODE:'off',MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',RATE_LIMIT_MAX:'60',RATE_LIMIT_WINDOW_MS:'60000'}});
 async function get(token){return fetch(base+'/api/learning/pilot',{headers:{Authorization:'Bearer '+token}});}
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/health')).ok;}catch{}if(ready)break;if(child.exitCode!==null)throw Error('隔离服务启动失败');await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  const users=[];for(let i=0;i<20;i++){const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'同网段合成'+i,password:'synthetic-network-test-only',email:''})});assert.equal(r.status,200);users.push(await r.json());}
  const start=Date.now();const responses=await Promise.all(users.flatMap(u=>Array.from({length:8},()=>get(u.token))));assert.equal(responses.length,160);assert.ok(responses.every(r=>r.status===200),'同一IP的20账号不应互相耗尽配额');
  for(let i=0;i<52;i++)assert.equal((await get(users[0].token)).status,200);assert.equal((await get(users[0].token)).status,429,'同一账号仍受限制');assert.equal((await get(users[1].token)).status,200,'不影响另一账号');
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'同网段合成0',password:'synthetic-network-test-only'})});assert.equal(login.status,200);const secondSession=await login.json();assert.equal((await get(secondSession.token)).status,429,'新增登录会话不能重置账号额度');
  let limited=false;for(let i=0;i<65;i++){if((await get('invalid-'+i)).status===429){limited=true;break;}}assert.ok(limited,'伪造不同令牌不能逃离匿名限流');
  console.log(JSON.stringify({passed:true,synthetic:true,users:20,concurrentReads:160,allSucceeded:true,accountLimit:true,sharedSessionLimit:true,invalidTokenLimit:true,elapsedMs:Date.now()-start}));
 }finally{if(child.exitCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;}fs.closeSync(log);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
