'use strict';
const {lessons}=require('./lessons');
module.exports=lessons.map(l=>({id:l.id,title:l.title,minutes:l.minutes,lead:l.core,takeaway:l.goal,blocks:[['概念与条件',l.core],['完整推理',l.example.steps.join(' ')]],example:[l.example.setup,...l.example.steps,l.example.conclusion],misconception:l.caution,transfer:l.transfer,sourceRefs:l.refs}));
