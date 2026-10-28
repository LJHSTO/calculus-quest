(function(root,factory){const api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;if(root)root.CoursewareSemantics=api;})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const definitions={
    "GH-01-K01":{subSkill:"input_uniqueness",parameters:["input_x","输入值x","function_rule","函数规则"]},
    "GH-01-K02":{subSkill:"point_membership",parameters:["point_x","point_y","坐标点","横坐标","纵坐标"]},
    "GH-01-K03":{subSkill:"direction_not_sign",parameters:["function_type","函数类型"]},
    "GH-02-K01":{subSkill:"limit_not_point_value",parameters:["x_position","x位置","prediction","预测极限值"]},
    "GH-02-K02":{subSkill:"two_sided_agreement",parameters:["breakpoint","间断点","leftStart","rightStart","左侧起点","右侧起点","epsilon","ε"]},
    "GH-02-K03":{subSkill:"continuity_value_match",parameters:["point_y_coordinate","孤立点纵坐标"]}
  };
  const normalize=x=>String(x||"").replace(/-slider$/,'').replace(/[\s-]/g,'').toLowerCase();
  function parameterRelevant(kp,parameter){const d=definitions[kp];return !d||d.parameters.some(p=>normalize(p)===normalize(parameter));}
  return Object.freeze({definitions,parameterRelevant});
});
