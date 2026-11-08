'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=process.env.COURSEWARE_QA_OUT||path.join(root,'tmp/voice-r12');
async function main(){
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage();const records=[];
 try{
  await page.route('http://voice-r12.test/**',route=>{const rel=new URL(route.request().url()).pathname.slice(1);const file=path.resolve(root,'resources/open-maic/pro-supplements-r11',rel);if(!file.startsWith(path.resolve(root,'resources/open-maic/pro-supplements-r11')+path.sep))return route.fulfill({status:403,body:''});return route.fulfill({contentType:'audio/mpeg',body:fs.readFileSync(file)});});
  await page.setContent('<meta charset="utf-8"><h1>语音逐段播放验收</h1><audio controls></audio>');
  for(let i=1;i<=18;i++){
   const file='audio/audio-'+i+'.mp3';
   const record=await page.evaluate(async file=>{const bytes=await (await fetch('http://voice-r12.test/'+file)).arrayBuffer();const ac=new AudioContext(),b=await ac.decodeAudioData(bytes),samples=b.getChannelData(0);let peak=0,sum=0,voiced=0;const bins=[];for(let j=0;j<samples.length;j++){const x=samples[j];peak=Math.max(peak,Math.abs(x));sum+=x*x;}for(let j=0;j<samples.length;j+=b.sampleRate/10){const s=samples.subarray(Math.floor(j),Math.min(samples.length,Math.floor(j+b.sampleRate/10)));const rms=Math.sqrt(s.reduce((a,x)=>a+x*x,0)/s.length);bins.push(rms);if(rms>.003)voiced++;}await ac.close();const audio=document.querySelector('audio');audio.src='http://voice-r12.test/'+file;const start=performance.now();await new Promise((resolve,reject)=>{audio.onended=resolve;audio.onerror=()=>reject(Error('音频解码/播放错误'));audio.play().catch(reject);});return {file,duration:b.duration,channels:b.numberOfChannels,sampleRate:b.sampleRate,peak,rms:Math.sqrt(sum/samples.length),voicedFraction:voiced/bins.length,wallSeconds:(performance.now()-start)/1000,ended:audio.ended,limit:'完整自然播放和信号检查；不等于人工听审或语音识别转录'};},file);
   assert(record.duration>2&&record.peak>.03&&record.rms>.003&&record.voicedFraction>.15&&record.ended);assert(record.wallSeconds>=record.duration-.7);records.push(record);fs.writeFileSync(path.join(out,'18段语音自然播放验收.json'),JSON.stringify({at:new Date().toISOString(),complete:records.length===18,records},null,2));console.log(file+' 自然播放完成 '+record.duration.toFixed(2)+'秒');
  }
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
