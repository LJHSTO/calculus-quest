"use strict";
const fs=require('node:fs'),path=require('node:path'),{buildReplay,modelInputs}=require('../lib/three-arm-replay');
const [sourceFile,directory,...flags]=process.argv.slice(2),args=Object.fromEntries(flags.map(s=>s.replace(/^--/,'').split('=')));
if(!sourceFile||!directory)throw new Error('用法：node ops/build-three-arm-replay.js 导出.json 新输出目录 --mode=preview或formal --fingerprint=协议指纹；通过 REPLAY_SPLIT_SALT 环境变量提供划分种子。');
const bundle=buildReplay(JSON.parse(fs.readFileSync(sourceFile,'utf8').replace(/^\uFEFF/,'')),{mode:args.mode,protocolFingerprint:args.fingerprint,splitSalt:process.env.REPLAY_SPLIT_SALT});
fs.mkdirSync(directory,{recursive:false});
fs.writeFileSync(path.join(directory,'回放与人工标注.json'),JSON.stringify(bundle,null,2));
fs.writeFileSync(path.join(directory,'模型输入.jsonl'),modelInputs(bundle).map(r=>JSON.stringify(r)).join('\n')+'\n');
console.log(`已生成 ${bundle.caseCount} 个决策回放，${bundle.participantCount} 位参与者；模型输入可交给 ops/run-education-replay.js。`);
