'use strict';
// Recheck the submitted values, not the browser's correctness flag.
const points=['GH-01-K01','GH-01-K02','GH-01-K03','GH-02-K01','GH-02-K02','GH-02-K03'];
function grade(data,point){
  if(data?.feedback_version!=='openmaic-games-20261102-v1'||data.independent!==false||data.evidence_scope!=='openmaic_game_attempt'||data.knowledge_point_id!==point)return null;
  const kind=points.indexOf(point),p=data.parameters||{},v=p.values,r=p.round;
  if(kind<0||!Array.isArray(v)||v.length>12||!Number.isInteger(r)||r<0||r>(kind===2?3:1))return null;
  const numbers=()=>v.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1000);
  if(p.task==='reason'){
    const choices=kind===0?[0,1,2]:kind===2?['A','B','C']:kind===5?[0,1,2]:['A','B','C'];
    return v.length===1&&choices.includes(v[0])?v[0]===(kind===0||kind===5?0:kind===2?'B':'A'):null;
  }
  if(kind===0&&p.task==='outputs'&&v.length===3&&numbers()){
    const [x,a,b]=v;if(!(r?[-1,0,3]:[-2,-1,2,3]).includes(x))return null;
    return a===(r?3*x-1:2*x+1)&&b===(r?x*x+1:x*x+x+1);
  }
  if(kind===1&&p.task==='audit'&&v.length===8){
    const rows=r?[[1,5],[-2,2],[2,4],[-3,1]]:[[2,3],[3,2],[0,-1],[-1,-3]];
    if(v.some((x,i)=>i%2?![true,false,null].includes(x):!(x===null||typeof x==='number'&&Number.isFinite(x))))return null;
    return rows.every(([x,y],i)=>v[i*2]===(r?x+4:2*x-1)&&v[i*2+1]===(y===(r?x+4:2*x-1)));
  }
  if(kind===2&&p.task==='construction'&&v.length===4&&numbers()){
    if(r===0)return v.slice(0,3).every(x=>x<0)&&v[1]>v[0];
    if(r===1)return v.slice(0,3).every(x=>x>0)&&v[1]<v[0];
    if(r===3)return v.every(x=>x>0)&&v[2]===v[1]&&v[3]<v[2];return null;
  }
  if(kind===3&&p.task==='prediction'&&v.length===2&&typeof v[1]==='boolean'){
    const x=v[0];if(!(r?[-2,1,2]:[2,3,-1]).includes(x))return null;
    return v[1]===(r?(x>=0&&x+2!==3*x+2):(x>=2&&x+3!==2*x+1));
  }
  if(kind>=4&&p.task==='limits'&&v.length===2&&numbers())return v[0]===2&&v[1]===4;
  if(kind===4&&p.task==='repair'&&v.length===4&&v.slice(0,3).every(x=>Number.isFinite(x)))return v.slice(0,3).every(x=>x===3)&&v[3]==='A';
  if(kind===5&&p.task==='repair'&&v.length===3&&numbers())return v.every(x=>x===3);
  if(kind===5&&p.task==='judgment'&&v.length===1&&['A','B','C'].includes(v[0]))return v[0]==='A';
  return null;
}
module.exports={grade};
