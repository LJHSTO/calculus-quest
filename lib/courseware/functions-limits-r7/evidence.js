'use strict';
const model=require('./tasks');
function grade(data,point){const p=data?.parameters,id=p?.task_id;if(data?.independent!==false||data.evidence_scope!=='guided_courseware_r7'||data.task_version!==model.version||!id?.startsWith(point+'-')||data.challenge_id!==id+'-check-r7')return null;return model.grade(id,p.answers,p.context);}
module.exports={grade};
