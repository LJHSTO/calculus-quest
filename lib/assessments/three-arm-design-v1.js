"use strict";
// Versioned participant instruments; prior definitions are retained in instrument history.
module.exports = {
  "version": "three-arm-measures-functions-r19-20261114",
  "origin": "保留六维配置决策任务与原三组结构；配套一套结合概念理解、课程测验与应用兴趣的函数极限综合课程；2026-11-12按weekly to-do补充学习前背景与主动式AI经验、当天结束问卷的控制感/理解/求助判断/核对/信任/依赖及两道情境题；2026-11-13中段改为使用记录与保持/调整决定，移除重复体验评分与必填计划；被试用语改为知点并简化情境说明。；2026-11-14三组均先完成最终回顾再填写结束问卷，情境题改为依据具体记录作出配置选择并提出检验办法。",
  "status": "draft_for_pilot",
  "configurationCases": [
    {
      "id": "J1",
      "focus": "D1 判断依据",
      "prompt": "小林常花较长时间读关系图，有时不点击，但两次独立检查都答对了。他说不希望仅凭阅读慢就被认为卡住。现在使用“有明确线索就考虑帮助”。你建议保持还是调整？具体怎样做、依据是什么、接下来观察什么？",
      "guide": "可以选择等待多个线索一致，也可以保留标准判断并要求看真正困难证据。高质量答案应知道阅读慢本身不等于困难，且说明若之后独立检查持续出错应重新考虑。"
    },
    {
      "id": "J2",
      "focus": "D2 介入时机",
      "prompt": "小周正在连续拖动参数比较变化，希望先完成自己的比较；他也担心真正卡住时等太久。两种时机设置都不会在拖动中打断。你会怎样安排主动提醒？如果中途急需帮助怎么办？下一阶段观察什么？",
      "guide": "可保持普通边界或选少打扰，理由要围绕集中探索与及时求助的权衡。知道少打扰仍需任务边界，等待期间仍可主动提问；不能声称间隔到期一定弹窗。"
    },
    {
      "id": "J3",
      "focus": "D3 支持内容",
      "prompt": "小陈选择局部例子，跟着示范完成了两次练习，但新题独立检查只对了一题。他说看懂了例子，却不确定自己能否说清判断过程。下一阶段你会保持还是改变帮助方式？请解释，并说明怎样检查这个决定是否有用。",
      "guide": "少量步骤、一个线索或保留局部示例并增加自己的解释，都可以合理。关键是区分跟随示范和独立解释，并计划用新题检验；不按“越少帮助越好”评分。"
    },
    {
      "id": "J4",
      "focus": "D4 提示位置",
      "prompt": "小杨在空间视角中旋转图形，侧栏曾出现提醒，但他没有打开正文；他完成了当前操作，独立检查仍有一题不会。你会怎样设置帮助位置？需要先查明什么，之后如何验证？",
      "guide": "先区分提醒出现与正文可见，可改为清楚可见的任务旁帮助，也可保留侧栏并明确阅读时机。不能把没有打开正文当作读过或拒绝内容；应观察正文可见和后续独立检查。"
    },
    {
      "id": "J5",
      "focus": "D5 主动权",
      "prompt": "小赵希望知识卡能直接出现，减少点击；但有关紧张或学习动力的帮助，希望先由自己说明需要。你会选择“先问我”还是“允许直接显示知识提示”？它能改变哪些行为，不能替学生决定什么？",
      "guide": "直接知识提示符合描述；保持先询问若有清楚的控制偏好理由也可。应知道直接显示只适用于知识提示，其他需要仍先确认，助手不会替学生提交答案。"
    },
    {
      "id": "J6",
      "focus": "D6 帮助后继续",
      "prompt": "小吴看过一个概念线索后仍不理解，希望主动请求再补充一次，之后自己试。他还想三天后收到复习通知。这两件事分别应怎样安排？下一次如何判断帮助是否足够？",
      "guide": "本次可选反馈仍有困难后再帮一次；必须主动请求，最多一轮。三天后提醒属于实验日程，不是D6。可用后续独立解释或新题检查帮助是否足够。"
    }
  ],
  "configurationRubric": [
    [
      "设置理解",
      "0：误解选项的作用；1：大体正确但遗漏重要行为；2：准确说明相关设置怎样改变助手。"
    ],
    [
      "证据与理由",
      "0：无依据或与材料冲突；1：有一般偏好但未连接情境；2：明确引用情境证据并解释选择或维持的理由。"
    ],
    [
      "后续检验",
      "0：没有检查计划；1：只说看效果或看感觉；2：给出可观察的后续检查，如正文可见、新题独立解释或是否再次被误打断。"
    ]
  ],
  "surveys": [
    {
      "id": "demo_age",
      "text": "你的年龄段？",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "人口学背景",
      "group": "A B C",
      "time": "前测前",
      "scale": "单选",
      "source": "本方案；招募要求年满18周岁",
      "type": "choice",
      "options": [
        "18–19岁",
        "20–21岁",
        "22–23岁",
        "24岁及以上"
      ],
      "section": "关于你"
    },
    {
      "id": "demo_gender",
      "text": "你的性别？",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "人口学背景",
      "group": "A B C",
      "time": "前测前",
      "scale": "单选",
      "source": "本方案",
      "type": "choice",
      "options": [
        "女",
        "男",
        "其他或不便说明"
      ],
      "section": "关于你"
    },
    {
      "id": "demo_grade",
      "text": "你目前的年级？",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "人口学背景",
      "group": "A B C",
      "time": "前测前",
      "scale": "单选",
      "source": "本方案",
      "type": "choice",
      "options": [
        "大一",
        "大二",
        "大三",
        "大四及以上",
        "研究生"
      ],
      "section": "关于你"
    },
    {
      "id": "demo_major",
      "text": "你的专业属于哪一类？",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "专业背景",
      "group": "A B C",
      "time": "前测前",
      "scale": "单选",
      "source": "本方案；预实验招募文科专业本科生",
      "type": "choice",
      "options": [
        "人文（文史哲、语言等）",
        "社会科学（经管法、教育、心理等）",
        "理学或工学",
        "医学或农学",
        "艺术或体育",
        "其他"
      ],
      "section": "关于你"
    },
    {
      "id": "ai_experience",
      "text": "过去一个月，你使用AI帮助学习的频率如何？",
      "status": "本方案自编背景题 待预试",
      "construct": "使用经历",
      "group": "A B C",
      "time": "前测前",
      "scale": "从未 偶尔 每周数次 几乎每天",
      "source": "本方案",
      "type": "choice",
      "options": [
        "从未",
        "偶尔",
        "每周数次",
        "几乎每天"
      ],
      "section": "关于你"
    },
    {
      "id": "topic_experience",
      "text": "此前是否学过本次函数、极限与连续的内容？",
      "status": "本方案自编背景题 待预试",
      "construct": "内容经历",
      "group": "A B C",
      "time": "前测前",
      "scale": "未学过 接触过但不熟悉 已系统学过",
      "source": "本方案",
      "type": "choice",
      "options": [
        "未学过",
        "接触过但不熟悉",
        "已系统学过"
      ],
      "section": "关于你"
    },
    {
      "id": "baseline_efficacy_rule",
      "text": "不借助知点，我有把握根据给定规则比较输出并说明理由。",
      "time": "前测前",
      "group": "A B C",
      "construct": "任务自我效能",
      "scale": "1＝毫无把握，5＝非常有把握",
      "status": "自编条目，待认知访谈与预试",
      "source": "函数极限研究版 r7",
      "section": "对这部分内容的把握"
    },
    {
      "id": "baseline_efficacy_nearby",
      "text": "不借助知点，我有把握区分一个点的取值和它附近的变化。",
      "time": "前测前",
      "group": "A B C",
      "construct": "任务自我效能",
      "scale": "1＝毫无把握，5＝非常有把握",
      "status": "自编条目，待认知访谈与预试",
      "source": "函数极限研究版 r7",
      "section": "对这部分内容的把握"
    },
    {
      "id": "baseline_efficacy_evidence",
      "text": "不借助知点，我有把握判断一条函数结论是否被现有证据支持。",
      "time": "前测前",
      "group": "A B C",
      "construct": "任务自我效能",
      "scale": "1＝毫无把握，5＝非常有把握",
      "status": "自编条目，待认知访谈与预试",
      "source": "函数极限研究版 r7",
      "section": "对这部分内容的把握"
    },
    {
      "id": "baseline_interest",
      "text": "我对继续了解函数与极限感兴趣。",
      "time": "前测前",
      "group": "A B C",
      "construct": "baseline_interest",
      "scale": "1＝完全不符合，5＝完全符合",
      "status": "自编条目，待认知访谈与预试",
      "source": "函数极限研究版 r7",
      "section": "对这部分内容的兴趣"
    },
    {
      "id": "baseline_value",
      "text": "我觉得理解函数与极限值得投入时间。",
      "time": "前测前",
      "group": "A B C",
      "construct": "baseline_value",
      "scale": "1＝完全不符合，5＝完全符合",
      "status": "自编条目，待认知访谈与预试",
      "source": "函数极限研究版 r7",
      "section": "对这部分内容的兴趣"
    },
    {
      "id": "pa_experience",
      "text": "你用过会主动给建议的 AI 工具吗？例如答错后显示提示，不需要你先提问。",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "主动式AI使用经验",
      "group": "A B C",
      "time": "前测前",
      "scale": "单选",
      "source": "本方案；weekly to-do 2026-11-11",
      "type": "choice",
      "options": [
        "从未用过",
        "用过一两次",
        "有时使用",
        "经常使用"
      ],
      "section": "你使用 AI 学习工具的经历与想法"
    },
    {
      "id": "pa_preference",
      "text": "我希望 AI 学习工具在我可能卡住时，主动来问我是否需要帮助。",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "对主动帮助的偏好",
      "group": "A B C",
      "time": "前测前",
      "scale": "1＝完全不符合，5＝完全符合",
      "source": "本方案；weekly to-do 2026-11-11",
      "section": "你使用 AI 学习工具的经历与想法"
    },
    {
      "id": "pa_interrupt_concern",
      "text": "我担心 AI 主动出现会打断我的思路。",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "预期打扰",
      "group": "A B C",
      "time": "前测前",
      "scale": "1＝完全不符合，5＝完全符合",
      "source": "本方案；Li, Edwards & Lee (2002) 侵扰感思路改写为单项",
      "section": "你使用 AI 学习工具的经历与想法"
    },
    {
      "id": "pa_control_desire",
      "text": "什么时候得到 AI 帮助、得到多少，我希望由自己决定。",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "对控制的期望",
      "group": "A B C",
      "time": "前测前",
      "scale": "1＝完全不符合，5＝完全符合",
      "source": "本方案；Burger & Cooper (1979) 控制欲思路改写为单项，不作为原量表分",
      "section": "你使用 AI 学习工具的经历与想法"
    },
    {
      "id": "pa_verify_habit",
      "text": "使用 AI 学习时，我会核对它给出的解释是否正确。",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "核对与批判性使用",
      "group": "A B C",
      "time": "前测前",
      "scale": "1＝完全不符合，5＝完全符合",
      "source": "本方案；weekly to-do 2026-11-11 批判性思维方向",
      "section": "你使用 AI 学习工具的经历与想法"
    },
    {
      "id": "hs_monitor_trait",
      "text": "遇到不会的题，我会先弄清自己卡在哪里，再决定要不要求助。",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "求助前的自我监控",
      "group": "A B C",
      "time": "前测前",
      "scale": "1＝完全不符合，5＝完全符合",
      "source": "本方案；MSLQ元认知自我调节与Karabenick (2003) 求助思路改写为单项",
      "section": "你使用 AI 学习工具的经历与想法"
    },
    {
      "id": "pa_ideal",
      "text": "你理想中的 AI 学习工具，什么时候应该主动出现？（选填，一句话即可）",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "对主动式助手的认识",
      "group": "A B C",
      "time": "前测前",
      "scale": "开放回答，可不填",
      "source": "本方案；weekly to-do 2026-11-11",
      "type": "text",
      "optional": true,
      "section": "你使用 AI 学习工具的经历与想法"
    },
    {
      "id": "autonomy1",
      "text": "对于我所做的事情，我有可以自己去自由选择的感觉",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "自主需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "competence5",
      "text": "我有信心自己能把事情做好",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "能力需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "autonomy7",
      "text": "我感觉我的决定反映了我真正想要的",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "自主需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "competence11",
      "text": "我觉得自己做事能力挺强的",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "能力需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "autonomy13",
      "text": "我感觉我所做的选择表达了我真实的自己",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "自主需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "competence17",
      "text": "我觉得我有能力去达成自己的目标",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "能力需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "autonomy19",
      "text": "我感觉我一直在做自己真正感兴趣的事情",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "自主需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "competence23",
      "text": "我感到我能成功完成有难度的任务",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "能力需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "efficacy_rule",
      "text": "不借助知点，我有把握根据给定规则比较输出并说明理由。",
      "time": "即时后测后",
      "group": "A B C",
      "construct": "任务自我效能",
      "scale": "1＝毫无把握，5＝非常有把握",
      "status": "自编条目，待认知访谈与预试",
      "source": "函数极限研究版 r7"
    },
    {
      "id": "efficacy_nearby",
      "text": "不借助知点，我有把握区分一个点的取值和它附近的变化。",
      "time": "即时后测后",
      "group": "A B C",
      "construct": "任务自我效能",
      "scale": "1＝毫无把握，5＝非常有把握",
      "status": "自编条目，待认知访谈与预试",
      "source": "函数极限研究版 r7"
    },
    {
      "id": "efficacy_evidence",
      "text": "不借助知点，我有把握判断一条函数结论是否被现有证据支持。",
      "time": "即时后测后",
      "group": "A B C",
      "construct": "任务自我效能",
      "scale": "1＝毫无把握，5＝非常有把握",
      "status": "自编条目，待认知访谈与预试",
      "source": "函数极限研究版 r7"
    },
    {
      "id": "interest",
      "text": "我对继续了解函数与极限感兴趣。",
      "status": "网站现有自编单项 待预试",
      "construct": "interest",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合",
      "source": "app/shared/learner-preferences.js"
    },
    {
      "id": "value",
      "text": "我觉得理解函数与极限值得投入时间。",
      "status": "网站现有自编单项 待预试",
      "construct": "value",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合",
      "source": "app/shared/learner-preferences.js"
    },
    {
      "id": "workload",
      "text": "完成这次学习任务需要我投入多少脑力？",
      "status": "自编单项，不作为NASA-TLX或认知负荷多维量表",
      "construct": "主观脑力投入",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1＝很少，5＝很多",
      "source": "app/shared/learner-preferences.js"
    },
    {
      "id": "disruption",
      "text": "知点主动出现的信息打断了我的思路。",
      "status": "网站现有自编单项 待预试",
      "construct": "感知打断",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合",
      "source": "app/shared/learner-preferences.js",
      "allowNotApplicable": true,
      "notApplicableLabel": "不适用：本次没有收到主动信息"
    },
    {
      "id": "usability",
      "text": "我能顺利找到并使用需要的学习功能。",
      "status": "网站现有自编单项 待预试",
      "construct": "usability",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合",
      "source": "app/shared/learner-preferences.js"
    },
    {
      "id": "agent_control",
      "text": "我能决定是否接受知点的帮助，以及接受到什么程度。",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "对助手的控制感",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1＝完全不符合，5＝完全符合",
      "source": "本方案；Sundar & Marathe (2010) 控制感思路改写；教师版问卷“控制感”",
      "section": "知点与帮助"
    },
    {
      "id": "agent_rationale",
      "text": "我理解知点为什么会在那个时候出现。",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "介入理由的可理解性",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1＝完全不符合，5＝完全符合",
      "source": "本方案；教师版问卷“可理解”",
      "section": "知点与帮助",
      "allowNotApplicable": true,
      "notApplicableLabel": "知点这次没有主动出现"
    },
    {
      "id": "helpseek_judgment",
      "text": "我能判断自己什么时候需要帮助、什么时候不需要。",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "求助判断",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1＝完全不符合，5＝完全符合",
      "source": "本方案；教师版问卷“求助判断”",
      "section": "知点与帮助"
    },
    {
      "id": "agent_verify",
      "text": "知点的解释不一定都对，我会自己核对。",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "核对与批判性使用",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1＝完全不符合，5＝完全符合",
      "source": "本方案；教师版问卷“核对意识”，与学习前同一构念",
      "section": "知点与帮助"
    },
    {
      "id": "agent_trust",
      "text": "我信任知点给出的帮助。",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "信任",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1＝完全不符合，5＝完全符合",
      "source": "本方案；Jian, Bisantz & Drury (2000) 自动化信任思路改写为单项",
      "section": "知点与帮助",
      "allowNotApplicable": true,
      "notApplicableLabel": "这次没有看过知点的帮助"
    },
    {
      "id": "agent_overreliance",
      "text": "有些步骤我本可以自己想出来，却直接接受了知点的帮助。",
      "status": "本方案自编或改写条目，待认知访谈与预试",
      "construct": "依赖校准（分数越高越依赖）",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1＝完全不符合，5＝完全符合",
      "source": "本方案；Lee & See (2004) 适当依赖思路",
      "section": "知点与帮助",
      "allowNotApplicable": true,
      "notApplicableLabel": "这次没有接受过知点的帮助"
    },
    {
      "id": "decision_reason",
      "text": "接下来的学习，要保持还是调整知点的设置？可以补充一次具体的使用经历（选填）。",
      "status": "本方案自编开放题 待预试",
      "construct": "配置理由",
      "group": "B C",
      "time": "中段回顾后的决定",
      "scale": "开放回答 也可暂不说明",
      "source": "本方案",
      "optional": true
    },
    {
      "id": "outside_practice",
      "text": "从上次学习结束到现在，你是否另外学习或练习过函数、极限与连续？如有，大约多久、用了什么资源？",
      "status": "本方案自编背景题 待预试",
      "construct": "额外学习",
      "group": "A B C",
      "time": "三天后主要测验完成后",
      "scale": "没有 有 加简短说明",
      "source": "本方案"
    },
    {
      "id": "usefulness",
      "text": "这次询问或帮助对你有用吗？",
      "time": "一次合格可见的帮助或询问结束后",
      "group": "A B C",
      "construct": "感知有用性",
      "scale": "1至5，按界面端点；可跳过",
      "status": "自编过程条目，不合成满意度总分；帮助询问与正文分开统计",
      "source": "app/main/three-arm-study.js"
    },
    {
      "id": "timing",
      "text": "它出现的时机合适吗？",
      "time": "一次合格可见的帮助或询问结束后",
      "group": "A B C",
      "construct": "感知时机适合",
      "scale": "1至5，按界面端点；可跳过",
      "status": "自编过程条目，不合成满意度总分；帮助询问与正文分开统计",
      "source": "app/main/three-arm-study.js"
    },
    {
      "id": "event_disruption",
      "text": "它打断了你的学习吗？",
      "time": "一次合格可见的帮助或询问结束后",
      "group": "A B C",
      "construct": "事件级打断",
      "scale": "1至5，按界面端点；可跳过",
      "status": "自编过程条目，不合成满意度总分；帮助询问与正文分开统计",
      "source": "app/main/three-arm-study.js"
    },
    {
      "id": "configuration_understood",
      "text": "我理解这些设置会怎样影响知点。",
      "time": "即时后测后",
      "group": "B C",
      "construct": "配置体验：understood",
      "scale": "1＝完全不符合，5＝完全符合",
      "status": "自编条目，单独报告；不作为客观配置能力",
      "source": "原配置问卷，保留并明确构念"
    },
    {
      "id": "configuration_burden",
      "text": "选择和调整设置让我感到负担。",
      "time": "即时后测后",
      "group": "B C",
      "construct": "配置体验：burden",
      "scale": "1＝完全不符合，5＝完全符合",
      "status": "自编条目，单独报告；不作为客观配置能力",
      "source": "原配置问卷，保留并明确构念"
    },
    {
      "id": "configuration_alignment",
      "text": "知点的实际行为符合我对设置的理解。",
      "time": "即时后测后",
      "group": "B C",
      "construct": "配置体验：alignment",
      "scale": "1＝完全不符合，5＝完全符合",
      "status": "自编条目，单独报告；不作为客观配置能力",
      "source": "原配置问卷，保留并明确构念",
      "allowNotApplicable": true,
      "notApplicableLabel": "不适用：本次没有足够的帮助经历来判断"
    },
    {
      "id": "scenario_timing",
      "text": "小周目前选择“完成当前小步后提醒”。第一次，知点在他完成一组图像比较后出现，他拒绝了；第二次，他连续两次做错，接受提示后做对了新题。他希望思考连贯，也不想错过帮助。下一阶段你建议保持，还是改成“完成小步后少来打扰”（同一知识点至少间隔3分钟）？选一项，结合这两次经历说理由，再说说你会观察什么来检验决定。",
      "status": "本方案情境题，量规沿用configurationRubric，待预试",
      "construct": "配置情境判断：介入时机",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "开放回答；按配置情境量规离线双人盲评",
      "source": "基于J2加入具体使用证据与检验要求",
      "type": "text",
      "section": "情境题",
      "rubric": "configurationRubric",
      "sourceCase": "J2",
      "scoringGuide": "保持或调整均可。准确区分边界和间隔得0–2分；引用两次不同经历权衡打断与漏掉帮助得0–2分；提出观察后续接受/拒绝时机及独立检查等可检验指标得0–2分。单说少打扰更好不能得满分。"
    },
    {
      "id": "scenario_initiative",
      "text": "小陈选择“直接显示知识提示”和“先看一个相关例子”。他跟着例子完成两次练习，但离开例子后，两道新题只对了一道。他觉得帮助方便，却担心自己只是照着做。你建议保持设置，还是调整出现方式或讲解方式？写出一个具体安排、依据，以及下一阶段怎样检查它是否有用。",
      "status": "本方案情境题，量规沿用configurationRubric，待预试",
      "construct": "配置情境判断：支持方式与独立理解",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "开放回答；按配置情境量规离线双人盲评",
      "source": "结合J3与J5的证据判断任务",
      "type": "text",
      "section": "情境题",
      "rubric": "configurationRubric",
      "sourceCase": "J3_J5",
      "scoringGuide": "不预设应减少帮助。准确说明所选讲法或出现方式的作用得0–2分；区分跟随示例成功与独立理解，结合当前记录得0–2分；提出用不同数值的新题或独立解释验证得0–2分。保持示例但要求先预测再核对也可满分；单以喜欢或做得快判断不充分。"
    }
  ],
  "understanding": [
    [
      "U1",
      "阅读慢、点击少，是否足以认定学生需要帮助？",
      "不足以；应结合实际任务与学习证据。"
    ],
    [
      "U2",
      "选“少来打扰”后，间隔到期是否一定弹出帮助？",
      "不会；仍需相关线索和合适的任务边界。"
    ],
    [
      "U3",
      "“局部例子”是否等于替我完成并提交当前独立测验？",
      "不是；它演示相关的一步。"
    ],
    [
      "U4",
      "把帮助从任务旁移到侧栏，是否同时改变是否先询问？",
      "不会；位置与主动权分别设置。"
    ],
    [
      "U5",
      "允许直接知识提示，是否也允许系统未经确认就推断我的情绪并介入？",
      "不允许；其他支持仍由学生确认需要。"
    ],
    [
      "U6",
      "“还没懂时再帮一次”是否意味着三天后自动提醒？",
      "不是；它只管本次帮助后的补充。"
    ]
  ],
  "scoringNotes": {
    "needs": "两个完整四题满足分量表分别报告；不合成agency总分。",
    "efficacy": "三题前后同措辞，探索性报告项目及平均数，缺题不计算均分；待检验结构。",
    "singleItems": "兴趣、价值、脑力投入、打断和可用性分别分析，不合成总满意度。应用兴趣不等于学习成绩；兴趣与价值单项不作为内在动机总量表。",
    "missing": "历史null与选填留空均为缺失，na=确实不适用；二者均不当作中点或零分。新版必答题不接受null。",
    "cases": "同一份六案例由所有组在延迟测量后独立作答；盲评允许有依据的保持或调整。",
    "background": "人口学与主动式AI经验题只用于描述样本和作探索性调节变量，不作为结果。",
    "agentItems": "控制感、理解、求助判断、核对、信任、依赖为单项分别报告，不合成总分；依赖题分数越高表示越依赖。",
    "scenarios": "两道当天情境题按configurationRubric三项0–2分离线双人盲评，每题0–6分，分开报告；未作答记缺失，不当作0分。三天后的调节任务另行评分，二者不合并。"
  },
  "removedItems": [
    {
      "id": "forecast",
      "reason": "原条目没有接入三组界面，本版不声称采集成绩预测或元认知校准数据。"
    }
  ]
};
