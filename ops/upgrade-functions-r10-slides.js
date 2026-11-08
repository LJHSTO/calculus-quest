'use strict';
const assert=require('node:assert/strict'),{lessons}=require('../lib/courseware/functions-limits-r10/lessons');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function setText(point,id,text,size=18){const e=point.slide.canvas.elements.find(e=>e.id===id&&e.type==='text');assert(e,'Missing original slide element: '+id);const color=e.content.match(/color:\s*(#[A-Fa-f0-9]+)/)?.[1]||'#333333';e.content=`<p style="font-size:${size}px;line-height:1.35;color:${color};margin:0">${text.split('\n').map(esc).join('<br>')}</p>`;}
function text(id,x,y,w,h,content,size=22,color='#24384a'){return {id,type:'text',left:x,top:y,width:w,height:h,rotate:0,content:`<p style="font-size:${size}px;line-height:1.4;color:${color};margin:0">${content}</p>`,defaultColor:color,defaultFontName:'Microsoft YaHei'};}
function supplement(point,lesson,example,index){const canvas=structuredClone(point.slide.canvas);canvas.id=lesson.id+'-r10-example-'+index;canvas.animations=[];canvas.elements=[{id:canvas.id+'-header',type:'shape',left:50,top:35,width:900,height:80,rotate:0,fill:'#2C3E50',path:'M 0 0 L 1 0 L 1 1 L 0 1 Z',viewBox:[1,1],fixedRatio:false},text(canvas.id+'-title',70,50,860,55,esc(example.title),27,'#ffffff'),text(canvas.id+'-setup',70,133,860,65,esc(example.setup),23),...example.steps.map((step,i)=>text(canvas.id+'-step-'+i,90,211+i*73,820,67,esc((i+1)+'. '+step),21)),text(canvas.id+'-conclusion',70,445,860,68,esc(example.conclusion),20),text(canvas.id+'-progress',70,530,860,22,esc(lesson.title+' · 推理 '+index+'/2'),13,'#59758a')];return {title:example.title,summary:[example.setup,...example.steps,example.conclusion].join('\n'),canvas,lessonId:lesson.id,kind:'worked_example',sourceRefs:lesson.refs};}
function upgrade(point,index){const lesson=lessons[index];assert.equal(point.id,lesson.id);const before=structuredClone(point.slide.canvas.elements.filter(e=>e.type!=='text'));
 if(index===0)setText(point,'text_Zg2SVkrJ','定义域：允许输入；值域：实际输出的集合。\n不同输入可以同值；同一允许输入只有一个输出。\n另例：g(x)=x²，定义域[−2,2]，值域[0,4]。');
 if(index===1)setText(point,'text__TMvCwhC','先按刻度读点，再按定义域选规则；约分不能补上原式无定义的点。');
 if(index===3)setText(point,'r7-error-bound','本例倍率为1；换成3时，输出误差=3×输入误差。\n输出误差要求小于0.3，输入距离小于0.1就足够。');
 if(index===4){setText(point,'limits-left','左侧：x < x₀',18);setText(point,'limits-point-note-r7','点值不改变附近趋势。还要区分：两侧不等、无界、没有共同趋近值。\n这些结论需要规则依据，不能只凭有限数表。',18);}
 if(index===5)setText(point,'continuity-note','共同极限存在时才可能补点修复；尖角不等于间断。\n定义域端点按允许的一侧判断，本课主要讨论内点。',18);
 point.goal=lesson.goal;point.slide.summary=[lesson.core,lesson.example.setup,...lesson.example.steps,lesson.example.conclusion,lesson.extension.setup,...lesson.extension.steps,lesson.extension.conclusion,lesson.caution,lesson.transfer].join('\n');
 assert.deepEqual(point.slide.canvas.elements.filter(e=>e.type!=='text'),before,'Original figures changed');
 const pages=[supplement(point,lesson,lesson.example,1),supplement(point,lesson,lesson.extension,2)];
 point.slide.lecturePages=pages;point.slide.pages=[point.slide.canvas,...pages.map(p=>p.canvas)];point.slide.lectureVersion='functions-limits-lessons-r10-v1';return pages;
}
module.exports={upgrade,supplement};
