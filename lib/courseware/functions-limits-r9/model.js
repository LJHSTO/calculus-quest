(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.R9Native=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const version='native-construction-r9-v1',courseVersion='functions-limits-native-r9-20261106';
 const points=['GH-01-K01','GH-01-K02','GH-01-K03','GH-02-K01','GH-02-K02','GH-02-K03'];
 const concepts=[
  '函数是一条固定的对应规则。x是输入，f(x)是按规则得到的输出。在允许的输入范围内，每个输入必须有、而且只能有一个输出；两个不同输入可以得到同一个输出。只看到几个样本，还不能确定所有输入的规则。',
  '图像上的点写成(x,y)：先读横坐标x，再读纵坐标y。若规则是y=f(x)，就把x代入，核对算出的f(x)是否等于y。坐标可以为负；转动视角、改变刻度都不会改变这个等式。',
  '判断增减时，先固定一个区间，再按x从小到大比较。严格上升要求区间内任取x₁<x₂，都有f(x₁)<f(x₂)。输出为负也可以上升。一个不满足的输入对就能否定“全程上升”，几个满足的点却不能证明它。',
  '极限描述输入靠近某个位置时，输出趋近什么数。目标输入a、趋近值L和点值f(a)是三件事；考察附近时排除x=a。数表可以帮助发现趋势，但判断要有对所有足够近输入都适用的规则。输入不断增大时，也可以考察输出是否趋近固定的数。',
  '左极限看x<a的一侧，右极限看x>a的一侧。双侧有限极限存在，需要两侧分别趋近有限数，而且这两个数相等。点值f(a)不会改变附近趋势；两侧不相等、无界或没有共同趋近值，都不能得到双侧有限极限。',
  '在定义域内点a处连续，需要：f(a)有定义；两侧有共同有限极限L；f(a)=L。只有点值缺失或不相等时，可以把点值补成L。两侧趋势不一致时，只改点值没有用。连续不要求光滑，例如|x|在0有尖角，仍然连续。'
 ];
 const tasks={
  'GH-01-K01-mindMap':{title:'把对应关系搭出来',goal:'允许输入是−1、0、1。点击格子连接输入和输出，让这张表能够定义一个函数；不要求遵从某个公式。',kind:'mapping'},
  'GH-01-K02-mindMap':{title:'让坐标、规则和图上的点对上',goal:'规则是y=2x−1。左右移动改变x，上下移动改变y；把蓝点放到这条规则的图像上，再固定它。',kind:'point'},
  'GH-01-K03-mindMap':{title:'给“全程上升”找一个反例',goal:'有人说y=x²−4在[−3,3]上严格上升。移动两个标记，找出x₁<x₂但右点不比左点高的一对。',kind:'counterexample'},
  'GH-02-K01-mindMap':{title:'把一个样本变成一个邻近范围',goal:'当x≠2时，f(x)=(x²−4)/(x−2)=x+2。试着选一个范围，让其中所有输入的输出距4都小于0.2。',kind:'neighborhood'},
  'GH-02-K02-mindMap':{title:'让数值沿关系图走一遍',goal:'用右侧原有的左右极限输入框，比较相等、不相等和负数情形。运行判定后，沿高亮路径看结论来自哪一个条件。',kind:'sides'},
  'GH-02-K03-mindMap':{title:'沿条件逐层修复',goal:'先看哪一层条件没满足，再决定改点值、保留原函数，还是承认只改点值不能解决。',kind:'repair'},
  'GH-01-K01-visualization3d':{title:'保留输入与输出的对照',goal:'选一条规则，用精确输入固定黄色映射线，再留下一条记录。比较不同输入同值与同一输入的唯一输出；采样线变密不会改变规则。',kind:'mapping_observe'},
  'GH-01-K02-visualization3d':{title:'用立柱表示带符号的输出',goal:'在原控件中选f(x)=x/3并生成立柱。先收集一个顶端在零平面下方的例子，再收集上方的例子。柱子的长度不带正负号，顶端的坐标才表示输出。',kind:'signed_pillar'},
  'GH-01-K03-visualization3d':{title:'在固定截面上寻找反例',goal:'固定z=0，把原来的两个标记作为x₁和x₂。找出x₁<x₂但f(x₁)≥f(x₂)的一对，否定“整条黄色截面严格上升”。旋转相机不会改变它们的坐标。',kind:'terrain'},
  'GH-02-K01-visualization3d':{title:'让后面的整段轨迹进入误差带',goal:'这里考察x不断增大，z=3+1/x趋近3。用原滑块选择门槛X，让所有x>X的输出都距3小于0.05；采用门槛前，先观察距离。',kind:'tail'},
  'GH-02-K02-visualization3d':{title:'同一组数据，换视角取证',goal:'先俯视，再侧视，分别保留观察。图中两侧极限固定为1和−1：俯视会丢失高度信息，不能用投影重合判断双侧极限。',kind:'projection'},
  'GH-02-K03-visualization3d':{title:'分开观察附近轨道与单点',goal:'用原按钮只改f(0)，保留改变前后的记录。附近按1+x²/5变化，共同极限始终为1；对照2D图看单点改动如何影响连续性。',kind:'point_observe'}
 };
 const finite=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
 const terrain=x=>Math.sin(x/8*2.5)*.6+Math.sin(x/8*4+1)*Math.cos(.5)*.25+Math.cos(x/8*1.5)*.3;
 function evaluate(id,s){
  const t=tasks[id];if(!t||!s||typeof s!=='object'||Array.isArray(s))return null;
  const result=(ok,feedback)=>({correct:ok,feedback});
  switch(t.kind){
   case 'mapping':{
    if(!Array.isArray(s.links)||s.links.length!==3||s.links.some(row=>!Array.isArray(row)||row.some(n=>![0,1,2].includes(n))||new Set(row).size!==row.length))return null;
    const missing=s.links.findIndex(a=>!a.length),multiple=s.links.findIndex(a=>a.length>1);
    if(missing>=0)return result(false,'输入'+(missing-1)+'还没有输出。允许的每个输入都要有对应结果。');
    if(multiple>=0)return result(false,'输入'+(multiple-1)+'连到了多个输出。请让这个输入只保留一个输出；不同输入共享一个输出没有问题。');
    return result(true,'每一行恰有一个输出，这张有限对应表定义了一个函数。输出列不必各占一格；若要定义更多输入，还需要说明它们的规则。');}
   case 'point':if(!finite(s.x,-3,3)||!finite(s.y,-7,7))return null;return result(s.y===2*s.x-1,s.y===2*s.x-1?'蓝点的纵坐标等于2x−1，所以属于这条图像。换一个x后，再找到对应点。':'横坐标是'+s.x+'，代入得到2×('+s.x+')−1='+ (2*s.x-1)+'，与当前纵坐标'+s.y+'不同。上下移动蓝点，或重新选择横坐标。');
   case 'counterexample':if(!finite(s.a,-3,3)||!finite(s.b,-3,3)||s.a>=s.b)return null;return result(s.a*s.a>=s.b*s.b,s.a*s.a>=s.b*s.b?'右点不比左点高，这一对就否定了整个区间严格上升。它不说明整个区间都下降；0右侧仍在上升。':'这一对的右点更高，只能说明这两个位置符合上升关系。把标记移到0左侧，再看能否找到反例。');
   case 'neighborhood':if(!finite(s.delta,.01,1)||![.2,.05].includes(s.epsilon))return null;return result(s.delta<=s.epsilon,s.delta<=s.epsilon?'对所有0<|x−2|<δ，都有|f(x)−4|=|x−2|<δ≤允许误差。理由覆盖整个邻近范围。':'当前范围太宽。例如选取距2为'+((s.delta+s.epsilon)/2).toFixed(3)+'的输入，仍在范围内，但输出已超出允许误差。请缩小δ。');
   case 'repair':{
    if(!['hole','jump','corner'].includes(s.case)||!['apply','leave','impossible'].includes(s.action)||!finite(s.value,-2,5))return null;
    const ok=s.case==='hole'?s.action==='apply'&&s.value===2:s.case==='jump'?s.action==='impossible':s.action==='leave'||s.action==='apply'&&s.value===0;
    return result(ok,ok?({hole:'附近规则是x+2，两侧趋近2。补上f(0)=2后三个条件都满足。',jump:'左侧趋近1、右侧趋近3。没有共同极限，任何单点值都无法补平这个跳跃。',corner:'|x|在0的左右极限与点值都是0。尖角不妨碍连续，无需修复。'})[s.case]:({hole:'两侧都按x+2趋近2。需要补的点值由这个共同极限决定。',jump:'这一步卡在共同极限：左右趋近值不相等。调整一个点不会改变两侧规则。',corner:'先核对三项条件。原函数的点值和共同极限都是0，不需要把尖角变圆。'})[s.case]);}
   case 'signed_pillar':if(s.rule!=='linear'||!finite(s.x,-11,11)||!['negative','positive'].includes(s.target))return null;return result(s.target==='negative'?s.x<0:s.x>0,(s.target==='negative'?s.x<0:s.x>0)?'x='+s.x+'，输出x/3='+Number((s.x/3).toFixed(3))+'。顶端在零平面'+(s.x<0?'下':'上')+'方；柱长是输出的绝对值。':'这个输入的输出不在目标一侧。保持规则x/3，改变输入的正负，再生成立柱。');
   case 'terrain':if(!finite(s.a,-7,7)||!finite(s.b,-7,7)||s.a>=s.b||!finite(s.scale,.5,3))return null;return result(terrain(s.a)>=terrain(s.b),terrain(s.a)>=terrain(s.b)?'按x从左到右，右侧输出没有变大。这一对足以否定全程严格上升；不要据此声称整条截面下降。':'这两个位置的输出在增大。它们不是反例；沿黄色截面把右标记移过一个局部高处，再比较。');
   case 'tail':if(!finite(s.x,1,50)||![.05,.1].includes(s.epsilon))return null;return result(s.x>=1/s.epsilon,s.x>=1/s.epsilon?'当x>X时，0<1/x<1/X≤允许误差，因此后面所有输出都在误差带内。有限输入处仍有1/x>0，不会恰好等于3。':'当前门槛还不够大。在X与'+(1/s.epsilon)+'之间仍有输出离3超过允许误差；继续向右移动门槛。');
   default:return null;
  }
 }
 function fingerprint(id,s){return JSON.stringify([id,Object.keys(s||{}).sort().map(k=>[k,s[k]])]);}
 function grade(data,point){if(data?.independent!==false||data.evidence_scope!=='native_construction_r9'||data.task_version!==version||data.course_version!==courseVersion)return null;const id=data.parameters?.task_id;if(!tasks[id]||!id.startsWith(point+'-')||data.knowledge_point_id!==point||data.challenge_id!==id+'-construction')return null;return evaluate(id,data.parameters.state)?.correct??null;}
 return {version,courseVersion,points,concepts,tasks,evaluate,grade,fingerprint,terrain};
});
