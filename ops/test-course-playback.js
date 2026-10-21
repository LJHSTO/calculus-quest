"use strict";
const assert = require("node:assert/strict");
const { create, publicActions } = require("../lib/course-playback");
function fixture(actions, more = {}) {
  let time = 0, callback = null, events = null;
  const seen = [], changes = [];
  const player = create(actions, { now:()=>time, every:fn=>(callback=fn,1), cancel:()=>{callback=null;},
    action:(a,d)=>seen.push([a.id,a.type,d]), onChange:s=>changes.push(s),
    media:(a,e)=>{events=e;return { stop(){},play(){},pause(){},setRate(){} };}, ...more });
  return { player, seen, changes, events:()=>events, advance(ms){time+=ms;callback?.();} };
}
const sequence = [ {id:"light",type:"spotlight",elementId:"target"}, {id:"s1",type:"speech",text:"先想一想"},
  {id:"demo",type:"widget_setState",state:{x:2}}, {id:"s2",type:"speech",text:"再观察"},
  {id:"tail",type:"widget_reveal",target:"#next"} ];
const f = fixture(sequence);f.player.play();assert.equal(f.player.snapshot().caption,"先想一想");
f.advance(500);f.player.pause();f.advance(10000);assert.equal(f.player.snapshot().elapsed,.5);
f.player.play();f.advance(1600);assert.equal(f.player.snapshot().caption,"再观察");f.advance(2100);
assert.equal(f.player.snapshot().status,"ended");assert.deepEqual(f.seen.map(x=>x[0]),["light","s1","demo","s2","tail"]);
assert.ok(f.seen.every(x=>x[2].source==="authored_playback"));
const g=fixture(sequence);g.player.seek(.75);assert.equal(g.player.snapshot().status,"paused");
assert.ok(g.seen.find(x=>x[0]==="demo"&&x[2].replay));g.advance(10000);assert.equal(g.player.snapshot().elapsed,3);
g.player.play();g.player.setRate(2);g.advance(510);assert.equal(g.player.snapshot().status,"ended");
const endSeek=fixture(sequence);endSeek.player.seek(1);assert.equal(endSeek.player.snapshot().status,'ended');
assert.deepEqual(endSeek.seen.map(x=>x[0]),['demo','tail'],'跳到结尾同样恢复最后的作者参数和揭示动作');
const fractional=fixture([{id:'a',type:'speech',text:'一段长度产生非整数秒的文字'},...sequence,{id:'b',type:'speech',text:'另一段产生小数秒的讲解文字'},{id:'last',type:'widget_reveal',target:'#last'}]);fractional.player.seek(1);assert.equal(fractional.player.snapshot().status,'ended');assert.equal(fractional.seen.at(-1)[0],'last');
const a=fixture([{id:"audio",type:"speech",audioRef:"a.mp3",text:"音频的文字替代"}]);a.player.play();
const stale=a.events();stale.duration(10);stale.time(3);assert.equal(a.player.snapshot().elapsed,3);
stale.failed();assert.ok(a.player.snapshot().warning);a.advance(3000);assert.equal(a.player.snapshot().status,"ended");
const h=fixture([{id:"audio",type:"speech",audioRef:"a.mp3",text:"讲解"}]);h.player.play();const cancelled=h.events();h.player.stop();
cancelled.duration(999);cancelled.time(999);cancelled.ended();assert.equal(h.player.snapshot().status,"idle");assert.equal(h.player.snapshot().elapsed,0);
const many=fixture(Array.from({length:12},(_,i)=>({id:String(i),type:"speech",text:"短句"})));
many.player.play();for(let i=0;i<12;i++)many.advance(2100);assert.equal(many.seen.length,12);
const safe=publicActions([{id:"s",type:"speech",text:"教学内容",secret:"hidden",answer:"A"},{type:"tool_call",code:"never"}]);
assert.deepEqual(safe,[{id:"s",type:"speech",text:"教学内容"}]);
console.log("通过：完整顺序、无音频文字、暂停/恢复、倍速、拖动恢复参数、尾动作、超过8段、取消隔离、音频故障与公共字段边界");
