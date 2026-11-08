'use strict';
const bank=require('./functions-limits-r10');
const retention=bank.forms('Z').filter(q=>q.type==='single').map(q=>({...q,id:q.id.replace('fl-r10-Z','fl-r10-retention-Z'),points:1}));
// Keep the delayed form short while retaining the restored domain construct.
retention[1]={id:'fl-r10-retention-domain',type:'single',points:1,question:'一个显示程序把(x²−36)/(x−6)化简成x+6，但没有改动原来的允许输入。输入恰好为6时，能否直接显示12？',options:[{value:'A',label:'能，化简会自动补定义'},{value:'B',label:'不能，原式排除了6；要显示12必须另行补定义'},{value:'C',label:'只能显示0'},{value:'D',label:'所有输入都不能显示'},{...bank.unknown},{value:'__skip__',label:'跳过本题（不作答）'}],answer:['B'],analysis:'函数的定义域是定义的一部分，代数化简不会扩大它。',knowledgePointId:bank.ids[1],knowledgePointIds:[bank.ids[1]],instrumentVersion:'functions-limits-delayed-r10'};
const rows=[
 ['某快递规则规定：重量不超过2千克收费8元；重量至少2千克收费10元。这份规则在重量2千克处有什么问题？',['同一允许输入对应两个不同费用，需要明确边界规则','不同重量不能收费相同','只要写成分段规则就不是函数','所有重量都没有费用'],0,'两个区间在2处重合，但分别给出8和10。把一个边界改成严格不等号或让费用一致都可修正。'],
 ['一个程序在t≠2时使用y=(t²−4)/(t−2)，并规定t=2时显示9。程序员约分后对所有输入使用y=t+2。这个修改有什么问题？',['没有问题，约分保留全部输入的行为','只需把所有输出改成9','改变了t=2处原来单独规定的显示值；其他允许输入的计算不变','所有输入的结果都改变了'],2,'约分不覆盖例外点的定义。原程序在2显示9，新程序显示4；要保持原行为，应保留单独分支。'],
 ['监测系统每隔一小时记录一次温度，连续五次记录都升高。温度随时间连续。负责人说这证明每一分钟都在升温。哪项最准确？',['连续已经排除了中间降温','记录证明了全天严格下降','记录支持升温猜测，但不能排除观测之间的下降','只要增加一次观测就一定能证明'],2,'连续曲线可在观测之间先降再升。有限采样不足以保证每一时刻的区间性质。'],
 ['传感器误差满足：输出误差的绝对值等于输入误差的6倍。要求输出误差小于0.3，哪项能保证这一要求？',['输入误差绝对值小于0.3','输入误差绝对值小于0.05','输入误差绝对值等于0.05','只要测几个合格样本即可'],1,'输入误差小于0.05时，输出误差小于6×0.05=0.3；等于0.05不符合严格小于。'],
 ['设备在切换时刻前的读数趋近12，切换后趋近15。工程师只把切换瞬间的显示改为13.5。下列哪项成立？',['双侧极限现在是13.5','只要点值介于两边之间就连续','两侧趋势仍不同，单点显示不能消除跳跃','左极限也会变为13.5'],2,'单点赋值没有改变切换前后的规则。左右趋近12和15不相等。'],
 ['一段轨迹在时刻t=2的两侧位置都趋近5，但记录将该时刻位置写成9。只修正这个记录，怎样使位置函数在这里连续？',['保留9，因为只要有记录就连续','改为两侧共同趋近的5','删去记录，不补任何值','必须先保证速度没有尖角'],1,'共同有限极限已为5；补上相同点值即可。位置连续不要求速度条件。']
];
const transfer=rows.map(([question,labels,key,analysis],i)=>({id:`fl-r10-transfer-${i+1}`,type:'single',question,points:1,knowledgePointId:bank.ids[i],knowledgePointIds:[bank.ids[i]],options:[...labels.map((label,j)=>({value:'ABCD'[j],label})),{...bank.unknown},{value:'__skip__',label:'跳过本题（不作答）'}],answer:['ABCD'[key]],analysis,instrumentVersion:'functions-limits-delayed-r10',transferScope:'near_context_transfer_not_far_transfer'}));
module.exports={version:'functions-limits-delayed-r10',retention,transfer};

