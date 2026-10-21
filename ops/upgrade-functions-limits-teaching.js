"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),routePath=path.join(root,"data/multi-scene-learning-route.json");
const route=JSON.parse(fs.readFileSync(routePath,"utf8"));
const chapter=route.chapters.find(c=>c.id==="V14-C1");
const changes=[];
const write=(file,text)=>fs.writeFileSync(file,text,"utf8");
function edit(pointId,type,replacements,extra){
  const point=chapter.modules.flatMap(m=>m.knowledgePoints).find(p=>p.id===pointId);
  const candidate=point.resourceCandidates.find(c=>c.type===type),file=path.join(root,"resources",candidate.root,candidate.file);
  const before=fs.readFileSync(file,"utf8");let after=before;
  for(const [a,b] of replacements)after=after.split(a).join(b);
  if(extra)after=extra(after);
  if(after!==before){write(file,after);changes.push({pointId,type,file:path.relative(root,file)});}
}
edit("GH-02-K01","mindMap",[
  ["⚠ 极限 ≠ 函数值","⚠ 极限不必等于点值"],
  ["趋势 ≠ 点值","趋势与点值分别判断"],
  ['（极限值等于函数值）','（未经判断就断定二者相等）'],
  ['❌ 错误理解：<br>','❌ 错误理解：不分情形，总认为<br>']
]);
edit("GH-02-K01","game",[
  ['<span class="good">✅ 绿色卡片</span>：趋近趋势值（正确！接住它）','卡片外观相同，请根据数表与函数规则判断哪些值接近目标趋势'],
  ['<span class="bad">❌ 红色卡片</span>：干扰值（避开它）','偏离趋势的数值不应选取'],
  ['<span class="bad">⚠️ 橙色卡片</span>：f(a) 陷阱值（避开！极限≠函数值！）','点上的值 f(a) 需要与附近趋势分开判断；二者可以相同，也可以不同'],
  ['极限 ≠ f(a)（函数在 a 点的值）','极限不必等于 f(a)（函数在 a 点的值）'],
  ['函数在某点的值 ≠ 该点的极限！','函数在某点的值不必等于该点的极限！'],
  ["const c = colors[card.type];","const c = { bg: '#334e78', border: '#b5cff5', glow: 'rgba(120,160,220,0.25)' };"]
]);
edit("GH-02-K02","mindMap",[
  ["<strong>🔍 可观察证据</strong>","<strong>试着解释</strong>"],
  ["学生激活了「判定失效」逻辑分支，确认了左右不等导致极限不存在。","左右两侧的有限极限不相等时，为什么没有一个共同的双侧极限？浏览节点后，请用自己的话解释。"]
]);
edit("GH-02-K03","game",[
  ['函数值 = 极限值</','在指定高度补定义</'],
  ['函数值 ≠ 极限值</','此处不取该值</'],
  ['填补断阶</','改动附近曲线</'],
  ['左极限 = 右极限，且该点有定义（实心点），才能连续！','在内点，左右有限极限相等，且等于该点函数值，才连续！'],
  ['实心点 = 函数在该点有定义且连续','实心点只表示函数值有定义；还要检查它是否等于两侧共同极限'],
  ['只需将空心点改为实心点，函数在该点连续。','需在高度3处补定义，函数才在该点连续。'],
  ['左右极限都等于2，放实心点即可连续。','左右极限都等于2，须在高度2处补定义才连续。'],
  ['空心点，左右极限相等，放实心点。','空心点，左右极限均为3，须在高度3处补定义。']
]);
edit("GH-02-K03","game",[],html=>{
  if(html.includes('const localX = (clientX - bounds.left)'))return html;
  return html.replace('    // Check if dropped near any unrepaired hole',
    '    const bounds = canvas.getBoundingClientRect();\n    const localX = (clientX - bounds.left) * w / bounds.width;\n    const localY = (clientY - bounds.top) * h / bounds.height;\n\n    // Check if dropped near any unrepaired hole')
    .replace('(clientX - hx) ** 2 + (clientY - hy) ** 2','(localX - hx) ** 2 + (localY - hy) ** 2')
    .replaceAll('addFloatingText(clientX, clientY - 20','addFloatingText(localX, localY - 20')
    .replaceAll('createSuccessParticles(clientX, clientY)','createSuccessParticles(localX, localY)')
    .replaceAll('createCrashParticles(clientX, clientY)','createCrashParticles(localX, localY)');
});
edit("GH-01-K02","game",[
  ['<span class="star-correct">⭐ 黄色星星</span>（在函数图像上）','满足函数关系的坐标点（先代入核对，再移动收集）'],
  ['<span class="star-wrong">❌ 红色星星</span>（不在函数图像上）','不满足函数关系的坐标点；所有点使用相同颜色'],
  ["'11px Microsoft YaHei'","'14px Microsoft YaHei'"],
  ['⏱ 时间','⏱ 练习用时'],
  ['timeLeft = 60','timeLeft = 0'],
  ['timeLeft += 30','timeLeft += 0'],
  ['timeLeft -= dt;','timeLeft += dt;'],
  ['if (timeLeft <= 0) {','if (false) { // No deadline: this activity is for exploration.']
],html=>html
  .replace(/const glowColor = s\.isCorrect \?[^;]+;/,'const glowColor = `rgba(130, 190, 250, ${a * 0.3})`;')
  .replace(/ctx\.strokeStyle = s\.isCorrect \?[^;]+;/,'ctx.strokeStyle = `rgba(220, 235, 255, ${a * 0.6})`;')
  .replaceAll('rgba(255, 255, 200, ${a})','rgba(220, 235, 255, ${a})')
  .replaceAll('rgba(255, 150, 150, ${a})','rgba(220, 235, 255, ${a})')
  .replaceAll('rgba(255, 221, 87, ${a})','rgba(110, 175, 245, ${a})')
  .replaceAll('rgba(255, 68, 102, ${a})','rgba(110, 175, 245, ${a})')
  .replaceAll('rgba(255, 170, 0, ${a * 0.8})','rgba(55, 100, 175, ${a * 0.8})')
  .replaceAll('rgba(200, 30, 60, ${a * 0.8})','rgba(55, 100, 175, ${a * 0.8})'));
edit("GH-02-K03","mindMap",[
  ['"label": "🚫 无穷间断"','"label": "🚫 此点未定义"'],
  ['"sublabel": "f(a) 无定义且极限→∞"','"sublabel": "需继续判断附近趋势"'],
  ['函数在 x=a 处无定义，且当 x 趋近 a 时，f(x) 趋向无穷大。图像上表现为：铁轨在该点有一个「悬崖」，高度无限上升或下降。例子：f(x) = 1/x 在 x=0 处。','点上未定义不能单独决定间断类型。若两侧有共同有限极限，可以补值；若附近无界或振荡，需另行判断。'],
  ["icon: '∞', title: '无穷间断详解'","icon: '○', title: '未定义不等于无穷间断'"],
  ['函数在该点无定义，且极限趋向无穷大。图像上表现为垂直渐近线。','该点未定义时，先判断附近是否存在共同有限极限；有时只需补一个值，而不是无穷间断。'],
  ['"sublabel": "极限存在 ≠ f(a)"','"sublabel": "共同有限极限与点值不匹配"'],
  ['"label": "🚫 跳跃间断"','"label": "🚫 极限条件不满足"'],
  ['"sublabel": "左极限 ≠ 右极限"','"sublabel": "需再区分跳跃、无界或振荡"'],
  ['当 x 趋近 a 时，左侧趋近一个值，右侧趋近另一个值，两者不相等。图像上表现为：铁轨在该点突然「跳」到一个不同的高度。这是最直观的间断类型。例子：分段函数在不同段的连接点。','双侧有限极限不存在可能有多种原因。两侧分别有有限极限但不相等时，称为跳跃；附近无界或持续振荡是另外的情形。']
]);
edit("GH-02-K03","visualization3d",[
  ['连续 · 平滑','连续 · 无跳跃'],
  ['质点沿曲线平滑滑行，体验“无瞬移”的连续感。旋转视角观察曲线在关键点处是否实心且无错位。','观察附近趋势与点值是否一致。连续不要求光滑，例如 y=|x| 在0处有尖角仍连续。旋转视角仅辅助观察。']
]);

// Keep assessed meaning consistent between the route, original manifest,
// lightweight index, and narration. Changed narration loses its old audioRef
// so it cannot play a recording that contradicts the corrected caption.
function repairQuestion(q){
  if(!q || !(q.sourceId==='GH-01-K02-check-q1'||q.id==='GH-01-K02-check-q1'))return;
  q.options.find(o=>o.value==='C').label='这个点的横坐标和纵坐标可以交换，位置保持不变';
  q.analysis='坐标(4,2)按顺序表示横坐标4、纵坐标2。交换为(2,4)会得到另一个点，因此选B。';
  q.instrumentVersion='functions-limits-formative-r3';
}
function walk(value){
  if(!value||typeof value!=='object')return;
  repairQuestion(value);
  if(value.type==='speech'&&typeof value.text==='string'){
    let text=value.text;
    if(text.includes('它不是‘y等于2’这种答案'))text='函数 f 是对应规则，f(x) 是给定输入时的输出。常函数 f(x)=2 仍然是函数，因为每个合法输入恰好对应一个输出。不同输入可以得到相同的输出。';
    if(text.includes('注意，它可以是任何值'))text='输入必须取自这条函数规则允许的定义域。在当前线性规则中，可以输入2、-5等实数，也可以用字母表示定义域中的未知输入。';
    if(text!==value.text){value.text=text;delete value.audioRef;value.narrationRevision='teaching-review-20261019';}
  }
  if(value.id==='text_MwoPt9wh'){value.top=112;value.height=44;}
  for(const item of Object.values(value))if(item&&typeof item==='object')walk(item);
}
walk(chapter);write(routePath,JSON.stringify(route,null,2)+'\n');
for(const module of chapter.modules){
  for(const filename of ['manifest.json','index.json']){
    const file=path.join(root,'resources',module.source.resourceRoot,filename);
    const data=JSON.parse(fs.readFileSync(file,'utf8'));walk(data);
    // The downloadable manifest and the live HTML must contain the same lesson.
    for(const point of module.knowledgePoints)for(const candidate of point.resourceCandidates){
      const scene=data.scenes?.find(s=>s.order===candidate.sceneOrder);
      if(typeof scene?.content?.html==='string')scene.content.html=fs.readFileSync(path.join(root,'resources',candidate.root,candidate.file),'utf8');
    }
    write(file,JSON.stringify(data,null,2)+'\n');
  }
}
console.log(JSON.stringify({changedHtml:changes,questionRevision:'functions-limits-formative-r3',audioPolicy:'修改口播的旧音频停用，保留原文件'}));
