(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.R8Activities=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const ids=['GH-01-K01','GH-01-K02','GH-01-K03','GH-02-K01','GH-02-K02','GH-02-K03'];
 const guides={
 simulation:[
  '先猜输入增加1时，输出会增加多少，再用滑块比较2x、x+3和x²。每次先固定一条规则，用图上的点和计算过程核对自己的预测。',
  '先选一种函数，代入一两个横坐标算出应有的高度，再启动并拖动橙点验证。吸附容差只是操作辅助；点是否属于图像，仍由公式决定。',
  '先关闭趋势指示器，按横坐标从小到大的顺序观察，再打开提示核对。试着反向拖动：鼠标的移动方向变了，函数在该区间的增减是否改变？',
  '先预测初始函数的输出趋近哪个数，再分别从左右靠近2并减小步长。利用原有数表与预测框验证；最后用x≠2时的规则x+2解释观察，而不只看最后一行。',
  '先比较跳跃情形的两侧读数，再切换到可去间断。分开看运动点当前高度、两侧趋近值和单点取值。δ是输入靠近目标的停止距离，不是输出误差。',
  '先判断紫点应移到哪里，再拖动并检查连续性；随后故意移开一点，观察哪一项条件失效。空心圈的大小只影响显示，不删除邻近输入。'
 ],
 mindMap:[
  '沿输入→规则→输出展开。试着用自己的话说明两条连接：输入受什么限制？规则与一次计算得到的值有什么区别？无需再计算一组固定数字。',
  '从输入和输出找到有序对，再连接到图像点。选一个图上的点，说清先读哪条轴、代入哪个坐标、怎样判断它是否满足规则。',
  '把上升、下降和不变三个分支放在一起比较。再展开复杂变化：说明“找到一个反例”和“证明整个区间的性质”所需的依据为什么不同。',
  '对照输入目标a、附近趋势L与点值f(a)三个节点。把左右数表与规则解释连起来；有限记录是线索，不能独自替代对整个邻域的说明。',
  '先在原有模拟器中输入两个不同的有限数，再改成相同的数。运行判定，沿高亮路径说明是哪一步改变了结论；不要用两侧的平均值代替极限。',
  '沿三层条件逐步展开，说明失败会停在哪一层。对比“没有点值”和“没有共同有限极限”：两者后续可以采取的修复方法是否一样？'
 ],
 visualization3d:[
  '固定一条函数规则，增加采样密度，比较映射线如何变密。旋转视角后再看：新增的是可见样本，不是新的函数规则；有限根线仍不是全部输入。',
  '选f(x)=x/3，依次生成负输入、0和正输入的立柱。比较顶端在零平面的下方、平面上还是上方，再用数值读数核对；柱长与带正负号的输出要分开。',
  '沿黄色的z=0截面选x₁<x₂，比较两个标记的高度，再把第二个点移到别处。观察结论如何随输入对改变；这只能直接说明当前两点的关系。',
  '把输入从10调到50，比较3+1/x与3的距离，再观察侧面投影。数值越来越接近3，却不在有限正输入处等于3；这里考察输入不断增大。',
  '先用俯视图比较输入位置，再切到侧视图比较输出高度。同一组数据为何在一个视角看似重合、另一个视角却分开？用左右极限的读数解释。',
  '切换“只改f(0)”并对照2D视图：绿色附近轨道是否改变，紫色点又怎样移动？用共同极限1与当前点值的关系解释连续性，巡航只用于观察。'
 ],
 game:[
  '两条已知规则通过相同的旧样本。找一个新输入并分别计算，再用这个反例判断有限记录能支持什么结论。',
  '逐点代入规则审核记录。把“计算出的输出”和“给定纵坐标”分开比较，不合格的点再修正。',
  '按关卡约束构造折线。先满足正负位置，再检查每一段的变化方向；试试是否还有另一组有效端点。',
  '第一轮的数表看起来趋近同一个数：找更靠近0的输入检查这个猜测。第二轮则反过来比较不同规则是否可以有相同极限。',
  '先诊断为什么只改点值不能改变跳跃。第二轮分别记录左右极限和原点值，只判断共同极限，不提前做下一知识点的连续修复。',
  '先判断能否只改点值，再说明依据。换一组规则后重新检查三项连续条件，避免照搬前一轮结论。'
 ]};
 const graphics={simulation:['#canvas-container','#canvas-container','.canvas-container','.canvas-wrap','#canvasWrapper','#canvas-container'],mindMap:['#diagram-area','#diagram-area','#diagram-wrap','#svg-container','#diagram-container','#svgContainer']};
 const actions=[['main-btn','reset-btn'],['main-btn','reset-btn'],['main-btn','reset-btn'],['main-btn','reset-btn'],['mainBtn','resetBtn'],['check-btn','start-btn','reset-btn']];
 const activities=Object.fromEntries(ids.flatMap((id,i)=>Object.entries(guides).map(([type,list])=>[id+'-'+type,{point:id,type,guide:list[i],graphic:graphics[type]?.[i],primary:type==='simulation'?actions[i]:[],game:type==='game'}])));
 return {version:'functions-exploration-r8-v1',courseVersion:'functions-limits-exploration-r8-20261106',activities};
});
