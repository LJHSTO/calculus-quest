"use strict";
const fs=require('node:fs'),path=require('node:path'),{run}=require('../lib/education-replay-runner');
async function main(){
  const [inputFile,outputFile,...flags]=process.argv.slice(2);
  if(!inputFile||!outputFile)throw new Error('用法：node ops/run-education-replay.js <模型输入.jsonl> <新预测.jsonl> --models=模型甲,模型乙 [--variant=full] [--repeats=1] [--execute]');
  const options=Object.fromEntries(flags.filter(x=>x.includes('=')).map(x=>x.slice(2).split('=')));
  const inputs=fs.readFileSync(inputFile,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse),models=(options.models||'').split(',').filter(Boolean);
  if(!models.length)throw new Error('请明确指定模型，避免静默使用生产模型');
  const variant=options.variant||'full',repeats=Number(options.repeats||1);
  if(!flags.includes('--execute')){console.log(JSON.stringify({mode:'仅生成运行计划，未调用模型',cases:inputs.length,models,variant,repeats,requests:inputs.length*models.length*repeats}));return;}
  const output=path.resolve(outputFile);fs.mkdirSync(path.dirname(output),{recursive:true});const fd=fs.openSync(output,'wx');
  try{await run(inputs,{models,variant,repeats,complete:require('../lib/llm').completeChat,onResult:row=>fs.writeSync(fd,JSON.stringify(row)+'\n')});}
  finally{fs.closeSync(fd);}
  console.log('运行结束。失败、超时和无效输出均保留在预测文件中；尚未产生质量分或学习效果。');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
