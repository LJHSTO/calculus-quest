'use strict';
const prior=require('./functions-limits-delayed-r11');
const bank=require('./functions-limits-r12');
const version='functions-limits-delayed-r12-20261108';
const z=new Map(bank.forms('Z').map(q=>[q.id.split('-').at(-1),q]));
const retention=prior.retention.map((old,i)=>{
  const position=/retention-Z-(\d+)$/.exec(old.id)?.[1],revised=position?z.get(position):null;
  const q={...structuredClone(revised||old),id:old.id.replace('fl-r11-','fl-r12-'),points:1,instrumentVersion:version};
  return bank.reorderChoices(q,[3,1,0,2,1,3,2,0][i]);
});
const transfer=prior.transfer.map((old,i)=>bank.reorderChoices({...structuredClone(old),id:old.id.replace('fl-r11-','fl-r12-'),instrumentVersion:version},[2,0,3,1,0,2][i]));
module.exports={version,retention,transfer};
