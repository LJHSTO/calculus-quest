(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LearnerPreferences = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const version = 'learner-preferences-20261024-v1';
  const dimensions = [
    {id:'D1',title:'怎样判断我可能需要帮助',short:'判断依据',description:'操作少不代表不想学。助手结合回答和任务记录发现线索，判断可能出错，也会先向你确认。',options:[
      ['standard','有明确线索，就先问问我','出现有依据的困难线索时，允许助手询问。'],
      ['cautious','等多个线索一致，再问我','减少只凭一种线索发起的询问，也可能错过一些帮助机会。']],default:'standard',preview:'例如：一次独立检查答错后，助手可以询问你是否卡住；选择谨慎判断时，它会等待更多类别的证据。'},
    {id:'D2',title:'什么时候可以来问我',short:'介入时机',description:'输入、拖动和独立测验期间都会保持安静。这里决定其他学习时刻的等待方式。',options:[
      ['boundary','等我完成当前小步','在提交、切换等任务边界再出现。'],
      ['quiet','完成小步后，少来打扰','仍等到任务边界，并将两轮帮助之间的基础间隔从10分钟延长到20分钟。']],default:'boundary',preview:'你正拖动图中的点时不会弹出帮助。完成这一小步后，助手再判断是否需要询问。较长间隔减少新的打扰，不影响你主动求助。'},
    {id:'D3',title:'知识上的帮助，先给到哪一步',short:'支持内容',description:'你仍可以说明需要概念、学习方法、价值、情绪或安排上的支持。这里选择知识提示的起点和默认份量。',options:[
      ['hint','先给一个线索','保留更多自己尝试的空间。'],
      ['guided','引导我想几个小步骤','用少量问题或步骤帮助我继续。'],
      ['example','先看一个局部例子','可以展示局部示范，但不会替我提交答案。']],default:'hint',preview:'遇到极限题：可以先提醒你比较左右趋势，也可以逐步引导；局部示例只演示相关的一步。'},
    {id:'D4',title:'帮助怎样显示',short:'提示呈现',description:'选择的是提示位置和展开方式。课件与答题区始终保留操作空间，完整对话仍在侧栏。',options:[
      ['inline','放在当前任务旁','任务内的独立提示区域，不覆盖题目或图形。'],
      ['compact','先显示可展开的小提示','你点击后再阅读正文。'],
      ['sidebar','放在对话侧栏','在侧栏阅读帮助，课件保留在主区域。']],default:'inline',preview:'同一条“先比较左右趋势”的提示，可以显示在任务旁，也可以先折叠，或放到侧栏。'},
    {id:'D5',title:'助手可以主动到哪一步',short:'主动权',description:'所有选择都允许拒绝和暂停。系统不会替你答题，也不会把未回应当成同意。',options:[
      ['ask','先问我，再提供帮助','发现可能困难时先询问，确认后再给对应支持。'],
      ['cue','允许直接给简短知识线索','低风险知识线索可以直接出现；其他支持可通过主动求助说明需要。'],
      ['request','这次只在我求助时回应','关闭自动询问；你仍能主动向知点提问。']],default:'ask',preview:'“要一起看看左右两边的变化吗？”你可以选择需要、不需要或稍后；不回答不会自动进入帮助。'},
    {id:'D6',title:'一次帮助之后怎样继续',short:'后续跟进',description:'反馈和独立检查不等于已经掌握。继续帮助需要你的选择，跨天提醒另需授权。',options:[
      ['stop','这一轮结束，先让我自己试','不自动准备补充轮次；有需要时重新求助。'],
      ['followup','保留一次补充帮助的机会','如果我反馈仍有困难，可以再引导一次。']],default:'followup',preview:'你可以反馈是否有帮助，选择继续或结束。没有回应时不会持续追问，也不会自动推送跨天消息。'}
  ];
  const reasons = [['fit','适合我平时的学习方式'],['independence','想保留自己思考的空间'],['support','希望卡住时更容易得到支持'],['focus','希望减少打断或操作负担'],['try','不确定，先试用这个选择'],['default','先使用默认设置'],['other','其他原因'],['decline','暂不说明理由']];
  const defaults = () => Object.fromEntries(dimensions.map(d=>[d.id,{value:d.default,reason:'',note:''}]));
  function validate(input) {
    if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!dimensions.some(d=>d.id===k))) throw new Error('请完成六项学习偏好');
    return Object.fromEntries(dimensions.map(d=>{
      const a=input[d.id];
      if(!a || !d.options.some(o=>o[0]===a.value) || !reasons.some(r=>r[0]===a.reason))throw new Error('请选择'+d.short+'及选择理由');
      if(typeof a.note!=='string'||a.note.length>500)throw new Error('补充说明请控制在500字内');
      if(a.reason==='other'&&!a.note.trim())throw new Error('选择其他原因时，请补充说明');
      return [d.id,{value:a.value,reason:a.reason,note:a.note.trim()}];
    }));
  }
  function profile(answers,base) {
    const a=validate(answers),p={...base,proactivity:'adaptive',supportGoal:'auto',supportStrategy:'auto',timingMode:'adaptive',ttlSeconds:900,cooldownSeconds:600,representationSwitch:false,reviewAfterHours:24};
    Object.assign(p,a.D1.value==='cautious'?{helpNeed:.8,minimumEvidenceFamilies:2}:{helpNeed:.7,minimumEvidenceFamilies:1});
    p.boundaryOnly=true;p.cooldownSeconds=a.D2.value==='quiet'?1200:600;p.interruptibility=.75;p.uncertainty=.3;
    Object.assign(p,({hint:{initialSupportLevel:'L2',maxSupportLevel:'L3',supportDose:'brief'},guided:{initialSupportLevel:'L3',maxSupportLevel:'L5',supportDose:'guided'},example:{initialSupportLevel:'L5',maxSupportLevel:'L5',supportDose:'guided'}})[a.D3.value]);
    p.placement=a.D4.value==='sidebar'?'sidebar':'inline';p.presentationFormat=a.D4.value==='compact'?'disclosure':'plain';
    p.authorityLevel=a.D5.value==='cue'?'A2':'A1';p.supportInquiryEnabled=a.D5.value==='ask';if(a.D5.value==='request')p.proactivity='reactive';
    p.supportFollowups=a.D6.value==='followup'?1:0;p.maxEscalations=a.D6.value==='followup'?2:0;
    return p;
  }
  const surveys={
    baseline:[['efficacy','不借助助手，我有把握理解并完成本次函数与极限任务。'],['interest','我对学习本次内容感兴趣。'],['value','我觉得本次学习内容值得投入时间。']],
    final:[['agency','本次学习中，我能按自己的目标决定学习和求助方式。'],['efficacy','不借助助手，我有把握完成同类函数与极限任务。'],['interest','本次学习内容让我感兴趣。'],['value','我觉得本次学习内容有用。'],['workload','本次学习让我感到费力。'],['disruption','学习过程中出现的信息打断了我的思路。'],['usability','我能顺利找到并使用需要的功能。']],
    configuration:[['understood','我理解这些设置会怎样影响助手。'],['burden','选择和调整设置让我感到负担。'],['alignment','助手的实际行为符合我对设置的理解。']]
  };
  return {version,dimensions,reasons,defaults,validate,profile,surveys};
});
