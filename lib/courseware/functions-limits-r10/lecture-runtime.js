(function(){
 'use strict';
 function init(){
  const id=window.R10_LESSON_ID||String(window.R7_TASK_ID||'').slice(0,9),lesson=window.R10Lessons?.byId[id];
  if(!lesson)return;
  const host=document.querySelector('.r9-content')||document.querySelector('.r8-guidance');if(!host||host.querySelector('.r10-explanation'))return;
  const old=host.querySelector('.r9-concept');if(old)old.textContent=lesson.core;
  const section=document.createElement('section');section.className='r10-explanation';section.setAttribute('aria-label','本知识点的推理示例');
  const heading=document.createElement('strong');heading.textContent='推理示例：'+lesson.example.title;
  const setup=document.createElement('p');setup.textContent=lesson.example.setup;const list=document.createElement('ol');for(const step of lesson.example.steps){const li=document.createElement('li');li.textContent=step;list.append(li);}
  const conclusion=document.createElement('p');conclusion.textContent=lesson.example.conclusion;
  const transfer=document.createElement('p');transfer.className='r10-transfer';transfer.textContent=lesson.transfer;
  section.append(heading,setup,list,conclusion,transfer);
  // It stays in the existing scroll region; native controls remain in their footer.
  if(old)old.after(section);else host.prepend(section);
  window.dispatchEvent(new Event('resize'));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
