'use strict';
const assert=require('node:assert/strict'),check=require('../lib/assistant-math-check-r18');
const yes=check.pointFacts('点P(−2,4)是否在y=x²图像上？');assert.equal(yes.onGraph,true);assert.equal(yes.computedY,4);
const no=check.pointFacts('点Q(4,−2)是否在y=x^2图像上？');assert.equal(no.onGraph,false);assert.equal(no.computedY,16);
assert.equal(check.pointFacts('点A(−1,8)是否在y=2x^2-3x+3图像上？').onGraph,true);
for(const q of ['P(2,4)在y=x^2/x图像上吗？','P(2,4)在y=x^2+sin(x)图像上吗？','P(2,4)在y=x^2图像上吗，定义域是x<0？','P(2,4)和Q(1,1)在y=x^2图像上吗？','P(2,4)在y=x^3图像上吗？'])assert.equal(check.pointFacts(q),null,q);
assert.equal(check.validateReply(yes,'不在。代入(-2)^2=4，所以在图像上。').valid,false);
assert.equal(check.validateReply(yes,'P点不在 y=x² 的图像上。更正：P在图像上。').valid,false);
assert.equal(check.validateReply(no,'点Q(4,-2)在图像上。').valid,false);
assert.equal(check.validateReply(yes,'在图像上。横坐标-2代入平方得到4。').valid,true);
assert.equal(check.validateReply(no,'不在图像上，4的平方是16，不是-2。').valid,true);
const sample=check.sampleFacts('已知连续函数在0、1、2处的值为0、1、2，为什么不能证明整个区间严格递增？请给一个中间下降的连续折线例子。');
assert.deepEqual(sample.observations,[[0,0],[1,1],[2,2]]);assert(sample.verification.every(v=>v.actual===v.required));
assert.equal(check.validateReply(sample,'连续折线依次连接 (0,0)、(\\tfrac12,2)、(\\tfrac32,-1)、(2,2)，满足观测。').valid,false);
assert.equal(check.validateReply(sample,check.explanation(sample)).valid,true);
const shifted=check.sampleFacts('连续函数经过(2,3)、(4,7)、(6,9)，是否整个区间上升？');assert(shifted.verification.every(v=>v.actual===v.required));
const a=require('../lib/learning-assistant'),index=a.buildCourseContextIndex(require('../data/multi-scene-learning-route.json'));
const resolved=a.resolveAssistantContext({index,chapterId:'V14-C1',unitId:'GH-01-K02',sceneType:'slide'});
const prompt=a.buildAssistantPrompt({resolved,question:'点P(−2,4)是否在y=x²图像上？请分步骤解释。'});
assert.equal(JSON.parse(prompt.user.slice(prompt.user.indexOf('{'))).verifiedStudentQuestionFacts.onGraph,true);assert(!prompt.system.includes('本轮学生要求分步引导'));
assert(a.buildAssistantPrompt({resolved,question:'刚才还是不懂。请换一个具体数值例子。'}).system.includes('本轮学生明确要求更换数值例子'));
assert.equal(check.validateQuestionScope('本题趋向正无穷。上一题左右分别趋近4和6。').valid,false);
assert.equal(check.validateQuestionScope('上一题的条件是左右极限不同。').valid,false);
assert.equal(check.validateQuestionScope('本题左右都趋向正无穷；没有提供上一题题干，不能准确比较。').valid,true);
assert.equal(check.validateQuestionScope('上一题的数字不能套用到本题。').valid,true);
assert.equal(check.validateQuestionScope('本题只有一对下降的输入。上一题题干我这里没有，无法准确比较。').valid,true);
assert.equal(check.validateQuestionScope('上一题的题干未提供。先看本题的点值。').valid,true);
assert.equal(check.validateQuestionScope('上一题题干没有点值，所以无法判断连续。').valid,false);
assert.equal(check.validateQuestionScope('上一题题干我这里没有。上一题左右极限分别为4和6。').valid,false);
const repair=check.questionFacts('如果改成两侧都趋近4且点值为9，这和刚才有什么不同？能通过只改点值变连续吗？');
assert.equal(repair.canRepairByPointValue,true);assert.equal(repair.requiredPointValue,4);
assert.equal(check.validateReply(repair,'两侧都趋近4，但点值9不同；只改点值不能修复，需把f(1)改成4。').valid,false);
assert.equal(check.validateReply(repair,'现在不能通过只改点值修复。').valid,false);
assert.equal(check.validateReply(repair,'刚才只改点值不能修复。现在两侧都趋近4，可以只改点值为4。').valid,true);
assert.equal(check.validateReply(repair,check.explanation(repair)).valid,true);
assert.equal(check.continuityFacts('有人说两侧都趋近4且点值为9，所以连续。'),null);
assert.equal(check.continuityFacts('两侧都趋近无穷且点值为9，可以修复吗？'),null);
for(const reply of ['0.8÷4=0.4。','你选的 \\(r=0.4\\) 是输出误差上限 \\(0.8\\) 除以倍率 \\(4\\) 得到的。','4×0.19=0.78。'])assert.equal(check.validateArithmetic(reply).valid,false,reply);
for(const reply of ['0.8÷4=0.2。4×0.19=0.76。','0.2 是 0.8 除以 4 得到的。','错误的等式是“0.8÷4=0.4”，应改成0.2。','0.8÷4=0.4 对吗？','2+3*4=14。','4d<0.8。','1÷3约等于0.33。'])assert.equal(check.validateArithmetic(reply).valid,true,reply);
const authored=require('../lib/courseware/quiz-scaffolds-r16'),radiusQuestion='fl-r13-formative-GH-02-K01-1';
for(const dot of ['·','⋅','∙']){
 assert.equal(check.validateArithmetic(`2${dot}1+2=4。`).valid,true,'不得把复合式末段误读为1+2=4');
 assert.equal(check.validateArithmetic(`2${dot}3=8。`).valid,false,'独立的点乘算式仍应校验');
}
assert.equal(authored.validateReply(radiusQuestion,'输入误差可以小于1.8，但输出误差是它的4倍，可能达到4×1.8=7.2。').valid,false);
assert.equal(authored.validateReply(radiusQuestion,'输入误差小于1.8，输出误差不能达到7.2。取d=1时输出误差4，超过3.6。').valid,true);
assert.equal(authored.validateReply(radiusQuestion,'输入误差小于1.8，输出误差可以达到4。').valid,true);
const corrected=authored.correctionForQuestion(radiusQuestion,['strict_error_bound_cannot_be_attained']);
assert.equal(authored.validateReply(radiusQuestion,corrected).valid,true);assert.match(corrected,/d=1/);assert.match(corrected,/不能取到/);
assert.equal(authored.correctionForQuestion('fl-r13-formative-GH-01-K01-1',['strict_error_bound_cannot_be_attained']),null);
const limitsQuestion='fl-r13-formative-GH-02-K02-1';
const realFailure='第一步：x<0时x+14趋近14，x>0时2x+15趋近15，两侧都有限但不等。第二步：只改f(0)不改变两侧附近规则，所以平均值15/2也不能让两侧趋近同一个数。';
// The observed reply omits “左侧/右侧”; the original task still supplies the
// two rules. The guard must cover that exact form as well as explicit sides.
assert.equal(authored.validateReply(limitsQuestion,realFailure).valid,false);
for(const value of ['15/2','7.5','\\(\\frac{15}{2}\\)','(14+15)/0'])assert.equal(authored.validateReply(limitsQuestion,`左侧趋近14、右侧趋近15，所以平均值${value}也不能产生共同极限。`).valid,false,value);
for(const reply of [
 '左侧趋近14、右侧趋近15，平均值14.5也无效。',
 '左极限为14、右极限为15，平均值(14+15)/2也无效。',
 '左侧趋近14、右侧趋近15，平均值\\(\\frac{29}{2}\\)也无效。',
 '左侧趋近14、右侧趋近15，取平均值也不能改变附近规则。',
 '左侧趋近14、右侧趋近15，平均值不是15/2。',
 '左侧趋近14、右侧趋近15，平均值15/2对吗？',
 '左侧趋近14、右侧趋近15。“平均值15/2”是错误的。',
 '左侧趋近14、右侧趋近15。例如左侧趋近2、右侧趋近6，平均值4也无效。',
 '如果改成左侧趋近2、右侧趋近6，平均值4也无效。'
])assert.equal(authored.validateReply(limitsQuestion,reply).valid,true,reply);
const meanCorrection=authored.correctionForQuestion(limitsQuestion,['stated_two_sided_mean_mismatch']);
assert.match(meanCorrection,/14\.5/);assert.match(meanCorrection,/只允许改f\(0\)/);assert.equal(check.validateArithmetic(meanCorrection).valid,true);
const checkQuestion=require('../lib/assessments/functions-limits-targeted-checks-r16').pools['fl-r13-formative-GH-01-K01-1'][0];
const guided=authored.guidedCheckStep({checkId:checkQuestion.id,sourceQuestionId:checkQuestion.sourceQuestionId,status:'incorrect',response:'9'});
assert.equal(guided.withheldAnswer,7);assert.equal(guided.equation,'2+b=9');
assert.equal(authored.validateGuidedStep(guided,'你选b=9时右段给出11。接下来请你判断：若b=7，输入2处两条规则各给出多少？').valid,false);
assert.equal(authored.validateGuidedStep(guided,'右段给出11，左段给出9。要让2+b=9，b应是多少？').valid,true);
assert.equal(authored.validateGuidedStep(guided,guided.correction).valid,true);assert.equal(check.validateArithmetic(guided.correction).valid,true);
assert.equal(authored.guidedCheckStep({checkId:'unknown',sourceQuestionId:checkQuestion.sourceQuestionId,status:'incorrect',response:'9'}),null);
assert.equal(authored.guidedCheckStep({checkId:checkQuestion.id,sourceQuestionId:checkQuestion.sourceQuestionId,status:'incorrect',response:'我还不会'}),null);
console.log('PASS: substitution facts, contradictory verdicts, unsupported domain/expression abstention, explanatory vs guided intent');
