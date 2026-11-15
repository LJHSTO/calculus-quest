'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
async function main(){
 for(const prefix of ['','/calculus_quest']){
  const calls=[],location={origin:'https://example.test',pathname:prefix+'/',search:'?study=B',hash:''};
  const document={baseURI:location.origin+location.pathname,createElement:()=>({}),head:{appendChild(){}}};
  const window={ThreeArmStudyUI:{run:{id:'study_synthetic'}},fetch:async(input,init)=>{calls.push({input,headers:new Headers(init?.headers)});}};
  const context=vm.createContext({window,document,location,URL,URLSearchParams,Headers,Request});
  for(const script of scripts.filter(s=>s.includes('originalFetch')||s.includes('Auto-detect sub-path')))vm.runInContext(script,context);
  for(const input of ['/api/learning/state',new URL('api/learning/state',document.baseURI),new Request(document.baseURI+'api/learning/state',{headers:{'X-Existing':'preserved'}})]){
   await window.fetch(input);const call=calls.at(-1);
   assert.equal(call.headers.get('X-Study-Arm'),'B','字符串、URL、Request都保留实验组请求头');
   assert.equal(call.headers.get('X-Study-Run'),'study_synthetic');
   if(input instanceof Request)assert.equal(call.headers.get('X-Existing'),'preserved');
   if(input instanceof URL)assert.equal(call.input,input,'不能把URL对象误写成undefined路径');
  }
  await window.fetch(new URL('api/auth/login',document.baseURI));assert.equal(calls.at(-1).headers.has('X-Study-Run'),false);
  await window.fetch(new URL('api/study/enroll',document.baseURI));assert.equal(calls.at(-1).headers.has('X-Study-Run'),false);
  for(const url of ['https://other.test/api/learning/state',document.baseURI+'assets/example.js']){
   await window.fetch(new URL(url));assert.equal(calls.at(-1).headers.has('X-Study-Arm'),false);
  }
 }
 console.log('实验请求头通过：根路径/子路径、字符串/URL/Request、原请求头、认证与外域隔离。');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
