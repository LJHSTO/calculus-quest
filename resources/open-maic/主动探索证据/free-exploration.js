(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.FreeExploration=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const version='free-exploration-20261027-v1';
 const points=['GH-01-K01','GH-01-K02','GH-01-K03','GH-02-K01','GH-02-K02','GH-02-K03'];
 const guides=[
  '保持规则不变，比较两个输入和对应输出；再换规则。输入、输出和规则是三个不同的对象。',
  '先看横坐标，再按函数规则确定纵坐标。图像上的点必须满足 y=f(x)，并非任意位置都可以。',
  '始终按 x 从小到大比较函数值。值为负也能上升；小球向左运动时，不能把运动方向当作函数的增减。',
  '比较输入如何趋近与输出如何变化。数表和动画帮助形成猜想，有限几个点不能证明极限。',
  '分别看左侧和右侧趋近的值，再比较是否相等；该点的函数值需要另行判断。',
  '分别检查该点有定义、双侧极限存在、极限等于函数值。图上的缺口大小不是连续性的判据。'
 ];
 const nodeSets=[{n1:'输入',n2:'函数规则',n3:'输出',n4:'具体对应关系'},
  {nx:'横坐标',nf:'纵坐标',nmerge:'有序对',npoint:'函数图像上的点'},
  {n1:'变化方向',n2:'上升',n3:'下降',n4:'不变',n5:'分段变化',n6:'先升后降',n7:'先降后升'},
  {input:'输入',left_seq:'左侧序列',right_seq:'右侧序列',compute:'计算规则',trend:'趋势',func_val:'该点函数值',trap:'常见混淆',insight:'趋势与点值'},
  {n1:'目标函数',n2:'左极限',n3:'右极限',n4:'比较两侧',n5:'双侧极限存在',n6:'双侧极限不存在',n7:'点值与极限'},
  {n1:'连续判定',n2:'函数值有定义',n3:'极限存在',n4:'极限等于函数值',n5:'连续',n6:'极限条件不满足',n7:'可去间断',n8:'该点未定义'}];
 const pick=(selector,values,label)=>({selector,event:'click',values,label});
 const select=(values,label)=>({selector:'#func-select',event:'change',values,label});
 const number=(selector,min,max,step,label,read)=>({selector,event:read?'pointerup':'change',min,max,step,label,read});
 const settings={
  'GH-01-K01:simulation':{rule:pick('[onclick^="applyPreset"]',{linear:'线性规则',square:'平方规则',shift:'平移规则',affine:'仿射规则',cubic:'立方规则'},'函数规则'),input:number('#input_x-slider',-8,8,2,'输入 x')},
  'GH-01-K02:simulation':{rule:pick('[onclick^="applyPreset"]',{linear:'直线',quadratic:'抛物线',sine:'正弦曲线',cubic:'立方曲线'},'图像规则')},
  'GH-01-K03:simulation':{position:number('#canvas',-6.29,6.29,1,'曲线上已观察的 x','#x-display')},
  'GH-02-K01:simulation':{rule:pick('[data-func]',{0:'约分后的线性趋势',1:'sin(x)/x 的趋近',2:'根式的趋近'},'函数例子'),input:number('#x-position-slider',-8,9,.5,'已观察的 x')},
  'GH-02-K02:simulation':{rule:pick('[onclick^="setFunctionType"]',{0:'可去间断',1:'跳跃间断',2:'无穷间断',3:'连续'},'两侧趋势情形')},
  'GH-02-K03:simulation':{point:number('#point_y_coordinate-slider',0,10,1,'函数值 f(2)')},
  'GH-01-K01:visualization3d':{rule:select({linear:'y=x',quadratic:'y=x²',cubic:'y=x³',sine:'y=sin(x)',sqrt:'y=√x',absolute:'y=|x|'},'函数规则')},
  'GH-01-K02:visualization3d':{rule:select({sin:'sin(x)',cos:'cos(x)',square:'x²/5',linear:'x/3',abs:'|x|/3',saw:'锯齿函数'},'立柱的函数规则')},
  'GH-01-K03:visualization3d':{scale:number('#height-slider',.5,3,.5,'正的高度倍数')},
  'GH-02-K01:visualization3d':{input:number('#x-slider',1,50,5,'输入 x')},
  'GH-02-K02:visualization3d':{distance:number('#approach-slider',0,2.05,.4,'两侧趋近距离')},
  'GH-02-K03:visualization3d':{gap:pick('#toggle-gap',{gap:'带有断点的示意',continuous:'连续的示意'},'曲线连接情形')}
 };
 for(let i=0;i<points.length;i++)settings[points[i]+':mindMap']={node:{selector:'[data-id],[data-node-id],g[id^="node-"],.node',event:'click',values:nodeSets[i],label:'已打开的概念节点'}};
 function get(point,scene){const bindings=settings[point+':'+scene];if(!bindings)return null;const i=points.indexOf(point);
  let guide=guides[i];
  if(scene==='visualization3d'&&i===2)guide+=' 高度倍数为正时，截面的高低差会改变，但从左到右的增减方向不因此翻转。重力只影响动画。';
  if(scene==='visualization3d'&&i===3)guide='这里是拓展例子：f(x)=3+1/x，x 越大，1/x 越小，输出靠近3。这是 x→∞，与本节的 x→某个有限点不同。有限观测仍不是证明。';
  if(scene==='visualization3d'&&i===5)guide+=' 此空间曲线是连接性的示意；请用前述三个条件判断实函数在一点的连续性，不能仅凭轨道是否连着下结论。';
  return{bindings,guide,minimum:scene==='mindMap'?3:2};
 }
 function verify(data,point){
  if(data?.task_version!==version||data?.evidence_scope!=='free_exploration_observation'||data.independent!==false||data.knowledge_point_id!==point)return null;
  const config=get(point,data.scene_type),channel=data.parameters?.channel,b=config?.bindings[channel],value=data.parameters?.value;if(!b)return null;
  if(b.values){if(typeof value!=='string'||!Object.hasOwn(b.values,value))return null;return{channel,value,key:value,label:b.values[value]};}
  if(typeof value!=='number'||!Number.isFinite(value)||value<b.min||value>b.max)return null;
  const context=data.parameters?.context;
  if(channel==='input'&&config.bindings.rule&&!Object.hasOwn(config.bindings.rule.values,context))return null;
  if(point==='GH-02-K01'&&data.scene_type==='simulation'&&channel==='input'){
    const ranges={'0':[-1,5],'1':[-8,8],'2':[0,9]},range=ranges[context];
    if(!range||value<range[0]||value>range[1])return null;
  }
  // Bins reject tiny accidental changes; they never represent difficulty or mastery.
  const key=point==='GH-02-K03'&&data.scene_type==='simulation'?(Math.abs(value-4)<.0001?'equal':'unequal'):Math.floor((value-b.min)/b.step);
  return{channel,context:context||'',value,key:String(key),label:(context?config.bindings.rule.values[context]+'，':'')+b.label+' = '+Number(value.toFixed(3))};
 }
 function collect(rows,point,scene,now){
  const config=get(point,scene);if(!config)return null;
  const groups=new Map(),changes=new Map();
  for(const row of [...rows].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at))){
   const p=row.payload||{},d=p.data||{},at=Date.parse(row.created_at);
   if(p.eventType!=='courseware_exploration_observed'||d.scene_type!==scene||!Number.isFinite(at)||at>now||now-at>300000)continue;
   const observation=verify(d,point);if(!observation)continue;
   const group=observation.channel+':'+(observation.context||''),entry={...observation,row,at,group};
   const previous=changes.get(group)||[];
   if(previous.at(-1)?.key!==observation.key)previous.push(entry);changes.set(group,previous);
   const entries=groups.get(group)||[];
   if(!entries.some(e=>e.key===observation.key))entries.push(entry);groups.set(group,entries);
  }
  const found=[...groups.values()].filter(a=>a.length>=config.minimum&&changes.get(a[0].group).at(-1).at-a[0].at>=3000).sort((a,b)=>changes.get(b[0].group).at(-1).at-changes.get(a[0].group).at(-1).at)[0];
  if(!found)return null;
  const selected=found.slice(-config.minimum),latest=changes.get(found[0].group).at(-1),sources=[...selected];
  if(!sources.some(e=>e.row.id===latest.row.id))sources.push(latest);
  return{verified:true,version,scope:point,scene,channel:latest.channel,latestAt:latest.at,observationCount:changes.get(latest.group).length,minimum:config.minimum,
   purpose:'reflection_opportunity',psychologicalState:'unknown',needEstimateApplicable:false,
   text:'刚才你操作查看了'+selected.map(e=>e.label).join('、')+'。',guide:config.guide,
   sources:sources.map(e=>({id:e.row.id,sourceType:'interaction',eventType:'courseware_exploration_observed',capturedAt:e.row.created_at,serverRechecked:true,observation:{channel:e.channel,context:e.context||'',value:e.value,label:e.label}}))};
 }
 return{version,points,get,verify,collect};
});
