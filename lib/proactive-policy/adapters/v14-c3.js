"use strict";

const CHAPTER_ID = "V14-C3";
const VERSION = "v14-c3-adapter-v3";

const KNOWLEDGE_POINTS = Object.freeze({
  "GH-06-K01": Object.freeze({
    label: "小矩形逼近面积",
    misconception: "只记住矩形和结论，没有比较分割、误差与极限过程。",
    selfExplanationPrompt: "不看解析，用“分割、每块误差、整体逼近”解释：为什么把区间分得更细，矩形和通常会更接近目标面积？",
    conceptHint: "先分开看两层：每个小区间怎样选矩形高度，以及分割变细后每块误差怎样变化。分割更细会压缩局部误差，但不保证所有矩形和都从同一侧逼近。结合这条线索，说说你刚才的判断漏掉了哪一层。",
    subgoalPrompt: "把问题拆成两个子目标：先固定分割，判断矩形高度的选取怎样造成上偏或下偏；再只增加分割数，比较上下逼近之间的差距。先完成第一个子目标，并说明你依据的是宽度还是高度。",
    nextStepPrompt: "下一步只做两件事：先写出 Δx=(b-a)/n，再写出一个小矩形面积 f(xᵢ*)Δx。暂时不要算最终答案；请指出求和式中的哪一部分会随分割变细而改变。",
    partialExamplePrompt: "看一个只做到中间的例子：区间 [0,4] 分成 4 份时 Δx=1，左端点高度依次为 1、2、3、4，所以 S=1×(1+2+3+4)。请你完成数值，并解释若继续细分，局部宽度与整体误差之间会发生什么。"
  }),
  "GH-06-K02": Object.freeze({
    label: "定积分作为累积",
    misconception: "把有向累积等同于路程，忽略负值区间的抵消。",
    selfExplanationPrompt: "用自己的话解释：当变化率为负时，定积分表示的累计量为什么可能下降，而路程仍会增加？",
    conceptHint: "把每小段看成“变化率乘小时间”得到的有向增量。正增量加入累计，负增量会抵消先前累计；路程则把方向去掉。根据这个区别，重新说明题目中的量是在累计净变化还是累计总路程。",
    subgoalPrompt: "先把任务拆成“方向”和“大小”两个子目标：对每一小段先判断变化率的正负，再决定是保留符号相加，还是取绝对值后相加。请先说清题目要求的是净变化还是总路程。",
    nextStepPrompt: "下一步先写一小段增量 r(t)Δt，并在它前面标出正负号；再把所有有向增量相加。不要直接给最终结论，请指出负增量在净变化与总路程中分别怎样处理。",
    partialExamplePrompt: "部分示例：速度先以 3 m/s 行驶 2 s，再以 -1 m/s 行驶 1 s。净位移先写成 3×2+(-1)×1，路程先写成 |3|×2+|-1|×1。请完成两个数值并解释差异来自哪里。"
  }),
  "GH-06-K03": Object.freeze({
    label: "原函数和不定积分",
    misconception: "把一个原函数当作不定积分，遗漏任意常数。",
    selfExplanationPrompt: "解释为什么两个只相差常数的函数会有相同导数，以及这件事为什么要求不定积分写上“+C”。",
    conceptHint: "导数描述局部斜率，整体上下平移不会改变任何位置的斜率。因此一个导函数对应的是一族彼此相差常数的原函数。请据此检查你刚才写的是一个函数，还是完整的函数族。",
    subgoalPrompt: "把判断拆成两步：先找一个求导后得到 f(x) 的具体函数，再检查是否存在由整体上下平移得到的其他函数。请先完成第一步，并用求导验证。",
    nextStepPrompt: "下一步在你找到的一个原函数后写上 +C，再解释 C 改变函数图像的什么、又不改变导数的什么。先不要套用定义原句，用当前函数验证。",
    partialExamplePrompt: "部分示例：∫6x²dx 先得到 2x³，因为 (2x³)'=6x²；完整结果还应写成 2x³+C。请说明 C=0 与 C=5 得到的是两个什么对象，以及它们为何属于同一个不定积分。"
  }),
  "GH-07-K01": Object.freeze({
    label: "变上限积分",
    misconception: "把变化的积分上限当作常数，忽略末端新增面积。",
    selfExplanationPrompt: "把积分上限从 x 增加到 x+Δx，新增的是哪一小条面积？用它解释变上限积分的导数为什么与末端函数值有关。",
    conceptHint: "比较 F(x+Δx) 与 F(x)：旧区间的累计会相消，只剩末端一条宽约为 Δx、高约为 f(x) 的窄条。先用这条窄条写出增量的近似关系，再说明除以 Δx 后保留下什么。",
    subgoalPrompt: "把推理拆成“比较两个累计量”和“形成差商”两步。先写出 F(x+h)-F(x) 对应哪一小段积分，并说明旧区间为什么会相消。",
    nextStepPrompt: "下一步把末端窄条近似写成 f(x)h，再除以 h。请停在差商这一步，并指出当 h 趋近 0 时，哪一个量会保留下来。",
    partialExamplePrompt: "部分示例：若 f(2)=3，h=0.01，则从 2 到 2.01 新增的面积约为 3×0.01=0.03，所以 [F(2.01)-F(2)]/0.01 约为 3。请把这个数值例子推广成一般的导数关系。"
  }),
  "GH-07-K02": Object.freeze({
    label: "牛顿-莱布尼茨公式",
    misconception: "把原函数端点差误写成被积函数端点差。",
    selfExplanationPrompt: "解释公式中 f、F、a、b 各自表示什么，并说明为什么定积分取的是原函数 F 的端点差，而不是 f 的端点差。",
    conceptHint: "f 描述瞬时变化率，F 描述累计量；从 a 到 b 的净累计变化应比较累计量在两个端点的差。先判断题目给出的每个符号是“率”还是“累计”，再决定端点代入谁。",
    subgoalPrompt: "先把任务拆成两个子目标：找到满足 F'=f 的原函数，再按上限减下限比较累计量。请先只完成第一个子目标，并说明你找到的是 f 还是 F。",
    nextStepPrompt: "下一步在纸上明确写出“F(b)-F(a)”三个符号，再分别代入端点。不要先心算；请指出若误写成 f(b)-f(a)，混淆的是瞬时率还是累计量。",
    partialExamplePrompt: "部分示例：计算 ∫₁³2x dx，取 F(x)=x²，端点代入得到 F(3)-F(1)=9-1。请完成数值，并用一句话说明为什么这里不能写成 2×3-2×1。"
  }),
  "GH-07-K03": Object.freeze({
    label: "换元法直觉",
    misconception: "替换表达式时没有同步处理微分元与积分上下限。",
    selfExplanationPrompt: "用一句话说明换元时为什么不能只替换内层表达式，还必须同时处理微分元；定积分时为什么还要同步换上下限。",
    conceptHint: "换元是在改写整个积分变量系统，不是在公式里替换一个片段。圈出内层函数、它的导数因子和原上下限，逐项检查它们是否都已经用新变量表达。先说出目前哪一项还留在旧变量里。",
    subgoalPrompt: "把换元拆成三个检查点：定义 u、把导数因子与 dx 合成 du、把原上下限换成 u 的取值。请逐项标记当前题已经完成哪一步、还缺哪一步。",
    nextStepPrompt: "下一步只做变量一致性检查：积分号内、微分元和上下限必须全部使用同一个变量。请圈出仍然含 x 的部分，再决定是继续用 u 计算还是回到 x。",
    partialExamplePrompt: "部分示例：∫₀¹2x cos(x²)dx，令 u=x²，则 du=2x dx，x=0、1 对应 u=0、1，因此积分变为 ∫₀¹cos(u)du。请完成最后一步，并说明这个过程中为什么不需要再回代 x。"
  }),
  "GH-07-K04": Object.freeze({
    label: "分部积分直觉",
    misconception: "机械选择 u 与 dv，无法判断转换后是否更简单。",
    selfExplanationPrompt: "从乘积求导公式反向解释分部积分，并说明选择 u 与 dv 时为什么要比较转换后的积分是否更简单。",
    conceptHint: "分部积分把一个乘积积分换成“边界乘积减去另一个乘积积分”。选择不是靠固定口令，而是比较求导后的 u 与积分后的 dv 是否让新积分更容易。分别预演两种选择，只比较新积分的复杂度。",
    subgoalPrompt: "先把任务拆成“选择 u”和“检查新积分”两个子目标。分别预演两个候选因子求导后会不会变简单，再决定谁做 u；此时先不要继续积分。",
    nextStepPrompt: "下一步写出 du 与 v，再把它们代入 uv-∫vdu。请只比较新积分与原积分的复杂度；如果没有变简单，就回到选择步骤。",
    partialExamplePrompt: "部分示例：∫x eˣdx 取 u=x、dv=eˣdx，则 du=dx、v=eˣ，所以得到 xeˣ-∫eˣdx。请完成最后一步，并解释若反过来选 u=eˣ，新积分为什么不会更简单。"
  })
});

function verificationOption(value, label) {
  return Object.freeze({ value, label });
}

function verificationCheck({
  id,
  stage,
  prompt,
  options,
  answer
}) {
  return Object.freeze({
    id,
    stage,
    prompt,
    options: Object.freeze(options),
    answer
  });
}

const VERIFICATION_CHECKS = Object.freeze({
  "GH-06-K01": Object.freeze({
    L1: verificationCheck({
      id: "GH-06-K01-probe-l1-v1",
      stage: "after_l1",
      prompt: "把区间分得更细时，下面哪种说法最准确？",
      options: [
        verificationOption("a", "矩形和一定单调增加并从下方逼近真实面积"),
        verificationOption("b", "局部宽度变小通常会压缩逼近误差，但不保证每次都从同一侧接近"),
        verificationOption("c", "只要矩形数量增加，矩形高度的选择就不再影响结果")
      ],
      answer: "b"
    }),
    L2: verificationCheck({
      id: "GH-06-K01-probe-l2-v1",
      stage: "after_l2",
      prompt: "同一分割下，上和与下和分别从两侧夹住面积。继续细分时，最关键的变化是什么？",
      options: [
        verificationOption("a", "上和与下和的差距缩小，从两侧夹逼目标面积"),
        verificationOption("b", "上和与下和会立即变成完全相同"),
        verificationOption("c", "只有下和变化，上和保持不变")
      ],
      answer: "a"
    }),
    L3: verificationCheck({
      id: "GH-06-K01-probe-l3-v1",
      stage: "after_l3",
      prompt: "固定同一分割时，要判断一个矩形造成上偏还是下偏，首先应比较什么？",
      options: [
        verificationOption("a", "矩形高度与该小区间内曲线高度的相对位置"),
        verificationOption("b", "整个区间一共分成了多少份"),
        verificationOption("c", "积分上下限相差多少")
      ],
      answer: "a"
    }),
    L4: verificationCheck({
      id: "GH-06-K01-probe-l4-v1",
      stage: "after_l4",
      prompt: "区间 [0,2] 等分为 4 份，每个小矩形的宽 Δx 是多少？",
      options: [
        verificationOption("a", "2"),
        verificationOption("b", "0.5"),
        verificationOption("c", "0.25")
      ],
      answer: "b"
    }),
    L5: verificationCheck({
      id: "GH-06-K01-probe-l5-v1",
      stage: "after_l5",
      prompt: "若 Δx=1，四个左端点高度依次为 1、2、3、4，则矩形和是多少？",
      options: [
        verificationOption("a", "4"),
        verificationOption("b", "8"),
        verificationOption("c", "10")
      ],
      answer: "c"
    })
  }),
  "GH-06-K02": Object.freeze({
    L1: verificationCheck({
      id: "GH-06-K02-probe-l1-v1",
      stage: "after_l1",
      prompt: "速度在一小段时间内为负时，净位移与路程怎样变化？",
      options: [
        verificationOption("a", "净位移的累计可能下降，路程仍按速度绝对值增加"),
        verificationOption("b", "净位移和路程都会减少"),
        verificationOption("c", "净位移不变，只有路程变化")
      ],
      answer: "a"
    }),
    L2: verificationCheck({
      id: "GH-06-K02-probe-l2-v1",
      stage: "after_l2",
      prompt: "某段变化率图像在横轴上方的有向面积为 5、下方的面积大小为 2。净变化与总路程分别是多少？",
      options: [
        verificationOption("a", "净变化 7，总路程 3"),
        verificationOption("b", "净变化 3，总路程 7"),
        verificationOption("c", "净变化 5，总路程 2")
      ],
      answer: "b"
    }),
    L3: verificationCheck({
      id: "GH-06-K02-probe-l3-v1",
      stage: "after_l3",
      prompt: "处理一段负速度时，净位移与路程的计算分别怎样使用符号？",
      options: [
        verificationOption("a", "两者都保留负号"),
        verificationOption("b", "净位移保留负号，路程取绝对值"),
        verificationOption("c", "净位移取绝对值，路程保留负号")
      ],
      answer: "b"
    }),
    L4: verificationCheck({
      id: "GH-06-K02-probe-l4-v1",
      stage: "after_l4",
      prompt: "变化率在 3 分钟内恒为 -2 单位/分钟，这一段对净变化的贡献是多少？",
      options: [
        verificationOption("a", "-6"),
        verificationOption("b", "1"),
        verificationOption("c", "6")
      ],
      answer: "a"
    }),
    L5: verificationCheck({
      id: "GH-06-K02-probe-l5-v1",
      stage: "after_l5",
      prompt: "速度先为 3 m/s 持续 2 s，再为 -1 m/s 持续 1 s。净位移与路程分别是多少？",
      options: [
        verificationOption("a", "7 m，5 m"),
        verificationOption("b", "6 m，1 m"),
        verificationOption("c", "5 m，7 m")
      ],
      answer: "c"
    })
  }),
  "GH-06-K03": Object.freeze({
    L1: verificationCheck({
      id: "GH-06-K03-probe-l1-v1",
      stage: "after_l1",
      prompt: "不定积分 ∫2x dx 的完整结果应写成什么？",
      options: [
        verificationOption("a", "x²"),
        verificationOption("b", "x² + C"),
        verificationOption("c", "2 + C")
      ],
      answer: "b"
    }),
    L2: verificationCheck({
      id: "GH-06-K03-probe-l2-v1",
      stage: "after_l2",
      prompt: "若 F'(x)=G'(x) 在同一区间内恒成立，可以确定什么？",
      options: [
        verificationOption("a", "F(x) 与 G(x) 必须完全相同"),
        verificationOption("b", "F(x)-G(x) 是常数"),
        verificationOption("c", "F(x)+G(x) 是常数")
      ],
      answer: "b"
    }),
    L3: verificationCheck({
      id: "GH-06-K03-probe-l3-v1",
      stage: "after_l3",
      prompt: "要验证一个函数是不是 f(x) 的原函数，最直接的操作是什么？",
      options: [
        verificationOption("a", "把它代入一个固定端点"),
        verificationOption("b", "对它求导并检查是否得到 f(x)"),
        verificationOption("c", "把它乘以任意常数")
      ],
      answer: "b"
    }),
    L4: verificationCheck({
      id: "GH-06-K03-probe-l4-v1",
      stage: "after_l4",
      prompt: "不定积分 ∫3x²dx 的完整结果是什么？",
      options: [
        verificationOption("a", "x³+C"),
        verificationOption("b", "3x³+C"),
        verificationOption("c", "x²+C")
      ],
      answer: "a"
    }),
    L5: verificationCheck({
      id: "GH-06-K03-probe-l5-v1",
      stage: "after_l5",
      prompt: "若 F'(x)=G'(x)，则 F 与 G 之间最准确的关系是什么？",
      options: [
        verificationOption("a", "F(x)+G(x) 恒为 0"),
        verificationOption("b", "F(x)-G(x) 恒为某个常数"),
        verificationOption("c", "F(x) 与 G(x) 只能完全相同")
      ],
      answer: "b"
    })
  }),
  "GH-07-K01": Object.freeze({
    L1: verificationCheck({
      id: "GH-07-K01-probe-l1-v1",
      stage: "after_l1",
      prompt: "若 F(x)=∫ₐˣ f(t)dt，把上限从 x 增加到 x+Δx 时，新增量最接近什么？",
      options: [
        verificationOption("a", "f(a)Δx"),
        verificationOption("b", "f(x)Δx"),
        verificationOption("c", "F(x)Δx")
      ],
      answer: "b"
    }),
    L2: verificationCheck({
      id: "GH-07-K01-probe-l2-v1",
      stage: "after_l2",
      prompt: "在某点附近 f(x)<0 时，变上限积分 F(x)=∫ₐˣ f(t)dt 在该处怎样变化？",
      options: [
        verificationOption("a", "F 在增加"),
        verificationOption("b", "F 在减少"),
        verificationOption("c", "F 必定等于 0")
      ],
      answer: "b"
    }),
    L3: verificationCheck({
      id: "GH-07-K01-probe-l3-v1",
      stage: "after_l3",
      prompt: "F(x)=∫ₐˣf(t)dt 时，F(x+h)-F(x) 等于哪一小段积分？",
      options: [
        verificationOption("a", "∫ₐʰf(t)dt"),
        verificationOption("b", "∫ₐˣf(t)dt"),
        verificationOption("c", "∫ₓˣ⁺ʰf(t)dt")
      ],
      answer: "c"
    }),
    L4: verificationCheck({
      id: "GH-07-K01-probe-l4-v1",
      stage: "after_l4",
      prompt: "若 f(x)=4，h=0.02，则末端新增面积近似是多少？",
      options: [
        verificationOption("a", "0.02"),
        verificationOption("b", "0.08"),
        verificationOption("c", "4.02")
      ],
      answer: "b"
    }),
    L5: verificationCheck({
      id: "GH-07-K01-probe-l5-v1",
      stage: "after_l5",
      prompt: "当 h→0 时，[F(x+h)-F(x)]/h 的极限是什么？",
      options: [
        verificationOption("a", "f(x)"),
        verificationOption("b", "F(x)"),
        verificationOption("c", "f(a)")
      ],
      answer: "a"
    })
  }),
  "GH-07-K02": Object.freeze({
    L1: verificationCheck({
      id: "GH-07-K02-probe-l1-v1",
      stage: "after_l1",
      prompt: "若 F'(x)=f(x)，定积分 ∫ₐᵇ f(x)dx 应计算为哪一项？",
      options: [
        verificationOption("a", "f(b)-f(a)"),
        verificationOption("b", "F(b)-F(a)"),
        verificationOption("c", "F(a)-F(b)")
      ],
      answer: "b"
    }),
    L2: verificationCheck({
      id: "GH-07-K02-probe-l2-v1",
      stage: "after_l2",
      prompt: "为什么公式使用原函数 F 的端点差，而不是被积函数 f 的端点差？",
      options: [
        verificationOption("a", "F 表示累计量，端点差给出区间内的净累计变化"),
        verificationOption("b", "f 的端点值在任何题里都相等"),
        verificationOption("c", "F 的数值总比 f 更大")
      ],
      answer: "a"
    }),
    L3: verificationCheck({
      id: "GH-07-K02-probe-l3-v1",
      stage: "after_l3",
      prompt: "使用牛顿-莱布尼茨公式前，第一个子目标是什么？",
      options: [
        verificationOption("a", "先计算 f(b)-f(a)"),
        verificationOption("b", "先找到满足 F'=f 的原函数 F"),
        verificationOption("c", "先把积分上下限相加")
      ],
      answer: "b"
    }),
    L4: verificationCheck({
      id: "GH-07-K02-probe-l4-v1",
      stage: "after_l4",
      prompt: "∫₀²3x²dx 使用 F(x)=x³ 计算，结果是多少？",
      options: [
        verificationOption("a", "2"),
        verificationOption("b", "6"),
        verificationOption("c", "8")
      ],
      answer: "c"
    }),
    L5: verificationCheck({
      id: "GH-07-K02-probe-l5-v1",
      stage: "after_l5",
      prompt: "为什么定积分取 F(b)-F(a)，而不是 f(b)-f(a)？",
      options: [
        verificationOption("a", "F 表示累计量，端点差给出区间内净累计变化"),
        verificationOption("b", "f 的端点值总是相等"),
        verificationOption("c", "F 的次数一定比 f 高")
      ],
      answer: "a"
    })
  }),
  "GH-07-K03": Object.freeze({
    L1: verificationCheck({
      id: "GH-07-K03-probe-l1-v1",
      stage: "after_l1",
      prompt: "定积分换元时，除了替换内层表达式，还必须同步处理什么？",
      options: [
        verificationOption("a", "只处理积分号"),
        verificationOption("b", "微分元，并把上下限改写为新变量的取值"),
        verificationOption("c", "只把被积函数前的常数删掉")
      ],
      answer: "b"
    }),
    L2: verificationCheck({
      id: "GH-07-K03-probe-l2-v1",
      stage: "after_l2",
      prompt: "计算 ∫₀¹ 2x cos(x²)dx，令 u=x² 后，新的上下限是什么？",
      options: [
        verificationOption("a", "0 到 1"),
        verificationOption("b", "0 到 2"),
        verificationOption("c", "1 到 2")
      ],
      answer: "a"
    }),
    L3: verificationCheck({
      id: "GH-07-K03-probe-l3-v1",
      stage: "after_l3",
      prompt: "定积分换元时必须同步改写哪三部分？",
      options: [
        verificationOption("a", "函数名称、积分号形状、等号"),
        verificationOption("b", "被积表达式、微分元、积分上下限"),
        verificationOption("c", "只改内层表达式和最终答案")
      ],
      answer: "b"
    }),
    L4: verificationCheck({
      id: "GH-07-K03-probe-l4-v1",
      stage: "after_l4",
      prompt: "令 u=1+x²，原上下限 x=0 到 x=2 对应的新上下限是什么？",
      options: [
        verificationOption("a", "0 到 2"),
        verificationOption("b", "1 到 4"),
        verificationOption("c", "1 到 5")
      ],
      answer: "c"
    }),
    L5: verificationCheck({
      id: "GH-07-K03-probe-l5-v1",
      stage: "after_l5",
      prompt: "∫₀¹2x cos(x²)dx 换元 u=x² 后的结果是什么？",
      options: [
        verificationOption("a", "cos(1)"),
        verificationOption("b", "sin(1)"),
        verificationOption("c", "1")
      ],
      answer: "b"
    })
  }),
  "GH-07-K04": Object.freeze({
    L1: verificationCheck({
      id: "GH-07-K04-probe-l1-v1",
      stage: "after_l1",
      prompt: "对 ∫x eˣ dx 使用分部积分，哪种选择通常会让新积分更简单？",
      options: [
        verificationOption("a", "u=x，dv=eˣdx"),
        verificationOption("b", "u=eˣ，dv=x dx"),
        verificationOption("c", "u=1，dv=x eˣdx")
      ],
      answer: "a"
    }),
    L2: verificationCheck({
      id: "GH-07-K04-probe-l2-v1",
      stage: "after_l2",
      prompt: "分部积分公式的正确结构是什么？",
      options: [
        verificationOption("a", "∫u dv = uv - ∫v du"),
        verificationOption("b", "∫u dv = uv + ∫u du"),
        verificationOption("c", "∫u dv = u/v")
      ],
      answer: "a"
    }),
    L3: verificationCheck({
      id: "GH-07-K04-probe-l3-v1",
      stage: "after_l3",
      prompt: "选择 u 与 dv 时，哪条判断最可靠？",
      options: [
        verificationOption("a", "u 求导后更简单，dv 又容易积分"),
        verificationOption("b", "总把第一个因子选作 u"),
        verificationOption("c", "只选次数最高的因子作 dv")
      ],
      answer: "a"
    }),
    L4: verificationCheck({
      id: "GH-07-K04-probe-l4-v1",
      stage: "after_l4",
      prompt: "计算 ∫ln(x)dx 时，哪种拆分更合适？",
      options: [
        verificationOption("a", "u=1，dv=ln(x)dx"),
        verificationOption("b", "u=ln(x)，dv=dx"),
        verificationOption("c", "u=x，dv=ln(x)dx")
      ],
      answer: "b"
    }),
    L5: verificationCheck({
      id: "GH-07-K04-probe-l5-v1",
      stage: "after_l5",
      prompt: "∫x eˣdx 的结果是什么？",
      options: [
        verificationOption("a", "x eˣ+C"),
        verificationOption("b", "eˣ-x+C"),
        verificationOption("c", "x eˣ-eˣ+C")
      ],
      answer: "c"
    })
  })
});

const ACTION_PROFILES = Object.freeze({
  elicit_self_explanation: Object.freeze({
    action: "elicit_self_explanation",
    supportLevel: "L1",
    presentation: "assistant_prompt",
    helpNeedScore: 0.92,
    interruptibilityScore: 1,
    uncertaintyScore: 0.08,
    requiredEvidenceFamilies: Object.freeze(["result"])
  }),
  concept_hint: Object.freeze({
    action: "concept_hint",
    supportLevel: "L2",
    presentation: "assistant_prompt",
    helpNeedScore: 0.94,
    interruptibilityScore: 1,
    uncertaintyScore: 0.06,
    requiredEvidenceFamilies: Object.freeze(["history"])
  }),
  decompose_subgoal: Object.freeze({
    action: "decompose_subgoal",
    supportLevel: "L3",
    presentation: "assistant_prompt",
    helpNeedScore: 0.96,
    interruptibilityScore: 1,
    uncertaintyScore: 0.05,
    requiredEvidenceFamilies: Object.freeze(["history"])
  }),
  next_step_hint: Object.freeze({
    action: "next_step_hint",
    supportLevel: "L4",
    presentation: "assistant_prompt",
    helpNeedScore: 0.97,
    interruptibilityScore: 1,
    uncertaintyScore: 0.04,
    requiredEvidenceFamilies: Object.freeze(["history"])
  }),
  partial_worked_example: Object.freeze({
    action: "partial_worked_example",
    supportLevel: "L5",
    presentation: "assistant_prompt",
    helpNeedScore: 0.98,
    interruptibilityScore: 1,
    uncertaintyScore: 0.03,
    requiredEvidenceFamilies: Object.freeze(["history"])
  }),
  switch_representation: Object.freeze({
    action: "switch_representation",
    supportLevel: "L2",
    presentation: "inline_nudge",
    helpNeedScore: 1,
    interruptibilityScore: 1,
    uncertaintyScore: 0.02,
    requiredEvidenceFamilies: Object.freeze(["history", "preference"])
  })
});

const CANDIDATE_PROFILES = Object.freeze({
  repeated_parameter: Object.freeze({
    action: "observe_change",
    supportLevel: "L1",
    presentation: "inline_nudge",
    helpNeedScore: 0.78,
    interruptibilityScore: 0.82,
    uncertaintyScore: 0.22,
    requiredEvidenceFamilies: Object.freeze(["process", "task"])
  }),
  quiet_dwell: Object.freeze({
    action: "ask_clarification",
    supportLevel: "L1",
    presentation: "inline_nudge",
    helpNeedScore: 0.45,
    interruptibilityScore: 0.6,
    uncertaintyScore: 0.45,
    requiredEvidenceFamilies: Object.freeze(["time"])
  }),
  quiz_review: Object.freeze({
    action: "review_mistake",
    supportLevel: "L1",
    presentation: "assistant_prompt",
    helpNeedScore: 0.92,
    interruptibilityScore: 1,
    uncertaintyScore: 0.08,
    requiredEvidenceFamilies: Object.freeze(["result"])
  }),
  formative_outcome: ACTION_PROFILES.elicit_self_explanation,
  independent_attempt_outcome: ACTION_PROFILES.concept_hint,
  student_requested_alternative: ACTION_PROFILES.switch_representation
});

function compact(value = "", limit = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function knowledgePoint(unitId = "") {
  return KNOWLEDGE_POINTS[String(unitId || "")] || null;
}

function supportsUnit(unitId = "", { isQuiz = false, knowledgePointId = "" } = {}) {
  return Boolean(
    knowledgePoint(unitId)
    || (isQuiz && (!knowledgePointId || knowledgePoint(knowledgePointId)))
  );
}

function candidateProfile(kind = "") {
  return CANDIDATE_PROFILES[String(kind || "")] || null;
}

function actionProfile(action = "") {
  return ACTION_PROFILES[String(action || "")] || null;
}

function verificationCheckFor(knowledgePointId = "", supportLevel = "") {
  const checks = VERIFICATION_CHECKS[String(knowledgePointId || "")];
  return checks?.[String(supportLevel || "").toUpperCase()] || null;
}

function publicVerificationCheck(knowledgePointId = "", supportLevel = "") {
  const check = verificationCheckFor(knowledgePointId, supportLevel);
  if (!check) return null;
  return {
    id: check.id,
    stage: check.stage,
    supportLevel: String(supportLevel || "").toUpperCase(),
    prompt: check.prompt,
    options: check.options.map((option) => ({ ...option }))
  };
}

function gradeVerificationCheck({
  knowledgePointId = "",
  supportLevel = "",
  checkId = "",
  response = ""
} = {}) {
  const check = verificationCheckFor(knowledgePointId, supportLevel);
  if (!check || check.id !== String(checkId || "")) return null;
  const normalizedResponse = compact(response, 80);
  if (!check.options.some((option) => option.value === normalizedResponse)) {
    return null;
  }
  return {
    checkId: check.id,
    stage: check.stage,
    supportLevel: String(supportLevel || "").toUpperCase(),
    response: normalizedResponse,
    correct: normalizedResponse === check.answer
  };
}

function studentReplyDecision({
  action,
  title,
  body,
  actionLabel,
  assistantPrompt,
  why,
  confidence,
  contextSummary
}) {
  return {
    action,
    intervene: true,
    eyebrow: "知点复盘",
    title,
    body,
    actionLabel,
    draftQuestion: "",
    assistantPrompt,
    replyOptions: [],
    interactionMode: "student_reply",
    contextMode: "unit",
    contextSummary,
    why,
    confidence
  };
}

const SCENE_LABELS = Object.freeze({
  simulation: "互动实验",
  mindMap: "关系图",
  game: "误解修复挑战",
  visualization3d: "空间视角"
});

const PREFERRED_ALTERNATIVES = Object.freeze({
  simulation: Object.freeze(["mindMap", "visualization3d", "game"]),
  mindMap: Object.freeze(["simulation", "game", "visualization3d"]),
  game: Object.freeze(["mindMap", "simulation", "visualization3d"]),
  visualization3d: Object.freeze(["simulation", "mindMap", "game"])
});

function normalizedSceneType(value = "") {
  if (value && typeof value === "object") {
    return compact(value.type || value.typeId || value.id, 80);
  }
  return compact(value, 80);
}

function representationAlternative({
  currentSceneType = "",
  availableSceneTypes = []
} = {}) {
  const current = normalizedSceneType(currentSceneType);
  const available = Array.from(new Set(
    (Array.isArray(availableSceneTypes) ? availableSceneTypes : [])
      .map(normalizedSceneType)
      .filter(Boolean)
  ));
  const preferred = PREFERRED_ALTERNATIVES[current] || Object.freeze([]);
  const targetSceneType = preferred.find((type) => (
    type !== current && available.includes(type)
  )) || available.find((type) => type !== current) || "";
  if (!targetSceneType) return null;
  return {
    targetSceneType,
    targetSceneLabel: SCENE_LABELS[targetSceneType] || targetSceneType
  };
}

function renderAction(action = "", context = {}) {
  const point = knowledgePoint(context.knowledgePointId);
  if (!point) return null;
  if (action === "elicit_self_explanation") {
    return studentReplyDecision({
      action,
      title: `先解释「${point.label}」里的关键关系`,
      body: "先不看完整解析，用自己的话连接条件、变化和结果。",
      actionLabel: "说说我的理解",
      assistantPrompt: point.selfExplanationPrompt,
      why: "形成性测验出现已确认错误，先用自我解释暴露当前推理，再决定是否需要更强支架。",
      confidence: 0.92,
      contextSummary: compact(
        `已确认形成性错题 · 易混点：${point.misconception}`,
        120
      )
    });
  }
  if (action === "concept_hint") {
    return studentReplyDecision({
      action,
      title: `换一层线索再看「${point.label}」`,
      body: "刚才的自我解释后仍出现同类错误，这次只补一条概念关系。",
      actionLabel: "用线索再试",
      assistantPrompt: point.conceptHint,
      why: "学生已接受并完成 L1 自我解释，但后续独立尝试仍有已确认错误，因此只升级一级。",
      confidence: 0.94,
      contextSummary: "L1 自我解释后，下一次独立尝试仍出现已确认错误"
    });
  }
  if (action === "decompose_subgoal") {
    return studentReplyDecision({
      action,
      title: `把「${point.label}」拆成可完成的子目标`,
      body: "连续两次独立检查仍有同类困难，这次只拆任务，不代替你完成。",
      actionLabel: "按子目标再试",
      assistantPrompt: point.subgoalPrompt,
      why: "L2 概念线索后仍有已确认错误，按最小必要原则升级为任务分解。",
      confidence: 0.96,
      contextSummary: "L2 概念线索后，独立验证仍出现同类错误"
    });
  }
  if (action === "next_step_hint") {
    return studentReplyDecision({
      action,
      title: `只推进「${point.label}」的下一步`,
      body: "任务分解后仍未恢复，这次给出一个可执行的下一步，不展开完整解法。",
      actionLabel: "完成下一步",
      assistantPrompt: point.nextStepPrompt,
      why: "L3 子目标支架后的独立验证仍失败，因此提供下一步提示并保留主要推理。",
      confidence: 0.97,
      contextSummary: "L3 子目标支架后，独立验证仍出现同类错误"
    });
  }
  if (action === "partial_worked_example") {
    return studentReplyDecision({
      action,
      title: `接着完成「${point.label}」的半成品例题`,
      body: "前四级支架后仍未恢复，这次展示部分过程，最后的计算与解释仍由你完成。",
      actionLabel: "接着做完",
      assistantPrompt: point.partialExamplePrompt,
      why: "L4 下一步提示后的独立验证仍失败，达到本试验允许的最高支架级别。",
      confidence: 0.98,
      contextSummary: "L4 下一步提示后，独立验证仍出现同类错误"
    });
  }
  if (action === "switch_representation") {
    const alternative = representationAlternative(context);
    if (!alternative) return null;
    return {
      action,
      intervene: true,
      eyebrow: "换一种帮助",
      title: `换个表征理解「${point.label}」`,
      body: `当前方式不合适时，可以切到${alternative.targetSceneLabel}。只有你确认后才会切换。`,
      actionLabel: `切换到${alternative.targetSceneLabel}`,
      draftQuestion: "",
      assistantPrompt: "",
      replyOptions: [],
      interactionMode: "scene_switch",
      contextMode: "unit",
      contextSummary: compact(
        `学生主动请求替代帮助 · 当前表征：${SCENE_LABELS[normalizedSceneType(context.currentSceneType)] || normalizedSceneType(context.currentSceneType) || "未知"}`,
        120
      ),
      targetSceneType: alternative.targetSceneType,
      targetSceneLabel: alternative.targetSceneLabel,
      why: "学生明确请求换一种帮助，系统仅推荐合法替代表征并保留学生确认权。",
      confidence: 0.98
    };
  }
  return null;
}

module.exports = Object.freeze({
  chapterId: CHAPTER_ID,
  version: VERSION,
  knowledgePoints: KNOWLEDGE_POINTS,
  knowledgePoint,
  supportsUnit,
  candidateProfile,
  actionProfile,
  representationAlternative,
  publicVerificationCheck,
  gradeVerificationCheck,
  renderAction
});
