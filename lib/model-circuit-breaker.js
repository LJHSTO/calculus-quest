'use strict';

// Shared by all study arms. A known provider outage must not make every new
// student wait through another full execution timeout. Never changes models.
function createCircuitBreaker({threshold=3,cooldownMs=15000,clock=Date.now}={}){
 const circuits=new Map();
 const stateFor=key=>{if(!circuits.has(key))circuits.set(key,{failures:0,generation:0,openUntil:0,probe:false});return circuits.get(key);};
 function unavailable(state){
  return Object.assign(new Error('模型服务暂时未响应，请稍后重试。'),{code:'MODEL_SERVICE_UNAVAILABLE',retryAfterMs:Math.max(1000,state.openUntil-clock())});
 }
 function check(key){const state=stateFor(key);if(state.openUntil&&(clock()<state.openUntil||state.probe))throw unavailable(state);}
 function begin(key){
  check(key);const state=stateFor(key),probe=Boolean(state.openUntil);
  if(probe)state.probe=true;
  return {key,generation:state.generation,probe};
 }
 function finish(ticket,error){
  const state=stateFor(ticket.key);if(ticket.generation!==state.generation)return;
  const transient=error&&(error.code==='MODEL_EXECUTION_TIMEOUT'||error.name==='TimeoutError'||error.name==='TypeError'
   ||error.code==='MODEL_HTTP_ERROR'&&(error.status===429||error.status>=500));
  if(!error){state.failures=0;state.openUntil=0;state.probe=false;if(ticket.probe)state.generation++;return;}
  if(transient){
   state.failures++;
   if(ticket.probe||state.failures>=threshold){state.openUntil=clock()+cooldownMs;state.probe=false;state.generation++;}
  }else if(ticket.probe){
   // A cancelled probe proves nothing about recovery; release its reservation
   // and permit another probe after a short pause. Ordinary student cancel
   // never trips the circuit.
   state.openUntil=clock()+cooldownMs;state.probe=false;state.generation++;
  }
 }
 return {check,begin,finish,limits:Object.freeze({threshold,cooldownMs}),snapshot:key=>({...stateFor(key)})};
}
module.exports={createCircuitBreaker,shared:createCircuitBreaker()};
