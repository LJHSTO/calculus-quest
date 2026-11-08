'use strict';
const patch=require('./functions-r7-scene-patches');
function apply(html,id){
 if(id==='GH-01-K03-visualization3d'){
  html=patch.body(html,'getTerrainHeight','return (x*x/32-1+.08*z)*terrainHeightScale;');
  html=patch.literal(html,"'，f(x₁)='+a.toFixed(3)+'；x₂='+second.toFixed(1)+'，f(x₂)='+b.toFixed(3)","'，f(x₁)≈'+a.toFixed(6)+'；x₂='+second.toFixed(1)+'，f(x₂)≈'+b.toFixed(6)+'；精确比较：f(x₁)'+(first*first<second*second?' < ':first*first>second*second?' > ':' = ')+'f(x₂)'");
 }
 return html;
}
module.exports={patch:apply};
