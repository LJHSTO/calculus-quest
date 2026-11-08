'use strict';
const {body,literal}=require('./functions-r7-scene-patches');
function patch(html,id){
 if(id==='GH-01-K01-visualization3d')html=literal(html,'highlightX = minX + (maxX - minX) * (0.5 + 0.5 * Math.sin(animTime * 1.2));','if(isPlaying) highlightX = minX + (maxX - minX) * (0.5 + 0.5 * Math.sin(animTime * 1.2));');
 if(id==='GH-01-K01-visualization3d')html=body(html,'initScene',`window.R9Scene={setInput(x){isPlaying=false;document.getElementById('toggle-anim-btn').textContent='继续';highlightX=x;buildHighlightLine(x);document.getElementById('x-val').textContent=x.toFixed(2);const y=functions[currentFunc].fn(x);document.getElementById('fx-val').textContent=Number.isFinite(y)?y.toFixed(2):'无实数输出';},read(){return {rule:currentFunc,x:highlightX,y:functions[currentFunc].fn(highlightX),density};}};`,true);
 if(id==='GH-01-K02-visualization3d'){
  html=literal(html,'let h = fn(xVal);','let h = fn(xVal); window.R9LastPillar={rule:funcName,x:xVal};');
  html=body(html,'initScene',`window.R9Scene={read(){return window.R9LastPillar&&pillars.some(p=>p.userData.xVal===window.R9LastPillar.x)?{...window.R9LastPillar}:null;}};document.getElementById('reset-btn').addEventListener('click',()=>{window.R9LastPillar=null;});document.getElementById('func-select').addEventListener('change',()=>{window.R9LastPillar=null;});`,true);
 }
 if(id==='GH-02-K01-visualization3d')html=body(html,'initScene',`window.R9Scene={pause(){isPlaying=false;playBtn.textContent='▶ 播放';playBtn.classList.remove('accent');playBtn.classList.add('primary');}};xSlider.addEventListener('input',()=>window.R9Scene.pause());`,true);
 if(id==='GH-02-K03-visualization3d')html=body(html,'initScene',`window.R9Scene={read(){return {value:hasGap?3:1,limit:1};}};`,true);
 return html;
}
module.exports={patch};
