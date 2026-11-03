'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../db.js'),'utf8');
const fn=source.slice(source.indexOf('function writeDatabaseAtomically()'),source.indexOf('function processIsAlive('));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cq-atomic-rename-')),file=path.join(dir,'synthetic.db');
function run({platform='win32',code='EPERM',failures=2}){
 fs.writeFileSync(file,'old');let attempts=0,waits=[];
 const context={db:{export:()=>Buffer.from('new')},DB_PATH:file,path,Buffer,process:{platform},SharedArrayBuffer,Int32Array,Atomics:{wait:(...args)=>waits.push(args.at(-1))},fs:{...fs,renameSync(from,to){attempts++;assert.equal(fs.readFileSync(file,'utf8'),'old','重试期间必须保留原数据库');if(attempts<=failures)throw Object.assign(new Error(code),{code});fs.renameSync(from,to);}}};
 let error;try{vm.runInNewContext(fn+'\nwriteDatabaseAtomically();',context);}catch(e){error=e;}
 return{attempts,waits,error,content:fs.readFileSync(file,'utf8')};
}
try{
 for(const code of ['EPERM','EACCES','EBUSY']){const r=run({code});assert.equal(r.attempts,3);assert.equal(r.content,'new');assert.equal(r.error,undefined);assert.deepEqual(r.waits,[10,20]);}
 const blocked=run({failures:99});assert.equal(blocked.attempts,6);assert.equal(blocked.content,'old');assert.equal(blocked.error.code,'EPERM');
 for(const args of [{code:'ENOSPC'},{platform:'linux'}]){const r=run(args);assert.equal(r.attempts,1);assert.equal(r.content,'old');assert.equal(r.waits.length,0);}
 console.log('通过：短暂文件占用后原子替换、重试有界、持续失败保留旧库、其他错误直接上报');
}finally{for(const name of ['synthetic.db','synthetic.db.tmp'])if(fs.existsSync(path.join(dir,name)))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
