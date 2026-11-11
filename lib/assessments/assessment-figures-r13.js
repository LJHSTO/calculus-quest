'use strict';
const crypto=require('node:crypto'),prior=require('./assessment-figures-r11');
const version='functions-limits-figures-r13-20261108',prefix='assets/assessment/functions-limits-r13/';
const stages={t0:0,t1:1,outcome:2,return_probe:7},definitions=[];
for(const [stage,variant] of Object.entries(stages)){
  const k=variant+5,L=k+1,base={xLabel:'x',yLabel:'y',caption:'线段表示图示区间内给定的规则；空心位置不取，实心位置取值。',representation:'complete_rule'};
  definitions.push({...base,id:`point-membership-${stage.replace('_','-')}`,title:'函数规则与待审核点',xRange:[k-1,k+2],yRange:[2*k-2,2*k+6],xTicks:[k-1,k,k+1,k+2],yTicks:[2*k-1,2*k+1,2*k+3,2*k+5],
    segments:[[[k-1,2*k-1],[k+2,2*k+5]]],markers:[{x:k,y:2*k+1,label:'P'},{x:k+1,y:2*k+1,label:'Q'}],
    caption:'紫线表示给定函数；橙色菱形是待审核标记，尚未判定是否属于函数图像。',representation:'complete_rule_with_candidate_markers',
    alt:`紫色直线从(${k-1},${2*k-1})到(${k+2},${2*k+5})。橙色菱形P位于(${k},${2*k+1})，Q位于(${k+1},${2*k+1})；菱形是待审核标记。`});
  definitions.push({...base,id:`one-sided-${stage.replace('_','-')}`,title:'零点附近的两段规则',xRange:[-1.5,1.5],yRange:[L-2,L+4],xTicks:[-1,0,1],yTicks:[L-1,L,L+1,L+3],
    segments:[[[-1,L-1],[0,L]],[[0,L+1],[1,L+3]]],points:[{x:0,y:L,filled:false},{x:0,y:L+1,filled:false}],
    alt:`左线段从(-1,${L-1})到(0,${L})，右线段从(0,${L+1})到(1,${L+3})；横坐标为0的两个端点均为空心位置，本图未指定f(0)。`});
  definitions.push({...base,id:`continuity-repair-${stage.replace('_','-')}`,title:'输入a附近的规则与点值',xLabel:'输入与a的差（x−a）',xRange:[-1.5,1.5],yRange:[L-2,L+3],xTicks:[-1,0,1],yTicks:[L-1,L,L+1,L+2],
    segments:[[[-1,L-1],[0,L]],[[0,L],[1,L+1]]],points:[{x:0,y:L,filled:false},{x:0,y:L+2,filled:true}],
    alt:`横轴表示x−a，横坐标0对应输入a。左线段从(-1,${L-1})到(0,${L})，右线段从(0,${L})到(1,${L+1})；(0,${L})为空心位置，(0,${L+2})为实心点。`});
}
const byId=Object.fromEntries(definitions.map(g=>[g.id,g]));
function publicFigure(id){const g=byId[id];if(!g)throw Error('图形编号不存在');return {id,version,src:prefix+id+'.svg',alt:g.alt,caption:g.caption,width:640,height:320,representation:g.representation,sha256:crypto.createHash('sha256').update(prior.renderFigure(g)).digest('hex')};}
function assets(){return definitions.map(g=>({file:prefix+g.id+'.svg',svg:prior.renderFigure(g),...publicFigure(g.id)}));}
module.exports={version,prefix,byId,publicFigure,assets,assetPaths:definitions.map(g=>prefix+g.id+'.svg')};
