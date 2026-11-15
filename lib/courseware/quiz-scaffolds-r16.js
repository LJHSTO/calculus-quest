'use strict';
// Authored, question-specific help. Keep assessment items and their answer keys
// unchanged; L5 uses a different example before returning the work to the learner.
const version='formative-scaffolds-r16-20261113';
const facts={
 'GH-01-K01-1':'重合输入x=1。左段输出2×1+13=15，右段输出1+b；相等要求b=14。13是左段常数项，不是左段在x=1的输出。若学生选b=13，右段输出14，左段输出15。只描述学生确实选了什么，不臆测他把哪个数当成哪个量。',
 'GH-01-K01-2':'输入重量1、2不同，各自只有收费5这一个输出；函数允许不同输入同值，与图像光滑无关。',
 'GH-01-K02-1':'约分仅在x≠5成立。f不允许输入5；g允许且g(5)=10；两者在共同定义域上值相同，原定义域不同。',
 'GH-01-K02-2':'原定义f(4)=2，实际点(4,2)实心。附近规则x+3趋近7，在(4,7)留空。',
 'GH-01-K03-1':'三个已知点不确定点间走势。依次连接(0,0)、(0.5,2)、(1,1)、(2,2)的连续折线满足全部观测，却在0.5到1下降。因此连续加有限采样不能证明整个区间严格上升。',
 'GH-01-K03-2':'u<v且f(u)>f(v)否定含这两点的区间严格上升。它只描述这一对，未证明整个区间严格下降。无需先算导数；可以直接比较。',
 'GH-02-K01-1':'记实际输入误差d，条件是0≤d<r，输出误差4d。要保证4d<3.6，可取所有0<r≤0.9。r=0.9有效，因为4d<4r=3.6；不能错误地要求4r<3.6或r必须小于0.9。r=1.8或2.7都过大，例如取d=1，在所选范围内，但输出误差4超过3.6。d<r时4d只能接近4r，不能达到4r。r=0不是正半径。要分清实际误差d和限制半径r。',
 'GH-02-K01-2':'附近规则2x+1在x→3时趋近7；单独点值f(3)=20。附近趋近值、点值依题目次序为7、20。',
 'GH-02-K02-1':'左侧趋近14，右侧趋近15，均有限但不相等。两数平均值是(14+15)/2=14.5，不是15/2。只改f(0)不改变两侧规则，不能产生共同有限极限，平均值无效。题目只允许改f(0)。分步帮助时可以先核对两侧数值，再让学生判断只改f(0)会不会改变x<0时的规则；不要先回答这个判断，再要求学生重复。',
 'GH-02-K02-2':'1/x²在x→0的两侧都趋向正无穷，没有双侧有限极限。无穷不是一个很大的有限数。',
 'GH-02-K03-1':'|x−4|的左右极限和f(4)都是0，所以在4连续。尖角影响可导性，不否定连续性，本题无需计算导数。',
 'GH-02-K03-2':'左极限3、右极限5不同，没有共同有限极限；只改点值无法让一个数同时等于3和5。'
};
const rows={
 'GH-01-K01-1':[
  '同一个输入可以同时满足两段规则，但两段算出的输出必须一致。先把重合输入1分别代入。',
  '先算左段在x=1时的输出，再把右段写成含b的式子。令这两个输出相等，最后检查你选的是b的值，还是左段的输出。',
  '换个例子：在x=2处，两条规则y=3x+1和y=x+c都适用。左边得到7，右边得到2+c，所以c=5。回到原题，用重合输入1做同样的检查；不要把输出直接当成参数。'
 ],
 'GH-01-K01-2':[
  '函数要求“每个输入只有一个输出”。它有没有要求“不同输入必须得到不同输出”？',
  '分别固定重量1和重量2，检查每个重量有没有出现两个不同收费。然后比较“一个重量有两个费用”和“两个重量收费相同”有什么区别。',
  '例如f(x)=x²，输入−2和2都得到4；固定任意一个输入时，输出仍然唯一。回到收费程序，逐个检查重量对应的费用，再判断有没有违反函数要求。'
 ],
 'GH-01-K02-1':[
  '约分前先看原式的分母。原来不能代入的数，会因为约分就变成允许输入吗？',
  '先写f允许哪些输入，再写g允许哪些输入。对双方都允许的输入可以比较输出，但判断是不是同一函数还要比较输入范围。',
  '例如h(x)=(x²−9)/(x−3)，原来要求x≠3；约成x+3后，h仍不允许输入3。另一个在全部实数上定义的x+3函数则允许。用同样的方法检查原题的排除点5。'
 ],
 'GH-01-K02-2':[
  '实心点表示这一输入真正取到的值；空心点表示附近曲线到这里时没有取到的值。先找题目单独规定的f(4)。',
  '分两栏写：输入正好等于4时按哪条规定，输入靠近4但不等于4时按哪条规则。前一栏决定实心点，后一栏决定附近曲线的空点。',
  '例如x≠2时g(x)=x+5，另设g(2)=1。实际点是(2,1)，画实心；附近直线走向(2,7)，那里留空。现在回到原题，分别使用“x≠4”和“f(4)=2”这两条规定。'
 ],
 'GH-01-K03-1':[
  '三个观测值按顺序增加，只告诉了你这三个位置。连续的曲线在相邻观测点之间能不能先上升、再下降？',
  '在x=0和x=1之间再选一个位置，想一想它的输出能否比f(1)更大，同时仍能用连续曲线接上三个已知点。若可以，三个观测值就不能证明整个区间严格上升。',
  '把(0,0)、(0.5,2)、(1,1)、(2,2)依次用线段连接：曲线连续，也经过题目给出的三个点，却在0.5到1之间下降。请据此区分“已观察的点在增加”和“整个区间严格上升”。'
 ],
 'GH-01-K03-2':[
  '一对输入的输出下降，只检查了这一对。判断整个区间严格下降，还需要其余输入对满足什么关系？',
  '先写严格上升要求：任取u<v，都应有f(u)<f(v)。题目这一对违反了它。再想：这是否已经说明其余每一对输入都下降？',
  '例如x²在[−2,2]上，从−2到−1时输出由4降到1，但从1到2又由1升到4。找到一对下降的输入，不能证明整个区间都下降。回到原题，说清这一对能否定什么、还不能证明什么。'
 ],
 'GH-02-K01-1':[
  '实际输入误差d小于所选半径r，输出误差是4d。注意d不会取到r：在你选的范围内，每个d的输出误差都小于3.6吗？',
  '把输入误差记为d，输出误差就是4d。要保证4d<3.6，先求d应小于多少；再检查所选r是否为正数，且范围内每个d都符合要求。',
  '换个要求：若输出误差必须小于2，且仍是输入误差的4倍，那么把输入误差限制为小于0.5即可，更小的正半径也可以。回到3.6这个要求，用同样的除法，并检查不等号。'
 ],
 'GH-02-K01-2':[
  '“靠近3但不等于3”和“正好等于3”用的不是同一条规定。请分别找出对应规则。',
  '先用2x+1判断x从两侧靠近3时输出靠近哪里；再直接读出题目单独规定的f(3)。按“附近趋近值、点值”的顺序填写，不要交换。',
  '例如x≠2时g(x)=3x+1，另设g(2)=10。附近输出趋近7，点上取值10；改点值不会改动附近的规则。原题同样把附近规则和单独的点值分开计算。'
 ],
 'GH-02-K02-1':[
  '双侧有限极限要求左右都趋近同一个有限数。只改f(0)，能改变x<0或x>0时的输出吗？',
  '先用x+14判断左侧趋近值，再用2x+15判断右侧趋近值。比较这两个数后，再检查题目允许改的点值能否改变它们。',
  '例如左侧趋近2、右侧趋近6，即使把点值设为平均值4，两侧仍各自趋近2和6。回到原题，先分别记录两侧的结果，再判断只改一个点有没有作用。'
 ],
 'GH-02-K02-2':[
  '本题问的是“有限极限”。不断增大而没有有限上界，和越来越靠近一个固定的有限数一样吗？',
  '分别想x=0.1、0.01、0.001以及对应负数时的输出。两侧方向虽然一致，但输出是否停留在某个有限数附近？用这一点判断有限极限。',
  '例如g(x)=2/x²，x取0.1和0.01时输出分别为200和20000，继续靠近0还会更大。“趋向正无穷”描述这样的无界趋势，不是一个很大的有限答案。原题也要区分这两种情况。'
 ],
 'GH-02-K03-1':[
  '连续要核对点值、左右共同趋近值，以及两者是否相同。图像有尖角会自动破坏哪一项吗？',
  '把左侧趋近值、右侧趋近值和f(4)分别写出来，再看三者是否一致。最后判断“有尖角”和“在这个点断开”是不是一回事。',
  '例如g(x)=|x−2|在2处有尖角；左右都趋近0，g(2)也等于0，所以它在那里连续。回到原题，照着检查三项数值，不需要先求导。'
 ],
 'GH-02-K03-2':[
  '要连续，点值必须与左右共同趋近值相同。左右分别趋近3和5时，有没有这样一个共同值？',
  '先把左极限3、右极限5分开写；只修改点值时，这两个数都不会变。尝试任取一个点值，看它能否同时等于两侧趋近值。',
  '例如左侧趋近1、右侧趋近4，把点值改成1、4或中间的2.5，都不能使两侧趋近同一个数。只改一个点无法修复这种跳跃。现在用原题的3和5说明原因。'
 ]
};
function forQuestion(questionId,level){
 const key=String(questionId||'').match(/^fl-r13-formative-(GH-0[12]-K0[123]-[12])$/)?.[1];
 const row=rows[key];if(!row)return null;
 const index=level==='L5'?2:['L3','L4'].includes(level)?1:0;
 return {version,text:row[index],facts:facts[key]};
}
function meanClaimIssues(text,left,right){
 // Check only explicit means alongside both stated one-sided limits. Do not
 // infer operands for a different example, a question, or a quoted mistake.
 const plain=String(text||'').replace(/\\(?:tfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/g,'($1)/$2').replace(/\\[()[\]]/g,'').normalize('NFKC').replace(/[−–]/g,'-').replace(/[ \t*$]/g,'');
 const number='-?\\d+(?:\\.\\d+)?';
 const side=(label,value)=>new RegExp(label+'(?:侧|边|极限)(?:的)?(?:输出)?(?:仍)?(?:各自)?(?:趋近(?:于)?|极限(?:为|是)|为|是|等于|=)'+value+'(?![\\d./])');
 for(const block of plain.split(/\n\s*\n|(?=例如|比如|另一个例子|假设|如果|回到原题)/)){
  const originalRules=left===14&&right===15&&/x<0时(?:f\(x\)=)?x\+14趋近14(?![\d./])/.test(block)&&/x>0时(?:f\(x\)=)?2x\+15趋近15(?![\d./])/.test(block);
  if(!originalRules&&(!side('左',left).test(block)||!side('右',right).test(block)))continue;
  for(const sentence of block.split(/[。；;\n]/)){
   if(/[?？]|误以为|误写|写错|错误|有人说|你说|“[^”]*平均[^”]*”/.test(sentence))continue;
   const claim=new RegExp('平均(?:值|数)(?:是|为|等于|取)?[=:：]?((?:\\('+number+'(?:\\+'+number+')?\\)|'+number+')(?:/'+number+')?)(?![\\d.+*/^\\-])','g');
   for(const match of sentence.matchAll(claim)){
    const expression=match[1],parts=expression.split('/'),terms=parts[0].replace(/[()]/g,'').split('+').map(Number),denominator=parts.length===2?Number(parts[1]):1;
    const value=terms.reduce((sum,n)=>sum+n,0)/denominator;
    if(!Number.isFinite(value)||Math.abs(value-(left+right)/2)>1e-9)return ['stated_two_sided_mean_mismatch'];
   }
  }
 }
 return [];
}
function validateReply(questionId,text){
 const key=String(questionId||'').replace(/^fl-r13-formative-/,'');
 const plain=String(text||'').replace(/\\(?:leq|le)(?![a-z])/g,'≤').replace(/\\[()[\]]/g,'').replace(/\s/g,'');
 const issues=[];
 if(key==='GH-01-K01-1'&&/(?:^|[^\d])13[^。！？；]{0,10}(?<!不)(?:是|为)(?:左段|左边|左侧)[^。！？；]{0,18}输出/.test(plain))issues.push('parameter_misidentified_as_output');
 if(key==='GH-02-K01-1'&&/(?:4r<3\.6|r<0\.9)/.test(plain)&&!/(?:r≤0\.9|r=0\.9|0\.9(?:也|仍|可以|能))/.test(plain))issues.push('valid_radius_endpoint_omitted');
 if(key==='GH-02-K01-1')for(const sentence of plain.split(/[。；]/)){
  const radius=sentence.match(/输入误差[^。；]{0,12}(?:小于|<)(\d+(?:\.\d+)?)/)?.[1];
  const reached=sentence.match(/(?<!不)(?:可能|可以|会|能)达到(?:[^。；=]{0,40}=)?(\d+(?:\.\d+)?)/)?.[1];
  if(radius&&reached&&Number(reached)>=4*Number(radius)-1e-9)issues.push('strict_error_bound_cannot_be_attained');
 }
 if(key==='GH-02-K02-1')issues.push(...meanClaimIssues(text,14,15));
 if(key==='GH-02-K03-2')issues.push(...meanClaimIssues(text,3,5));
 return {version:'course-math-guard-r16',issues,valid:issues.length===0};
}
function correctionForQuestion(questionId,issues=[]){
 if(questionId==='fl-r13-formative-GH-02-K01-1'&&issues.includes('strict_error_bound_cannot_be_attained'))return '实际误差d小于半径r，因此输出误差4d小于4r，不能取到4r。检查一个范围是否合格，要找范围内的实际输入：例如d=1时，输出误差为4，超过3.6，所以允许d=1的范围就不合格。回到要求4d<3.6，d应小于多少？';
 if(issues.includes('stated_two_sided_mean_mismatch')){
  if(questionId==='fl-r13-formative-GH-02-K02-1')return '14和15的平均值是(14+15)/2=14.5。双侧有限极限要求两侧趋近同一个有限数，不能用平均值替代。原题只允许改f(0)：把它设为14.5后，x<0时仍按哪条规则计算？';
  if(questionId==='fl-r13-formative-GH-02-K03-2')return '3和5的平均值是4。连续需要左右趋近同一个值，点值也与它相等。现在只把点值改成4，你认为左侧原本趋近的3会跟着变成4吗？';
 }
 return null;
}
function guidedCheckStep(completedCheck){
 if(!completedCheck||completedCheck.status!=='incorrect')return null;
 const check=require('../assessments/functions-limits-targeted-checks-r16').pools[completedCheck.sourceQuestionId]?.find(item=>item.id===completedCheck.checkId);
 if(check?.subSkill!=='overlap_unique_output')return null;
 const match=check.prompt.match(/^输入(\d+)同时适用于两条规则：左段y=2x\+(\d+)，右段y=x\+b。/);
 const selected=check.options.find(option=>option.label===String(completedCheck.response));
 if(!match||!selected||selected.value==='__unknown__'||selected.value===check.answer)return null;
 const input=Number(match[1]),constant=Number(match[2]),chosen=Number(selected.label),left=2*input+constant;
 if(!Number.isFinite(chosen))return null;
 const comparison=`你选b=${chosen}时，右段输出${input}+${chosen}=${input+chosen}，左段输出${left}，两段不一致。`;
 const equation=`${input}+b=${left}`,question='要让同一个输入得到相同输出，b应取多少？';
 return {kind:'overlap_parameter',parameter:'b',withheldAnswer:left-input,comparison,equation,question,correction:comparison+`需要满足${equation}。`+question};
}
function validateGuidedStep(plan,text){
 if(!plan)return {valid:true,issues:[]};
 const plain=String(text||'').replace(/\\[()[\]]/g,'').replace(/[\s${}*]/g,'');
 const exposed=new RegExp('b(?:=|应(?:该)?(?:取|为)|取|为|是|等于)'+plan.withheldAnswer+'(?![\\d.])').test(plain);
 return {valid:!exposed,issues:exposed?['guided_parameter_answer_revealed']:[]};
}
module.exports={version,forQuestion,validateReply,correctionForQuestion,guidedCheckStep,validateGuidedStep};
