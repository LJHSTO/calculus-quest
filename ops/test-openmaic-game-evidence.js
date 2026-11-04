'use strict';
const assert=require('node:assert/strict'),{grade}=require('../lib/assisted-game-evidence');
const points=['GH-01-K01','GH-01-K02','GH-01-K03','GH-02-K01','GH-02-K02','GH-02-K03'];
const rows=[
 [0,'outputs',0,[2,5,7],true],[0,'outputs',0,[2,5,5],false],[0,'outputs',1,[3,8,10],true],
 [0,'reason',1,[2],false],[1,'audit',0,[3,true,5,false,-1,true,-3,true],true],[1,'audit',0,[3,true,5,null,-1,true,-3,true],false],
 [1,'audit',1,[5,true,2,true,6,false,1,true],true],[2,'construction',0,[-4,-1,-3,0],true],[2,'construction',0,[-4,-5,-3,0],false],
 [2,'construction',1,[4,1,3,0],true],[2,'construction',3,[2,3,3,1],true],[2,'reason',2,['B'],true],
 [3,'prediction',0,[2,false],true],[3,'prediction',0,[3,false],false],[3,'prediction',1,[1,true],true],
 [4,'limits',0,[2,4],true],[4,'limits',0,[2,2],false],[4,'repair',1,[3,3,3,'A'],true],[4,'repair',1,[3,3,7,'A'],false],
 [5,'limits',0,[2,4],true],[5,'judgment',0,['B'],false],[5,'repair',1,[3,3,3],true],[5,'reason',1,[0],true]
];
for(const [i,task,round,values,expected]of rows){
 const point=points[i],data={knowledge_point_id:point,feedback_version:'openmaic-games-20261102-v1',independent:false,evidence_scope:'openmaic_game_attempt',is_correct:!expected,parameters:{task,round,values}};
 assert.equal(grade(data,point),expected,JSON.stringify(data));
 assert.equal(grade({...data,independent:true},point),null);assert.equal(grade(data,points[(i+1)%6]),null);
}
assert.equal(grade({evidence_scope:'openmaic_game_attempt'},points[0]),null);
for(const [version,answer]of [['openmaic-games-20261102-v1','A'],['openmaic-games-20261104-v2','B']]){
 const data={feedback_version:version,knowledge_point_id:points[3],evidence_scope:'openmaic_game_attempt',independent:false,parameters:{task:'reason',round:1,values:[answer]}};
 assert.equal(grade(data,points[3]),true,'新旧题目分别按各自版本评分');
 assert.equal(grade({...data,parameters:{...data.parameters,values:[answer==='A'?'B':'A']}},points[3]),false);
}
const stages=require('../app/shared/study-stages'),run={configuredAt:'2026-11-02',reviewedStages:[]};
assert.equal(stages.reviewWindow(run,['GH-01-K01-formative'],'GH-01-K02').allowed,false);
const submitted=['GH-01-K01-formative','GH-01-K02-formative'];
assert.equal(stages.reviewWindow(run,submitted,'GH-01-K02-formative').allowed,false,'两个知识点后不打断');
assert.equal(stages.reviewWindow(run,submitted,'GH-01-K03-formative').allowed,false);
submitted.push('GH-01-K03-formative');
assert.equal(stages.reviewWindow(run,submitted,'GH-01-K03-formative').allowed,true,'三个知识点后回顾');
assert.equal(stages.reviewWindow({...run,reviewedStages:['S1']},submitted,'GH-02-K01').readOnly,true,'回顾完成后仍可只读重看');
console.log('通过：23组原OpenMAIC作答的服务端重算、伪造正确标记/跨知识点/独立成绩保护、回顾窗口');
