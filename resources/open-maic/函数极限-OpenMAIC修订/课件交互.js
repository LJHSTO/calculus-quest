document.addEventListener('DOMContentLoaded',function(){
 'use strict';
 const bar=document.createElement('header');bar.id='cq-course-actions';
 const title=document.createElement('strong');title.textContent=document.title;bar.append(title);
 for(const [label,fn]of [['需要提示','showHint'],['重试本页','resetGame']]){
  if(typeof window[fn]!=='function')continue;
  const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{if(fn==='showHint')window.CQ?.hint();window[fn]();};bar.append(button);
 }
 const feedback=document.createElement('p');feedback.id='cq-visible-feedback';feedback.hidden=true;feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 document.body.prepend(bar,feedback);
 window.alert=message=>{feedback.textContent=String(message);feedback.hidden=false;};
 const hint=window.CQ?.hint;
 if(hint)window.CQ.hint=function(){window.OpenMaicLearningEvidence?.recordHint({independent:false,evidence_scope:'openmaic_game_process'});return hint.apply(this,arguments);};
 document.addEventListener('click',event=>{if(event.isTrusted&&/^(重置本页|重试本页|重新开始|再玩一次)$/.test(event.target.closest('button')?.textContent.trim()||'')){feedback.hidden=true;window.OpenMaicLearningEvidence?.recordReset({independent:false,evidence_scope:'openmaic_game_process'});}},true);
 document.querySelectorAll('div[onclick]').forEach(n=>{n.setAttribute('role','button');n.tabIndex=0;n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();n.click();}});});
 // Keep newly requested hints and submitted feedback in view without moving the task.
 const targets=[...document.querySelectorAll('[id*="feedback"],[id*="hint"]')].filter(n=>n!==feedback&&n.tagName!=='BUTTON'&&!n.closest('script'));
 const observer=new MutationObserver(records=>{
  const changed=targets.filter(n=>records.some(r=>n===r.target||n.contains(r.target))&&n.getClientRects().length&&getComputedStyle(n).display!=='none');
  const text=changed.map(n=>n.innerText.trim()).filter(Boolean).join(' ');
  if(text&&text!==feedback.textContent){feedback.textContent=text;feedback.hidden=false;}
 });
 targets.forEach(n=>observer.observe(n,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['style','class']}));
 document.querySelectorAll('input:not([aria-label])').forEach(n=>{if(n.id&&!document.querySelector('label[for="'+n.id+'"]'))n.setAttribute('aria-label',n.closest('.output-row,.input-group')?.innerText.trim()||({ 'out-a':'甲输出','out-b':'乙输出' }[n.id])||n.id);});
},{once:true});
