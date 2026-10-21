"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { startPreview } = require("./start-functions-limits-preview");
async function main() {
  const dir = fs.mkdtempSync(path.resolve(__dirname, "../output/persistence-check-"));
  const stateFile = path.join(dir, "入口.json");
  const publicFile = path.resolve(__dirname, "../output/函数极限预览.json");
  const priorPublic = fs.existsSync(publicFile) ? fs.readFileSync(publicFile, "utf8") : null;
  let info;
  const checks = [];
  const post = async (route, body = {}, token = "") => {
    const res = await fetch(info.url + route, {method:"POST", headers:{"Content-Type":"application/json", ...(token ? { Authorization:`Bearer ${token}` } : {})},body:JSON.stringify(body)});
    return { status:res.status, body:await res.json() };
  };
  try {
    info = await startPreview({stateFile});
    const password = crypto.randomUUID(), replacement = crypto.randomUUID();
    const nickname = `持续性核验${Date.now().toString().slice(-8)}`;
    const registered = await post("/api/auth/register", {nickname,password});
    assert.equal(registered.status,200);
    const token = registered.body.token;
    const second = await post("/api/auth/login", {identifier:nickname,password});
    await post("/api/learning/event", {type:"persistent_preview_check",payload:{fixture:true}},token);
    const again = await startPreview({stateFile});
    assert.equal(again.pid,info.pid); assert.equal(again.directory,info.directory); assert.equal(again.url,info.url);
    checks.push("重复启动复用端口、进程和数据库");
    assert.equal((await post("/api/auth/password", {currentPassword:"incorrect",newPassword:replacement},token)).status,400);
    assert.equal((await post("/api/auth/password", {currentPassword:password,newPassword:password},token)).status,400);
    assert.equal((await post("/api/auth/password", {currentPassword:password,newPassword:replacement})).status,401);
    assert.equal((await post("/api/auth/password", {currentPassword:password,newPassword:replacement},token)).status,200);
    assert.equal((await post("/api/auth/me",{},second.body.token)).status,401);
    assert.equal((await post("/api/auth/me",{},token)).status,200);
    assert.equal((await post("/api/auth/login",{identifier:nickname,password})).status,401);
    checks.push("改密要求登录与原密码；新密码生效、旧密码失效、撤销其他会话");
    const priorPid=info.pid; info=await startPreview({stateFile,restart:true});
    assert.notEqual(info.pid,priorPid); assert.equal(info.url,again.url);assert.equal(info.directory,again.directory);
    assert.equal((await post("/api/auth/me",{},token)).status,200);
    assert.equal((await post("/api/auth/login",{identifier:nickname,password:replacement})).status,200);
    const SQL=await require("sql.js")(), db=new SQL.Database(fs.readFileSync(path.join(info.directory,"preview.db")));
    assert.equal(db.exec("SELECT COUNT(*) FROM events WHERE type='persistent_preview_check'")[0].values[0][0],1);
    db.close();checks.push("安全重启后账号、新密码、原登录会话和学习事件保留");
    if(priorPublic!==null)assert.equal(fs.readFileSync(publicFile,"utf8"),priorPublic);
    checks.push("测试入口没有覆盖用户固定入口");
    fs.writeFileSync(path.join(dir,"验收.json"),JSON.stringify({passed:true,checks},null,2));
    console.log(JSON.stringify({passed:true,checks,report:path.join(dir,"验收.json")}));
  } finally { if(info) await fetch(info.url+"/api/admin/shutdown",{method:"POST"}).catch(()=>{}); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
