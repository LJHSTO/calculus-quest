"use strict";
// Versioned study items; guides are sent only to authorized raters.
module.exports = {
  "version": "three-arm-measures-20261031-v1",
  "origin": "六维主动学习助手三组实验方案 20261030-v1",
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
      "id": "autonomy1",
      "text": "对于我所做的事情，我有可以自己去自由选择的感觉",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "自主需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "competence5",
      "text": "我有信心自己能把事情做好",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "能力需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "autonomy7",
      "text": "我感觉我的决定反映了我真正想要的",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "自主需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "competence11",
      "text": "我觉得自己做事能力挺强的",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "能力需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "autonomy13",
      "text": "我感觉我所做的选择表达了我真实的自己",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "自主需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "competence17",
      "text": "我觉得我有能力去达成自己的目标",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "能力需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "autonomy19",
      "text": "我感觉我一直在做自己真正感兴趣的事情",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "自主需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "competence23",
      "text": "我感到我能成功完成有难度的任务",
      "status": "成熟量表来源 本次学习指导语适配",
      "construct": "能力需要满足",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "网站现有BPNSFS中文条目；官方手册第29至30页"
    },
    {
      "id": "interest",
      "text": "本次学习内容让我感兴趣。",
      "status": "网站现有自编单项 待预试",
      "construct": "interest",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "app/shared/learner-preferences.js"
    },
    {
      "id": "value",
      "text": "我觉得本次学习内容有用。",
      "status": "网站现有自编单项 待预试",
      "construct": "value",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "app/shared/learner-preferences.js"
    },
    {
      "id": "workload",
      "text": "本次学习让我感到费力。",
      "status": "网站现有自编单项 待预试",
      "construct": "workload",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "app/shared/learner-preferences.js"
    },
    {
      "id": "disruption",
      "text": "学习过程中出现的信息打断了我的思路。",
      "status": "网站现有自编单项 待预试",
      "construct": "disruption",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "app/shared/learner-preferences.js"
    },
    {
      "id": "usability",
      "text": "我能顺利找到并使用需要的功能。",
      "status": "网站现有自编单项 待预试",
      "construct": "usability",
      "group": "A B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "app/shared/learner-preferences.js"
    },
    {
      "id": "understood",
      "text": "我理解这些设置会怎样影响助手。",
      "status": "网站现有自编配置题 待预试",
      "construct": "配置体验",
      "group": "B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "app/shared/learner-preferences.js"
    },
    {
      "id": "burden",
      "text": "选择和调整设置让我感到负担。",
      "status": "网站现有自编配置题 待预试",
      "construct": "配置体验",
      "group": "B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "app/shared/learner-preferences.js"
    },
    {
      "id": "alignment",
      "text": "助手的实际行为符合我对设置的理解。",
      "status": "网站现有自编配置题 待预试",
      "construct": "配置体验",
      "group": "B C",
      "time": "即时后测后",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "app/shared/learner-preferences.js"
    },
    {
      "id": "review_understanding",
      "text": "本次回顾帮助我分清了哪些内容已能独立完成。",
      "status": "本方案自编过程题 待预试",
      "construct": "回顾体验",
      "group": "A B C",
      "time": "两次回顾各一次",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "本方案"
    },
    {
      "id": "review_action",
      "text": "本次回顾帮助我确定了下一步怎样学习。",
      "status": "本方案自编过程题 待预试",
      "construct": "回顾体验",
      "group": "A B C",
      "time": "两次回顾各一次",
      "scale": "1至5 完全不符合至完全符合 可选不愿回答",
      "source": "本方案"
    },
    {
      "id": "baseline_efficacy",
      "text": "不借助助手，我有把握理解并完成本次函数与极限任务。",
      "status": "网站现有自编单项 待预试",
      "construct": "任务信心",
      "group": "A B C",
      "time": "前测前",
      "scale": "1至5",
      "source": "网站基线问卷"
    },
    {
      "id": "baseline_interest",
      "text": "我对学习本次内容感兴趣。",
      "status": "网站现有自编单项 待预试",
      "construct": "兴趣",
      "group": "A B C",
      "time": "前测前",
      "scale": "1至5",
      "source": "网站基线问卷"
    },
    {
      "id": "baseline_value",
      "text": "我觉得本次学习内容值得投入时间。",
      "status": "网站现有自编单项 待预试",
      "construct": "价值",
      "group": "A B C",
      "time": "前测前",
      "scale": "1至5",
      "source": "网站基线问卷"
    },
    {
      "id": "ai_experience",
      "text": "过去一个月，你使用AI帮助学习的频率如何？",
      "status": "本方案自编背景题 待预试",
      "construct": "使用经历",
      "group": "A B C",
      "time": "前测前",
      "scale": "从未 偶尔 每周数次 几乎每天",
      "source": "本方案"
    },
    {
      "id": "topic_experience",
      "text": "此前是否学过本次函数、极限与连续的内容？",
      "status": "本方案自编背景题 待预试",
      "construct": "内容经历",
      "group": "A B C",
      "time": "前测前",
      "scale": "未学过 接触过但不熟悉 已系统学过",
      "source": "本方案"
    },
    {
      "id": "forecast",
      "text": "请先浏览这组独立检查题。开始作答前，你预计自己能得到满分的百分之多少？",
      "status": "自编表现预测任务 待预试",
      "construct": "成绩预测",
      "group": "A B C",
      "time": "每组独立检查及即时延迟测验开始作答前",
      "scale": "0至100 每10一个选项",
      "source": "本方案"
    },
    {
      "id": "decision_reason",
      "text": "这次准备保持还是修改设置？请说出一个依据，以及下一阶段会观察什么。",
      "status": "本方案自编开放题 待预试",
      "construct": "配置理由",
      "group": "B C",
      "time": "两次回顾后的决定",
      "scale": "开放回答 也可暂不说明",
      "source": "本方案"
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
  ]
};
