'use strict';
const assert=require('node:assert/strict');
const J=require('../lib/learner-journey');
const C=require('../app/shared/learner-preferences');
assert.equal(C.optionsFor('D4',true).length,2,'学生 D4 只选择位置');
assert.equal(J.editWindow({stage:'ready',experiencePolicy:'rehearsal'}, {currentUnitId:'GH-01-K01'}, []).allowed,true,'演练允许在学习中调整偏好');
assert.equal(J.editWindow({stage:'ready'}, {currentUnitId:'GH-01-K01'}, []).allowed,false,'正式预试保留知识点边界');
assert.equal(J.editWindow({stage:'ready',experiencePolicy:'rehearsal'}, {currentUnitId:'V14-C1-post'}, []).allowed,false,'演练独立后测不允许修改');
console.log('学习交互契约通过：D4、演练修改、正式边界');
