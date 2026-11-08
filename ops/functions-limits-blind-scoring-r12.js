'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=require('./functions-limits-blind-scoring-r11');
const bank=require('../lib/assessments/functions-limits-r12');
// The r11 scoring packet/hash schema is unchanged; each row freezes the actual r12 instrument version.
const questions=['pre','post'].flatMap(phase=>['X','Y'].flatMap(form=>bank.questions(phase,form)));
const scoreableIds=new Set(questions.filter(q=>q.type==='short_answer').map(q=>q.id));
function options(exported,mode){
  if(mode!=='math')return {};
  const rows=exported.data?.tables?.quiz_results||exported.tables?.quiz_results||exported.quiz_results||[];
  assert(rows.some(r=>scoreableIds.has(r.question_id)&&!['__unknown__','__skip__'].includes(r.response)), '没有可盲评的 r12 简答记录；请检查题库版本、导出范围及是否全部明确不会，未生成空评分包。');
  return {questions};
}
function packet(exported,mode='math'){return base.packet(exported,mode,options(exported,mode));}
function prepare(exported,dir,mode='math'){return base.prepare(exported,dir,mode,options(exported,mode));}
if(require.main===module){try{
  const [command,...args]=process.argv.slice(2),read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
  if(command==='prepare'||command==='prepare-regulation'){
    const [input,dir]=args;assert(input&&dir,'请提供管理导出 JSON 与新建评分目录');
    const p=prepare(read(input),dir,command==='prepare'?'math':'regulation');console.log(`已生成 ${p.rating.items.length} 条独立盲评材料；保留原回答、材料校验、双评和裁决。`);
  }else if(command==='reconcile'){
    const [mapping,a,b,output,adjudication]=args;assert(output&&!fs.existsSync(output),'结果必须写入新文件');
    fs.writeFileSync(output,JSON.stringify(base.reconcile(read(mapping),read(a),read(b),adjudication?read(adjudication):null),null,2));console.log('已保留双评、分歧和独立裁决。');
  }else throw Error('用法：prepare|prepare-regulation <导出.json> <新目录>；reconcile <映射.json> <甲.json> <乙.json> <新结果.json> [裁决.json]');
}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={...base,packet,prepare};
