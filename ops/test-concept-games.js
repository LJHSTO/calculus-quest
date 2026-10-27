'use strict';
const assert=require('node:assert/strict'),M=require('../resources/open-maic/函数极限混合探索/game-model');
for(let kind=0;kind<6;kind++)for(let round=0;round<M.rounds(kind);round++){
 const s=M.create(kind,round);assert.equal(M.check(s,[-3,-3]).correct,false);
 if(kind===0){for(let i=0;i<3;i++){for(const j of [...s.links[i]])M.act(s,'link',[i,j]);M.act(s,'link',[i,0]);}}
 if(kind===1){for(const x of M.targets(s))assert.equal(M.check(s,[x,M.f(s,x)]).correct,true);}
 if(kind===2)M.targetSegments(s).forEach((v,i)=>M.act(s,'segment',[i,v]));
 if(kind===3){M.act(s,'point',2);assert.equal(M.check(s).correct,false,'仅改中心值不能过关');while(s.distance>=M.epsilon(s))M.act(s,'near');}
 if(kind===4)M.sides(s).forEach((v,i)=>M.act(s,'dock',[i,v]));
 if(kind===5){M.act(s,'point',2);if(round){assert.equal(M.check(s).correct,false,'跳跃不能仅靠移动点值修复');M.act(s,'right',2);}}
 assert.equal(M.check(s).completed,true);const attempts=s.attempts;assert.equal(M.check(s).duplicate,true);assert.equal(s.attempts,attempts,'完成后重复点击不产生新尝试');
}
console.log('六种游戏、13关的失败路径和完整通关数学判定通过。');
