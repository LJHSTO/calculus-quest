'use strict';
// Deliberately small exact domain: one explicit point and one polynomial graph.
// Unsupported expressions or restricted domains return null; never eval text.
function pointFacts(question){
 const s=String(question||'').replace(/²/g,'^2').normalize('NFKC').replace(/[−–]/g,'-').replace(/\\[()[\]]/g,'').replace(/\s/g,'');
 if(!/图[像象]/.test(s)||/定义域|区间|分段|仅当|当x|x[<>≤≥≠∈]|x(?:不等于|大于|小于)/.test(s))return null;
 const points=[...s.matchAll(/(?:点[A-Z]?|[A-Z])\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/g)];
 const functions=[...s.matchAll(/(?:y|f\(x\))=([+\-\d.x^]+)/g)];
 if(points.length!==1||functions.length!==1)return null;
 if(/[\/\\({a-z]/i.test(s[functions[0].index+functions[0][0].length]||''))return null;
 const expression=functions[0][1],terms=expression.match(/[+-]?[^+-]+/g)||[];let output=0;
 if(terms.join('')!==expression)return null;
 const x=Number(points[0][1]),y=Number(points[0][2]);if(Math.max(Math.abs(x),Math.abs(y))>1e4)return null;
 const degrees=new Set();
 for(const term of terms){
  const m=term.match(/^([+-]?)(?:(\d+(?:\.\d+)?)?(x)(?:\^([12]))?|(\d+(?:\.\d+)?))$/);if(!m)return null;
  const degree=m[3]?Number(m[4]||1):0;if(degrees.has(degree))return null;degrees.add(degree);
  const coefficient=(m[1]==='-'?-1:1)*Number(m[3]?m[2]||1:m[5]);output+=coefficient*x**degree;
 }
 if(!terms.length||!Number.isFinite(output)||Math.abs(output)>1e8)return null;
 const tolerance=1e-10*Math.max(1,Math.abs(output),Math.abs(y));
 return {kind:'explicit_polynomial_point',x,y,expression,computedY:Number(output.toPrecision(12)),onGraph:Math.abs(output-y)<=tolerance,scope:'only the explicitly stated unrestricted polynomial and point'};
}
function validateReply(facts,text){
 if(!facts)return {version:'explicit-point-check-r18',valid:true,issues:[]};
 if(facts.kind==='common_finite_limit_point_value'){
  const clauses=String(text||'').split(/[。；;\n]/);
  const invalid=clauses.some(s=>!/(?:刚才|此前|原先|原来|之前).{0,18}(?:只改|只修改|仅改|不能)/.test(s)&&/(?:只(?:改|修改|改变)(?:一个)?点值(?:不能|无法|不可以)(?:修复|变连续|使.*连续)|(?:不能|无法|不可以)(?:通过)?只(?:改|修改|改变)(?:一个)?点值(?:修复|变连续|使.*连续))/.test(s));
  return {version:'continuity-check-r19',valid:!invalid,issues:invalid?['point_value_repair_contradicts_common_finite_limit']:[]};
 }
 if(facts.kind==='finite_samples_counterexample'){
  const points=readPoints(text),issues=[];
  if(/折线/.test(text)&&points.length>=facts.observations.length){
   // Check the example, not an unrelated equation claiming f(1)=1.
   const unique=new Map();let conflict=false;for(const [x,y]of points){if(unique.has(x)&&unique.get(x)!==y)conflict=true;unique.set(x,y);}
   const vertices=[...unique].sort((a,b)=>a[0]-b[0]);
   if(!conflict&&facts.observations.some(([x,y])=>{const value=interpolate(vertices,x);return value!==null&&Math.abs(value-y)>1e-8;}))issues.push('polyline_does_not_match_given_observations');
  }
  return {version:'polyline-check-r18',valid:!issues.length,issues};
 }
 const plain=String(text||'').replace(/\\[()[\]]/g,'').replace(/[\s*]/g,'');
 const first=plain.split(/[。！!\n]/)[0];
 const negative=/^(?:不在|不是图像上的点|(?:点?[A-Z](?:点)?(?:\([^)]*\))?|该点|这个点).{0,12}不在)/.test(first);
 const positive=/^(?:在(?:图像|这|y=|f\()|(?:点?[A-Z](?:点)?(?:\([^)]*\))?|该点|这个点).{0,12}(?<!不)在.{0,40}图像)/.test(first);
 const invalid=facts.onGraph?negative:positive;
 return {version:'explicit-point-check-r18',valid:!invalid,issues:invalid?['point_verdict_disagrees_with_substitution']:[]};
}
function readPoints(text){
 const s=String(text).replace(/\\(?:tfrac|frac)\{(-?\d+)\}\{(\d+)\}/g,(_,a,b)=>String(Number(a)/Number(b))).replace(/\\(?:tfrac|frac)(\d)(\d)/g,(_,a,b)=>String(Number(a)/Number(b))).replace(/\\[()[\]]/g,'').normalize('NFKC').replace(/[−–]/g,'-').replace(/\s/g,'');
 return [...s.matchAll(/\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/g)].map(m=>[Number(m[1]),Number(m[2])]);
}
function interpolate(points,x){for(let i=0;i<points.length;i++){const [a,b]=points[i];if(x===a)return b;if(i&&x<a&&x>points[i-1][0]){const [c,d]=points[i-1];return d+(b-d)*(x-c)/(a-c);}}return null;}
function sampleFacts(question){
 const s=String(question).normalize('NFKC').replace(/[−–]/g,'-').replace(/\s/g,'');if(!/连续/.test(s)||!/递增|上升|单调/.test(s))return null;
 let observations=[];const m=s.match(/在(?:x=)?([\d.,、-]+)处(?:的)?(?:函数)?值(?:分别)?(?:为|是)([\d.,、-]+)/);
 if(m){const numbers=v=>v.split(/[,、]/).filter(Boolean).map(Number),xs=numbers(m[1]),ys=numbers(m[2]);if(xs.length===ys.length)observations=xs.map((x,i)=>[x,ys[i]]);}
 else if(/经过/.test(s))observations=readPoints(question);
 if(observations.length<2||observations.length>8||observations.some(p=>p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e4)))return null;
 observations.sort((a,b)=>a[0]-b[0]);if(new Set(observations.map(p=>p[0])).size!==observations.length)return null;
 const [a,b]=observations[0],[c,d]=observations[1],mid=(a+c)/2;if(!(a<mid&&mid<c))return null;
 const high=Math.max(b,d)+Math.max(1,Math.abs(d-b)),vertices=[[a,b],[mid,high],...observations.slice(1)];
 return {kind:'finite_samples_counterexample',observations,counterexamplePoints:vertices,verification:observations.map(([x,y])=>({x,required:y,actual:interpolate(vertices,x)})),descendingSegment:{from:[mid,high],to:[c,d]},scope:'connect the listed points in this order by straight segments'};
}
function continuityFacts(question){
 const s=String(question||'').normalize('NFKC').replace(/[−–]/g,'-').replace(/\s/g,'');
 // Only explicit finite premises. Do not turn a quoted or uncertain claim
 // about the limits into an established fact.
 if(!/连续|间断|修复|补点/.test(s)||/有人说|他说|声称|是否(?:两侧|左右)|并非|不都|不是都/.test(s))return null;
 const m=s.match(/(?:两侧|左右两侧|左右)(?:都|均)趋近(-?\d+(?:\.\d+)?)(?:且|而|,|，)(?:点值|函数值)(?:为|是|等于)(-?\d+(?:\.\d+)?)(?![\d.])/);
 if(!m)return null;
 const limit=Number(m[1]),pointValue=Number(m[2]);if(Math.max(Math.abs(limit),Math.abs(pointValue))>1e8)return null;
 return {kind:'common_finite_limit_point_value',commonLimit:limit,pointValue,currentContinuous:limit===pointValue,canRepairByPointValue:true,requiredPointValue:limit,scope:'only the explicitly stated current common finite limit and point value'};
}
function questionFacts(q){return pointFacts(q)||sampleFacts(q)||continuityFacts(q);}
function validateQuestionScope(text){
 const claims=String(text||'').split(/[。！？\n]/).filter(s=>/上一题|上道题|前一题/.test(s));
 const invalid=claims.some(s=>{
  // “上一题题干我这里没有” describes missing context, not a claim about
  // that question. Keep this narrow: “上一题题干没有点值” still asserts facts.
  const contextAbsent=/(?:上一题|上道题|前一题)(?:的)?题干(?:我这里|这里|我|目前|当前)?(?:没有|未提供|未给出)(?=[，,；;]|$)/.test(s);
  return !contextAbsent&&!/(?:未|没|没有).{0,12}(?:提供|给出|题干)|不清楚|不(?:能|要|宜|再|应).{0,14}(?:套用|沿用|比较|猜|推断)|需要.{0,12}题干/.test(s);
 });
 return {valid:!invalid,issues:invalid?['unprovided_previous_question_claim']:[]};
}
function validateArithmetic(text){
 // Only check explicit, unqualified binary numerical assertions. Never execute
 // expressions or reinterpret symbolic algebra, estimates, or quoted mistakes.
 const plain=String(text||'').replace(/\\[()[\]]/g,'').replace(/\\(?:times|cdot)/g,'×').replace(/[·⋅∙]/g,'×').replace(/\\div/g,'÷').normalize('NFKC').replace(/[−–]/g,'-');
 const issues=[];
 for(const sentence of plain.split(/[。；;\n]/)){
  if(/[?？]|约|近似|≈|错误|错在|误以为|不是|不等于|不成立|不正确|写错|算错|不能写|“[^”]*[=÷×][^”]*”/.test(sentence))continue;
  const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
  const binary=/(?<![\w.+\-*/^×÷])(-?\d+(?:\.\d+)?)\s*([+\-×÷*/])\s*(-?\d+(?:\.\d+)?)\s*=\s*(-?\d+(?:\.\d+)?)(?![\d.\w+\-*/^×÷])/g;
  for(const match of sentence.matchAll(binary)){
   const a=Number(match[1]),b=Number(match[3]),claimed=Number(match[4]);
   if(Math.max(Math.abs(a),Math.abs(b),Math.abs(claimed))>1e8)continue;
   const expected=match[2]==='+'?a+b:match[2]==='-'?a-b:['×','*'].includes(match[2])?a*b:a/b;
   if(!close(expected,claimed))issues.push('numeric_arithmetic_mismatch');
  }
  // Also cover numerical prose, e.g. “0.4 是 0.8 除以倍率 4 得到的”.
  const prose=/(-?\d+(?:\.\d+)?)\s*(?:是|等于)[^\d。，；!?？\n]{0,18}(-?\d+(?:\.\d+)?)\s*除以[^\d。，；!?？\n]{0,8}(-?\d+(?:\.\d+)?)\s*(?:得到|的结果)/g;
  for(const m of sentence.matchAll(prose))if(!close(Number(m[2])/Number(m[3]),Number(m[1])))issues.push('numeric_arithmetic_mismatch');
 }
 return {valid:issues.length===0,issues:[...new Set(issues)]};
}
function explanation(f){
 if(f.kind==='common_finite_limit_point_value')return f.currentContinuous?`两侧都趋近${f.commonLimit}，点值也为${f.pointValue}，因此该点已经连续，无需改动。`:`可以只改点值。现在两侧都趋近${f.commonLimit}，共同有限极限已经存在；点值${f.pointValue}与它不同。把该点的函数值改成${f.commonLimit}，就能使点值等于共同极限，附近规则无需改变。`;
 if(f.kind==='finite_samples_counterexample')return `不能据此证明整个区间严格上升。依次连接 ${f.counterexamplePoints.map(p=>'('+p.join(', ')+')').join('、')} 得到一条连续折线；它经过题目给出的所有观测点，却在 x=${f.descendingSegment.from[0]} 到 x=${f.descendingSegment.to[0]} 之间下降。有限个点的比较不能代替对整个区间的判断。`;
 return `点 (${f.x}, ${f.y}) ${f.onGraph?'在':'不在'} y=${f.expression} 的图像上。横坐标是输入 x=${f.x}，代入得到 y=${f.computedY}；它与该点的纵坐标 ${f.y} ${f.onGraph?'相同':'不同'}。`;
}
module.exports={pointFacts,sampleFacts,continuityFacts,questionFacts,validateReply,validateQuestionScope,validateArithmetic,explanation};
