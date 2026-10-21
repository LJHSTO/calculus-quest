"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {startPreview}=require("./start-functions-limits-preview");
async function main(){
  const root=path.resolve(__dirname,".."),pointer=path.join(root,"output/函数极限预览.json");
  const original=JSON.parse(fs.readFileSync(pointer,"utf8"));
  const SQL=await require("sql.js")();
  function read(directory){
    const d=new SQL.Database(fs.readFileSync(path.join(directory,"preview.db")));
    try{
      const ids=table=>d.exec(`SELECT id FROM ${table}`)[0]?.values.map(row=>row[0])||[];
      const count=table=>d.exec(`SELECT COUNT(*) FROM ${table}`)[0].values[0][0];
      return {users:ids("users"),quizzes:ids("quiz_results"),counts:{users:count("users"),sessions:count("sessions"),quizResults:count("quiz_results"),events:count("events")}};
    }finally{d.close();}
  }
  const before=read(original.directory);
  const current=await startPreview({restart:true});
  assert.equal(current.url,original.url);assert.equal(current.directory,original.directory);
  const after=read(current.directory);
  assert.ok(before.users.every(id=>after.users.includes(id)));
  assert.ok(before.quizzes.every(id=>after.quizzes.includes(id)));
  assert.ok(after.counts.sessions>=before.counts.sessions);
  assert.ok(after.counts.events>=before.counts.events);
  assert.equal((await fetch(current.url+"/api/health")).ok,true);
  const report={passed:true,at:new Date().toISOString(),url:current.url,database:path.join(current.directory,"preview.db"),
    sameDatabase:true,sameAddress:true,existingUserIdsPreserved:true,existingQuizIdsPreserved:true,
    before:before.counts,after:after.counts};
  const out=path.join(root,"output/六维最小实现交付-2026-10-20");
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,"固定入口与数据保留核验.json"),JSON.stringify(report,null,2),"utf8");
  console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
