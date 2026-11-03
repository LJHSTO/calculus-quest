'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),chapter=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1');
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const results=[];
 try{
  const page=await browser.newPage();await page.evaluate(()=>window.decoder=new AudioContext());
  for(const m of chapter.modules){
   const map=JSON.parse(fs.readFileSync(path.join(root,'resources',m.source.resourceRoot,'index.json'),'utf8'));
   for(const p of m.knowledgePoints)for(const c of [{type:'slide',sceneOrder:p.slide.sceneOrder},...p.resourceCandidates]){
    const scene=map.scenes.find(s=>s.order===c.sceneOrder),actions=(c.teachingActions||scene.actions).filter(a=>a.type==='speech');
    assert.ok(actions.length,p.id+' '+c.type+' 缺少讲解');
    for(const a of actions){
     assert.ok(a.audioRef,p.id+' '+c.type+' '+a.id+' 只有字幕没有语音');
     const file=path.join(root,'resources',c.audioRoot||m.source.resourceRoot,a.audioRef),bytes=fs.readFileSync(file);
     const stats=await page.evaluate(async encoded=>{
      const data=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));const buffer=await decoder.decodeAudioData(data.buffer);
      let peak=0,sum=0,active=0,count=0;
      for(let c=0;c<buffer.numberOfChannels;c++)for(const sample of buffer.getChannelData(c)){peak=Math.max(peak,Math.abs(sample));sum+=sample*sample;active+=Math.abs(sample)>.005;count++;}
      return {duration:buffer.duration,peak,rms:Math.sqrt(sum/count),activeRatio:active/count,channels:buffer.numberOfChannels};
     },bytes.toString('base64'));
     const row={point:p.id,type:c.type,id:a.id,audioRef:a.audioRef,text:a.text,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),...stats};results.push(row);
     assert.ok(stats.duration>1&&stats.peak>.02&&stats.rms>.001&&stats.activeRatio>.015,'静音或损坏：'+JSON.stringify(row));
    }
   }
  }
  console.log('通过：30 个启用课件，'+results.length+' 段语音均存在、可解码且非静音');
 }finally{await browser.close();fs.writeFileSync(path.resolve(process.env.NARRATION_MEDIA_REPORT||path.join(root,'output/学生体验修复-20261102/全部语音解码核验.json')),JSON.stringify(results,null,2));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
