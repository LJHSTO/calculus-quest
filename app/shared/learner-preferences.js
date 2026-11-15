(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LearnerPreferences = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const version = 'learner-preferences-20261114-v9';
  const dimensions = [
    {id:'D1',title:'什么时候算是我可能卡住了',short:'判断依据',description:'“知点”是本网站中可以和你讨论课程的 AI 学习伙伴。它会参考你的答题和操作记录，判断是否需要提供帮助。',options:[
      ['standard','有明确线索，就考虑帮助','答题或操作结果显示可能卡住时，知点就可以提醒你。'],
      ['cautious','等多个线索一致，再考虑帮助','答题、操作等不同方面都显示可能遇到困难时，再提醒你。']],default:'standard',preview:'例如：一次独立检查答错后，第一种方式可以考虑帮助；第二种方式还会等待其他方面的线索。'},
    {id:'D2',title:'什么时候可以出现帮助',short:'介入时机',description:'输入、拖动和独立测验期间都会保持安静。这里决定其他学习时刻的等待方式。',options:[
      ['boundary','等我完成当前小步','在提交、切换等小步骤结束时再出现。'],
      ['quiet','完成小步后，少来打扰','在小步骤结束时询问，同一知识点两次主动帮助至少间隔3分钟。']],default:'boundary',preview:'输入或拖动时保持安静。完成小步后，知点根据新出现的困难证据询问；普通探索不触发帮助，同一证据不重复询问。选择“我先自己试”后，本知识点至少2分钟不再询问。'},
    {id:'D3',title:'遇到难题，先怎样帮我',short:'讲解方式',description:'选择第一次帮助的讲法。你可以只看一个线索，也可以先看步骤或相关例子，再自己完成当前题目。',options:[
      ['hint','先给一个线索','保留更多自己尝试的空间。'],
      ['guided','引导我想几个小步骤','用少量问题或步骤帮助我继续。'],
      ['example','先看一个相关例子','用另一组数演示关键一步，再由我尝试当前题目。']],default:'hint',preview:'遇到极限题：可以先提醒你比较左右趋势，也可以引导你分步比较，或者先用另一组数演示。'},
    {id:'D4',title:'帮助放在哪里',short:'提示位置',description:'只选择阅读帮助的位置。是否先征求你的同意，由下一项“出现方式”决定。',options:[
      ['inline','当前任务旁','在课件或题目的独立帮助区阅读。'],['compact','任务旁 · 点击展开正文'],
      ['sidebar','对话侧栏','通过提醒打开侧栏，集中阅读和继续讨论。'],['sidebar_compact','侧栏 · 点击展开正文']],default:'inline',preview:'同一条帮助可以放在任务旁或侧栏。选择位置不会改变帮助内容，也不会代替你同意接受帮助。'},
    {id:'D5',title:'先询问我，还是直接显示提示',short:'出现方式',description:'选择知点发现你可能卡住时怎么出现。你随时可以关闭提示，或主动向知点提问。',options:[
      ['ask','先问我，再提供帮助','先问你要不要一起看看，点击需要后再开始讲解。'],
      ['cue','允许直接显示知识提示','按前面选择的程度直接显示知识提示；其他支持仍由你确认需要。'],
      ['request','这次只在我求助时回应','关闭自动询问；你仍能主动向知点提问。']],default:'ask',preview:'“要一起看看左右两边的变化吗？”你可以选择需要、不需要或稍后；不回答不会自动进入帮助。'},
    {id:'D6',title:'看过帮助后，还没弄懂怎么办',short:'帮助后怎么继续',description:'选择一次提示之后的安排。无论选哪种方式，你都可以随时在输入框里提问。',options:[
      ['stop','结束这次帮助，我先自己试','本次帮助后不接着提供第二轮；之后有新线索时，知点再判断是否询问。'],
      ['followup','我表示仍有困难时，再帮一次','只有你反馈仍有困难并选择继续，才提供一次补充帮助；不回应就结束等待。']],default:'followup',preview:'例如：你看过“比较左右趋势”的提示，仍然不理解。选择再帮一次后，你可以请求一个更具体的提示；选择先自己试，则结束本轮帮助。两者都不会自动发跨天消息。'}
  ];
  const reasons = [['fit','适合我平时的学习方式'],['independence','想保留自己思考的空间'],['support','希望卡住时更容易得到支持'],['focus','希望减少打断或操作负担'],['try','不确定，先试用这个选择'],['default','先使用默认设置'],['other','其他原因'],['decline','暂不说明理由']];
  const dimensionReasons={
    D1:[['evidence','希望知点根据可靠的学习记录判断'],['missed_help','担心困难没有被及时发现'],['false_alarm','不希望知点误判我需要帮助']],
    D2:[['finish_step','想先完成眼前这一步'],['less_interrupt','希望集中学习，少被打断'],['timely','希望困难出现后不用等太久']],
    D3:[['think_first','想保留自己推理的过程'],['small_steps','希望把困难拆成几个小步骤'],['example_first','看到具体例子更容易理解']],
    D4:[['near_task','希望不用离开当前题目或课件'],['less_space','希望提示少占屏幕空间'],['separate_chat','希望把帮助和课件分开放']],
    D5:[['confirm_first','想先决定是否需要这次帮助'],['direct_cue','希望直接看到所选的知识提示，少点一次'],['predictable','希望清楚知道知点下一步会做什么']],
    D6:[['try_after','看过提示后想先独立尝试'],['continue_help','担心一次提示仍然不够'],['control_end','希望由我决定这次帮助何时结束']]
  };
  const previews={
    D1:{standard:'例如：一次独立检查答错且证据达到判断条件时，知点可以考虑提供帮助。是否先询问，由“出现方式”设置决定。普通拖动、比较、停留不会单独触发帮助；没有点击、阅读较慢不代表没有学习意愿。',cautious:'知点等待至少两类一致的困难线索，再提供帮助。是否先询问，由“出现方式”设置决定。可能减少误判，也可能错过只有一种证据的困难。普通探索和操作少本身都不是困难证据。'},
    D2:{boundary:'在你完成小步后，知点根据新出现的困难考虑帮助，例如提交检测后答错，或连续两次挑战出错。普通提醒至少间隔1分钟；选择这次先不看后，同一知识点至少2分钟不再询问。',quiet:'同样等待小步结束，同一知识点两次主动帮助至少间隔3分钟。你可以随时主动向知点提问。'},
    D3:{hint:'先提供一个概念线索，例如“先分别看左右两边趋向哪里”。确认还需要帮助后，可逐步增加到小步骤提示。',guided:'先将当前困难拆成少量小步骤，例如先看左侧，再看右侧。继续帮助仍由你选择，不会代替你提交答案。',example:'先看相关的局部示例，示例演示其中一步。你仍需要自己完成当前任务；不会展示整道独立测验的答案。'},
    D4:{inline:'出现帮助时，在当前课件或题目旁的提示区域阅读。完整对话仍可在侧栏打开，提示不覆盖图形和答题控件。',compact:'出现帮助时先看到可展开的小提示，点击后阅读正文。没有展开时，只记作提示已出现，不记作你已阅读正文。',sidebar:'出现帮助时，通过可见提醒打开侧栏阅读。课件仍留在主区域。'},
    D5:{ask:'发现可能困难后先问“这一步需要帮助吗？”。你选择需要后才给支持，也可以拒绝或稍后；没有回应不会视为同意。',cue:'发现有依据的知识困难后，可以直接显示你在“讲解方式”中选的线索、小步骤或局部示例，你可以关闭。涉及动机、情绪等支持时仍需你说明需要；不会替你作答。',request:'普通学习中关闭自动询问，仅在你主动向知点提问时回应。此项不作为本轮实验组的常规选择，实验中仍可暂停帮助或退出。'},
    D6:{stop:'看完这次提示后结束本轮帮助，不自动接上第二轮。你可以自己尝试、反馈有没有用。之后出现新线索时，知点再判断是否询问。',followup:'看完提示仍不理解时，你可以反馈“仍有困难”并选择继续，再获得一次补充帮助。补充仍会等待所选间隔和合适的小步结束；没有请求或选择结束时，不会追着询问，也不包含跨天提醒。'}
  };
  // Retain legacy values for reading historical records; new choices use two locations.
  const optionsFor=(id,experimental=false)=>dimensions.find(d=>d.id===id).options.filter(o=>!(experimental&&id==='D5'&&o[0]==='request')&&!(id==='D4'&&o[0].includes('compact')));
  // Goals concern the dimension, not a preferred setting. Keep all historic
  // reason codes readable, without changing the meaning of earlier responses.
  const currentReasons={
    D1:[['evidence_quality','我在意判断依据是否可靠'],['noticed_difficulty','我在意真正的困难能否被发现'],['mistaken_need','我在意正常思考会不会被当成困难']],
    D2:[['thinking_rhythm','我在意能否连贯地完成思考'],['wait_for_help','我在意遇到困难后要等多久'],['timing_fit','我想看看提醒能否出现在合适的时刻']],
    D3:[['connect_knowledge','我想把新内容和已经懂的内容连起来'],['find_reason','我想弄清自己为什么会卡住或做错'],['explain_alone','我想在看过帮助后，能自己说明并完成新题']],
    D4:[['compare_material','我在意能否方便地对照帮助和课件'],['visual_attention','我在意阅读时注意力怎样分配'],['continue_dialogue','我在意能否方便地找到并继续这段讨论']],
    D5:[['choose_help','我在意能否自己决定接受这次帮助'],['effort_to_open','我在意看到帮助需要多少操作'],['expected_behavior','我想让知点的出现方式符合自己的预期']],
    D6:[['sufficient_help','我在意一次帮助是否足够解决困难'],['practice_chance','我在意看过帮助后是否有机会自己尝试'],['end_control','我在意能否清楚地继续或结束帮助']]
  };
  const allReasonsFor=id=>[...(currentReasons[id]||[]),...(dimensionReasons[id]||[]),...reasons];
  const reasonLabel=(id,value)=>allReasonsFor(id).find(r=>r[0]===value)?.[1]||'';
  const reasonsFor=(id,savedReason='')=>{
    const choices=[...(currentReasons[id]||[]),...reasons.filter(r=>['try','other'].includes(r[0]))];
    const saved=allReasonsFor(id).find(r=>r[0]===savedReason);
    if(saved&&!choices.some(r=>r[0]===savedReason))choices.push(saved);
    return choices;
  };
  const previewFor=(id,value)=>previews[id]?.[value]||dimensions.find(d=>d.id===id).preview;
  const configurationPolicy={version:'context-edits-20261027-v2',editing:'before_learning_or_after_submitted_formative',rehearsalEditing:'knowledge_units_with_assessment_and_support_protection',experimentalD5:['ask','cue'],defaultRationale:'当前设置：完成一个小步骤后先询问你，在任务旁给一个线索；如果仍有困难，可以再请求一次帮助。你可以按自己的习惯调整。',defaultProvenance:'designer_selected_not_empirically_optimal'};
  const defaults = () => Object.fromEntries(dimensions.map(d=>[d.id,{value:d.default,reason:'',note:''}]));
  function validate(input,context={}) {
    if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!dimensions.some(d=>d.id===k))) throw new Error('请完成六项学习偏好');
    return Object.fromEntries(dimensions.map(d=>{
      const a=input[d.id];
      if(context.experimental&&d.id==='D5'&&a?.value==='request')throw new Error('本轮实验组须保留主动帮助；仍可拒绝、暂停或退出预试');
      if(!a || !d.options.some(o=>o[0]===a.value) || !allReasonsFor(d.id).some(r=>r[0]===a.reason))throw new Error('请选择'+d.short+'及选择理由');
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
    const display=displayParts(a.D4.value);p.placement=display.placement;p.presentationFormat=display.format;
    p.authorityLevel=a.D5.value==='cue'?'A2':'A1';p.supportInquiryEnabled=a.D5.value==='ask';if(a.D5.value==='request')p.proactivity='reactive';
    p.supportFollowups=a.D6.value==='followup'?1:0;p.maxEscalations=a.D6.value==='followup'?1:0;
    return p;
  }
  const surveys={
    baseline:[['efficacy','不借助知点，我有把握理解并完成本次函数与极限任务。'],['interest','我对学习本次内容感兴趣。'],['value','我觉得本次学习内容值得投入时间。']],
    final:[['agency','本次学习中，我能按自己的目标决定学习和求助方式。'],['efficacy','不借助知点，我有把握完成同类函数与极限任务。'],['interest','本次学习内容让我感兴趣。'],['value','我觉得本次学习内容有用。'],['workload','本次学习让我感到费力。'],['disruption','学习过程中出现的信息打断了我的思路。'],['usability','我能顺利找到并使用需要的功能。']],
    configuration:[['understood','我理解这些设置会怎样影响知点。'],['burden','选择和调整设置让我感到负担。'],['alignment','知点的实际行为符合我对设置的理解。']]
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
  const taskConfidence=[['efficacy_rule','不借助知点，我有把握根据给定规则比较输出并说明理由。'],['efficacy_nearby','不借助知点，我有把握区分一个点的取值和它附近的变化。'],['efficacy_evidence','不借助知点，我有把握判断一条函数结论是否被现有证据支持。']];
  surveys.baseline=[...taskConfidence,['interest','我对继续了解函数与极限感兴趣。'],['value','我觉得理解函数与极限值得投入时间。']];
  surveys.final=[...needsItems,...taskConfidence,...surveys.baseline.filter(([k])=>['interest','value'].includes(k)),['workload','完成这次学习任务需要我投入多少脑力？'],['disruption','知点主动出现的信息打断了我的思路。'],['usability','我能顺利找到并使用需要的学习功能。']];
  const instrument={version:'pilot-questionnaire-functions-r10-20261106',source:'https://selfdeterminationtheory.org/wp-content/uploads/2022/08/BPNSFS_Complete_2022.pdf',sourcePages:'29–30',status:'Chinese_source_task_instruction_adaptation_not_revalidated',instructions:'请只回想刚才这一次学习，包括讲解、交互和应用例子，判断下面的描述有多符合你的实际感受。有关知点的问题按你实际遇到的帮助作答，不需要猜测。1＝完全不符合，5＝完全符合；请完成每一道必答题。',groups:{autonomySatisfaction:['autonomy1','autonomy7','autonomy13','autonomy19'],competenceSatisfaction:['competence5','competence11','competence17','competence23']},interpretation:'自主需求满足不等于完整 agency；能力需求满足不等于任务自我效能。兴趣与价值单项分别描述体验，不等于内在动机总量表或学习成绩；其他单项及设置问卷为自编预试条目。'};
  function scoreSurvey(input){return Object.fromEntries(Object.entries(instrument.groups).map(([k,ids])=>{const complete=ids.every(id=>Number.isInteger(input?.[id])&&input[id]>=1&&input[id]<=5);return [k,{mean:complete?ids.reduce((s,id)=>s+input[id],0)/ids.length:null,answered:ids.filter(id=>Number.isInteger(input?.[id])).length,total:ids.length,missingRule:'all_four_required_no_imputation'}];}));}
  function displayParts(value){return {placement:value.startsWith('sidebar')?'sidebar':'inline',format:value.includes('compact')?'disclosure':'plain'};}
  function displayValue(placement,format){return placement==='sidebar'?(format==='disclosure'?'sidebar_compact':'sidebar'):(format==='disclosure'?'compact':'inline');}
  function behaviorSummary(answers) {
    // A preview uses the same mapping as the saved policy, without requiring a rationale yet.
    const draft=Object.fromEntries(dimensions.map(d=>[d.id,{value:answers?.[d.id]?.value||d.default,reason:'default',note:''}]));
    const p=profile(draft,{});
    return [
      ['D1',p.minimumEvidenceFamilies===2?'等待至少两类一致的困难线索':'有明确困难线索时考虑帮助'],
      ['D2',draft.D2.value==='quiet'?'任务边界询问，同一知识点至少间隔3分钟':'任务边界询问；新的连续错误及时帮助，普通询问至少间隔1分钟'],
      ['D3',({L2:'先给一个概念线索',L3:'先给少量引导步骤',L5:'先给一个局部示例'})[p.initialSupportLevel]],
      ['D4',p.placement==='inline'?'在当前任务旁阅读；不覆盖操作区':'通过提醒打开侧栏'],
      ['D5',p.proactivity==='reactive'?'只回应你的主动求助':p.supportInquiryEnabled?'确认需要后才提供帮助':'可直接显示知识提示；其他支持仍先确认'],
      ['D6',p.supportFollowups?'你表示仍有困难并选择继续后，再补充一次':'结束本轮帮助，留给你独立尝试']
    ];
  }
  return {version,dimensions,reasons,defaults,validate,profile,surveys,instrument,scoreSurvey,optionsFor,reasonsFor,reasonLabel,previewFor,behaviorSummary,configurationPolicy,displayParts,displayValue};
});
