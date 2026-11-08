(function(){
 'use strict';
 const id=window.R7_TASK_ID,activity=window.R8Activities.activities[id];if(!activity)return;
 function init(){
  const panel=(window.R7_PANEL||[]).map(s=>document.querySelector(s)).find(Boolean)||document.body;
  document.body.dataset.activityRevision=window.R8Activities.version;
  document.body.dataset.activityPoint=activity.point;document.body.dataset.activityType=activity.type;
  const box=document.createElement('section');box.className='r7-learning r8-guidance';box.setAttribute('aria-label','本页观察指引');
  const guide=document.createElement('p');guide.className='r7-guide';guide.textContent=activity.guide;box.append(guide);
  if(id==='GH-01-K01-simulation'){
   const legend=document.createElement('aside');legend.id='r7-trace-legend';legend.setAttribute('aria-label','图上点的含义');
   legend.innerHTML='<p><span class="r8-current">●</span> 粉色大点：当前的(x, f(x))。<span class="r8-history">●</span> 黄色小点：之前记录的输入和对应输出。</p><p>自动演示随机记录部分位置，最多保留20条；疏密不代表变化快慢。重置或换规则会清空记录。</p>';box.prepend(legend);
  }
  if(activity.graphic){
   const graphic=document.querySelector(activity.graphic);if(!graphic)throw Error('Missing activity graphic: '+id);
   const figure=document.createElement('figure');figure.className='r8-figure';graphic.before(figure);figure.append(graphic,box);graphic.classList.add('r8-graphic');
   if(getComputedStyle(figure.parentElement).flexDirection==='column')figure.classList.add('r8-column');
  }else if(activity.type==='visualization3d'){
   // Keep live readouts, but replace static instructions with the current observation task.
   for(const child of [...panel.children])if(child.tagName!=='H2'&&!child.id&&!child.querySelector('[id]'))child.hidden=true;
   panel.append(box);panel.classList.add('r8-space-caption');
   if(id==='GH-02-K03-visualization3d'){const alternate=document.getElementById('2d-fallback');document.getElementById('canvas-container').append(alternate);alternate.style.setProperty('display','none','important');}
  }else panel.append(box);
  if(activity.primary.length){
   const bar=document.createElement('div');bar.className='r8-actions';bar.setAttribute('aria-label','主要操作');
   const parents=new Set();for(const key of activity.primary){const button=document.getElementById(key);if(!button)throw Error('Missing primary control: '+key);parents.add(button.parentElement);bar.append(button);button.dataset.primaryControl='true';}
   panel.prepend(bar);for(const parent of parents)if(parent!==panel&&!parent.children.length&&!parent.id)parent.remove();
   const bg=getComputedStyle(panel).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')bar.style.backgroundColor=bg;
  }
  const clearOldFeedback=()=>{const mirror=document.getElementById('cq-visible-feedback');if(mirror)mirror.hidden=true;};
  window.R7Continue=function(next){const current=panel.querySelector('.screen.active')||panel;const feedback=[...current.querySelectorAll('[id*="feedback"],.feedback')].find(e=>!e.closest('.r7-learning')&&e.getBoundingClientRect().height>0);const host=feedback||current;host.querySelector('.r7-continue')?.remove();const button=document.createElement('button');button.className='r7-continue';button.type='button';button.textContent='读完反馈，继续';button.addEventListener('click',()=>{button.remove();next();clearOldFeedback();},{once:true});host.append(button);};
  if(activity.game){let active=panel.querySelector('.screen.active');const observer=new MutationObserver(()=>{const next=panel.querySelector('.screen.active');if(next!==active){active=next;clearOldFeedback();}});panel.querySelectorAll('.screen').forEach(screen=>observer.observe(screen,{attributes:true,attributeFilter:['class']}));}
  if(activity.game&&typeof window.startGame==='function'){window.startGame();const reset=window.resetGame;if(reset)window.resetGame=function(){reset();window.startGame();};}
  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
