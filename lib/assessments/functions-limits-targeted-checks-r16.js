'use strict';
// These local checks follow a particular formative misconception. They do not
// replace the common pre/post/outcome measures or establish overall mastery.
const version='functions-limits-targeted-checks-r16-20261113';
function rows(v){
  const a=v+2,c=v+5,b=2*a+c-a,pointValue=v+1,near=a+3,limit=v+4;
  const radius=(v+2)/10,epsilon=Number((4*radius).toFixed(2));
  return [
    ['overlap_unique_output',`输入${a}同时适用于两条规则：左段y=2x+${c}，右段y=x+b。要使这个输入只有一个输出，b应取多少？`,[String(b),String(2*a+c),String(c)],0,`左段输出为${2*a+c}，右段为${a}+b；令两者相等得到b=${b}。输出与参数不是同一个量。`],
    ['many_to_one_allowed',`程序中，输入${a}得到${c}，输入${a+1}也得到${c}；每个允许的输入都有唯一输出。这个程序满足函数要求吗？`,['满足，不同输入可以有相同输出','不满足，不同输入必须有不同输出','只要输出为正数才满足'],0,'唯一性检查的是同一个输入是否对应多个输出；不同输入相同输出是允许的。'],
    ['domain_after_cancellation',`f(x)=(x²−${a*a})/(x−${a})，g(x)=x+${a}，各自取原式允许的实数为定义域。哪项正确？`,[`两者在x≠${a}处相同，但f不允许输入${a}、g允许`,`约分后两者定义域都包含${a}`,`f(${a})=0，所以两者不同`],0,`原式分母为0时无定义。约分等式只在x≠${a}成立，不能补回原先排除的输入。`],
    ['actual_point_and_hole',`x≠${a}时f(x)=x+3，另设f(${a})=${pointValue}。在x=${a}这一列应怎样画？`,[`(${a},${pointValue})实心，(${a},${near})空心`,`(${a},${near})实心，(${a},${pointValue})空心`,'只画附近直线，不用表示单独点值'],0,`实际点值是${pointValue}，所以实心点在(${a},${pointValue})；附近直线在这一列趋近${near}，应留空。`],
    ['finite_samples_not_monotonic_proof',`某连续函数在x=0、1、2处的值分别为${c}、${c+1}、${c+2}。这些信息能证明整个[0,2]严格上升吗？`,['不能，观测点之间仍可能出现下降','能，三个值连续增加就足够','能，连续函数一定单调'],0,`还可让f(0.5)=${c+3}，用折线连接所有点；它仍连续并满足三处观测，却在0.5到1下降。`],
    ['one_pair_does_not_prove_decreasing',`已知u<v且f(u)=${c+3}、f(v)=${c}。哪项结论有充分依据？`,['含这两点的区间不是严格上升，但尚不能证明整个区间严格下降','整个区间一定严格下降','单凭这一对数已经能算出所有导数'],0,'严格上升要求任意一对有序输入的输出都上升，这一对已违反要求；严格下降仍需对整个区间判断。'],
    ['radius_and_strict_error_bound',`实际输入误差d满足0≤d<r，输出误差是4d。要保证输出误差小于${epsilon}，下列哪个正半径有效？`,[String(radius),String(Number((radius*2).toFixed(2))),'0'],0,`r=${radius}时，d<${radius}给出4d<${epsilon}，边界半径可以取到。更小的正半径也有效；0不是正半径。`],
    ['limit_distinct_from_point_value',`x≠${a}时f(x)=2x+1，另设f(${a})=${near+10}。当x从两侧靠近${a}时的趋近值、以及f(${a})分别是多少？`,[`${2*a+1}和${near+10}`,`${near+10}和${near+10}`,`${near+10}和${2*a+1}`],0,`附近规则给出趋近值${2*a+1}；单独规定的点值是${near+10}。只改点值不改变附近趋近值。`],
    ['unequal_one_sided_limits',`x<0时f(x)=x+${limit}，x>0时f(x)=2x+${limit+2}。只修改f(0)，能让x→0时双侧有限极限存在吗？`,[`不能，左右分别趋近${limit}和${limit+2}`,`能，把f(0)改成平均值${limit+1}`,'能，把点值设为0即可'],0,`左右分别趋近${limit}和${limit+2}，两者不相等；修改单独的点值不会改变两侧规则。`],
    ['unbounded_is_not_finite_limit',`f(x)=${a}/x²。当x从两侧趋近0时，输出持续增大且没有有限上界。本课所说的双侧有限极限存在吗？`,['不存在有限极限；两侧都趋向正无穷','存在，正无穷是一个很大的有限数','存在，只要两侧增大的方向相同'],0,'两侧同向增大并不等于趋近某个有限数。趋向正无穷描述无界趋势，不是有限极限。'],
    ['corner_can_be_continuous',`f(x)=|x−${a}|在x=${a}处有尖角。它在那里连续吗？`,['连续，左右极限和点值都是0','不连续，有尖角就一定断开','必须先证明可导才能判断连续'],0,`x从两侧靠近${a}时函数值都趋近0，f(${a})=0，所以连续。尖角不破坏这三项条件。`],
    ['jump_not_repaired_by_point_value',`x→a时左极限为${limit}，右极限为${limit+2}。只改f(a)，能让它在a连续吗？`,['不能，一个点值无法同时等于两个不同的左右极限',`能，把f(a)改为${limit}`,`能，把f(a)改为${limit+2}`],0,'连续需要共同有限极限存在且等于点值。两侧极限不同，单改点值无法消除跳跃。']
  ];
}
const ids=['GH-01-K01','GH-01-K02','GH-01-K03','GH-02-K01','GH-02-K02','GH-02-K03'];
const pools=Object.fromEntries(ids.flatMap((point,i)=>[1,2].map(n=>{
  const questionId=`fl-r13-formative-${point}-${n}`;
  return [questionId,Array.from({length:4},(_,v)=>{
    const [subSkill,prompt,labels,answer,analysis]=rows(v)[i*2+n-1];
    // Rotate options independently of assistance level, avoiding a fixed-key cue.
    const shift=v%labels.length,options=labels.map((label,j)=>({value:String((j+shift)%labels.length),label})).sort((a,b)=>Number(a.value)-Number(b.value));
    return {id:`${point}-target-r16-q${n}-v${v+1}`,knowledgePointId:point,sourceQuestionId:questionId,stage:'after_support',instrumentVersion:version,subSkill,prompt,options:[...options,{value:'__unknown__',label:'我还不会'}],answer:String((answer+shift)%labels.length),analysis};
  })];
})));
module.exports={version,pools};
