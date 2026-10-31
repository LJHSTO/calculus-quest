'use strict';
const fs=require('node:fs'),path=require('node:path'),M=require('../resources/open-maic/函数极限混合探索/game-model');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'resources/open-maic/函数极限混合探索'),routeFile=path.join(root,'data/multi-scene-learning-route.json');
const route=JSON.parse(fs.readFileSync(routeFile,'utf8')),points=route.chapters.find(c=>c.id==='V14-C1').modules.flatMap(m=>m.knowledgePoints);
const css=fs.readFileSync(path.join(dir,'game.css'),'utf8'),js=['game-model.js','game-ui.js'].map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
// Refresh the embedded UI without replacing reviewed semantic contracts.
if(process.argv.includes('--ui-only')){
 const ui=fs.readFileSync(path.join(dir,'game-ui.js'),'utf8');
 for(const p of points){const file=path.join(dir,p.id+'.html'),old=fs.readFileSync(file,'utf8');
  const pattern=/\(function\(\)\{\s*'use strict';\s*const cfg=[\s\S]*?(?=<\/script>\s*<\/body>)/;
  if(!pattern.test(old))throw Error('找不到内嵌游戏界面：'+p.id);
  fs.writeFileSync(file,old.replace(pattern,()=>ui));
 }
 console.log('六个游戏界面已同步；语义契约、课程和用户数据保持原状。');process.exit(0);
}
const leads=['连接和拆除运输线路，让每个输入有唯一输出。','在坐标棋盘上寻找补给，并连接函数航线。','选择坡道拼成指定趋势的山地路线。','缩小两侧距离，让飞船进入越来越窄的目标带。','沿左右曲线设置泊位，比较两侧的会合高度。','调整桥身接缝与中心点，让路线连续通过。'];
for(const [gameKind,p]of points.entries()){
 const file=path.join(dir,p.id+'.html'),old=fs.readFileSync(file,'utf8');
 const contract=JSON.parse(old.match(/id="openmaic-semantic-contract">([\s\S]*?)<\/script>/)[1]);
 Object.assign(contract,{contract_revision:'2026-10-27',course_version:'concept-games-20261027-v3',resource_title:M.titles[gameKind],observable_evidence:'具体路线构建、坐标定位、接缝操作及实际任务判定；不把点击数量或完成游戏视为独立掌握。'});
 const cfg={id:p.id,gameKind,title:M.titles[gameKind]};
 fs.writeFileSync(file,`<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${cfg.title}</title><style>${css}</style><script type="application/json" id="openmaic-semantic-contract">${JSON.stringify(contract)}</script><style id="functions-limits-reduced-motion">@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0s!important;animation-iteration-count:1!important;transition-duration:0s!important}}</style></head><body><main><header><h1>${cfg.title}</h1><span id="progress"></span></header><p id="mission"></p><div class="game-layout"><section class="board" id="board" aria-label="游戏操作画布"></section><section><div id="tools"></div><p id="result" role="status"></p></section></div><section class="support-anchor" data-cq-support-anchor></section><p class="learning-note">${p.goal} 游戏不计入测验成绩；可以根据反馈调整，再次尝试。</p></main><script type="application/json" id="lesson">${JSON.stringify(cfg)}</script><script>${js}</script></body></html>\n`);
 const c=p.resourceCandidates.find(c=>c.type==='game');Object.assign(c,{title:cfg.title,description:leads[gameKind],teachingActions:[{id:p.id+'-game-intro',type:'speech',text:leads[gameKind]+' 阅读任务说明后动手尝试；遇到反馈时，可以调整方案。'}]});
}
fs.writeFileSync(routeFile,JSON.stringify(route,null,2)+'\n');console.log('六个游戏已生成；保留讲解、模拟、概念图和三维课件。');
