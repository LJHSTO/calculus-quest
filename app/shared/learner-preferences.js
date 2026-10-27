(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LearnerPreferences = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const version = 'learner-preferences-20261027-v4';
  const dimensions = [
    {id:'D1',title:'怎样判断我可能需要帮助',short:'判断依据',description:'操作少不代表不想学。助手结合回答和任务记录发现线索，判断可能出错。是否先询问，由“主动权”设置决定。',options:[
      ['standard','有明确线索，就考虑帮助','出现有依据的困难线索时，允许助手考虑介入。'],
      ['cautious','等多个线索一致，再考虑帮助','减少只凭一种线索发起的介入，也可能错过一些帮助机会。']],default:'standard',preview:'例如：一次独立检查答错后，助手可以询问你是否卡住；选择谨慎判断时，它会等待更多类别的证据。'},
    {id:'D2',title:'什么时候可以出现帮助',short:'介入时机',description:'输入、拖动和独立测验期间都会保持安静。这里决定其他学习时刻的等待方式。',options:[
      ['boundary','等我完成当前小步','在提交、切换等任务边界再出现。'],
      ['quiet','完成小步后，少来打扰','仍等任务边界，两次主动介入之间至少等待3分钟；通常模式至少等待1分钟。']],default:'boundary',preview:'你正拖动图中的点时不会弹出帮助。完成这一小步后，还要有明确的困难证据。间隔到期不会自动弹窗；同一证据不重复询问，每个知识点最多询问两次。你可以拒绝、暂停或结束帮助。'},
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
      ['cue','允许直接显示知识提示','按前面选择的程度直接显示知识提示；其他支持仍由你确认需要。'],
      ['request','这次只在我求助时回应','关闭自动询问；你仍能主动向知点提问。']],default:'ask',preview:'“要一起看看左右两边的变化吗？”你可以选择需要、不需要或稍后；不回答不会自动进入帮助。'},
    {id:'D6',title:'看过帮助后，还没弄懂怎么办',short:'帮助后怎么继续',description:'这项设置只管同一次帮助后是否继续，不是再次提醒的时间，也不是跨天复习。两种选择都可以反馈或结束帮助。',options:[
      ['stop','结束这次帮助，我先自己试','本次帮助后不接着提供第二轮；之后有新线索时，助手再判断是否询问。'],
      ['followup','我表示仍有困难时，再帮一次','只有你反馈仍有困难并选择继续，才提供一次补充帮助；不回应就结束等待。']],default:'followup',preview:'例如：你看过“比较左右趋势”的提示，仍然不理解。选择再帮一次后，你可以请求一个更具体的提示；选择先自己试，则结束本轮帮助。两者都不会自动发跨天消息。'}
  ];
  const reasons = [['fit','适合我平时的学习方式'],['independence','想保留自己思考的空间'],['support','希望卡住时更容易得到支持'],['focus','希望减少打断或操作负担'],['try','不确定，先试用这个选择'],['default','先使用默认设置'],['other','其他原因'],['decline','暂不说明理由']];
  const dimensionReasons={
    D1:[['evidence','希望助手根据可靠的学习记录判断'],['missed_help','担心困难没有被及时发现'],['false_alarm','不希望助手误判我需要帮助']],
    D2:[['finish_step','想先完成眼前这一步'],['less_interrupt','希望集中学习，少被打断'],['timely','希望困难出现后不用等太久']],
    D3:[['think_first','想保留自己推理的过程'],['small_steps','希望把困难拆成几个小步骤'],['example_first','看到具体例子更容易理解']],
    D4:[['near_task','希望不用离开当前题目或课件'],['less_space','希望提示少占屏幕空间'],['separate_chat','希望把帮助和课件分开放']],
    D5:[['confirm_first','想先决定是否需要这次帮助'],['direct_cue','希望直接看到所选的知识提示，少点一次'],['predictable','希望清楚知道助手下一步会做什么']],
    D6:[['try_after','看过提示后想先独立尝试'],['continue_help','担心一次提示仍然不够'],['control_end','希望由我决定这次帮助何时结束']]
  };
  const previews={
    D1:{standard:'例如：一次独立检查答错且证据达到判断条件时，助手可以考虑提供帮助。是否先询问，由“主动权”设置决定。它不会把没有点击、阅读较慢直接当成没有学习意愿。',cautious:'助手等待至少两类一致的困难线索，再考虑介入。是否先询问，由“主动权”设置决定。可能减少误判，也可能错过只有一种证据的困难。操作少本身不代表不想学。'},
    D2:{boundary:'你正在输入或拖动时不会出现询问。完成当前小步后，仍须有困难线索；两次主动介入之间至少间隔1分钟，时间到了也不会自动出现。',quiet:'同样等待提交、切换等小步结束，但两次主动介入之间至少间隔3分钟。正在输入、拖动或独立测验时保持安静；你可以拒绝、暂停或结束帮助。'},
    D3:{hint:'先提供一个概念线索，例如“先分别看左右两边趋向哪里”。确认还需要帮助后，可逐步增加到小步骤提示。',guided:'先将当前困难拆成少量小步骤，例如先看左侧，再看右侧。继续帮助仍由你选择，不会代替你提交答案。',example:'先看相关的局部示例，示例演示其中一步。你仍需要自己完成当前任务；不会展示整道独立测验的答案。'},
    D4:{inline:'出现帮助时，在当前课件或题目旁的提示区域阅读。完整对话仍可在侧栏打开，提示不覆盖图形和答题控件。',compact:'出现帮助时先看到可展开的小提示，点击后阅读正文。没有展开时，只记作提示已出现，不记作你已阅读正文。',sidebar:'出现帮助时，通过可见提醒打开侧栏阅读。课件仍留在主区域；窄屏会切换面板，以免把课件挤得太小。'},
    D5:{ask:'发现可能困难后先问“这一步需要帮助吗？”。你选择需要后才给支持，也可以拒绝或稍后；没有回应不会视为同意。',cue:'发现有依据的知识困难后，可以直接显示你在“支持内容”中选的线索、小步骤或局部示例，你可以关闭。涉及动机、情绪等支持时仍需你说明需要；不会替你作答。',request:'普通学习中关闭自动询问，仅在你主动向知点提问时回应。此项不作为本轮实验组的常规选择，实验中仍可暂停帮助或退出。'},
    D6:{stop:'看完这次提示后结束本轮帮助，不自动接上第二轮。你可以自己尝试、反馈有没有用。之后出现新线索时，助手再判断是否询问。',followup:'看完提示仍不理解时，你可以反馈“仍有困难”并选择继续，再获得一次补充帮助。补充仍会等待所选间隔和合适的小步结束；没有请求或选择结束时，不会追着询问，也不包含跨天提醒。'}
  };
  const optionsFor=(id,experimental=false)=>dimensions.find(d=>d.id===id).options.filter(o=>!(experimental&&id==='D5'&&o[0]==='request'));
  const reasonsFor=id=>[...(dimensionReasons[id]||[]),...reasons];
  const previewFor=(id,value)=>previews[id]?.[value]||dimensions.find(d=>d.id===id).preview;
  const configurationPolicy={version:'boundary-edits-v1',editing:'before_learning_or_after_submitted_formative',experimentalD5:['ask','cue'],defaultRationale:'先确认、少量线索、任务旁呈现；等待任务边界并限制重复询问。默认值是可调整的设计起点，尚未证明最优。',defaultProvenance:'designer_selected_not_empirically_optimal'};
  const defaults = () => Object.fromEntries(dimensions.map(d=>[d.id,{value:d.default,reason:'',note:''}]));
  function validate(input,context={}) {
    if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!dimensions.some(d=>d.id===k))) throw new Error('请完成六项学习偏好');
    return Object.fromEntries(dimensions.map(d=>{
      const a=input[d.id];
      if(context.experimental&&d.id==='D5'&&a?.value==='request')throw new Error('本轮实验组须保留主动帮助；仍可拒绝、暂停或退出预试');
      if(!a || !d.options.some(o=>o[0]===a.value) || !reasonsFor(d.id).some(r=>r[0]===a.reason))throw new Error('请选择'+d.short+'及选择理由');
      if(typeof a.note!=='string'||a.note.length>500)throw new Error('补充说明请控制在500字内');
      if(a.reason==='other'&&!a.note.trim())throw new Error('选择其他原因时，请补充说明');
      return [d.id,{value:a.value,reason:a.reason,note:a.note.trim()}];
    }));
  }
  function profile(answers,base) {
    const a=validate(answers),p={...base,proactivity:'adaptive',supportGoal:'auto',supportStrategy:'auto',timingMode:'adaptive',ttlSeconds:900,cooldownSeconds:600,representationSwitch:false,reviewAfterHours:24};
    Object.assign(p,a.D1.value==='cautious'?{helpNeed:.8,minimumEvidenceFamilies:2}:{helpNeed:.7,minimumEvidenceFamilies:1});
    p.boundaryOnly=true;p.cooldownSeconds=a.D2.value==='quiet'?180:60;p.interruptibility=.75;p.uncertainty=.3;
    Object.assign(p,({hint:{initialSupportLevel:'L2',maxSupportLevel:'L3',supportDose:'brief'},guided:{initialSupportLevel:'L3',maxSupportLevel:'L5',supportDose:'guided'},example:{initialSupportLevel:'L5',maxSupportLevel:'L5',supportDose:'guided'}})[a.D3.value]);
    p.placement=a.D4.value==='sidebar'?'sidebar':'inline';p.presentationFormat=a.D4.value==='compact'?'disclosure':'plain';
    p.authorityLevel=a.D5.value==='cue'?'A2':'A1';p.supportInquiryEnabled=a.D5.value==='ask';if(a.D5.value==='request')p.proactivity='reactive';
    p.supportFollowups=a.D6.value==='followup'?1:0;p.maxEscalations=a.D6.value==='followup'?1:0;
    return p;
  }
  const surveys={
    baseline:[['efficacy','不借助助手，我有把握理解并完成本次函数与极限任务。'],['interest','我对学习本次内容感兴趣。'],['value','我觉得本次学习内容值得投入时间。']],
    final:[['agency','本次学习中，我能按自己的目标决定学习和求助方式。'],['efficacy','不借助助手，我有把握完成同类函数与极限任务。'],['interest','本次学习内容让我感兴趣。'],['value','我觉得本次学习内容有用。'],['workload','本次学习让我感到费力。'],['disruption','学习过程中出现的信息打断了我的思路。'],['usability','我能顺利找到并使用需要的功能。']],
    configuration:[['understood','我理解这些设置会怎样影响助手。'],['burden','选择和调整设置让我感到负担。'],['alignment','助手的实际行为符合我对设置的理解。']]
  };
  // Preserve complete satisfaction subscales, not a new total "agency" score.
  // Chinese source: BPNSFS manual (2022), pp.29–30; task-specific instructions
  // are an adaptation and require cognitive interviews in this pilot.
  const needsItems=[
    ['autonomy1','对于我所做的事情，我有可以自己去自由选择的感觉'],
    ['competence5','我有信心自己能把事情做好'],
    ['autonomy7','我感觉我的决定反映了我真正想要的'],
    ['competence11','我觉得自己做事能力挺强的'],
    ['autonomy13','我感觉我所做的选择表达了我真实的自己'],
    ['competence17','我觉得我有能力去达成自己的目标'],
    ['autonomy19','我感觉我一直在做自己真正感兴趣的事情'],
    ['competence23','我感到我能成功完成有难度的任务']
  ];
  surveys.final=[...needsItems,...surveys.final.filter(([k])=>!['agency','efficacy'].includes(k))];
  const instrument={version:'pilot-questionnaire-20261025-v2',source:'https://selfdeterminationtheory.org/wp-content/uploads/2022/08/BPNSFS_Complete_2022.pdf',sourcePages:'29–30',status:'Chinese_source_task_instruction_adaptation_not_revalidated',instructions:'请只回想刚才这一次学习，判断下面的描述有多符合你的实际感受。1＝完全不符合，5＝完全符合；可选择不愿回答。',groups:{autonomySatisfaction:['autonomy1','autonomy7','autonomy13','autonomy19'],competenceSatisfaction:['competence5','competence11','competence17','competence23']},interpretation:'自主需求满足不等于完整 agency；能力需求满足不等于任务自我效能。其他单项及设置问卷为自编预试条目。'};
  function scoreSurvey(input){return Object.fromEntries(Object.entries(instrument.groups).map(([k,ids])=>{const complete=ids.every(id=>Number.isInteger(input?.[id])&&input[id]>=1&&input[id]<=5);return [k,{mean:complete?ids.reduce((s,id)=>s+input[id],0)/ids.length:null,answered:ids.filter(id=>Number.isInteger(input?.[id])).length,total:ids.length,missingRule:'all_four_required_no_imputation'}];}));}
  return {version,dimensions,reasons,defaults,validate,profile,surveys,instrument,scoreSurvey,optionsFor,reasonsFor,previewFor,configurationPolicy};
});
