"use strict";
const assert=require("node:assert/strict");
const {buildLearnerMemory}=require("../lib/learner-memory");
const now=Date.parse("2026-10-18T12:00:00Z"),base={user_id:"u1",chapter_id:"c1",learning_generation:2,phase:"pre",status:"graded",is_correct:0,created_at:"2026-10-14T12:00:00Z"};
const index=new Map([...["q1","q2","q3","q4"].map(id=>[id,{question:{knowledgePointIds:["p1"]}}])]);
const options={userId:"u1",chapterId:"c1",generation:2,now,points:[{id:"p1",name:"函数"}],index};
const memory=buildLearnerMemory({...options,rows:[
 {...base,id:"old",question_id:"q1"},{...base,id:"new",question_id:"q1",is_correct:1,created_at:"2026-10-15T11:00:00Z"},
 {...base,id:"pending",question_id:"q2",is_correct:-1,status:"pending_review"},
 {...base,id:"other-user",question_id:"q3",user_id:"u2"},
 {...base,id:"old-generation",question_id:"q3",learning_generation:1},
 {...base,id:"future",question_id:"q4",created_at:"2026-10-19T12:00:00Z"}
]});
assert.deepEqual([memory.points[0].correct,memory.points[0].incorrect,memory.points[0].pending],[1,0,1]);
assert.equal(memory.points[0].needsFreshObservation,true);
assert.deepEqual(memory.points[0].sources.map(x=>x.id),["new","pending"]);
assert.equal(memory.historyIsMasteryEvidence,false);
assert.equal(buildLearnerMemory({...options,generation:3,rows:[{...base,id:"old",question_id:"q1"}]}).points[0].lastObservedAt,null);
console.log("学习记忆通过：每题最新记录、待复核、跨用户、学习轮次与未来信息隔离。");
