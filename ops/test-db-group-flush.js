'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cq-group-flush-'));
process.env.DB_PATH=path.join(dir,'synthetic.db');process.env.NODE_ENV='test';
const db=require('../db');
async function main(){
 const SQL=await require('sql.js')(),sql=await db.getDb();
 sql.run('CREATE TABLE flush_probe(id INTEGER PRIMARY KEY)');db.saveNow();
 const rename=fs.renameSync;let writes=0;
 fs.renameSync=(...args)=>{writes++;return rename(...args);};
 const read=()=>{const disk=new SQL.Database(fs.readFileSync(process.env.DB_PATH));try{return disk.exec('SELECT count(*) FROM flush_probe')[0].values[0][0];}finally{disk.close();}};
 try{
  const batch=await Promise.allSettled(Array.from({length:50},async(_,i)=>{await new Promise(r=>setTimeout(r,Math.floor(i/5)*2));sql.run('INSERT INTO flush_probe VALUES(?)',[i]);await db.flush();}));
  assert.ok(batch.every(r=>r.status==='fulfilled'));assert.equal(read(),50);
  assert.ok(writes<=2,'网络请求跨事件循环分批到达也应合并，实际导出次数='+writes);
  fs.renameSync=()=>{throw Object.assign(Error('合成磁盘写入失败'),{code:'ENOSPC'});};
  sql.run('INSERT INTO flush_probe VALUES(50)');
  const failed=await Promise.allSettled([db.flush(),db.flush()]);
  assert.ok(failed.every(r=>r.status==='rejected'&&r.reason.code==='ENOSPC'));
  assert.equal(read(),50,'失败仍保留原子替换前的数据库');
  fs.renameSync=rename;await db.flush();assert.equal(read(),51,'重试必须保留并写入尚未确认的记录');
  sql.run('INSERT INTO flush_probe VALUES(51)');const pending=db.flush();db.saveNow();
  sql.run('INSERT INTO flush_probe VALUES(52)');await pending;assert.equal(read(),53,'同步保存与异步批次交错不能漏掉后续写入');
  console.log('通过：50个并发持久化请求合并一次、成功前落盘、失败全部拒绝且保留旧库、恢复重试及同步保存交错');
 }finally{fs.renameSync=rename;db.saveNow();db.releaseWriteLock();}
 for(const name of ['synthetic.db','synthetic.db.tmp','synthetic.db.lock']){const file=path.join(dir,name);if(fs.existsSync(file))fs.unlinkSync(file);}fs.rmdirSync(dir);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
