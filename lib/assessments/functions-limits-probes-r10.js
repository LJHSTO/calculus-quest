'use strict';
const {ids}=require('./functions-limits-r10');
const version='functions-limits-probes-r10';
function raw(index,variant){
 if(!Number.isInteger(index)||index<0||index>5||!Number.isInteger(variant)||variant<0||variant>10)throw Error('检查题索引无效');
 const k=variant+5,L=k+1;
 const errorRadius=Number((variant===0?.07:(variant+1)*.1).toFixed(4)),epsilon=Number((4*errorRadius).toFixed(4));
 const rows=[
 [`两段都允许输入1。左段y=2x+${k}，右段y=x+b。为了在重合输入处只有一个输出，b应取多少？`,[String(k+1),String(k),String(k+2),'任何数'],0],
 [`规则y=2x+1。点P(${k},${2*k+1})与Q(${k+1},${2*k+1})，哪项正确？`,['两点都在图像上',`只有P在图像上；Q的纵坐标应为${2*k+3}`,'只有Q在图像上','两个点都不能判断'],1],
 [`已确认u<v，但f(u)=${L+2}、f(v)=${L}。这能说明什么？`,['整个区间严格下降','这些值没有意义','已经否定包含这两点的区间严格上升','只要函数连续就不能这样比较'],2],
 [`规则的输出误差恰为输入误差的4倍，要求输出误差小于${epsilon}。以下哪个正输入范围半径能保证所有允许输入都合格？`,[String(errorRadius),String(Number((2*errorRadius).toFixed(4))),String(Number((3*errorRadius).toFixed(4))),'0'],0],
 [`x<0时f(x)=x+${L}，x>0时f(x)=2x+${L+1}。只修改f(0)能让双侧有限极限存在吗？`,['能，设为两侧平均值',`不能，两侧分别趋近${L}和${L+1}`,`能，设为${L}`,'能，只要点值有定义'],1],
 [`已知函数在内点a的左右有限极限均为${L}，点值为${L+2}。只改点值能否连续？`,['不能，因为极限存在就无法改点值','可以，改为0',`可以，改为${L}并与共同极限相等`,'已经连续，不用修改'],2]
 ];
 const common=[
  [["已知h(0)=2、h(1)=4。还要增加哪个条件，才能唯一确定一次函数模型并预测h(2)？",['函数连续即可','明确h属于一次函数模型','h的输出都是正数即可','不需要其他条件，任何函数都已确定'],1,'两点可确定一次函数，但不能确定任意函数。'],["收费程序允许重量1和2都收费5元；每个重量各有一个确定费用。这违反函数要求吗？",['违反，不同输入不能有相同输出','违反，输出必须大于输入','不违反，唯一性限制的是同一输入的输出','仅当收费曲线光滑时才不违反'],2,'不同输入得到相同输出不违反函数的唯一输出要求。']],
  [["f(x)=(x²−25)/(x−5)，原式只在x≠5处定义；g(x)=x+5对全部实数定义。以下哪项正确？",['两者是同一函数，因为都能约成x+5','两者在x≠5处相同，但原定义域不同','原式在5处自动取0','原式没有任何图像'],1,'约分只对原式允许的输入成立，不会补上x=5。'],["x≠4时f(x)=x+3，另设f(4)=2。在x=4这一列，实际函数值与附近曲线的空点应怎样表示？",['把(4,7)画实心，把(4,2)删去','把两个点都画成实际函数值','只要靠得近就可以随便画','(4,2)为实心点，(4,7)为空心点'],3,'原定义规定点值2；邻近直线趋向7，但这个位置未取7。']],
  [["连续函数在x=0、1、2处的值为0、1、2。能否证明整个[0,2]严格上升？",['能，连续已经排除中间下降','不能，观测之间仍可能起伏','能，只要三个输出都按顺序增加','不能，因为连续函数都不是单调的'],1,'有限观测未覆盖区间里的全部输入对；连续性不排除起伏。'],["已找到u<v且f(u)>f(v)。一位同学因此宣布整个区间严格下降。问题在哪里？",['u与v不能比较','只要有反例就能证明相反的全称结论','这对数否定严格上升，但未检查其余输入对','必须先计算导数，任何直接比较都无效'],2,'否定一个全称判断不等于证明另一个全称判断。']],
  [["x≠3时f(x)=2x+1，f(3)=20。附近趋近值和点值分别是多少？",['7和20','20和20','3和7','因为20不同，附近不能趋近7'],0,'附近规则给出趋近7；单独规定的点值20不改变附近规则。'],["在某个输入范围内试了十个点，它们的输出误差都小于0.2。要保证该范围内所有输入都符合要求，还缺什么？",['再试一个点就一定够了','把不合格点删掉','只看图像颜色','对整个范围适用的规则或论证'],3,'有限采样可提供线索；对所有输入的保证需要覆盖整个范围。']],
  [["当x趋近0时，两列正输入aₙ、bₙ都趋近0，但已由公式证明f(aₙ)=1、f(bₙ)=−1恒成立。这说明什么？",['右侧能趋近同一个有限数0','这些输出不相容，因此右侧没有共同有限极限','只要把f(0)设为0就能改变两列输出','只有负输入才会影响极限'],1,'两列输出始终分别为1和−1，不能同时趋近同一个有限数。'],["f(x)=1/x²。x从两侧趋近0时输出不断增大、没有有限上界。本课讨论的双侧有限极限是否存在？",['存在且为0','存在且等于f(0)','不存在有限极限，趋向正无穷描述的是无界趋势','因为左右同向，所以存在一个很大的有限极限'],2,'两侧同向无界不等于共同趋近某个有限实数。']],
  [["f(x)=|x−4|在x=4有尖角。左右输出均趋近0且f(4)=0。该点是否连续？",['连续，三项条件都满足','不连续，有尖角就不连续','不连续，因为点值为0','无法判断，必须先求导'],0,'连续不要求图像光滑；点值与共同有限极限一致即可。'],["某内点左极限是3、右极限是5。若只允许修改点值，哪项正确？",['改为4就连续','改为3就连续','改为5就连续','没有一个点值能同时匹配两侧，只改点值不能修复'],3,'点值不能改变左右两侧附近的不同趋势。']]
 ];
 const chosen=variant===9?common[index][0]:variant===10?common[index][1]:rows[index];
 const [prompt,labels,correct,analysis]=chosen,shift=variant%4,ordered=[...labels.slice(shift),...labels.slice(0,shift)],answer=String(ordered.indexOf(labels[correct]));
 return {id:`${ids[index]}-probe-r10-v${variant+1}`,evidenceScope:'local_skill_check_not_transfer',prompt,options:ordered.map((label,i)=>({value:String(i),label})),answer,analysis:analysis||['在重合输入处分别代入两条规则，令输出相同。','将横坐标代入完整规则，比较计算结果与纵坐标。','一个顺序相反的输入对能否定严格上升，不能证明整个区间下降。',variant===0?'输出误差等于输入误差的4倍。取正半径0.07，输入误差小于0.07时，输出误差就小于4×0.07=0.28；0.14和0.21不能保证要求，0不是正半径。':'输出误差等于输入误差的4倍；用给定要求除以4得到可用正半径。','单点取值不改变两侧附近规则；左右有限极限不同就没有共同有限极限。','两侧共同有限极限已经存在；只需令实际点值与它一致。'][index],instrumentVersion:version,knowledgePointId:ids[index],subSkill:index===1&&variant===9?'domain_equivalence':index===1&&variant===10?'point_and_nearby_value':['boundary_uniqueness','point_membership','counterexample_scope','error_bound','side_value_separation','continuity_repair'][index]};
}
function publicProbe(index,stage){const variant={t0:0,t1:1,outcome:2,return_probe:7}[stage];if(variant===undefined)throw Error('检查阶段无效');const {answer,analysis,...q}=raw(index,variant);return {...q,stage,evidenceScope:'platform_independent_check',independent:true};}
function gradeProbe(index,stage,response){const q=raw(index,{t0:0,t1:1,outcome:2,return_probe:7}[stage]);if(response==='skip')return {checkId:q.id,correct:null,score:null,response,responseKind:'skipped',status:'skipped',serverGraded:true,independent:true};if(response==='unknown'||response==='__unknown__')return {checkId:q.id,correct:false,score:0,response,responseKind:'dont_know',status:'unknown',serverGraded:true,independent:true};if(!q.options.some(o=>o.value===String(response)))throw Error('检查选项无效');return {checkId:q.id,responseKind:'answer',response:String(response),correct:String(response)===q.answer,score:String(response)===q.answer?1:0,serverGraded:true,independent:true,instrumentVersion:version};}
module.exports={version,raw,publicProbe,gradeProbe};
