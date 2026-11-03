"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process");
const { openDatabase } = require("../lib/native-sqlite");
const initSqlJs = require("sql.js");
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-native-sqlite-")), filename = path.join(dir, "test.db");
  const SQL = await initSqlJs(), legacy = new SQL.Database();
  legacy.run("CREATE TABLE sample(id TEXT PRIMARY KEY,value TEXT,blob BLOB); INSERT INTO sample VALUES('old','已有内容',NULL)");
  fs.writeFileSync(filename, legacy.export()); legacy.close();
  const db = openDatabase(filename);
  const rows = (sql, values=[]) => { const s=db.prepare(sql);try{s.bind(values);const all=[];while(s.step())all.push(s.getAsObject());return all;}finally{s.free();} };
  assert.equal(rows("SELECT value FROM sample WHERE id=?",["old"])[0].value,"已有内容");
  assert.equal(rows("PRAGMA synchronous")[0].synchronous,2);
  assert.equal(rows("PRAGMA journal_mode")[0].journal_mode,"delete");
  db.run("INSERT INTO sample VALUES(?,?,?)",["new","新内容",new Uint8Array([0,255])]);assert.equal(db.getRowsModified(),1);
  db.run("INSERT OR IGNORE INTO sample VALUES(?,?,NULL)",["new","重复"]);assert.equal(db.getRowsModified(),0);
  db.run("BEGIN IMMEDIATE");db.run("UPDATE sample SET value=? WHERE id=?",["不应保留","old"]);db.run("ROLLBACK");
  assert.equal(rows("SELECT value FROM sample WHERE id=$id",{$id:"old"})[0].value,"已有内容");
  const reader=new SQL.Database(fs.readFileSync(filename));assert.equal(reader.exec("SELECT count(*) FROM sample")[0].values[0][0],2);reader.close();
  db.close();
  const script=`const db=require(${JSON.stringify(path.resolve(__dirname,"../lib/native-sqlite"))}).openDatabase(process.argv[1]);db.run("INSERT INTO sample VALUES(?,?,NULL)",["exit","提交后立即退出"]);process.exit(0);`;
  const child=spawnSync(process.execPath,["-e",script,filename],{encoding:"utf8"});assert.equal(child.status,0,child.stderr);
  const restored=openDatabase(filename),s=restored.prepare("SELECT value FROM sample WHERE id='exit'");assert.ok(s.step());assert.equal(s.getAsObject().value,"提交后立即退出");s.free();restored.close();
  console.log("通过：原 sql.js 文件兼容、按页持久化、绑定与遍历、BLOB、变化行数、事务回滚、跨进程读取和立即退出后的已提交数据");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
