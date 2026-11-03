'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function fixture(){
 let now=0,watchdog,audio,ports;
 class Media{
  constructor(){audio=this;this.handlers={};this.currentTime=0;this.duration=20;this.readyState=1;this.plays=0;}
  addEventListener(name,fn){this.handlers[name]=fn;}load(){}play(){this.plays++;return Promise.resolve();}pause(){}removeAttribute(){}
 }
 const slot={dataset:{knowledgeAudioSlot:'scene-game',knowledgeAudioOrder:'5'}},target={querySelector:()=>slot,isConnected:true};
 const ctx={Audio:Media,performance:{now:()=>now},setInterval:fn=>(watchdog=fn,1),clearInterval:()=>watchdog=null,queueMicrotask,crypto:{randomUUID:()=>''},analyticsTrack(){},resourceUrl:x=>x,knowledgeAudioRoot:()=> 'open-maic/对应课件',getUnit:()=>({id:'point',type:'knowledge'}),knowledgeAudioActions:()=>[{id:'speech',type:'speech',audioRef:'audio/correct.wav',text:'与当前声音对应的字幕'}],addEventListener(){},CoursePlayback:{create(actions,p){ports=p;return require('../lib/course-playback').create(actions,{...p,now:()=>now,every:()=>2,cancel(){}});}}};ctx.window=ctx;
 vm.runInNewContext(fs.readFileSync(require.resolve('../app/main/lesson-playback'),'utf8'),ctx);
 ctx.LessonPlayback.play(target);
 return {ctx,target,get audio(){return audio;},advance(ms){now+=ms;watchdog?.();},snapshot:()=>ctx.LessonPlayback.snapshot(target)};
}
const stalled=fixture();stalled.audio.handlers.loadedmetadata();assert.match(stalled.audio.src,/对应课件\/audio\/correct.wav$/);stalled.advance(13000);assert.match(stalled.snapshot().warning,/加载超时/);
const paused=fixture();paused.ctx.LessonPlayback.pause();paused.audio.handlers.loadedmetadata();assert.equal(paused.audio.plays,0);paused.advance(20000);assert.equal(paused.snapshot().warning,'');paused.ctx.LessonPlayback.play(paused.target);assert.equal(paused.audio.plays,1);paused.advance(13000);assert.match(paused.snapshot().warning,/加载超时/);
const playing=fixture();playing.audio.handlers.loadedmetadata();playing.advance(11000);playing.audio.currentTime=5;playing.audio.handlers.timeupdate();playing.advance(11000);assert.equal(playing.snapshot().warning,'');playing.ctx.LessonPlayback.stop();playing.advance(20000);assert.equal(playing.snapshot(),null);
console.log('通过：已读元数据但不出声的超时、暂停不误报、恢复后检测、进度更新及离开页面释放音频');
