'use strict';
const version='functions-limits-integrated-r10-20261106';
const ids=['GH-01-K01','GH-01-K02','GH-01-K03','GH-02-K01','GH-02-K02','GH-02-K03'];
const unknown={value:'__unknown__',label:'我暂时不会'};
const signed=n=>n<0?'−'+Math.abs(n):'+'+n;
const cleanNumber=n=>Number(n.toFixed(6));
const variants={X:{a:2,h:1,b:2,t:3,c:1,e:.2,bias:1,j:2,end:4},Y:{a:3,h:1,b:3,t:4,c:2,e:.4,bias:3,j:3,end:5},Z:{a:4,h:1,b:4,t:5,c:3,e:.6,bias:5,j:4,end:6}};
const blueprint=[
 ['函数规则与边界','single',2,2],['有限记录与模型','single',2,2],
 ['坐标点的代入审核','single',2,2],['定义域、等价变形与空点','short_answer',4,4],
 ['采样与区间性质','single',2,2],['反例与证据范围','single',2,2],
 ['点值与附近趋近','single',2,2],['误差范围保证','short_answer',4,4],
 ['左右有限极限','single',2,3],['分段规则的参数','short_answer',4,4],
 ['尖角与连续','single',2,2],['点值修复与条件解释','short_answer',4,4]
];
function forms(form='X'){
 const p=variants[form];if(!p)throw Error('未知测验卷别');
 const a=p.a,b=p.b,t=p.t,L=2*t+1,eps=p.e,maxDelta=eps/2;
 const rows=[
 [`规则一：0≤x≤${a}时，y=x+1；规则二：${a}≤x≤${a+2}时，y=2x${signed(1-a)}。在重合的输入x=${a}处，这两条规则是否违反函数的唯一输出要求？`,['不违反，两条规则在重合输入处给出相同输出','违反，只要同一输入满足两条公式就不行','违反，因为不同输入不能有相同输出','无法判断，因为还没有画图'],0,`两条规则在x=${a}都给出${a+1}，定义域内每个输入仍只有一个输出。`],
 [`一个预测器只留下两条输入输出记录：g(${a-1})=${2*(a-1)+1}、g(${a})=${2*a+1}，没有说明采用什么模型。能否断定g(${a+1})=${2*(a+1)+1}？`,['能，因为两次观测已确定任何函数','不能，其他规则也可能通过这两个观测点','不能，因为函数值不能大于输入','能，因为函数只允许直线图像'],1,'两个点仅在已知函数属于一次函数等受限模型时才能确定该模型；题目未给出这种假设。'],
 [`已知f(x)=2x+1。甲点为(${a},${2*a+1})，乙点为(${a+1},${2*a+1})。哪项审核正确？`,[`两个点都在图像上`,`甲点在图像上；乙点的纵坐标应改为${2*a+3}`,'只要横纵坐标均为整数就属于图像','甲点不在，因为输入与输出必须相等'],1,`代入横坐标：f(${a})=${2*a+1}，f(${a+1})=${2*a+3}。是否属于图像取决于输出是否与纵坐标一致。`],
 [`f(x)=(x²−${a*a})/(x−${a})，定义域为所有x≠${a}的实数；g(x)=x+${a}，定义域为全部实数。它们是否为同一个函数？说明它们在哪些输入上相等、在哪个输入上不同，以及怎样限制定义域或补充定义可使二者成为同一函数。`,null,null,`不是同一函数。在x≠${a}处取值相等；f在${a}没有定义而g在${a}取${2*a}。把g的定义域限制为x≠${a}即可。`],
 [`某连续函数只公布了三个观测：f(${a-2})=${a-2}，f(${a-1})=${a-1}，f(${a})=${a}。能否据此证明它在整个[${a-2},${a}]上严格上升？`,['能，三个点已经足够','能，连续就意味着上升','不能，观测之间仍可能有局部下降','不能，因为所有连续函数都会下降'],2,'连续不保证单调。有限采样不能排除未观测位置的起伏。'],
 [`函数在整个区间上的完整规则未知，但已确认f(${a-1.75})=${a+.25}、f(${a-1.25})=${a-1.25}。这两个值能说明什么？`,['因为输出有正有负，无法比较',`因为${a-1.75}<${a-1.25}而前一个输出更大，已经否定整个区间严格上升`,'已经证明整个区间严格下降','只要函数连续，这两个观测就不可能同时出现'],1,'严格上升要求任意较大输入对应较大输出；一个顺序相反的输入对就足以反驳。它不能反过来证明整个区间严格下降。'],
 [`x≠${t}时，f(x)=2x+1；f(${t})=${p.c}。当x从两侧越来越接近${t}而不取该点时，输出接近哪个值？`,[String(p.c),String(t),String(L),'因为点值不同，所以不能有共同趋近值'],2,`附近由2x+1决定，趋近${L}；单点的值${p.c}不改变这一趋势。`],
 [`一个预测模型的规则是y=2x+${p.bias}。希望输入接近1时，输出与${2+p.bias}的差的绝对值小于${eps}。把输入与1的距离限制为小于${eps}，能保证要求吗？给出一个反例输入，再给出一个有效的输入范围并说明理由。`,null,null,`不能。例如x=${cleanNumber(1+eps*.75)}时输出误差为${cleanNumber(eps*1.5)}，超过${eps}。只要|x−1|<${maxDelta}就足够，因为输出误差=2|x−1|。任何更小的正范围也有效，不要求写最大范围。`],
 [`x<1时f(x)=x+${b}；x>1时f(x)=2x+${b-1}；f(1)=${b+6}。x从左、右两侧靠近1时分别趋近什么？双侧有限极限是否存在？`,[`左侧${b+1}、右侧${b+1}，双侧有限极限存在`,`左侧${b+1}、右侧${b+6}，双侧极限不存在`,`两侧都趋近点值${b+6}`,'没有把点值改好之前不能判断'],0,'先使用各侧附近的规则计算；点上另行赋值不改变两个单侧极限。'],
 [`x<1时f(x)=2x+k；x>1时f(x)=x+${p.end}；f(1)=0。求让左右两侧有共同有限极限的k。写出两侧趋近值和理由，并说明把f(1)改为别的数是否会改变这个k。`,null,null,`左极限为2+k，右极限为${1+p.end}；相等要求k=${p.end-1}。只改f(1)不影响附近规则，因此不改变这个k。`],
 [`f(x)=|x−${a}|的图像在x=${a}处有尖角，且f(${a})=0。下面哪个判断正确？`,['有尖角就一定不连续','只要函数值为0就一定连续','该点连续，因为左右都趋近0且等于点值；尖角本身不否定连续','必须先求导数才能判断'],2,'连续只要求点值和共同极限相等，不要求图像光滑。'],
 [`x<${a}时f(x)=x+1；x>${a}时f(x)=3x${signed(1-2*a)}；原来f(${a})=${a+6}。若只允许改这一点的值，能否使它在该点连续？若能，应改成多少？分别计算左右趋近值并解释。`,null,null,`可以。左侧趋近${a+1}，右侧趋近${3*a+1-2*a}，两者相等；将f(${a})改为${a+1}即可。`]
 ];
 return rows.map((r,i)=>{
  const [construct,type,points,steps]=blueprint[i],kp=ids[Math.floor(i/2)];
  const item={id:`fl-r10-${form}-${i+1}`,type,question:r[0],points,knowledgePointIds:[kp],knowledgePointId:kp,instrumentVersion:version,form,pairId:`FLR10-P${i+1}`,difficulty:'provisional_for_high_achieving_calculus_novices',cognitiveLevel:'解释、条件判断与近迁移',sourceAlignment:{kind:'original_items_aligned_to_textbook_objectives',reference:'同济大学数学科学学院《高等数学》第八版上册第一章函数与极限；题面独立编写，不复制教材习题'},assessmentRole:'common_core_learning',equivalence:{constructId:construct,estimatedSteps:steps,points,validationStatus:'content_aligned_not_empirically_equated'},analysis:r[3],hasAnswer:true};
  if(type==='single'){
   const correct=r[1][r[2]],shift=(i+{X:0,Y:1,Z:2}[form])%4,options=[...r[1].slice(shift),...r[1].slice(0,shift)];
   item.options=[...options.map((label,k)=>({value:'ABCD'[k],label})),{...unknown},{value:'__skip__',label:'跳过本题（不作答）'}];item.answer=[item.options.find(o=>o.label===correct).value];
  }else{item.options=[];item.answer=[];item.referenceAnswer=r[3];item.rubric=rubric(i,p);item.commentPrompt='按四项量规分别评分，每项0或1分；等价理由接受。空白、不会和明确跳过分别记录。不得仅按关键词命中给分。';}
  return item;
 });
}
function rubric(i,p){const a=p.a;const criteria={
  5:['构造了三个负输出','第一个输出小于第二个，并解释样本增大','第二个输出大于第三个，并解释样本减小','说明有限样本不能排除其他起伏，不能证明整个区间只有一次转折'],
  3:['明确不是同一个函数',`说明x≠${a}处取值相等`, `指出x=${a}处定义域不同`, `提出将g定义域限制为x≠${a}，或将f在该点补成${2*a}`],
  7:['正确判断给定输入范围不能保证要求','给出满足输入范围但违反输出误差要求的有效反例',`给出0<δ≤${p.e/2}的有效范围，并用严格不等式表达`,'使用输出误差=2|x−1|说明保证对范围内所有输入成立'],
  9:['写出左侧趋近2+k',`写出右侧趋近${p.end+1}`,`令两侧相等并得k=${p.end-1}`,'说明单点取值不影响这个k'],
  11:[`左侧趋近${a+1}`,`右侧趋近${a+1}`,`正确设点值为${a+1}`,'说明两侧共同极限等于点值，因此连续']};
 return criteria[i].map(criterion=>({criterion,points:1}));}
function questions(phase,form){if(!['pre','post','retention'].includes(phase))throw Error('无效测量阶段');return forms(form||({pre:'X',post:'Y',retention:'Z'}[phase])).map(q=>({...q,id:q.id.replace('fl-r10-','fl-r10-'+phase+'-')}));}
function publicForm(phase,form){return {id:phase,form:form||({pre:'X',post:'Y',retention:'Z'}[phase]),instrumentVersion:version,agentAssistanceAllowed:false,feedbackPolicy:'acknowledgement_only',instructions:'x→a表示x接近a，f(a)表示输入恰好为a时的输出。按题目给出的范围和规则推理，可以用自然语言说明，不要求背标准表述。不会和跳过分别记录；本测验不提供提示或即时答案。',maxScore:32,items:questions(phase,form).map(({answer,analysis,rubric,referenceAnswer,commentPrompt,hasAnswer,...q})=>q)};}
module.exports={version,ids,unknown,blueprint,variants,forms,questions,publicForm,rubric,retention:[],pairs:[]};
