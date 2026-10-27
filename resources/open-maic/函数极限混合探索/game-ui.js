(function(){
  'use strict';
  const cfg=JSON.parse(document.querySelector('#lesson').textContent),M=ConceptGame;
  let s=M.create(cfg.gameKind),feedback='',selectedSegment=0;
  const board=document.querySelector('#board'),tools=document.querySelector('#tools'),result=document.querySelector('#result');
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
  const emit=(type,data)=>window.OpenMaicLearningEvidence?.emit(type,{...data,independent:false,game_version:'concept-games-20261027-v3'});
  function button(label,fn,selected=false){const b=el('button',label);b.type='button';b.onclick=fn;if(selected)b.setAttribute('aria-pressed','true');return b;}
  function change(name,value){M.act(s,name,value);feedback='';emit('parameter_commit',{parameter:name,value,round:s.round});draw();}
  function verify(position){const before=structuredClone(s),r=M.check(s,position);if(r.duplicate)return;feedback=r.text;
    window.OpenMaicLearningEvidence?.recordChallenge({challenge_id:cfg.id+'-game-r'+s.round+(s.kind===1?'-p'+before.parcel:''),is_correct:r.correct,independent:false,attempt_number:s.attempts,response:position||before,parameters:before,evidence_scope:'assisted_game_attempt',feedback_version:'concept-games-20261027-v3'});
    if(r.completed)emit('task_progress',{stage:'round_complete',round:s.round,completed:true});draw();
  }
  const X=x=>210+x*48,Y=y=>260-y*38;
  function svg(paths=[],dots=[],extras=''){return `<svg viewBox="0 0 430 360" role="img" aria-label="当前路线和坐标"><path d="M20 ${Y(0)}H415M${X(0)} 22V340" stroke="#a9b5c8"/>${[-3,-2,-1,0,1,2,3].map(x=>`<text x="${X(x)}" y="${Y(0)+20}" text-anchor="middle">${x}</text>`).join('')}${[-1,1,2,3,4,5].map(y=>`<text x="${X(0)-10}" y="${Y(y)+5}" text-anchor="end">${y}</text>`).join('')}<text x="414" y="${Y(0)-10}">x</text><text x="222" y="20">y</text>${extras}${paths.map((p,i)=>`<path d="${p}" fill="none" stroke="${i?'#14827c':'#6952c9'}" stroke-width="4"/>`).join('')}${dots.map(([x,y,hollow])=>`<circle cx="${X(x)}" cy="${Y(y)}" r="7" fill="${hollow?'white':'#eaa931'}" stroke="#483676" stroke-width="2"/>`).join('')}</svg>`;}
  function range(label,value,callback){const wrap=el('label',label+'：'+value),input=el('input');input.type='range';input.min=0;input.max=5;input.step=1;input.value=value;input.setAttribute('aria-label',label);input.oninput=()=>{wrap.firstChild.textContent=label+'：'+input.value;};input.onchange=()=>callback(Number(input.value));wrap.append(input);return wrap;}
  function draw(){
    const focusKey=document.activeElement?.getAttribute('data-focus');
    board.replaceChildren();tools.replaceChildren();result.textContent=feedback;document.querySelector('#progress').textContent=`任务 ${s.round+1} / ${M.rounds(s.kind)}${s.won?' · 已完成':''}`;
    const intro=document.querySelector('#mission');
    if(s.kind===0){intro.textContent='修好分流站：每个输入必须有且只有一条去向。点击连线格可以接线或拆线，修好后发车。';
      board.innerHTML=`<svg viewBox="0 0 430 300" role="img" aria-label="三个输入与两个输出的对应连线">${s.links.map((a,i)=>a.map(j=>`<path d="M90 ${55+i*95}L340 ${95+j*120}" stroke="#6952c9" stroke-width="3"/>`).join('')).join('')}${[0,1,2].map(i=>`<circle cx="70" cy="${55+i*95}" r="24" fill="#eee9ff"/><text x="70" y="${61+i*95}" text-anchor="middle">${i+1}</text>`).join('')}${[0,1].map(j=>`<rect x="320" y="${70+j*120}" width="64" height="50" rx="12" fill="#e1f4ef"/><text x="352" y="${101+j*120}" text-anchor="middle">${j?4:2}</text>`).join('')}</svg>`;
      for(let i=0;i<3;i++){const row=el('div');row.className='choice-row';row.append(el('strong','输入 '+(i+1)));for(let j=0;j<2;j++){const on=s.links[i].includes(j);const b=button(`${i+1} → ${j?4:2}${on?' · 已连':''}`,()=>change('link',[i,j]),on);b.dataset.link=`${i}-${j}`;row.append(b);}tools.append(row);}tools.append(button('发车检查',()=>verify()));
    }else if(s.kind===1){const target=M.targets(s)[Math.min(s.parcel,2)];intro.textContent=`沿 ${s.round?'y=−x+1':'y=x+1'} 寻宝。${s.won?'航线已完成。':`下一件补给的横坐标是 ${target}，请在坐标棋盘上点击它的位置。`}`;
      const grid=el('div');grid.className='coordinate-grid';grid.setAttribute('role','group');grid.setAttribute('aria-label','坐标棋盘');
      for(let y=3;y>=-3;y--)for(let x=-3;x<=3;x++){const got=s.collected.some(p=>p[0]===x&&p[1]===y),b=button(got?'★':`${x},${y}`,()=>verify([x,y]));b.setAttribute('aria-label',`坐标 (${x}, ${y})`);b.dataset.point=`${x},${y}`;b.classList.toggle('collected',got);b.classList.toggle('target-column',x===target&&!s.won);b.disabled=got;grid.append(b);}board.append(grid);tools.append(el('p',`已找到 ${s.collected.length} / 3 件补给`),el('p','纵坐标向上增大，横坐标向右增大。选错会留下反馈，可以继续找。'));
    }else if(s.kind===2){const names={'1':'上升','0':'水平','-1':'下降'};intro.textContent='为探险车铺三段路：'+M.targetSegments(s).map((v,i)=>`第${i+1}段${names[v]}`).join('，')+'。选择路段，再放入坡道。';
      let y=2;const pts=[[-3,y]];for(let i=0;i<3;i++){y+=(s.segments[i]||0);pts.push([-1+2*i,y]);}board.innerHTML=svg([pts.map(([x,y],i)=>(i?'L':'M')+X(x)+','+Y(y)).join('')],pts);
      const slots=el('div');slots.className='choice-row';for(let i=0;i<3;i++)slots.append(button(`第${i+1}段：${s.segments[i]===null?'待铺':names[s.segments[i]]}`,()=>{selectedSegment=i;draw();},i===selectedSegment));tools.append(slots);
      const palette=el('div');palette.className='choice-row';for(const [v,label]of [[1,'↗ 上升坡'],[0,'→ 水平路'],[-1,'↘ 下降坡']])palette.append(button(label,()=>change('segment',[selectedSegment,v])));tools.append(palette,button('让探险车通行',()=>verify()));
    }else if(s.kind===3){const e=M.epsilon(s),d=s.distance;intro.textContent=`让两侧飞船进入 2±${e} 的目标带。规则：x≠1 时 f(x)=x+1。飞船可以靠近 x=1，但不落在中心点上。`;
      const band=`<rect x="20" y="${Y(2+e)}" width="390" height="${2*e*38}" fill="#8dd7bd77"/><text x="20" y="${Y(2+e)-10}">目标带 2±${e}</text>`;board.innerHTML=svg([`M${X(-2)},${Y(-1)}L${X(3)},${Y(4)}`],[[1,2,true],[1-d,2-d],[1+d,2+d],[1,s.point]],band);
      const table=el('table');table.innerHTML=`<caption>距离中心 ${d.toPrecision(3)}</caption><tr><th></th><th>x</th><th>f(x)</th></tr><tr><th>左侧</th><td>${(1-d).toFixed(6)}</td><td>${(2-d).toFixed(6)}</td></tr><tr><th>右侧</th><td>${(1+d).toFixed(6)}</td><td>${(2+d).toFixed(6)}</td></tr>`;tools.append(table,button('再靠近一半',()=>change('near')),button('退远一倍',()=>change('far')),range('中心点 f(1)',s.point,v=>change('point',v)),button('检查着陆',()=>verify()),el('small','有限次观察用于建立直觉，不等于证明极限存在。'));
    }else if(s.kind===4){const [left,right]=M.sides(s);intro.textContent='分别为左右飞船设泊位：沿曲线接近 x=0 时，各自趋向哪里？两个泊位可以不同。中心实心点不决定泊位。';board.innerHTML=svg([`M${X(-3)},${Y(left-2)}L${X(0)},${Y(left)}`,`M${X(0)},${Y(right)}L${X(2)},${Y(right+1)}`],[[0,left,true],[0,right,true],[0,0]],s.docks.map((v,i)=>`<rect x="${i?225:145}" y="${Y(v)-10}" width="45" height="20" rx="4" fill="${i?'#14827c55':'#6952c955'}"/>`).join(''));
      tools.append(range('左侧泊位',s.docks[0],v=>change('dock',[0,v])),range('右侧泊位',s.docks[1],v=>change('dock',[1,v])),button('让两侧飞船入港',()=>verify()));
    }else{intro.textContent=s.round?'右桥与左桥发生跳跃。要让整座桥在 x=0 处连续，需要修桥身并放好中心铆钉。':'左右桥身已接近同一高度，但接缝铆钉错位了。修好后让小车过桥。';board.innerHTML=svg([`M${X(-3)},${Y(0)}L${X(0)},${Y(2)}`,`M${X(0)},${Y(s.right)}L${X(2)},${Y(s.right+1)}`],[[0,2,true],[0,s.right,true],[0,s.point]]);
      tools.append(range('中心铆钉 f(0)',s.point,v=>change('point',v)));if(s.round)tools.append(range('右桥接缝高度',s.right,v=>change('right',v)));tools.append(button('试着过桥',()=>verify()));
    }
    if(s.won){board.querySelectorAll('button,input').forEach(n=>n.disabled=true);tools.querySelectorAll('button,input').forEach(n=>n.disabled=true);const n=button(s.round+1<M.rounds(s.kind)?'下一项挑战':'本组挑战已完成',()=>{s=M.create(cfg.gameKind,s.round+1);feedback='';draw();emit('task_progress',{stage:'round_started',round:s.round});});n.id='next-round';n.disabled=s.round+1>=M.rounds(s.kind);tools.append(n);}
    tools.querySelectorAll('button,input').forEach((n,i)=>{n.dataset.focus=String(i);});
    if(focusKey)tools.querySelector(`[data-focus="${focusKey}"]`)?.focus({preventScroll:true});
  }
  draw();
})();
