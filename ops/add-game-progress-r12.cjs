'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'resources/open-maic/函数极限-OpenMAIC修订');
const helper=fs.readFileSync(path.join(root,'lib/courseware/functions-limits-r12/game-progress.js'),'utf8');
const hooks={
'GH-01-K01':`
    CQGameProgress.register('GH-01-K01',{
      get:()=>({currentLevelIdx,score,selectedInput,usedHint,gameActive,conclusion:document.getElementById('conclusion-section').style.display!=='none',outA:document.getElementById('out-a').value,outB:document.getElementById('out-b').value}),
      set:(s,saved)=>{if(!Number.isInteger(s.currentLevelIdx)||s.currentLevelIdx<0||s.currentLevelIdx>config.levels.length)return false;
        currentLevelIdx=Math.min(config.levels.length-1,saved.pending?Math.max(0,s.currentLevelIdx-1):s.currentLevelIdx);initLevel();
        score=Number.isFinite(s.score)?Math.max(0,Math.min(100,s.score)):0;document.getElementById('score-display').textContent='积分: '+score;
        if(config.levels[currentLevelIdx].inputs.includes(s.selectedInput)){const b=[...document.querySelectorAll('.input-btn')].find(b=>Number(b.textContent)===s.selectedInput);if(b)selectInput(s.selectedInput,b);}
        document.getElementById('out-a').value=typeof s.outA==='string'?s.outA.slice(0,20):'';document.getElementById('out-b').value=typeof s.outB==='string'?s.outB.slice(0,20):'';
        if(s.conclusion&&selectedInput!==null)showConclusion();currentLevelIdx=s.currentLevelIdx;usedHint=s.usedHint===true;gameActive=s.gameActive===true;
      },after:(s,saved)=>{if(saved.pending&&currentLevelIdx<config.levels.length)window.R7Continue(initLevel);}
    },['feedback','hint-box','result-desc']);
`,
'GH-01-K02':`
    CQGameProgress.register('GH-01-K02',{
      get:()=>({currentLevel:state.currentLevel,score:state.score,hintUsed:state.hintUsed,reasoningChoice:state.reasoningChoice,transitioning:state.transitioning===true,points:state.points.map((p,i)=>({value:document.getElementById('calc-'+i)?.value||'',choice:document.getElementById('on-'+i)?.classList.contains('active')?true:document.getElementById('on-'+i)?.nextElementSibling.classList.contains('active')?false:null}))}),
      set:s=>{if(!Number.isInteger(s.currentLevel)||s.currentLevel<0||s.currentLevel>=state.config.levels.length)return false;initLevel(s.currentLevel);
        state.score=Number.isFinite(s.score)?Math.max(0,Math.min(100,s.score)):0;document.getElementById('score').textContent=state.score;state.hintUsed=s.hintUsed===true;state.transitioning=s.transitioning===true;
        state.reasoningChoice=['A','B','C'].includes(s.reasoningChoice)?s.reasoningChoice:null;
        (Array.isArray(s.points)?s.points:[]).slice(0,state.points.length).forEach((p,i)=>{document.getElementById('calc-'+i).value=typeof p.value==='string'?p.value.slice(0,20):'';togglePoint(i,typeof p.choice==='boolean'?p.choice:null);});
        if(state.reasoningChoice){const options=[...document.querySelectorAll('.reasoning-opt')],b=options[['A','B','C'].indexOf(state.reasoningChoice)];if(b)window.selectReasoning(state.reasoningChoice,{currentTarget:b});}
      },after:(s,saved)=>{if(saved.pending)window.R7Continue(()=>{if(state.currentLevel===0)initLevel(1);else{state.transitioning=false;showScreen('reasoning-screen');}});}
    },['feedback','result-text']);
`,
'GH-01-K03':`
    CQGameProgress.register('GH-01-K03',{
      get:()=>({currentLevel,points:points.slice(),hintUsed,gameActive,started:document.getElementById('start-screen').classList.contains('hidden'),finished:currentLevel===3&&!gameActive&&!document.querySelector('#input-controls input')}),
      set:s=>{if(!Number.isInteger(s.currentLevel)||s.currentLevel<0||s.currentLevel>=config.levels.length)return false;initLevel(s.currentLevel);document.getElementById('start-screen').classList.toggle('hidden',s.started===true);
        points=Array.from({length:4},(_,i)=>Number.isFinite(s.points?.[i])&&Math.abs(s.points[i])<=9?s.points[i]:0);
        [...document.querySelectorAll('#input-controls input')].forEach((n,i)=>n.value=String(points[i]));hintUsed=s.hintUsed===true;gameActive=s.gameActive===true;draw();
        if(s.finished){document.getElementById('target-text').textContent='全部构造完成';document.getElementById('input-controls').textContent='三组数据均通过数学条件校验。';}
      },after:(s,saved)=>{if(saved.pending&&currentLevel<2)window.R7Continue(()=>initLevel(currentLevel+1));}
    },['feedback']);
`,
'GH-02-K01':`
    CQGameProgress.register('GH-02-K01',{
      get:()=>({currentLevel:state.currentLevel,selectedPoint:state.selectedPoint,prediction:state.prediction,samples:state.samples.map(s=>s.x).slice(-24),usedHint:state.usedHint,transitioning:state.transitioning===true,conclusionLocked:state.conclusionLocked===true}),
      set:s=>{if(!Number.isInteger(s.currentLevel)||s.currentLevel<0||s.currentLevel>=state.config.levels.length)return false;state.currentLevel=s.currentLevel;initLevel();
        const level=state.config.levels[state.currentLevel],allowed=[...level.initialSamples,...level.candidates];state.samples=(Array.isArray(s.samples)?s.samples:[]).slice(-24).filter(x=>allowed.includes(x)).map(x=>({x,a:x+(state.currentLevel===0?3:2),b:state.currentLevel===0?(Math.abs(x)>0&&Math.abs(x)<.005?x+5:x+3):(x<0?x+2:3*x+2)}));renderTable();
        state.selectedPoint=level.candidates.includes(s.selectedPoint)?s.selectedPoint:null;state.prediction=typeof s.prediction==='boolean'?s.prediction:null;state.usedHint=s.usedHint===true;state.transitioning=s.transitioning===true;state.conclusionLocked=s.conclusionLocked===true;
        [...document.querySelectorAll('.candidate-btn')].forEach(b=>b.classList.toggle('selected',Number(b.textContent)===state.selectedPoint));window.setPrediction(state.prediction);
        const table=document.getElementById('final-table');table.replaceChildren();for(const sample of state.samples){const row=document.createElement('tr');for(const v of [sample.x,sample.a,sample.b]){const cell=document.createElement('td');cell.textContent=v;row.append(cell);}table.append(row);}
      },after:(s,saved)=>{if(saved.pending)window.R7Continue(()=>{if(saved.screen==='game-screen')showScreen('conclusion-screen');else if(state.currentLevel<state.config.levels.length-1){state.currentLevel++;initLevel();showScreen('game-screen');}else showResult();});}
    },['feedback','conclusion-feedback','hint-container','result-desc']);
`,
'GH-02-K02':`
    CQGameProgress.register('GH-02-K02',{
      get:()=>({prediction:{...state.prediction},diagnosis:state.diagnosis,solution:state.solution,usedHint:state.usedHint}),
      set:(s,saved)=>{state.prediction={left:Number.isFinite(s.prediction?.left)?s.prediction.left:null,right:Number.isFinite(s.prediction?.right)?s.prediction.right:null};state.diagnosis=['A','B','C'].includes(s.diagnosis)?s.diagnosis:null;state.solution=['A','B','C'].includes(s.solution)?s.solution:null;state.usedHint=s.usedHint===true;
        for(const [id,choice] of [['step3',state.diagnosis],['step4',state.solution]]){[...document.querySelectorAll('#'+id+' .option')].forEach((n,i)=>n.classList.toggle('selected',i===['A','B','C'].indexOf(choice)));document.getElementById(id==='step3'?'submit3':'submit4').style.display=choice==='A'?'block':'none';}
        updateProgress(({'start-screen':0,step1:20,step2:40,step3:60,step4:80,'transfer-screen':80,'result-screen':100})[saved.screen]||0);
      }
    },['feedback3','feedback4','data-display','transfer-feedback','final-score','finish-type']);
`,
'GH-02-K03':`
    CQGameProgress.register('GH-02-K03',{
      get:()=>({selectedOption:state.selectedOption,selectedReason:state.selectedReason,selectedFinal:state.selectedFinal,hasHint:state.hasHint,achievements:state.achievements.slice()}),
      set:(s,saved)=>{state.selectedOption=['A','B','C'].includes(s.selectedOption)?s.selectedOption:null;state.selectedReason=[0,1,2].includes(s.selectedReason)?s.selectedReason:null;state.selectedFinal=[0,1,2].includes(s.selectedFinal)?s.selectedFinal:null;state.hasHint=s.hasHint===true;state.achievements=(Array.isArray(s.achievements)?s.achievements:[]).filter(x=>['精准预测！','修复大师！'].includes(x)).slice(0,2);showScreen(saved.screen);
        const selections=[['level-repair',['A','B','C'].indexOf(state.selectedOption)],['level-reason',state.selectedReason],['level-final',state.selectedFinal]];for(const [id,index] of selections)[...document.querySelectorAll('#'+id+' .option-card')].forEach((n,i)=>n.classList.toggle('selected',i===index));
        const list=document.getElementById('achievement-list');list.replaceChildren();for(const name of state.achievements){const span=document.createElement('span');span.textContent='🏆 '+name;list.append(span);}
      }
    },['repair-feedback','reason-feedback','hint-display','result-desc']);
`
};
for(const [id,hook] of Object.entries(hooks)){
 const file=path.join(dir,id+'.html');let html=fs.readFileSync(file,'utf8');assert(!html.includes('id="cq-game-progress-r12"'),'already installed');
 const end=html.match(/\}\);\r?\n<\/script>\r?\n\r?\n<script id="openmaic-widget-action-listener">/)?.[0];const pos=end?html.indexOf(end):-1;assert(pos>=0,id+' primary closure');
 html=html.slice(0,pos)+hook+html.slice(pos);
 const begin=html.match(/<script>\r?\ndocument.addEventListener\('DOMContentLoaded', function\(\) \{/)?.[0];assert(begin);html=html.replace(begin,'<script id="cq-game-progress-r12">'+helper+'</script>\n'+begin);
 html=html.replace('start(label) { current=label;',"start(label) { if(window.__cqRestoringProgress)return; current=label;")
  .replace('hint() { entry().hints++;',"hint() { if(window.__cqRestoringProgress)return; entry().hints++;")
  .replace('attempt(correct,detail,parameters) { if(parameters)',"attempt(correct,detail,parameters) { if(window.__cqRestoringProgress)return !!correct; if(parameters)")
  .replace('complete() { const e=entry();',"complete() { if(window.__cqRestoringProgress)return category(entry()); const e=entry();")
  .replace("e.attempts.some(a=>!a.correct)","(e.restoredIncorrect||e.attempts.some(a=>!a.correct))")
  .replace("e.attempts.length+' 次'","((e.restoredAttempts||0)+e.attempts.length)+' 次'")
  .replace('summary() { return',`getProgress() { return {current,rounds:Array.from(rounds.values()).slice(-8).map(e=>({round:e.round,hints:e.hints,count:(e.restoredAttempts||0)+e.attempts.length,incorrect:Boolean(e.restoredIncorrect||e.attempts.some(a=>!a.correct)),completed:e.completed}))}; },
    restoreProgress(saved) { if(!saved||!Array.isArray(saved.rounds))return;rounds.clear();for(const s of saved.rounds.slice(-8)){if(typeof s.round!=='string')continue;rounds.set(s.round.slice(0,64),{round:s.round.slice(0,64),hints:Number.isFinite(s.hints)?Math.max(0,Math.min(10000,Math.trunc(s.hints))):0,attempts:[],restoredAttempts:Number.isFinite(s.count)?Math.max(0,Math.min(10000,Math.trunc(s.count))):0,restoredIncorrect:s.incorrect===true,completed:s.completed===true});}current=rounds.has(saved.current)?saved.current:'第一轮';entry();render(); },
    summary() { return`);
 fs.writeFileSync(file,html);
}
console.log('6份游戏 typed UI进度接口已嵌入；未改题目判分函数。');
