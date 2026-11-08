'use strict';
const figures=require('./assessment-figures-r11');
const version='regulation-transfer-r11-20261107';
const primaryOutcome='behavior_12';
const taskOrder=['sensor','junction','pause_case','worked_example_case'];
const nonAnswer=[{value:'__unknown__',label:'我不会'},{value:'__skip__',label:'暂不作答'}];
const question=(id,prompt,labels,answer,figure,analysis)=>({id,type:'single',prompt,options:[...labels.map((label,i)=>({value:'ABCD'[i],label})),...nonAnswer],answer,figure:figures.publicFigure(figure),analysis,maxScore:1});
const actions=[{value:'self_check',label:'先自己核对一次'},{value:'more_help',label:'再看具体一些的线索'},{value:'finish_help',label:'结束当前帮助'}];
const decisions=[{value:'stop',label:'可以结束这次帮助'},{value:'continue',label:'还需继续处理同一问题'},{value:'change',label:'应换一种帮助方式或问题'}];
const tasks={
 sensor:{id:'sensor',kind:'behavior',title:'新情境任务一：传感器读数',budgetSeconds:210,
  context:'图中的线段规定了所示时段内完整的读数变化，实心点表示该时刻实际读数。不需要了解传感器专业知识。',
  initial:question('reg-r11-sensor-initial','时间从两侧越来越接近第5分钟而不取该时刻时，读数接近多少？恰好第5分钟的读数又是多少？',['25；25','20；20','20；25','25；20'],'C','reg-sensor-initial','两侧线段在第5分钟的空心位置为20，实际采用的实心点读数为25。'),
  check:question('reg-r11-sensor-check','换一个传感器。第3分钟附近两侧的读数与这一刻的读数有什么关系？该点是否连续？',['两侧接近12，点值也是12；连续','两侧接近12，点值也是12；不连续','两侧接近13，点值是12；不连续','只要图上有实心点，就不必比较两侧'],'A','reg-sensor-check','线段两侧在第3分钟都接近12，实际点值为12，符合该点的连续条件。'),
  help:[
   {level:1,text:'先区分两件事：恰好这一刻采用哪个点；从两侧靠近这一刻时，线段上的读数怎样变化。'},
   {level:2,text:'分别沿左、右线段观察接近目标时间时的位置，再单独找目标时间竖线上实际取到的实心点。把“附近变化”和“这一刻取值”写成两行核对。'}],
  reflectionPrompt:'刚才的新例和你的解释，支持结束、继续，还是调整帮助？请指出一条依据。',
  rationaleExample:'如果已经能区分附近线段与单点值，可以有依据地不使用更多帮助；若仍混淆二者，针对这个区别继续求助也合理。'
 },
 junction:{id:'junction',kind:'behavior',title:'新情境任务二：两段规则的接合',budgetSeconds:210,
  context:'图中的左、右线段分别规定了各自区间内完整的函数规则。请关注接合位置，不需要学习新术语。',
  initial:question('reg-r11-junction-initial','当x从左右两侧靠近2时，分别接近哪个数？双侧共同有限极限是否存在？',['左侧3、右侧3；存在','左侧3、右侧4；不存在','左侧4、右侧4；存在','只要点值是3，两侧就都必须接近3'],'B','reg-junction-initial','左线段在接合处对应3，右线段对应4；两侧不同，因此没有共同有限极限。'),
  check:question('reg-r11-junction-check','换一条规则。x从两侧靠近4时，共同有限极限是多少？该点是否连续？',['共同极限为7；连续','没有共同有限极限；不连续','共同极限为5；连续','共同极限为5；不连续'],'D','reg-junction-check','两侧线段在4附近都接近5，点值另定为7；极限存在，但与点值不同，因此不连续。'),
  help:[
   {level:1,text:'先分别观察左侧、右侧靠近接合位置时的读数，之后再比较两者。暂时不要用单点值替代这两步。'},
   {level:2,text:'可以分三行记录：“左侧附近”“右侧附近”“恰好该点”。先判断前两行能否一致，再考虑第三行是否与它们相同。'}],
  reflectionPrompt:'新例中的什么证据支持你结束、继续，或调整帮助？请说明，不必写长篇反思。',
  rationaleExample:'指出仍分不清极限与连续，并安排针对性帮助，可以是合理调节；仅说“已经看过提示”不能代替对新例证据的解释。'
 },
 pause_case:{id:'pause_case',kind:'scenario',title:'情境判断一：观察中的停顿',budgetSeconds:90,
  context:'小林正在看一张新的函数图，观察了两分钟还没有点击。他前面的两道独立读图题都答对了，也能解释理由。他说：“我想先看清实心点和空心点的位置。”页面此时发出一个帮助邀请。',
  prompt:'你建议小林接下来怎样做？请说明依据，以及出现什么新情况时应重新考虑。',
  options:[{value:'continue',label:'先继续自己观察'},{value:'hint',label:'看一条概念线索核对'},{value:'explain',label:'请求针对某个点的具体解释'},{value:'other',label:'其他有依据的做法'}],
  rationaleExample:'继续观察或使用一条针对性线索均可能合理。应把决定与已有独立表现、当前目标联系起来，而不是把停顿或出现邀请本身当成必须接受帮助的理由。'
 },
 worked_example_case:{id:'worked_example_case',kind:'scenario',title:'情境判断二：例子之后的新问题',budgetSeconds:90,
  context:'小陈跟着一个详细例子完成了两题，觉得自己理解了。换一张图且移开例子后，他既没有答对，也不能解释为什么要分别看左右两侧。',
  prompt:'你建议他下一步怎样做？这个行动针对哪个缺口？怎样检验它是否有帮助？',
  options:[{value:'worked_example',label:'再看例子，并在每一步说明理由'},{value:'hint',label:'先要一条左右趋近线索，再独立试题'},{value:'self_explain',label:'先自己画出两侧，再核对遗漏条件'},{value:'other',label:'其他有依据的做法'}],
  rationaleExample:'发现跟随示范与独立解释之间的差距、把帮助对准缺口并安排撤去帮助后的检验才是重点。选择完整例子不必然低分，选择少用帮助也不必然高分。'
 }
};
const behaviorCriteria=[
 {id:'evidence_based_decision',label:'依据自己的尝试作决定',levels:['提供的理由没有对应当前证据，或与自己的记录明显相反','提到了把握或困难，但与当前证据的联系较笼统','指出自己的具体尝试、解释或不确定点，说明该证据怎样支持当前决定']},
 {id:'decision_action_alignment',label:'执行与决定相符的行动',levels:['有可用且可见机会，但实际行动与所述目标无关，且没有解释调整原因','选择与行动部分相符，或只给出一般性理由','实际独立核对、使用针对性线索或结束帮助，与所述目标相符；合理改变计划也有依据']},
 {id:'evidence_based_update',label:'解释新例并调整后续帮助',levels:['仅以“做完了”或“看过了”为依据，没有解释新例证据','提到新例中的一个表现，但未清楚连接下一步决定','指出新例中已能解释或仍有缺口的部分，并据此合理决定继续、结束或调整帮助']}
];
const scenarioCriteria=[
 {id:'identify_evidence',label:'识别情境中的有效证据',levels:['忽略或误解关键证据','提到一项一般性相关线索','指出与当前困难或独立理解直接相关的具体证据']},
 {id:'fit_decision',label:'使决定对应证据',levels:['决定与证据冲突或没有相关解释','方向可理解，但依据较笼统','清楚解释行动怎样解决当前缺口或保留已有独立能力；允许不同有依据的选择']},
 {id:'plan_verification',label:'提出独立核验或调整条件',levels:['没有可执行核验，或只说继续多用/少用帮助','提出检查，但没有明确独立性或改变决定的条件','提出撤去帮助后的新例、解释或对照检查，并说明何种证据会使决定改变']}
];
const fail=message=>{throw Object.assign(new Error(message),{status:400,code:'regulation_transfer_invalid'});};
const clone=x=>JSON.parse(JSON.stringify(x));
function task(id){if(!Object.hasOwn(tasks,id))fail('未知的新情境任务');return tasks[id];}
function publicQuestion(q){const {answer,analysis,...safe}=q;return clone(safe);}
function publicInstrument(){return {version,primaryOutcome,designBudgetSeconds:840,helpPolicy:'same_authored_help_all_arms',order:taskOrder.map(id=>({id,kind:tasks[id].kind,title:tasks[id].title,budgetSeconds:tasks[id].budgetSeconds})),orientationSeconds:120,summarySeconds:60,transitionBufferSeconds:60,introduction:'接下来有几个新任务。你可以自己继续，也可以使用一条线索、请求更具体的线索或结束帮助。没有规定你必须多用或少用帮助，请按任务和自己的情况决定。每个真实任务最后都有一个大家都要做的小检查。这部分不使用前面的学习设置与回顾面板。',completionMessage:'已保存你的作答与说明。本次任务完成了，感谢参与。'};}
function publicTask(id,phase='attempt',options={}){
 const t=task(id),common={id:t.id,kind:t.kind,title:t.title,context:t.context,instrumentVersion:version,budgetSeconds:t.budgetSeconds};
 if(t.kind==='scenario'){if(!['attempt','reflect'].includes(phase))fail('情境任务阶段无效');return {...common,prompt:t.prompt,options:clone(t.options)};}
 if(phase==='attempt')return {...common,question:publicQuestion(t.initial),reasonPrompt:'请用一句话说明你的依据；暂时无法说明也可以如实填写。',confidenceOptions:[{value:'sure',label:'有把握'},{value:'unsure',label:'不太确定'},{value:'dont_know',label:'不知道'}]};
 if(phase==='support'){
  const level=options.level??0;if(![0,1,2].includes(level))fail('线索层级无效');
  return {...common,invitation:'要用一条线索检查你的依据吗？',choices:[{value:'hint',label:'看一条线索'},{value:'continue',label:'先自己再试'},{value:'decline',label:'这次不需要'}],help:level?clone(t.help.find(x=>x.level===level)):null,actions:clone(actions),maxHelpLevel:2};
 }
 if(phase==='check')return {...common,question:publicQuestion(t.check),helpAllowed:false,notice:'这是一道新的独立小检查，前面的线索暂时收起。'};
 if(phase==='reflect')return {...common,prompt:t.reflectionPrompt,decisions:clone(decisions)};
 fail('新情境任务阶段无效');
}
function gradeMath(id,phase,response){
 const t=task(id);if(t.kind!=='behavior'||!['initial','check'].includes(phase))fail('数学作答阶段无效');
 const q=t[phase],r=response==='unknown'?'__unknown__':response==='skip'?'__skip__':response;
 if(!q.options.some(o=>o.value===r))fail('数学作答选项无效');
 const skipped=r==='__skip__',unknown=r==='__unknown__';
 return {questionId:q.id,instrumentVersion:version,response:r,responseKind:skipped?'skipped':unknown?'dont_know':'answer',correct:skipped?null:r===q.answer,score:skipped?null:Number(r===q.answer),maxScore:1,complete:!skipped};
}
function normalizeSubmission(id,input,options={}){
 const t=task(id);if(!input||typeof input!=='object'||Array.isArray(input))fail('任务记录格式无效');
 const fields=t.kind==='behavior'?['initialAnswer','initialReason','confidence','helpChoice','actionChoice','actionNote','checkAnswer','checkReason','reflectionDecision','reflectionReason','skipped']:['choice','reason','verification','skipped'];
 if(Object.keys(input).some(k=>!fields.includes(k)))fail('任务记录含有未知字段');
 const result={};for(const [key,value]of Object.entries(input)){
  if(key==='skipped'){if(typeof value!=='boolean')fail('跳过状态无效');result[key]=value;continue;}
  if(typeof value!=='string'||value.length>600)fail('请将每段说明控制在600字以内');result[key]=value.trim();
 }
 const enums=t.kind==='behavior'?{confidence:['sure','unsure','dont_know'],helpChoice:['hint','continue','decline'],actionChoice:actions.map(x=>x.value),reflectionDecision:decisions.map(x=>x.value)}:{choice:t.options.map(x=>x.value)};
 for(const [field,values]of Object.entries(enums))if(result[field]!==undefined&&!values.includes(result[field]))fail('任务选择无效');
 if(t.kind==='behavior')for(const field of ['initialAnswer','checkAnswer'])if(result[field]!==undefined)result[field]=gradeMath(id,field==='initialAnswer'?'initial':'check',result[field]).response;
 if(options.complete&&!result.skipped){const required=t.kind==='behavior'?['initialAnswer','confidence','helpChoice','actionChoice','checkAnswer','reflectionDecision']:['choice'];if(required.some(k=>result[k]===undefined))fail('请完成本任务的选择，或明确暂不作答');}
 return result;
}
function ratingCards(){return taskOrder.map(id=>({id,kind:tasks[id].kind,title:tasks[id].title,maxScore:6,criteria:clone(tasks[id].kind==='behavior'?behaviorCriteria:scenarioCriteria),guide:tasks[id].rationaleExample,missingPolicy:'明确不作答、机会未显示、技术中断或无可解释记录时保留缺失；不要当成0分。已提供的无关理由才可按量规评0。',...(tasks[id].kind==='behavior'?{mathKeys:{initial:{answer:tasks[id].initial.answer,analysis:tasks[id].initial.analysis},check:{answer:tasks[id].check.answer,analysis:tasks[id].check.analysis}}}:{})}));}
function summarizeRatings(ratings={}){
 if(!ratings||typeof ratings!=='object'||Array.isArray(ratings)||Object.keys(ratings).some(id=>!taskOrder.includes(id)))fail('评分任务编号无效');
 const byTask={};for(const id of taskOrder){const values=ratings[id];if(values===undefined||values===null){byTask[id]=null;continue;}if(!Array.isArray(values)||values.length!==3||values.some(x=>x!==null&&(!Number.isInteger(x)||x<0||x>2)))fail('每个任务需要三个0至2分的评分点，缺失为null');byTask[id]=values.some(x=>x===null)?null:values.reduce((a,b)=>a+b,0);}
 const total=ids=>ids.every(id=>byTask[id]!==null)?ids.reduce((s,id)=>s+byTask[id],0):null;
 return {instrumentVersion:version,primaryOutcome,behaviorScore:total(['sensor','junction']),behaviorMaxScore:12,scenarioScore:total(['pause_case','worked_example_case']),scenarioMaxScore:12,byTask,combinedScore:null,scoringPolicy:'human_blind_rubric_no_automatic_credit_from_math_or_help_clicks'};
}
function mathSummary(responses={}){
 const items=[];for(const id of ['sensor','junction'])for(const phase of ['initial','check']){const r=responses[id]?.[phase];items.push(r===undefined?{questionId:tasks[id][phase].id,score:null,complete:false,responseKind:'missing'}:gradeMath(id,phase,r));}
 return {instrumentVersion:version,score:items.every(x=>x.complete)?items.reduce((s,x)=>s+x.score,0):null,maxScore:4,items,separateFromRegulationScore:true};
}
module.exports={version,primaryOutcome,taskOrder,publicInstrument,publicTask,gradeMath,normalizeSubmission,ratingCards,summarizeRatings,mathSummary};
