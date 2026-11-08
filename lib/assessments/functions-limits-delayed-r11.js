'use strict';
const prior=require('./functions-limits-delayed-r10');
const bank=require('./functions-limits-r11');
const figures=require('./assessment-figures-r11');
const version='functions-limits-delayed-r11-20261107';
const z=new Map(bank.forms('Z').map(q=>[q.id.split('-').at(-1),q]));
const retention=prior.retention.map(old=>{
  const position=/retention-Z-(\d+)$/.exec(old.id)?.[1],revised=position?z.get(position):null;
  return {...structuredClone(old),id:old.id.replace('fl-r10-','fl-r11-'),instrumentVersion:version,...(revised?{question:revised.question,...(revised.figure?{figure:revised.figure}:{})}:{})};
});
const transfer=prior.transfer.map((old,i)=>{
  const q={...structuredClone(old),id:old.id.replace('fl-r10-','fl-r11-'),instrumentVersion:version};
  if(i===2){q.figure=figures.publicFigure('transfer-temperature-samples');q.question='监测系统每隔一小时记录一次温度，图中只给出了五次记录。温度随时间连续。负责人说这证明图示时段每一分钟都在升温。哪项最准确？';}
  if(i===4){q.figure=figures.publicFigure('transfer-switch');q.question='图中线段给出设备切换前后的完整读数规则，实心点是工程师重新设置的切换瞬间读数。这次单点修改能否消除图中的跳跃？';}
  if(i===5){q.figure=figures.publicFigure('transfer-position');q.question='图中给出时刻2附近的完整位置规则，实心点是该时刻的记录。只修正这一个记录，怎样使位置函数在这里连续？';}
  return q;
});
module.exports={version,retention,transfer};
