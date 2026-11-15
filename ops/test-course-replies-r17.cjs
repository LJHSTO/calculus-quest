'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),llm=require('../lib/llm'),a=require('../lib/learning-assistant');
assert(process.argv.includes('--live'),'Explicit synthetic live evaluation only');
const index=a.buildCourseContextIndex(require('../data/multi-scene-learning-route.json'));
const cases=[
 ['domain','GH-01-K01','实数平方根不能输入负数，所以它不是函数，对吗？','应区分定义域排除与输出不唯一，不赞同错误结论。'],
 ['overlap','GH-01-K01','另一个纸面例子：x=1同时适用y=2x+13和y=x+b。b应是多少？请写核对过程。','左段15、右段1+b，b=14。'],
 ['cancel','GH-01-K02','(x²−9)/(x−3)约成x+3后，原函数在3处就有定义了吗？','否；约分仍保留x≠3。'],
 ['scale','GH-01-K02','横轴每格1，纵轴每格2，向右3格、向上2格的点是什么坐标？','(3,4)，分别读取轴刻度。'],
 ['samples','GH-01-K03','连续函数经过(0,0)、(1,1)、(2,2)，是否证明整个[0,2]严格上升？','否；连续与有限点不保证点间单调。'],
 ['counterexample','GH-01-K03','已知u<v而f(u)=8、f(v)=6，就能说明整个区间严格下降吗？','否；仅否定含两点区间严格上升。'],
 ['radius_boundary','GH-02-K01','输出误差=4d，要求输出误差<3.6。如果0≤d<r，r=0.9可以吗？请用不等式解释。','可以，4d<4r=3.6；不把4r<3.6当必要条件。'],
 ['constant','GH-02-K01','附近规则是常函数7，输出误差要求<0.3。是不是必须用0.3除以斜率0来选半径？','否；误差0，规则有效邻域内任意正半径。'],
 ['piecewise','GH-02-K02','另一个例子：x<1时f(x)=2x+k，x>1时f(x)=x+3，f(1)=9。双侧极限存在要k取多少？此时连续吗？','k=2、极限4、点值9，故不连续。'],
 ['unbounded','GH-02-K02','1/x²在0两侧都越来越大，所以双侧有限极限存在吗？','无有限极限；正无穷不是有限实数。'],
 ['corner','GH-02-K03','|x|在0处有尖角，是不是不连续？','连续；两侧极限与点值均0，尖角不等于间断。'],
 ['endpoint','GH-02-K03','实数函数sqrt(x)在定义域端点0处没有左侧输入，是不是不能连续？','端点按定义域允许方向判断，右极限0等于点值0，因此连续。']
];
const out=path.resolve('output/r17-quality');fs.mkdirSync(out,{recursive:true});const rows=[];
function save(){fs.writeFileSync(path.join(out,'真实课程回答.json'),JSON.stringify({at:new Date().toISOString(),synthetic:true,model:llm.runtimeInfo().model,promptVersion:require('../lib/assistant-prompt-r17').version,rows},null,2));}
(async()=>{for(const [id,unitId,question,criterion]of cases){
 const prompt=a.buildAssistantPrompt({resolved:a.resolveAssistantContext({index,chapterId:'V14-C1',unitId,sceneType:'slide'}),question});
 const result=await llm.completeChat({...prompt,model:llm.runtimeInfo().model,temperature:.2,maxTokens:700,timeoutMs:45000});
 rows.push({id,unitId,question,criterion,...result,prompt});save();
 assert.equal(result.provider,'openai-compatible');assert.equal(result.modelInfo.reportedModel,llm.runtimeInfo().model);console.log(id+': '+result.text);
 }console.log('12 real replies saved for mathematical review: '+out);
})().catch(e=>{save();console.error(e.message);process.exitCode=1;});
