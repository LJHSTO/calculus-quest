'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),parser=require('../lib/courseware/function-expression-r11'),budget=require('../lib/first-session-budget');
const checks=[];
function check(name,fn){try{fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,error:error.message});}}
check('未定义中间结果不能恢复成有效函数值',()=>{for(const [f,x]of [['1/(1/x)',0],['sqrt(x)^0',-1],['1/(10^1000)',0],['(sqrt(x)+1)^0',-2],['0^0',1]])assert(Number.isNaN(parser.compile(f).evaluate(x)),f);assert.equal(parser.compile('1/(1/x)').evaluate(2),2);});
check('构建脚本在隔离内存文件系统中幂等',()=>{const target=path.join(root,'resources/open-maic/GH-01-函数、坐标与图像读法入门/interactive/03_输入、输出和函数规则：拖动实验.html');let html=fs.readFileSync(target,'utf8');const script=fs.readFileSync(path.join(__dirname,'build-function-explorer-r11.js'),'utf8');const sandbox={__dirname,require:name=>name==='node:fs'?{readFileSync:(p,...rest)=>p===target?html:fs.readFileSync(p,...rest),writeFileSync:(p,value)=>{assert.equal(p,target);html=value;}}:require(name),console:{log(){}}};vm.runInNewContext(script,sandbox);const once=html;vm.runInNewContext(script,{...sandbox});assert.equal(html,once);assert(!html.includes('if (Number.isFinite(my)) if (Number.isFinite(my))'));});
const started=Date.UTC(2026,10,7),run={mode:'formal',firstSessionBudget:budget.start(new Date(started).toISOString())};
check('已完成首场在三天后保持原时长',()=>{const result=budget.project({...run,finalSurveyAt:new Date(started+4700000).toISOString()},started+4*86400000);assert.equal(result.elapsedSeconds,4700);assert.equal(result.expired,false);});
check('超时首场在随访时不累计等待天数',()=>{const result=budget.project(run,started+4*86400000);assert.equal(result.elapsedSeconds,5400,'超时首场时长应固定在90分钟，额外经过时间可另列字段');});
const out=path.join(root,'output/学习体验与调节迁移-r11-20261107');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'独立边界审查回执.json'),JSON.stringify({at:new Date().toISOString(),checks},null,2));console.log(JSON.stringify(checks));if(checks.some(x=>!x.passed))process.exitCode=1;
