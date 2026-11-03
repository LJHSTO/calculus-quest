'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const dir=fs.mkdtempSync(path.join(root,'output/学生体验修复验收/连接保活-'));
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir)};
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,windowsHide:true,stdio:['ignore',log,log]});
 const agent=new http.Agent({keepAlive:true,maxSockets:1}),idleMs=Number(process.env.KEEPALIVE_TEST_IDLE_MS||6500);
 let passed=false,token;
 async function request(route,body){return new Promise((resolve,reject)=>{
  const raw=JSON.stringify(body),req=http.request({host:'127.0.0.1',port,path:route,method:'POST',agent,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),...(token?{Authorization:'Bearer '+token}: {})}},res=>{
   const socket=res.socket,chunks=[];res.on('data',c=>chunks.push(c));res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,socket,body:JSON.parse(Buffer.concat(chunks)),keepAlive:res.headers['keep-alive']}));
  });req.on('error',reject);req.setTimeout(15000,()=>req.destroy(Error('请求超时')));req.end(raw);
 });}
 try{
  for(let i=0;i<120;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)break;}catch{}assert.equal(server.exitCode,null,'隔离服务器意外退出');await sleep(100);}
  const registered=await request('/api/auth/register',{nickname:'连接保活合成账号',password:'synthetic-keepalive-password'});assert.equal(registered.status,200);token=registered.body.token;
  const events={events:[{eventId:'keepalive-idle-retry',type:'keepalive_validation',payload:{synthetic:true}}]};
  const first=await request('/api/learning/events',events);assert.equal(first.status,200);
  await sleep(idleMs);
  const second=await request('/api/learning/events',events);assert.equal(second.status,200);
  assert.ok(second.socket===first.socket,'思考间隔后应仍能使用原连接提交，避免代理复用已关闭的后端连接');
  assert.deepEqual(second.body.eventIds,first.body.eventIds,'相同事件重试必须保持幂等');
  assert.ok(Number(/timeout=(\d+)/.exec(second.keepAlive)?.[1])>120,'后端空闲超时必须大于已部署网关的两分钟');
  passed=true;console.log('通过：空闲后原连接提交成功、重复事件幂等，后端超时覆盖网关两分钟复用窗口');
 }finally{
  agent.destroy();if(server.exitCode===null){const closed=new Promise(r=>server.once('exit',r));server.kill();await closed;}fs.closeSync(log);
  fs.writeFileSync(path.join(dir,'连接保活结果.json'),JSON.stringify({passed,idleMs},null,2));console.log(dir);
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
