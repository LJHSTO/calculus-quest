(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ConceptGame=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const titles=['函数分流站','坐标寻宝航线','山地路线拼图','趋近着陆任务','双侧会合港','连续桥维修'];
  function create(kind,round=0){return {kind,round,won:false,attempts:0,moves:0,links:round?[[0],[0,1],[]]:[[0,1],[],[1]],parcel:0,collected:[],segments:[null,null,null],distance:1,point:5,docks:[0,0],right:round?4:2};}
  const rounds=kind=>kind===3?3:2;
  const targetSegments=s=>s.round?[-1,1,0]:[1,0,-1];
  const targets=s=>s.round?[-1,0,1]:[-2,0,2];
  const f=(s,x)=>s.round?-x+1:x+1;
  const epsilon=s=>[.5,.1,.02][s.round];
  const sides=s=>s.round?[2,4]:[2,2];
  function act(s,name,value){
    if(s.won)return;
    if(name==='link'){const [i,j]=value;if(!Number.isInteger(i)||!Number.isInteger(j)||i<0||i>2||j<0||j>1)return;const a=s.links[i],n=a.indexOf(j);n<0?a.push(j):a.splice(n,1);}
    else if(name==='segment'){const [i,v]=value;if(i<0||i>2||![0,1,-1].includes(v))return;s.segments[i]=v;}
    else if(name==='near')s.distance=Math.max(.000001,s.distance/2);
    else if(name==='far')s.distance=Math.min(1,s.distance*2);
    else if(name==='point'&&Number.isInteger(value)&&value>=0&&value<=5)s.point=value;
    else if(name==='dock'){const [i,v]=value;if(![0,1].includes(i)||!Number.isInteger(v)||v<0||v>5)return;s.docks[i]=v;}
    else if(name==='right'&&Number.isInteger(value)&&value>=0&&value<=5)s.right=value;
    else return;
    s.moves++;
  }
  function check(s,position){
    if(s.won)return {correct:true,completed:true,duplicate:true};
    s.attempts++;
    let correct=false,text='';
    if(s.kind===0){correct=s.links.every(a=>a.length===1);text=correct?'每个输入都只有一条去向。不同输入可以去同一个输出。':s.links.some(a=>a.length>1)?'有输入被分到了两个不同输出。先拆掉多余连线，再发车。':'还有输入没有去向。为它接上一条连线。';}
    if(s.kind===1){const x=targets(s)[s.parcel];correct=Array.isArray(position)&&position[0]===x&&position[1]===f(s,x);text=correct?'到达正确坐标，补给已收集。':`这次没找到补给：先横向找到 x=${x}，再按规则确定纵坐标。`;if(correct){s.collected.push(position);s.parcel++;}if(s.parcel===3)text='三个补给点已连成航线：先横坐标，再纵坐标。';}
    if(s.kind===2){correct=s.segments.every((v,i)=>v===targetSegments(s)[i]);text=correct?'路线与每一段要求一致。上升、水平、下降都按从左向右判断。':'路线还不能通行。逐段比较：往右走时，高度应该升高、保持还是降低？';}
    if(s.kind===3){correct=s.distance<epsilon(s);text=correct?'两侧飞船都进入目标带，中心点值并未改变附近的趋向。':'两侧还没全部进入目标带。缩小与 x=1 的距离；改变中心点值不能代替趋近。';}
    if(s.kind===4){correct=s.docks.every((v,i)=>v===sides(s)[i]);text=correct?(s.round?'两个泊位不同：左右极限分别存在，但没有共同的双侧极限。':'两个泊位相同：左右两边趋向同一高度，双侧极限存在。'):'泊位没有对准图中的趋向。分别沿左、右曲线靠近 x=0，空心点不等于中心点值。';}
    if(s.kind===5){correct=s.right===2&&s.point===2;text=correct?'桥已接通：左右趋向相同，而且中心点落在同一高度。':s.right!==2?'右桥与左桥仍有高度差，只移动中心点补不上跳跃。':'左右已经接齐，还需要把中心点放在接缝的高度。';}
    s.won=correct&&(s.kind!==1||s.parcel===3);return {correct,completed:s.won,text};
  }
  return {titles,create,act,check,rounds,targetSegments,targets,f,epsilon,sides};
});
