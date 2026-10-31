"use strict";
// Versioned migration: preserve the former two-item form for history display.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../data/multi-scene-learning-route.json');
const route=JSON.parse(fs.readFileSync(file,'utf8'));
const additions={
 'GH-01-K01':['某停车场按停放时长 t 收费：每个允许的时长都对应唯一费用 c。同一费用可能对应不同的时长。关于“费用是时长的函数”，哪项正确？',['只要每个时长的费用唯一，就满足函数要求','不同的时长必须有不同的费用','费用只能按一次函数计算','同一时长可以随机对应两个费用'],'A','函数要求每个允许的输入对应唯一输出，并不要求不同输入对应不同输出，也不要求规则是一次函数。'],
 'GH-01-K02':['传感器图的横轴是时间 t（秒），纵轴是温度 T（℃）。记录“第 3 秒温度为 −2℃”应画在哪个点？',['(−2,3)','(3,−2)','(3,2)','(−3,2)'],'B','横坐标对应时间3，纵坐标对应温度−2。坐标次序由轴的含义决定，负号表示温度低于0。'],
 'GH-01-K03':['某冷库温度在 0≤t≤4 分钟内满足 T(t)=2t−10。小李说“温度一直小于0，因此温度在下降”。哪项判断正确？',['小李正确，负数一定表示下降','小李错误，温度虽然为负，但随时间增加而上升','温度既不是上升也不是下降','只在温度超过0后才能判断变化方向'],'B','函数值的正负与变化方向不同。规则中的系数2为正，时间每增加1分钟，温度上升2℃；这一范围内温度仍为负。'],
 'GH-02-K01':['仪器在 x≠2 时按 R(x)=3x+2 显示读数，在 x=2 时没有显示。根据这条规则，x 从两侧趋近2时读数如何变化？',['趋近2','趋近6','趋近8，即使该点没有显示','没有该点读数就无法判断极限'],'C','在2附近，读数3x+2从两侧趋近8。极限描述附近的趋势，点上缺少读数不影响这个结论。'],
 'GH-02-K02':['某分段收费函数在 t 趋近2时，左侧费用趋近4元、右侧费用趋近7元；系统把 t=2 时的费用设为4元。它在2处的双侧极限是什么？',['4元，因为点上的费用是4元','7元，因为应看右侧','5.5元，是两侧平均值','不存在，因为左右极限不同'],'D','双侧极限要求左右极限存在且相等。4与7不相等，点上的取值或两侧平均值都不能补出双侧极限。'],
 'GH-02-K03':['为了修复显示曲线，设 x≠3 时 g(x)=2x−1，x=3 时 g(3)=k。要使曲线在 x=3 处连续，k 应是多少？',['3','5','6','任意值都可以'],'B','当x从两侧趋近3，2x−1趋近5。连续要求点上的函数值等于这个极限，因此k=5。']
};
for(const p of route.chapters.find(c=>c.id==='V14-C1').modules.flatMap(m=>m.knowledgePoints)){
 const quiz=p.formativeQuiz;
 if(quiz.instrumentVersion==='functions-limits-formative-r5')continue;
 quiz.archivedQuestions=structuredClone(quiz.questions);
 const [question,options,answer,analysis]=additions[p.id];
 quiz.questions=[...quiz.questions.map((q,i)=>({...q,id:`${p.id}-formative-v5-q${i+1}`,sourceId:`${p.id}-formative-v5-q${i+1}`,legacyQuestionId:q.id,adaptiveRole:'common_core',measurementTarget:i===0?'concept_application':'misconception_discrimination',instrumentVersion:'functions-limits-formative-r5'})),
 {id:`${p.id}-formative-v5-q3`,sourceId:`${p.id}-formative-v5-q3`,type:'single',question,options:[...options.map((label,i)=>({value:'ABCD'[i],label})),{value:'__unknown__',label:'我不会'}],answer:[answer],analysis,points:10,hasAnswer:true,knowledgePointIds:[p.id],adaptiveRole:'common_core',measurementTarget:'near_transfer',instrumentVersion:'functions-limits-formative-r5'}];
 quiz.adaptive=false;quiz.questionCount=3;quiz.instrumentVersion='functions-limits-formative-r5';
 quiz.description='三道共同检测：基本应用、误解辨析和新情境应用。统一独立作答后查看反馈；是否回看由你决定。';
}
fs.writeFileSync(file,JSON.stringify(route,null,2)+'\n','utf8');
console.log('六个知识点已升级为三道共同检测；旧题保留为历史版本。');
