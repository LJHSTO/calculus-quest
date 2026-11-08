'use strict';
const crypto = require('node:crypto');
const { variants } = require('./functions-limits-r10');

const version = 'functions-limits-figures-r11-20261107';
const prefix = 'assets/assessment/functions-limits-r11/';
const clean = n => Number(n.toFixed(4));
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const range = (a, b, step = 1) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => clean(a + i * step));
const rulesCaption = '线段或曲线表示图示区间内给定的完整规则；空心位置不取，实心位置取值。';
const definitions = [];
function add(id, definition) { definitions.push({ id, xLabel: 'x', yLabel: 'y', ...definition }); }

for (const [form, p] of Object.entries(variants)) {
  const f = form.toLowerCase(), a = p.a, t = p.t, L = 2 * t + 1, b = p.b;
  add(`${f}-point-membership`, {
    title: '函数曲线与待审核标记', xRange: [0, a + 2], yRange: [0, 2 * a + 6],
    xTicks: range(0, a + 2), yTicks: [0, 2 * a + 1, 2 * a + 3, 2 * a + 5],
    segments: [[[0, 1], [a + 2, 2 * a + 5]]], markers: [{x:a,y:2*a+1,label:'甲'}, {x:a+1,y:2*a+1,label:'乙'}],
    alt: `横轴从0到${a+2}，紫色直线经过(0,1)和(${a+2},${2*a+5})。橙色菱形甲位于(${a},${2*a+1})，乙位于(${a+1},${2*a+1})。菱形是待审核标记。`,
    caption: '紫线表示给定函数；橙色菱形是待审核标记，尚未判定是否属于函数图像。', representation: 'complete_rule_with_candidate_markers'
  });
  add(`${f}-finite-samples`, {
    title: '三个离散观测', xRange:[a-2.5,a+.5], yRange:[a-2.5,a+.5], xTicks:[a-2,a-1,a], yTicks:[a-2,a-1,a],
    samples:[[a-2,a-2],[a-1,a-1],[a,a]], segments:[],
    alt:`只标出三个观测点(${a-2},${a-2})、(${a-1},${a-1})、(${a},${a})，点间没有连线，也未给出未观测部分。`,
    caption:'只给出标记点的观测值；未绘制也未规定点间的变化。',representation:'samples_only'
  });
  add(`${f}-point-and-nearby`, {
    title:'指定输入附近的函数图像', xRange:[t-1.5,t+1.5], yRange:[Math.min(p.c,L-2)-1,Math.max(p.c,L+2)+1],
    xTicks:[t-1,t,t+1],yTicks:[...new Set([p.c,L-2,L,L+2])].sort((x,y)=>x-y),
    segments:[[[t-1,L-2],[t,L]],[[t,L],[t+1,L+2]]],points:[{x:t,y:L,filled:false},{x:t,y:p.c,filled:true}],
    alt:`左线段从(${t-1},${L-2})到(${t},${L})，右线段从(${t},${L})到(${t+1},${L+2})；(${t},${L})为空心位置，(${t},${p.c})为实心点。`,
    caption:rulesCaption,representation:'complete_rule'
  });
  add(`${f}-one-sided`, {
    title:'左右两段与单独标出的点',xRange:[0,2],yRange:[b-1,b+7],xTicks:[0,1,2],yTicks:[b,b+1,b+3,b+6],
    segments:[[[0,b],[1,b+1]],[[1,b+1],[2,b+3]]],points:[{x:1,y:b+1,filled:false},{x:1,y:b+6,filled:true}],
    alt:`左线段从(0,${b})到(1,${b+1})，右线段从(1,${b+1})到(2,${b+3})；(1,${b+1})为空心位置，(1,${b+6})为实心点。`,
    caption:rulesCaption,representation:'complete_rule'
  });
  add(`${f}-corner`, {
    title:'指定点附近的折线',xRange:[a-2.5,a+2.5],yRange:[-.5,3],xTicks:[a-2,a,a+2],yTicks:[0,1,2],
    segments:[[[a-2,2],[a,0],[a+2,2]]],points:[{x:a,y:0,filled:true}],
    alt:`左线段从(${a-2},2)到(${a},0)，右线段从(${a},0)到(${a+2},2)，在(${a},0)有实心点。`,
    caption:rulesCaption,representation:'complete_rule'
  });
}
add('transfer-temperature-samples',{
  title:'每小时记录的温度',xLabel:'时间（小时）',yLabel:'温度（°C）',xRange:[-.3,4.3],yRange:[17,23],xTicks:[0,1,2,3,4],yTicks:[18,19,20,21,22],
  samples:[[0,18],[1,19],[2,20],[3,21],[4,22]],segments:[],
  alt:'五个记录点依次为(0小时,18度)、(1小时,19度)、(2小时,20度)、(3小时,21度)、(4小时,22度)。点间没有连线，未给出其间的温度记录。',
  caption:'图中只画出五次测量；没有画出测量之间的温度变化。',representation:'samples_only'
});
add('transfer-switch',{
  title:'切换时刻附近的设备读数',xLabel:'距切换时刻的时间',yLabel:'读数',xRange:[-2.5,2.5],yRange:[9,18],xTicks:[-2,-1,0,1,2],yTicks:[10,12,13.5,15,17],
  segments:[[[-2,10],[0,12]],[[0,15],[2,17]]],points:[{x:0,y:12,filled:false},{x:0,y:15,filled:false},{x:0,y:13.5,filled:true}],
  alt:'左线段从(-2,10)到(0,12)，右线段从(0,15)到(2,17)；(0,12)与(0,15)是空心位置，(0,13.5)是实心点。',
  caption:rulesCaption,representation:'complete_rule'
});
add('transfer-position',{
  title:'时刻2附近的位置记录',xLabel:'时间 t',yLabel:'位置',xRange:[.5,3.5],yRange:[3,10],xTicks:[1,2,3],yTicks:[4,5,6,9],
  segments:[[[1,4],[2,5]],[[2,5],[3,6]]],points:[{x:2,y:5,filled:false},{x:2,y:9,filled:true}],
  alt:'左线段从(1,4)到(2,5)，右线段从(2,5)到(3,6)；(2,5)为空心位置，(2,9)为实心点。',
  caption:rulesCaption,representation:'complete_rule'
});
add('reg-sensor-initial',{
  title:'传感器在第五分钟附近的读数',xLabel:'时间（分钟）',yLabel:'温度读数（°C）',xRange:[2.5,7.5],yRange:[18,26],xTicks:[3,4,5,6,7],yTicks:[18,20,22,24,25],
  segments:[[[3,19.6],[5,20]],[[5,20],[7,20.4]]],points:[{x:5,y:20,filled:false},{x:5,y:25,filled:true}],
  alt:'左线段从(3,19.6)到(5,20)，右线段从(5,20)到(7,20.4)；(5,20)为空心位置，(5,25)为实心点。',
  caption:rulesCaption,representation:'complete_rule'
});
add('reg-sensor-check',{
  title:'另一传感器在第三分钟附近的读数',xLabel:'时间（分钟）',yLabel:'读数',xRange:[.5,5.5],yRange:[10,14],xTicks:[1,2,3,4,5],yTicks:[10,11,12,13,14],
  segments:[[[1,11],[3,12],[5,13]]],points:[{x:3,y:12,filled:true}],
  alt:'线段依次经过(1,11)、(3,12)、(5,13)，(3,12)为实心点。',
  caption:rulesCaption,representation:'complete_rule'
});
add('reg-junction-initial',{
  title:'两段规则在输入2附近的图像',xRange:[-.3,4.3],yRange:[0,7],xTicks:[0,1,2,3,4],yTicks:[1,3,4,6],
  segments:[[[0,1],[2,3]],[[2,4],[4,6]]],points:[{x:2,y:3,filled:true},{x:2,y:4,filled:false}],
  alt:'左线段从(0,1)到(2,3)，右线段从(2,4)到(4,6)；(2,3)为实心点，(2,4)为空心位置。',
  caption:rulesCaption,representation:'complete_rule'
});
add('reg-junction-check',{
  title:'另一规则在输入4附近的图像',xRange:[1.5,6.5],yRange:[2,8],xTicks:[2,3,4,5,6],yTicks:[3,5,7],
  segments:[[[2,3],[4,5]],[[4,5],[6,3]]],points:[{x:4,y:5,filled:false},{x:4,y:7,filled:true}],
  alt:'左线段从(2,3)到(4,5)，右线段从(4,5)到(6,3)；(4,5)为空心位置，(4,7)为实心点。',
  caption:rulesCaption,representation:'complete_rule'
});

const byId = Object.fromEntries(definitions.map(item => [item.id, item]));
function renderFigure(figure) {
  const g = typeof figure === 'string' ? byId[figure] : figure;
  if (!g) throw new Error('图形编号不存在');
  const [xmin,xmax]=g.xRange,[ymin,ymax]=g.yRange;
  if (![xmin,xmax,ymin,ymax].every(Number.isFinite)||xmin>=xmax||ymin>=ymax) throw new Error('图形范围无效');
  const px=x=>clean(68+(x-xmin)*540/(xmax-xmin)),py=y=>clean(262-(y-ymin)*220/(ymax-ymin));
  const line=(x1,y1,x2,y2,color='#dbe2ed',width=1)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`;
  const text=(x,y,s,extra='')=>`<text x="${x}" y="${y}" ${extra}>${escape(s)}</text>`;
  const bits=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320" role="img" aria-labelledby="${g.id}-title ${g.id}-desc"><title id="${g.id}-title">${escape(g.title)}</title><desc id="${g.id}-desc">${escape(g.alt)}</desc><rect width="640" height="320" fill="white"/><g font-family="Microsoft YaHei,Noto Sans CJK SC,sans-serif" font-size="16" fill="#25334b">`,text(68,24,g.title,'font-weight="600"')];
  for(const x of g.xTicks){bits.push(line(px(x),42,px(x),262),text(px(x),284,x,'text-anchor="middle"'));}
  for(const y of g.yTicks){bits.push(line(68,py(y),608,py(y)),text(57,py(y)+5,y,'text-anchor="end"'));}
  bits.push(line(68,42,68,262,'#475569',1.5),line(68,262,608,262,'#475569',1.5),text(605,309,g.xLabel,'text-anchor="end"'),text(68,39,g.yLabel,'font-size="12"'));
  for(const points of g.segments||[]){if(!points.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)))throw Error('图形坐标无效');bits.push(`<polyline points="${points.map(([x,y])=>`${px(x)},${py(y)}`).join(' ')}" fill="none" stroke="#5b47b5" stroke-width="3"/>`);}
  for(const [x,y] of g.samples||[])bits.push(`<circle cx="${px(x)}" cy="${py(y)}" r="5.5" fill="#b85a10"/>`);
  for(const p of g.points||[])bits.push(`<circle cx="${px(p.x)}" cy="${py(p.y)}" r="6" fill="${p.filled?'#233c64':'white'}" stroke="#233c64" stroke-width="2.5"/>`);
  for(const p of g.markers||[]){const x=px(p.x),y=py(p.y);bits.push(`<path d="M${x} ${y-7}L${x+7} ${y}L${x} ${y+7}L${x-7} ${y}Z" fill="#c66a19"/>`,text(x+11,y-9,p.label,'fill="#97430c" font-weight="600"'));}
  bits.push('</g></svg>');return bits.join('');
}
function publicFigure(id) {
  const g=byId[id];if(!g)throw Error('图形编号不存在');
  return {id,version,src:prefix+id+'.svg',alt:g.alt,caption:g.caption,width:640,height:320,representation:g.representation,sha256:crypto.createHash('sha256').update(renderFigure(g)).digest('hex')};
}
const assetPaths=definitions.map(g=>prefix+g.id+'.svg');
function assets(){return definitions.map(g=>({file:prefix+g.id+'.svg',svg:renderFigure(g),...publicFigure(g.id)}));}
module.exports={version,prefix,byId,publicFigure,renderFigure,assetPaths,assets};
