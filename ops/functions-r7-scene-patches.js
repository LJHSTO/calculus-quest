'use strict';
const assert=require('node:assert/strict'),{createRequire}=require('node:module');
// OpenMAIC 工具链需事先安装 typescript；路径由调用方显式提供。
assert.ok(process.env.OPENMAIC_ROOT,'请设置 OPENMAIC_ROOT，指向已安装依赖的 OpenMAIC 源码目录');
const ts=createRequire(require('node:path').resolve(process.env.OPENMAIC_ROOT,'package.json'))('typescript');
function scripts(html,change){return html.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g,(whole,attr,code)=>/(?:importmap|application\/json|src=)/.test(attr)?whole:`<script${attr}>${change(code)}</script>`);}
function body(html,name,newBody,append=false){let hits=0;html=scripts(html,code=>{const sf=ts.createSourceFile('page.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[];function walk(n){let b;if(ts.isFunctionDeclaration(n)&&n.name?.text===name)b=n.body;if(ts.isVariableDeclaration(n)&&n.name.getText(sf)===name&&n.initializer&&ts.isFunctionExpression(n.initializer))b=n.initializer.body;if(ts.isBinaryExpression(n)&&ts.isPropertyAccessExpression(n.left)&&n.left.expression.getText(sf)==='window'&&n.left.name.text===name&&ts.isFunctionExpression(n.right))b=n.right.body;if(b){hits++;let a=b.getStart(sf),z=b.end;if(append){const t=b.statements.find(ts.isTryStatement);assert(t,'initScene requires try block');a=t.tryBlock.end-1;z=a;edits.push([a,z,newBody.trim()+'\n']);}else edits.push([a,z,'{\n'+newBody.trim()+'\n}']);return;}ts.forEachChild(n,walk);}walk(sf);for(const [a,z,s]of edits.sort((a,b)=>b[0]-a[0]))code=code.slice(0,a)+s+code.slice(z);return code;});assert.equal(hits,1,'function patch '+name);return html;}
function config(html,change){let n=0;html=html.replace(/(<script[^>]*id="widget-config"[^>]*>)([\s\S]*?)(<\/script>)/,(all,a,b,c)=>{n++;const data=JSON.parse(b);change(data);return a+JSON.stringify(data).replace(/</g,'\\u003c')+c;});assert.equal(n,1);return html;}
function literal(html,from,to){assert(html.includes(from),'missing literal: '+from.slice(0,80));return html.split(from).join(to);}
function patch(html,id){const notes=[];function note(s){notes.push(s);}
 if(id==='GH-02-K01-game'){
  html=config(html,c=>Object.assign(c.levels[0],{initialSamples:[.1,.01],candidates:[.1,.001,-.01],correctPoint:.001,ruleB:'0 < |x| < 0.005 ? x + 5 : x + 3'}));
  let n=0;html=html.replace(/outB = x < 2 \? x \+ 3 : 2 \* x \+ 1;/g,()=>{n++;return 'outB = Math.abs(x)>0 && Math.abs(x)<0.005 ? x+5 : x+3;';});assert.equal(n,2);
  html=literal(html,'<strong>规则甲：</strong> 输出 = 输入 + 3<br><strong>规则乙：</strong> 输入 &lt; 2 时输出 = 输入 + 3；输入 ≥ 2 时输出 = 2 × 输入 + 1','<strong>目标：</strong>输入从两侧靠近0。<br><strong>规则甲：</strong>输出=x+3。<br><strong>规则乙：</strong>0&lt;|x|&lt;0.005时输出=x+5，其余输入输出=x+3。');
  html=literal(html,'未限定规则范围时，只观察到有限个输入的输出相同，能够得出什么结论？','最初两行读数都接近3，但更靠近0时出现了差异。结合两条完整规则，哪项判断成立？');
  html=literal(html,'A. 有限个相同样本不足以证明两条规则处处相同','A. 初始数表不足以证明共同极限；根据规则，甲趋近3、乙趋近5');
  html=literal(html,'B. 只要相同样本足够多，就能证明规则完全相同','B. 只要列出足够多的有限样本，就能证明极限相同');
  html=literal(html,'C. 已给样本相同，所以其他输入的输出也一定相同','C. 两条规则在0的取值都是3，所以两者的极限都是3');
  html=literal(html,'未限定规则范围时，有限个相同样本不足以证明两条规则处处相同。','初始样本没有进入0<|x|<0.005这个更小范围。附近按x+3或x+5变化，分别趋近3和5；有限数表的表象不能代替规则依据。');
  html=literal(html,'未限定规则范围时，可以另造一条在这些点相同、在其他点不同的规则。','再多的有限读数也可能漏掉更近的输入。请检查0<|x|<0.005时分别采用哪条公式。');
  html=literal(html,'在已给两点相同只说明暂时无法区分，样本外的点已经显示不同。','x=0的单点取值不决定极限；附近输出按各自的规则计算。');
  html=literal(html,'有限样本相同，不能推出一般规则唯一。','有限数表不能单独证明极限；不同规则也可能有相同极限。');
  html=literal(html,'openmaic-games-20261104-v2','openmaic-games-exploration-r8-v1');note('第一轮改为逼近0的有限采样反例，第二轮保留不同规则同极限的对照');
 }
 if(id==='GH-02-K02-game'){
  html=literal(html,'第二轮：换数据判断能否修复','第二轮：极限与原点值分开记录');html=literal(html,'应将点值改为','原式在x=2处的点值');
  html=literal(html,'第四步：修复方案','第四步：改变哪一部分');
  html=literal(html,'左右同为3，只需使点值也为3','共同极限为3；原点值7不改变两侧趋势');html=literal(html,'任何不连续点都只能改规则','因为原点值是7，所以双侧极限也必须是7');
  html=literal(html,'第二轮：可修复的新规则','第二轮：共同极限与单点取值');html=literal(html,'你成功诊断了跳跃的原因并找到了修复方案。','你已区分两侧趋势与点值；下一知识点再判断什么时候能够修复连续性。');
  html=body(html,'finishGame',`const l=Number(document.getElementById('new-left').value),r=Number(document.getElementById('new-right').value),f=Number(document.getElementById('new-fix').value),reason=document.getElementById('new-reason').value;
   if(['new-left','new-right','new-fix'].some(id=>!document.getElementById(id).value.trim())||![l,r,f].every(Number.isFinite)||!reason){document.getElementById('transfer-feedback').textContent='请分别记录两侧趋近值和原点值，再选择理由。';return;}
   const ok=l===3&&r===3&&f===7&&reason==='A';CQ.attempt(ok,'极限与原点值区分',{task:'limit_point',round:1,values:[l,r,f,reason]});
   if(!ok){document.getElementById('transfer-feedback').textContent='先分别代入两侧的规则，找共同趋近值；再单独读取题目给定的f(2)。本轮不修改点值。';return;}
   const completion=CQ.complete();showScreen('result-screen');updateProgress(100);document.getElementById('final-score').innerText='两组判断完成';document.getElementById('finish-type').innerText='本组：'+completion+'；共同极限3，原点值7。';`);
  html=literal(html,'openmaic-games-20261102-v1','openmaic-games-exploration-r8-v1');note('第二轮保留点值7，仅判断共同极限，移除与下一知识点重复的补值练习');
 }
 if(id.endsWith('-game')){let count=0;html=scripts(html,code=>{const sf=ts.createSourceFile('game.js',code,ts.ScriptTarget.Latest,true),edits=[];function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='setTimeout'&&/showScreen|initLevel|showResult/.test(n.arguments[0]?.getText(sf)||'')){edits.push([n.getStart(sf),n.end,'window.R7Continue('+n.arguments[0].getText(sf)+')']);count++;return;}ts.forEachChild(n,walk);}walk(sf);for(const [a,z,text]of edits.sort((a,b)=>b[0]-a[0]))code=code.slice(0,a)+text+code.slice(z);return code;});if(count)note('反馈保留到学生主动继续，不再1–2.5秒后自动跳过');}
 if(id==='GH-01-K02-visualization3d'){
  html=literal(html,'h = Math.max(0, h);','// Preserve signed output; geometry length alone is nonnegative.');html=literal(html,'if (h > 7) h = 7;','// Do not replace larger outputs with a display cap.');html=literal(html,'const geo = new THREE.BoxGeometry(w, h, w);','const geo = new THREE.BoxGeometry(w, Math.abs(h), w);');html=literal(html,'const hue = 0.6 - (h / 7) * 0.6;','const hue = 0.6 - Math.min(Math.abs(h)/7,1)*0.6;');
  html=literal(html,'currentHeight: 0','currentHeight: animated ? 0 : h');html=literal(html,'if (current < target) {','if (Math.abs(current-target)>1e-9) {');html=literal(html,'const newH = Math.min(current + increment, target);','const newH = current + Math.sign(target-current)*Math.min(increment,Math.abs(target-current));');html=literal(html,'newH + 0.6','newH + (target<0 ? -.6 : .6)');
  html=body(html,'initScene',`
   groundMat.transparent=true;groundMat.opacity=.24;groundMat.depthWrite=false;
   const exact=document.createElement('div');exact.className='r7-marker';exact.innerHTML='<label>精确输入x <input id="r7-input-x" aria-label="生成立柱的输入" type="number" min="-11" max="11" step="0.1" value="-3" style="width:80px"></label><button id="r7-create-pillar" type="button">生成立柱</button>';document.getElementById('controls').prepend(exact);document.getElementById('r7-create-pillar').addEventListener('click',()=>{const el=document.getElementById('r7-input-x');if(!el.reportValidity()||el.value.trim()==='')return;const x=Number(el.value);const old=pillars.find(p=>Math.abs(p.userData.xVal-x)<1e-8);if(old)removePillar(old);createPillar(x,currentFunc);});
  `,true);note('修复负输出被截成0和大输出被截成7；保留立柱外观，增加精确输入与透明零平面');
  html=html.replaceAll('立柱的高度 <strong>f(x)</strong>','立柱顶端的纵坐标 <strong>f(x)</strong>');
 }
 if(id==='GH-01-K03-mindMap'){html=config(html,c=>{c.nodes.find(n=>n.id==='n2').details='在所讨论的区间内，任取x₁&lt;x₂，若总有f(x₁)&lt;f(x₂)，就称严格上升。要比较的是输出大小，不是输出正负。';c.nodes.find(n=>n.id==='n3').details='在所讨论的区间内，任取x₁&lt;x₂，若总有f(x₁)>f(x₂)，就称严格下降。一个符合顺序的输入对，还不能证明整个区间。';c.nodes.find(n=>n.id==='n5').note='先确定讨论区间，再结合完整规则判断。有限样本只能显示已观测位置；连续的曲线也可能在样本之间起伏。';});note('保留节点布局，补全区间量词及有限样本限制');}
 if(id==='GH-02-K01-mindMap'){html=config(html,c=>{const node=n=>c.nodes.find(x=>x.id===n);node('compute').details=node('compute').details.replace('不要求 x = a','只考察 x ≠ a 的邻近输入');node('trend').details="<div class='detail-title'>从数表线索到规则解释</div><div class='detail-body'><p>数表中两侧输出都接近4，这是观察到的线索。</p><div class='formula'>当x≠2时，(x²−4)/(x−2)=x+2。</div><p>由规则可知，输出与4的距离恰好等于输入与2的距离。因此两侧输入足够接近2时，输出可以任意接近4。</p><p>只检查有限个输入还不能排除未观测位置的变化。这里的结论同时依据了对邻近输入都适用的规则。</p><p>极限不是最大值或最低点，也不要求函数值永远不等于极限。常函数的输出可以一直等于极限。</p></div>";});note('删除极限等于最低点的错误比喻；区分有限数表与规则论证');}
 if(id==='GH-02-K03-mindMap'){html=config(html,c=>{c.nodes.find(n=>n.id==='n1').details='这里讨论定义域内点的连续性。依次检查点值有定义、共同有限极限存在、两者相等。端点要按定义域允许的方向另作判断。';c.nodes.find(n=>n.id==='n3').details='从左右两侧靠近a时，输出分别趋近的两个数必须有限并且相等。两侧都无界，并不等于存在共同有限极限。';c.nodes.find(n=>n.id==='n5').details='三个条件都满足，所以函数在a处连续。连续不要求光滑：例如f(x)=|x|在0有尖角，但左右极限和点值都是0。';c.nodes.find(n=>n.id==='n6').details='左右有限极限不等是跳跃。1/x在0附近无界；sin(1/x)在0附近没有共同趋近值。注意，并非所有振荡都破坏极限，例如x·sin(1/x)在0附近趋近0。';c.edges.find(e=>e.from==='n3'&&e.to==='n6').label='❌ 无共同有限极限';});note('漏斗保留；补上有限性、尖角及间断类型的准确条件');}
 if(id==='GH-02-K01-simulation'){
  html=literal(html,'if (Math.abs(x - 2) < 1e-10) return NaN;','if (x === 2) return NaN;');html=literal(html,'return (x * x - 4) / (x - 2);','return x + 2;');html=literal(html,'if (Math.abs(x) < 1e-10) return NaN;','if (x === 0) return NaN;');html=literal(html,'if (Math.abs(x - 4) < 1e-10) return NaN;','if (x === 4) return NaN;');html=literal(html,'return (Math.sqrt(x) - 2) / (x - 4);','return 1 / (Math.sqrt(x) + 2);');note('仅排除真正无定义的点；避免邻域误删与相消误差');
 }
 if(id==='GH-02-K02-mindMap'){
  html=literal(html,"parseFloat(document.getElementById('sim-left').value)","(document.getElementById('sim-left').value.trim() ? Number(document.getElementById('sim-left').value) : NaN)");html=literal(html,"parseFloat(document.getElementById('sim-right').value)","(document.getElementById('sim-right').value.trim() ? Number(document.getElementById('sim-right').value) : NaN)");html=literal(html,'isNaN(leftVal) || isNaN(rightVal)','!Number.isFinite(leftVal) || !Number.isFinite(rightVal) || Math.abs(leftVal)>1000 || Math.abs(rightVal)>1000');note('拒绝空白、无穷与部分可解析字符串；仅比较有效有限实数');
 }
 if(id==='GH-02-K02-simulation'){html=html.replaceAll('ε','δ');note('停止阈值是输入距离δ，避免与输出误差ε混淆');}
 if(id==='GH-02-K03-simulation'){
  html=body(html,'f','return x === holeX ? NaN : x + 2;');
  html=body(html,'drawCurve',`ctx.strokeStyle='#60a5fa';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(toCanvasX(xMin),toCanvasY(xMin+2));ctx.lineTo(toCanvasX(xMax),toCanvasY(xMax+2));ctx.stroke();const radius=5+state.gap_width*3;ctx.beginPath();ctx.arc(toCanvasX(holeX),toCanvasY(holeY),radius,0,Math.PI*2);ctx.fillStyle='#0f172a';ctx.fill();ctx.strokeStyle='#fbbf24';ctx.lineWidth=2;ctx.stroke();`);
  html=body(html,'drawMatchLine','');
  html=html.replace(/setTimeout\(\(\) => \{\s*banner.className = ['"]feedback-banner['"];\s*\}, 3500\);/,'// Keep feedback until the point changes.');
  html=html.replace(/缺口宽度/g,'空心圈大小（仅显示）').replace(/裂缝宽度/g,'空心圈大小（仅显示）').replace(/缝隙宽度/g,'空心圈大小（仅显示）').replace(/宽缺口/g,'放大空心圈');note('可去间断只缺一个点；取消错误删除一段定义域，保留拖点补值与原配色');
 }
 if(id==='GH-01-K03-visualization3d'){
  html=body(html,'initScene',`
   const sectionGeometry=new THREE.BufferGeometry(),sectionLine=new THREE.Line(sectionGeometry,new THREE.LineBasicMaterial({color:0xffd166,depthTest:false}));sectionLine.renderOrder=9;scene.add(sectionLine);
   const firstMarker=new THREE.Mesh(new THREE.SphereGeometry(.18,16,16),new THREE.MeshBasicMaterial({color:0x63b3ff}));scene.add(firstMarker);
   const taskControls=document.createElement('div');taskControls.className='r7-marker';taskControls.innerHTML='<label>x₁ <input id="r7-first" aria-label="截面第一个输入" type="range" min="-7" max="7" step="0.1" value="-3"></label><label>x₂ <input id="r7-second" aria-label="截面第二个输入" type="range" min="-7" max="7" step="0.1" value="2"></label><output id="r7-pair"></output>';document.getElementById('controls').prepend(taskControls);
   function updateSection(){isSliding=false;ballState.active=false;const first=Number(document.getElementById('r7-first').value),second=Number(document.getElementById('r7-second').value),a=getTerrainHeight(first,0),b=getTerrainHeight(second,0);sectionGeometry.setFromPoints(Array.from({length:161},(_,i)=>{const x=-8+i/10;return new THREE.Vector3(x,getTerrainHeight(x,0)+.035,0);}));firstMarker.position.set(first,a+.18,0);ball.position.set(second,b+ballRadius,0);window.R7SceneContext={first,second,scale:terrainHeightScale};document.getElementById('r7-pair').textContent='固定z=0：x₁='+first.toFixed(1)+'，f(x₁)='+a.toFixed(3)+'；x₂='+second.toFixed(1)+'，f(x₂)='+b.toFixed(3)+(first>=second?'。请把x₁调到x₂左边。':'');document.getElementById('status-x').textContent=second.toFixed(2);document.getElementById('status-fx').textContent=b.toFixed(3);document.getElementById('status-dir').textContent='请比较两个有序输入的高度';window.dispatchEvent(new Event('r7-state'));}
   ['r7-first','r7-second','height-slider'].forEach(id=>document.getElementById(id).addEventListener('input',updateSection));document.getElementById('reset-btn').addEventListener('click',updateSection);document.getElementById('start-btn').style.display='none';document.getElementById('gravity-slider').parentElement.style.display='none';['status-slope','status-speed'].forEach(id=>document.getElementById(id).parentElement.style.display='none');document.getElementById('status-dir').parentElement.style.display='none';updateSection();
  `,true);note('保留原三维地形与镜头；用固定截面和两个有序输入替代自由落球');
 }
 if(id==='GH-02-K03-visualization3d'){
  html=literal(html,"canvas2D.style.display = show2D ? 'block' : 'none';","canvas2D.style.setProperty('display',show2D?'block':'none','important');");
  html=body(html,'curvePoint','const x=10*t-5;return new THREE.Vector3(x,x*x/5+1,0);');
  html=body(html,'generateCurvePoints','return [Array.from({length:201},(_,i)=>curvePoint(i/200))];');
  html=body(html,'createRibbon',`const group=new THREE.Group();for(const points of generateCurvePoints()){const curve=new THREE.CatmullRomCurve3(points);group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,200,.08,8,false),new THREE.MeshPhongMaterial({color:0x22c55e,emissive:0x0a3a1a,shininess:40})));}const ring=new THREE.Mesh(new THREE.TorusGeometry(.18,.04,8,32),new THREE.MeshBasicMaterial({color:0xfbbf24,depthTest:false}));ring.position.set(0,1,.15);ring.renderOrder=10;group.add(ring);if(hasGap){const hole=new THREE.Mesh(new THREE.CircleGeometry(.14,24),new THREE.MeshBasicMaterial({color:0x0a0a1a,depthTest:false,side:THREE.DoubleSide}));hole.position.set(0,1,.14);hole.renderOrder=9;group.add(hole);}const point=new THREE.Mesh(new THREE.SphereGeometry(.20,24,16),new THREE.MeshPhongMaterial({color:0xb792ff,emissive:0x442266}));point.position.set(0,hasGap?3:1,.2);group.add(point);const axes=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-5.5,0,0),new THREE.Vector3(5.5,0,0),new THREE.Vector3(0,0,0),new THREE.Vector3(0,6.5,0)]);group.add(new THREE.LineSegments(axes,new THREE.LineBasicMaterial({color:0x94a3b8})));window.R7SceneContext={altered:hasGap};window.dispatchEvent(new Event('r7-state'));return group;`);
  html=body(html,'updateProbe',`const pos=curvePoint(t);probe.position.copy(pos);document.getElementById('status-text').textContent='两侧极限=1；f(0)='+(hasGap?3:1)+'；黄点为附近公式的巡航标记';document.getElementById('status-text').style.color=hasGap?'#fbbf24':'#22c55e';isWarning=false;warningIntensity=0;`);
  html=body(html,'draw2D',`const w=canvas2D.width,h=canvas2D.height;ctx2D.fillStyle='#0f0f2a';ctx2D.fillRect(0,0,w,h);const X=x=>30+(x+5)/10*(w-60),Y=y=>h-25-y/7*(h-55);ctx2D.strokeStyle='#94a3b8';ctx2D.beginPath();ctx2D.moveTo(X(-5),Y(0));ctx2D.lineTo(X(5),Y(0));ctx2D.moveTo(X(0),Y(0));ctx2D.lineTo(X(0),Y(7));ctx2D.stroke();ctx2D.strokeStyle='#22c55e';ctx2D.lineWidth=2;ctx2D.beginPath();for(let i=0;i<=200;i++){const x=-5+i/20,y=x*x/5+1;if(!i)ctx2D.moveTo(X(x),Y(y));else ctx2D.lineTo(X(x),Y(y));}ctx2D.stroke();ctx2D.fillStyle='#0f0f2a';ctx2D.strokeStyle='#fbbf24';ctx2D.beginPath();ctx2D.arc(X(0),Y(1),5,0,Math.PI*2);ctx2D.fill();ctx2D.stroke();ctx2D.fillStyle='#b792ff';ctx2D.beginPath();ctx2D.arc(X(0),Y(hasGap?3:1),5,0,Math.PI*2);ctx2D.fill();ctx2D.font='12px sans-serif';ctx2D.fillText('x≠0：y=x²/5+1；紫点：f(0)='+(hasGap?3:1),10,18);ctx2D.fillStyle='#94a3b8';ctx2D.fillText('x',w-18,h-10);ctx2D.fillText('0',X(0)+4,h-10);`);
  html=html.replaceAll('⚡ 插入断点','只改 f(0)=3').replaceAll('🔗 修复断点','恢复 f(0)=1');html=literal(html,'const gapSize = 0.15;','const gapSize = 0;');
  html=literal(html,'空间轨迹仅用于直观演示连接与断开，不能代替实函数连续性的判断。实函数在一点连续，要核对该点附近的极限与点值。','绿色轨道表示附近规则，紫点表示单独规定的f(0)。先读两个数，再用连续的三个条件判断。空心圈标出附近趋近的高度。');
  html=body(html,'initScene',"statusLightGroup.visible=false;document.getElementById('status-dot').style.background='#94a3b8';document.getElementById('status-dot').style.boxShadow='none';",true);
  note('保留轨道外观、巡航、镜头和2D切换；改为同一函数的两种视图，独立显示单点取值');
 }
 return {html,notes};
}
module.exports={patch,scripts,body,config,literal};
