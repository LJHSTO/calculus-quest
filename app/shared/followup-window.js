(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.FollowupWindow=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function date(value,timeZone){const d=new Date(value);if(!value||!Number.isFinite(d.getTime()))return '';return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short',...(timeZone?{timeZone}:{})}).format(d);}
  function describe({unlockAt,closeAt,researchEndsAt,platformKnown=false,timeZone}={}){
    const parts=[],opens=date(unlockAt,timeZone),closes=date(closeAt,timeZone),research=date(researchEndsAt,timeZone);
    if(opens)parts.push(`平台开放时间：${opens}。`);
    parts.push(platformKnown?(closes?`平台作答截止：${closes}。`:'平台未设置强制截止；实际可作答状态以任务列表为准。'):'平台开放时间及强制截止以测量任务列表为准。');
    if(research)parts.push(`本轮研究仅纳入 ${research} 之前的延迟测量作答（主流程结束后 7 天的研究纳入窗口）。这个研究窗口不等同于平台的作答截止，之后的作答不自动纳入本轮研究。`);
    return parts.join('');
  }
  return {date,describe};
});
