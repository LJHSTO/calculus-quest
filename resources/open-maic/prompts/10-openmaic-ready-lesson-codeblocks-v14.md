# OpenMAIC生成提示词

## GH-01 函数、坐标与图像读法

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：函数、坐标与图像读法
学习对象：零基础到弱基础学生。本节只教学基础微积分和高等数学，不使用后段应用语境。
建议时长：30-40 分钟
先修基础：只要求会四则运算、坐标平面和简单代入。
后续承接：进入极限和连续：当输入越来越接近某个点时，输出怎样变化。
参考材料：Mathematics for Machine Learning, PDF pages 56-57,145-147. Use only the concepts in these pages. Do not show local file paths. Do not invent pages.
核心问题：怎样把一个变化过程写成函数，并在坐标图像上读懂它？
核心直觉：函数是输入到输出的规则，坐标图像把这条规则变成可观察的变化轨迹。

本节知识点：
- 输入、输出和函数规则：目标：能区分 x、f(x) 和函数规则；误解：把函数看成一个数或一个公式名字；组件：simulation, diagram, game, visualization3d。
- 坐标点与函数图像：目标：能把 (x, f(x)) 放到图像上并读横轴纵轴；误解：把图像当装饰，不会从图像读信息；组件：simulation, diagram, game, visualization3d。
- 图像的上升、下降与变化方向：目标：能用图像语言描述局部变化趋势；误解：只会代数计算，不会解释图像变化；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：函数、坐标与图像读法学习准备诊断"；quizConfig={"questionCount":5,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点，但不引用未来场景。
2. slide；title="输入、输出和函数规则"；说明目标：能区分 x、f(x) 和函数规则；点名将要修复的误解：把函数看成一个数或一个公式名字。
3. interactive；widgetType="simulation"；title="输入、输出和函数规则：拖动实验"；widgetOutline.concept="输入、输出和函数规则"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="输入、输出和函数规则：关系图"；widgetOutline.concept="输入、输出和函数规则"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="输入、输出和函数规则：误解修复挑战"；widgetOutline.concept="输入、输出和函数规则"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把函数看成一个数或一个公式名字。
6. interactive；widgetType="visualization3d"；title="输入、输出和函数规则：空间视角"；widgetOutline.concept="输入、输出和函数规则"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="坐标点与函数图像"；说明目标：能把 (x, f(x)) 放到图像上并读横轴纵轴；点名将要修复的误解：把图像当装饰，不会从图像读信息。
8. interactive；widgetType="simulation"；title="坐标点与函数图像：拖动实验"；widgetOutline.concept="坐标点与函数图像"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="坐标点与函数图像：关系图"；widgetOutline.concept="坐标点与函数图像"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="坐标点与函数图像：误解修复挑战"；widgetOutline.concept="坐标点与函数图像"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把图像当装饰，不会从图像读信息。
11. interactive；widgetType="visualization3d"；title="坐标点与函数图像：空间视角"；widgetOutline.concept="坐标点与函数图像"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":5,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q4）：第一组每个知识点（输入、输出和函数规则 + 坐标点与函数图像）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q5）：预诊断"图像的上升、下降与变化方向"所需先备直觉，不考未学公式。
13. slide；title="图像的上升、下降与变化方向"；说明目标：能用图像语言描述局部变化趋势；点名将要修复的误解：只会代数计算，不会解释图像变化。
14. interactive；widgetType="simulation"；title="图像的上升、下降与变化方向：拖动实验"；widgetOutline.concept="图像的上升、下降与变化方向"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
15. interactive；widgetType="diagram"；title="图像的上升、下降与变化方向：关系图"；widgetOutline.concept="图像的上升、下降与变化方向"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
16. interactive；widgetType="game"；title="图像的上升、下降与变化方向：误解修复挑战"；widgetOutline.concept="图像的上升、下降与变化方向"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：只会代数计算，不会解释图像变化。
17. interactive；widgetType="visualization3d"；title="图像的上升、下降与变化方向：空间视角"；widgetOutline.concept="图像的上升、下降与变化方向"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
18. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
19. quiz；title="后测：函数、坐标与图像读法综合测评"；quizConfig={"questionCount":6,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（输入、输出和函数规则 + 坐标点与函数图像），新学证据题覆盖第二组全部知识点（图像的上升、下降与变化方向）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```

## GH-02 极限与连续直觉

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：极限与连续直觉
学习对象：零基础到弱基础学生。本节只教学基础微积分和高等数学，不使用后段应用语境。
建议时长：30-40 分钟
先修基础：已学函数和图像读法。
后续承接：进入导数：用极限把平均变化率推进到瞬时变化率。
参考材料：Mathematics for Machine Learning, PDF pages 145-148. Use only the concepts in these pages. Do not show local file paths. Do not invent pages.
核心问题：为什么高等数学总在问“越来越接近时会怎样”？
核心直觉：极限看的是靠近过程中的稳定趋势，连续看的是图像有没有断裂和跳跃。

本节知识点：
- 从数表观察趋近：目标：能从左右取值表判断输出是否趋向同一个数；误解：把等于某点的函数值误认为极限；组件：simulation, diagram, game, visualization3d。
- 图像上的左右极限：目标：能在图像上判断左边靠近和右边靠近；误解：只看一个方向就下结论；组件：simulation, diagram, game, visualization3d。
- 连续就是不跳断：目标：能说出连续需要趋势和函数值接上；误解：把可画图等同于连续；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：极限与连续直觉学习准备诊断"；quizConfig={"questionCount":5,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点，但不引用未来场景。
2. slide；title="从数表观察趋近"；说明目标：能从左右取值表判断输出是否趋向同一个数；点名将要修复的误解：把等于某点的函数值误认为极限。
3. interactive；widgetType="simulation"；title="从数表观察趋近：拖动实验"；widgetOutline.concept="从数表观察趋近"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="从数表观察趋近：关系图"；widgetOutline.concept="从数表观察趋近"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="从数表观察趋近：误解修复挑战"；widgetOutline.concept="从数表观察趋近"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把等于某点的函数值误认为极限。
6. interactive；widgetType="visualization3d"；title="从数表观察趋近：空间视角"；widgetOutline.concept="从数表观察趋近"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="图像上的左右极限"；说明目标：能在图像上判断左边靠近和右边靠近；点名将要修复的误解：只看一个方向就下结论。
8. interactive；widgetType="simulation"；title="图像上的左右极限：拖动实验"；widgetOutline.concept="图像上的左右极限"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="图像上的左右极限：关系图"；widgetOutline.concept="图像上的左右极限"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="图像上的左右极限：误解修复挑战"；widgetOutline.concept="图像上的左右极限"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：只看一个方向就下结论。
11. interactive；widgetType="visualization3d"；title="图像上的左右极限：空间视角"；widgetOutline.concept="图像上的左右极限"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":5,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q4）：第一组每个知识点（从数表观察趋近 + 图像上的左右极限）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q5）：预诊断"连续就是不跳断"所需先备直觉，不考未学公式。
13. slide；title="连续就是不跳断"；说明目标：能说出连续需要趋势和函数值接上；点名将要修复的误解：把可画图等同于连续。
14. interactive；widgetType="simulation"；title="连续就是不跳断：拖动实验"；widgetOutline.concept="连续就是不跳断"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
15. interactive；widgetType="diagram"；title="连续就是不跳断：关系图"；widgetOutline.concept="连续就是不跳断"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
16. interactive；widgetType="game"；title="连续就是不跳断：误解修复挑战"；widgetOutline.concept="连续就是不跳断"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把可画图等同于连续。
17. interactive；widgetType="visualization3d"；title="连续就是不跳断：空间视角"；widgetOutline.concept="连续就是不跳断"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
18. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
19. quiz；title="后测：极限与连续直觉综合测评"；quizConfig={"questionCount":6,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（从数表观察趋近 + 图像上的左右极限），新学证据题覆盖第二组全部知识点（连续就是不跳断）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```

## GH-03 从平均变化率到导数

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：从平均变化率到导数
学习对象：零基础到弱基础学生。本节只教学基础微积分和高等数学，不使用后段应用语境。
建议时长：35-45 分钟
先修基础：已学极限、连续、图像变化趋势。
后续承接：进入求导规则：用可靠规则计算常见函数的导数。
参考材料：Mathematics for Machine Learning, PDF pages 147-148. Use only the concepts in these pages. Do not show local file paths. Do not invent pages.
核心问题：怎样把一段变化的平均速度推进到某一点的瞬时速度？
核心直觉：割线斜率描述一段平均变化；当两点靠得越来越近，割线变成切线，斜率变成导数。

本节知识点：
- 平均变化率和割线：目标：能用 delta y / delta x 解释一段变化；误解：只记公式，不知道分子分母代表什么；组件：simulation, diagram, game, visualization3d。
- 瞬时变化率和切线：目标：能说明 h 趋近 0 时割线变成切线；误解：把导数当成普通除法；组件：simulation, diagram, game, visualization3d。
- 导数符号和意义：目标：能解释 f'(x) 与 df/dx 的含义；误解：把导数只看成求公式步骤；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：从平均变化率到导数学习准备诊断"；quizConfig={"questionCount":5,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点，但不引用未来场景。
2. slide；title="平均变化率和割线"；说明目标：能用 delta y / delta x 解释一段变化；点名将要修复的误解：只记公式，不知道分子分母代表什么。
3. interactive；widgetType="simulation"；title="平均变化率和割线：拖动实验"；widgetOutline.concept="平均变化率和割线"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="平均变化率和割线：关系图"；widgetOutline.concept="平均变化率和割线"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="平均变化率和割线：误解修复挑战"；widgetOutline.concept="平均变化率和割线"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：只记公式，不知道分子分母代表什么。
6. interactive；widgetType="visualization3d"；title="平均变化率和割线：空间视角"；widgetOutline.concept="平均变化率和割线"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="瞬时变化率和切线"；说明目标：能说明 h 趋近 0 时割线变成切线；点名将要修复的误解：把导数当成普通除法。
8. interactive；widgetType="simulation"；title="瞬时变化率和切线：拖动实验"；widgetOutline.concept="瞬时变化率和切线"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="瞬时变化率和切线：关系图"；widgetOutline.concept="瞬时变化率和切线"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="瞬时变化率和切线：误解修复挑战"；widgetOutline.concept="瞬时变化率和切线"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把导数当成普通除法。
11. interactive；widgetType="visualization3d"；title="瞬时变化率和切线：空间视角"；widgetOutline.concept="瞬时变化率和切线"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":5,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q4）：第一组每个知识点（平均变化率和割线 + 瞬时变化率和切线）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q5）：预诊断"导数符号和意义"所需先备直觉，不考未学公式。
13. slide；title="导数符号和意义"；说明目标：能解释 f'(x) 与 df/dx 的含义；点名将要修复的误解：把导数只看成求公式步骤。
14. interactive；widgetType="simulation"；title="导数符号和意义：拖动实验"；widgetOutline.concept="导数符号和意义"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
15. interactive；widgetType="diagram"；title="导数符号和意义：关系图"；widgetOutline.concept="导数符号和意义"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
16. interactive；widgetType="game"；title="导数符号和意义：误解修复挑战"；widgetOutline.concept="导数符号和意义"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把导数只看成求公式步骤。
17. interactive；widgetType="visualization3d"；title="导数符号和意义：空间视角"；widgetOutline.concept="导数符号和意义"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
18. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
19. quiz；title="后测：从平均变化率到导数综合测评"；quizConfig={"questionCount":6,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（平均变化率和割线 + 瞬时变化率和切线），新学证据题覆盖第二组全部知识点（导数符号和意义）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```

## GH-04 常用求导规则与函数组合

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：常用求导规则与函数组合
学习对象：零基础到弱基础学生。本节只教学基础微积分和高等数学，不使用后段应用语境。
建议时长：35-45 分钟
先修基础：已学导数定义和切线意义。
后续承接：进入导数应用：用导数判断单调、极值和实际变化。
参考材料：Mathematics for Machine Learning, PDF pages 148,151-152. Use only the concepts in these pages. Do not show local file paths. Do not invent pages.
核心问题：复杂函数的变化怎样由简单函数的变化拼出来？
核心直觉：幂函数、和差、乘除和套娃函数都有稳定求导规则；链式法则追踪变化怎样一层层传递。

本节知识点：
- 幂函数求导：目标：能从 x^n 到 n x^(n-1) 建立最小规则；误解：把指数和系数机械搬动但不会解释；组件：simulation, diagram, game, visualization3d。
- 和差积商规则：目标：能判断什么时候用哪条规则；误解：把乘积的导数误写成导数相乘；组件：simulation, diagram, game, visualization3d。
- 链式法则：目标：能识别外层函数和内层函数；误解：只对最外层求导，漏掉内层变化；组件：simulation, diagram, game, visualization3d。
- 常见函数变化速度：目标：能比较多项式、指数、对数、三角函数的变化特点；误解：把所有函数变化速度想成直线；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：常用求导规则与函数组合学习准备诊断"；quizConfig={"questionCount":5,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点，但不引用未来场景。
2. slide；title="幂函数求导"；说明目标：能从 x^n 到 n x^(n-1) 建立最小规则；点名将要修复的误解：把指数和系数机械搬动但不会解释。
3. interactive；widgetType="simulation"；title="幂函数求导：拖动实验"；widgetOutline.concept="幂函数求导"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="幂函数求导：关系图"；widgetOutline.concept="幂函数求导"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="幂函数求导：误解修复挑战"；widgetOutline.concept="幂函数求导"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把指数和系数机械搬动但不会解释。
6. interactive；widgetType="visualization3d"；title="幂函数求导：空间视角"；widgetOutline.concept="幂函数求导"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="和差积商规则"；说明目标：能判断什么时候用哪条规则；点名将要修复的误解：把乘积的导数误写成导数相乘。
8. interactive；widgetType="simulation"；title="和差积商规则：拖动实验"；widgetOutline.concept="和差积商规则"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="和差积商规则：关系图"；widgetOutline.concept="和差积商规则"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="和差积商规则：误解修复挑战"；widgetOutline.concept="和差积商规则"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把乘积的导数误写成导数相乘。
11. interactive；widgetType="visualization3d"；title="和差积商规则：空间视角"；widgetOutline.concept="和差积商规则"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":6,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q4）：第一组每个知识点（幂函数求导 + 和差积商规则）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q5-Q6）：第二组每个知识点（链式法则、常见函数变化速度）各 1 题预诊断，测试先备直觉，不考未学公式。
13. slide；title="链式法则"；说明目标：能识别外层函数和内层函数；点名将要修复的误解：只对最外层求导，漏掉内层变化。
14. interactive；widgetType="simulation"；title="链式法则：拖动实验"；widgetOutline.concept="链式法则"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
15. interactive；widgetType="diagram"；title="链式法则：关系图"；widgetOutline.concept="链式法则"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
16. interactive；widgetType="game"；title="链式法则：误解修复挑战"；widgetOutline.concept="链式法则"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：只对最外层求导，漏掉内层变化。
17. interactive；widgetType="visualization3d"；title="链式法则：空间视角"；widgetOutline.concept="链式法则"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
18. slide；title="常见函数变化速度"；说明目标：能比较多项式、指数、对数、三角函数的变化特点；点名将要修复的误解：把所有函数变化速度想成直线。
19. interactive；widgetType="simulation"；title="常见函数变化速度：拖动实验"；widgetOutline.concept="常见函数变化速度"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
20. interactive；widgetType="diagram"；title="常见函数变化速度：关系图"；widgetOutline.concept="常见函数变化速度"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
21. interactive；widgetType="game"；title="常见函数变化速度：误解修复挑战"；widgetOutline.concept="常见函数变化速度"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把所有函数变化速度想成直线。
22. interactive；widgetType="visualization3d"；title="常见函数变化速度：空间视角"；widgetOutline.concept="常见函数变化速度"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
23. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
24. quiz；title="后测：常用求导规则与函数组合综合测评"；quizConfig={"questionCount":6,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（幂函数求导 + 和差积商规则），新学证据题覆盖第二组全部知识点（链式法则 + 常见函数变化速度）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```

## GH-05 导数应用：单调、极值与弯曲

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：导数应用：单调、极值与弯曲
学习对象：零基础到弱基础学生。本节只教学基础微积分和高等数学，不使用后段应用语境。
建议时长：40-50 分钟
先修基础：已学常用求导规则。
后续承接：进入积分：从变化率反过来看累积量。
参考材料：Mathematics for Machine Learning, PDF pages 147-149. Use only the concepts in these pages. Do not show local file paths. Do not invent pages.
核心问题：知道导数以后，怎样判断函数哪里上升、哪里下降、哪里达到最好？
核心直觉：一阶导数给方向，二阶导数给弯曲；极值问题不是背套路，而是读变化信号。

本节知识点：
- 导函数图像读法：目标：能从 f'(x) 的正负判断原函数升降；误解：把导函数图像当成原函数图像；组件：simulation, diagram, game, visualization3d。
- 临界点与极值：目标：能用 f'(x)=0 或不存在寻找候选点；误解：以为导数为 0 一定是最低点；组件：simulation, diagram, game, visualization3d。
- 二阶变化和凹凸：目标：能用弯曲方向解释局部形状；误解：只看一阶导数，不看弯曲；组件：simulation, diagram, game, visualization3d。
- 实际最值建模：目标：能把文字情境转成目标函数和限制范围；误解：忘记检查端点或范围；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：导数应用：单调、极值与弯曲学习准备诊断"；quizConfig={"questionCount":5,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点，但不引用未来场景。
2. slide；title="导函数图像读法"；说明目标：能从 f'(x) 的正负判断原函数升降；点名将要修复的误解：把导函数图像当成原函数图像。
3. interactive；widgetType="simulation"；title="导函数图像读法：拖动实验"；widgetOutline.concept="导函数图像读法"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="导函数图像读法：关系图"；widgetOutline.concept="导函数图像读法"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="导函数图像读法：误解修复挑战"；widgetOutline.concept="导函数图像读法"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把导函数图像当成原函数图像。
6. interactive；widgetType="visualization3d"；title="导函数图像读法：空间视角"；widgetOutline.concept="导函数图像读法"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="临界点与极值"；说明目标：能用 f'(x)=0 或不存在寻找候选点；点名将要修复的误解：以为导数为 0 一定是最低点。
8. interactive；widgetType="simulation"；title="临界点与极值：拖动实验"；widgetOutline.concept="临界点与极值"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="临界点与极值：关系图"；widgetOutline.concept="临界点与极值"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="临界点与极值：误解修复挑战"；widgetOutline.concept="临界点与极值"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：以为导数为 0 一定是最低点。
11. interactive；widgetType="visualization3d"；title="临界点与极值：空间视角"；widgetOutline.concept="临界点与极值"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":6,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q4）：第一组每个知识点（导函数图像读法 + 临界点与极值）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q5-Q6）：第二组每个知识点（二阶变化和凹凸、实际最值建模）各 1 题预诊断，测试先备直觉，不考未学公式。
13. slide；title="二阶变化和凹凸"；说明目标：能用弯曲方向解释局部形状；点名将要修复的误解：只看一阶导数，不看弯曲。
14. interactive；widgetType="simulation"；title="二阶变化和凹凸：拖动实验"；widgetOutline.concept="二阶变化和凹凸"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
15. interactive；widgetType="diagram"；title="二阶变化和凹凸：关系图"；widgetOutline.concept="二阶变化和凹凸"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
16. interactive；widgetType="game"；title="二阶变化和凹凸：误解修复挑战"；widgetOutline.concept="二阶变化和凹凸"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：只看一阶导数，不看弯曲。
17. interactive；widgetType="visualization3d"；title="二阶变化和凹凸：空间视角"；widgetOutline.concept="二阶变化和凹凸"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
18. slide；title="实际最值建模"；说明目标：能把文字情境转成目标函数和限制范围；点名将要修复的误解：忘记检查端点或范围。
19. interactive；widgetType="simulation"；title="实际最值建模：拖动实验"；widgetOutline.concept="实际最值建模"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
20. interactive；widgetType="diagram"；title="实际最值建模：关系图"；widgetOutline.concept="实际最值建模"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
21. interactive；widgetType="game"；title="实际最值建模：误解修复挑战"；widgetOutline.concept="实际最值建模"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：忘记检查端点或范围。
22. interactive；widgetType="visualization3d"；title="实际最值建模：空间视角"；widgetOutline.concept="实际最值建模"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
23. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
24. quiz；title="后测：导数应用：单调、极值与弯曲综合测评"；quizConfig={"questionCount":6,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（导函数图像读法 + 临界点与极值），新学证据题覆盖第二组全部知识点（二阶变化和凹凸 + 实际最值建模）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```

## GH-06 积分直觉：面积、累积与原函数

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：积分直觉：面积、累积与原函数
学习对象：零基础到弱基础学生。本节只教学基础微积分和高等数学，不使用后段应用语境。
建议时长：40-50 分钟
先修基础：已学函数、图像读法、导数定义和求导规则。
后续承接：进入微积分基本定理：连接导数和积分。
参考材料：Standard higher-mathematics supplement. Mathematics for Machine Learning has no direct continuous page slice for this lesson. Do not show local file paths. Do not invent pages.
核心问题：如果导数描述瞬时变化，怎样把变化重新累积成总量？
核心直觉：定积分把很多小变化加起来，不定积分寻找导数的来源；积分是累积语言，不只是求面积公式。

本节知识点：
- 小矩形逼近面积：目标：能解释分割越细面积越稳定；误解：把积分只看成几何面积公式；组件：simulation, diagram, game, visualization3d。
- 定积分作为累积：目标：能把速度-时间、流量-时间等情境解释成累积；误解：把正负面积混在一起；组件：simulation, diagram, game, visualization3d。
- 原函数和不定积分：目标：能说明求原函数是在反向寻找导数来源；误解：漏掉常数 C；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：积分直觉：面积、累积与原函数学习准备诊断"；quizConfig={"questionCount":5,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点，但不引用未来场景。
2. slide；title="小矩形逼近面积"；说明目标：能解释分割越细面积越稳定；点名将要修复的误解：把积分只看成几何面积公式。
3. interactive；widgetType="simulation"；title="小矩形逼近面积：拖动实验"；widgetOutline.concept="小矩形逼近面积"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="小矩形逼近面积：关系图"；widgetOutline.concept="小矩形逼近面积"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="小矩形逼近面积：误解修复挑战"；widgetOutline.concept="小矩形逼近面积"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把积分只看成几何面积公式。
6. interactive；widgetType="visualization3d"；title="小矩形逼近面积：空间视角"；widgetOutline.concept="小矩形逼近面积"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="定积分作为累积"；说明目标：能把速度-时间、流量-时间等情境解释成累积；点名将要修复的误解：把正负面积混在一起。
8. interactive；widgetType="simulation"；title="定积分作为累积：拖动实验"；widgetOutline.concept="定积分作为累积"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="定积分作为累积：关系图"；widgetOutline.concept="定积分作为累积"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="定积分作为累积：误解修复挑战"；widgetOutline.concept="定积分作为累积"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把正负面积混在一起。
11. interactive；widgetType="visualization3d"；title="定积分作为累积：空间视角"；widgetOutline.concept="定积分作为累积"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":5,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q4）：第一组每个知识点（小矩形逼近面积 + 定积分作为累积）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q5）：预诊断"原函数和不定积分"所需先备直觉，不考未学公式。
13. slide；title="原函数和不定积分"；说明目标：能说明求原函数是在反向寻找导数来源；点名将要修复的误解：漏掉常数 C。
14. interactive；widgetType="simulation"；title="原函数和不定积分：拖动实验"；widgetOutline.concept="原函数和不定积分"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
15. interactive；widgetType="diagram"；title="原函数和不定积分：关系图"；widgetOutline.concept="原函数和不定积分"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
16. interactive；widgetType="game"；title="原函数和不定积分：误解修复挑战"；widgetOutline.concept="原函数和不定积分"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：漏掉常数 C。
17. interactive；widgetType="visualization3d"；title="原函数和不定积分：空间视角"；widgetOutline.concept="原函数和不定积分"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
18. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
19. quiz；title="后测：积分直觉：面积、累积与原函数综合测评"；quizConfig={"questionCount":6,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（小矩形逼近面积 + 定积分作为累积），新学证据题覆盖第二组全部知识点（原函数和不定积分）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```

## GH-07 微积分基本定理与积分方法

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：微积分基本定理与积分方法
学习对象：零基础到弱基础学生。本节只教学基础微积分和高等数学，不使用后段应用语境。
建议时长：40-50 分钟
先修基础：已学积分直觉和原函数。
后续承接：进入多元函数：从一条曲线走向曲面。
参考材料：Standard higher-mathematics supplement. Mathematics for Machine Learning has no direct continuous page slice for this lesson. Do not show local file paths. Do not invent pages.
核心问题：为什么求面积的问题可以转化为求原函数？
核心直觉：微积分基本定理把瞬时变化和总累积接起来；换元和分部积分是把复杂累积拆回熟悉结构。

本节知识点：
- 变上限积分：目标：能解释累积函数的导数为什么回到被积函数；误解：只背公式，不知道上限变化产生新增小面积；组件：simulation, diagram, game, visualization3d。
- 牛顿-莱布尼茨公式：目标：能用原函数计算定积分；误解：把定积分和不定积分符号混用；组件：simulation, diagram, game, visualization3d。
- 换元法直觉：目标：能识别内部变量替换让结构变简单；误解：换元后忘记 dx 的变化；组件：simulation, diagram, game, visualization3d。
- 分部积分直觉：目标：能把乘积型累积拆成两部分；误解：把公式当作无意义搬运；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：微积分基本定理与积分方法学习准备诊断"；quizConfig={"questionCount":5,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点，但不引用未来场景。
2. slide；title="变上限积分"；说明目标：能解释累积函数的导数为什么回到被积函数；点名将要修复的误解：只背公式，不知道上限变化产生新增小面积。
3. interactive；widgetType="simulation"；title="变上限积分：拖动实验"；widgetOutline.concept="变上限积分"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="变上限积分：关系图"；widgetOutline.concept="变上限积分"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="变上限积分：误解修复挑战"；widgetOutline.concept="变上限积分"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：只背公式，不知道上限变化产生新增小面积。
6. interactive；widgetType="visualization3d"；title="变上限积分：空间视角"；widgetOutline.concept="变上限积分"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="牛顿-莱布尼茨公式"；说明目标：能用原函数计算定积分；点名将要修复的误解：把定积分和不定积分符号混用。
8. interactive；widgetType="simulation"；title="牛顿-莱布尼茨公式：拖动实验"；widgetOutline.concept="牛顿-莱布尼茨公式"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="牛顿-莱布尼茨公式：关系图"；widgetOutline.concept="牛顿-莱布尼茨公式"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="牛顿-莱布尼茨公式：误解修复挑战"；widgetOutline.concept="牛顿-莱布尼茨公式"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把定积分和不定积分符号混用。
11. interactive；widgetType="visualization3d"；title="牛顿-莱布尼茨公式：空间视角"；widgetOutline.concept="牛顿-莱布尼茨公式"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":6,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q4）：第一组每个知识点（变上限积分 + 牛顿-莱布尼茨公式）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q5-Q6）：第二组每个知识点（换元法直觉、分部积分直觉）各 1 题预诊断，测试先备直觉，不考未学公式。
13. slide；title="换元法直觉"；说明目标：能识别内部变量替换让结构变简单；点名将要修复的误解：换元后忘记 dx 的变化。
14. interactive；widgetType="simulation"；title="换元法直觉：拖动实验"；widgetOutline.concept="换元法直觉"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
15. interactive；widgetType="diagram"；title="换元法直觉：关系图"；widgetOutline.concept="换元法直觉"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
16. interactive；widgetType="game"；title="换元法直觉：误解修复挑战"；widgetOutline.concept="换元法直觉"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：换元后忘记 dx 的变化。
17. interactive；widgetType="visualization3d"；title="换元法直觉：空间视角"；widgetOutline.concept="换元法直觉"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
18. slide；title="分部积分直觉"；说明目标：能把乘积型累积拆成两部分；点名将要修复的误解：把公式当作无意义搬运。
19. interactive；widgetType="simulation"；title="分部积分直觉：拖动实验"；widgetOutline.concept="分部积分直觉"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
20. interactive；widgetType="diagram"；title="分部积分直觉：关系图"；widgetOutline.concept="分部积分直觉"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
21. interactive；widgetType="game"；title="分部积分直觉：误解修复挑战"；widgetOutline.concept="分部积分直觉"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把公式当作无意义搬运。
22. interactive；widgetType="visualization3d"；title="分部积分直觉：空间视角"；widgetOutline.concept="分部积分直觉"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
23. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
24. quiz；title="后测：微积分基本定理与积分方法综合测评"；quizConfig={"questionCount":6,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（变上限积分 + 牛顿-莱布尼茨公式），新学证据题覆盖第二组全部知识点（换元法直觉 + 分部积分直觉）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```

## GH-08 多元函数、曲面与偏导数

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：多元函数、曲面与偏导数
学习对象：零基础到弱基础学生。本节只教学基础微积分和高等数学，不使用后段应用语境。
建议时长：40-50 分钟
先修基础：已学一元导数和积分闭环。
后续承接：进入梯度和方向导数：把所有方向的变化组织起来。
参考材料：Mathematics for Machine Learning, PDF pages 153-155. Use only the concepts in these pages. Do not show local file paths. Do not invent pages.
核心问题：当一个输出由多个输入共同决定时，怎样分别看每个方向的变化？
核心直觉：二元函数可以看成曲面；偏导数是在只动一个输入时观察输出变化。

本节知识点：
- 多输入函数：目标：能说出 z=f(x,y) 中两个输入共同决定一个输出；误解：把多元函数当成两个互不相关的一元函数；组件：simulation, diagram, game, visualization3d。
- 曲面与等高线：目标：能在曲面和俯视等高线之间对应；误解：把等高线当成普通函数图像；组件：simulation, diagram, game, visualization3d。
- 偏导数：目标：能解释固定一个变量、只看另一个方向；误解：误以为偏导必须同时改变所有变量；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：多元函数、曲面与偏导数学习准备诊断"；quizConfig={"questionCount":5,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点，但不引用未来场景。
2. slide；title="多输入函数"；说明目标：能说出 z=f(x,y) 中两个输入共同决定一个输出；点名将要修复的误解：把多元函数当成两个互不相关的一元函数。过渡说明：前面一元函数只有一个输入 x，现在很多真实问题需要多个输入共同决定结果，从 f(x) 到 f(x,y) 的跨越是理解后续梯度和优化的基础。
3. interactive；widgetType="simulation"；title="多输入函数：拖动实验"；widgetOutline.concept="多输入函数"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="多输入函数：关系图"；widgetOutline.concept="多输入函数"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="多输入函数：误解修复挑战"；widgetOutline.concept="多输入函数"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把多元函数当成两个互不相关的一元函数。
6. interactive；widgetType="visualization3d"；title="多输入函数：空间视角"；widgetOutline.concept="多输入函数"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="曲面与等高线"；说明目标：能在曲面和俯视等高线之间对应；点名将要修复的误解：把等高线当成普通函数图像。
8. interactive；widgetType="simulation"；title="曲面与等高线：拖动实验"；widgetOutline.concept="曲面与等高线"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="曲面与等高线：关系图"；widgetOutline.concept="曲面与等高线"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="曲面与等高线：误解修复挑战"；widgetOutline.concept="曲面与等高线"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把等高线当成普通函数图像。
11. interactive；widgetType="visualization3d"；title="曲面与等高线：空间视角"；widgetOutline.concept="曲面与等高线"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":5,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q4）：第一组每个知识点（多输入函数 + 曲面与等高线）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q5）：预诊断"偏导数"所需先备直觉，不考未学公式。
13. slide；title="偏导数"；说明目标：能解释固定一个变量、只看另一个方向；点名将要修复的误解：误以为偏导必须同时改变所有变量。
14. interactive；widgetType="simulation"；title="偏导数：拖动实验"；widgetOutline.concept="偏导数"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
15. interactive；widgetType="diagram"；title="偏导数：关系图"；widgetOutline.concept="偏导数"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
16. interactive；widgetType="game"；title="偏导数：误解修复挑战"；widgetOutline.concept="偏导数"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：误以为偏导必须同时改变所有变量。
17. interactive；widgetType="visualization3d"；title="偏导数：空间视角"；widgetOutline.concept="偏导数"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
18. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
19. quiz；title="后测：多元函数、曲面与偏导数综合测评"；quizConfig={"questionCount":6,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（多输入函数 + 曲面与等高线），新学证据题覆盖第二组全部知识点（偏导数）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```

## GH-09 梯度、方向导数与等高线

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：梯度、方向导数与等高线
学习对象：零基础到弱基础学生。本节只教学基础微积分和高等数学，不使用后段应用语境。
建议时长：40-50 分钟
先修基础：已学偏导数和曲面等高线。
后续承接：进入链式法则和 Jacobian：追踪多路径、多输出的变化。
参考材料：Mathematics for Machine Learning, PDF pages 153-155. Use only the concepts in these pages. Do not show local file paths. Do not invent pages.
核心问题：曲面上任意方向都能走，怎样找到上升最快的方向？
核心直觉：梯度把各方向变化整理成箭头；它指向上升最快方向，并和等高线垂直。

本节知识点：
- 梯度向量：目标：能把偏导数组合成上升最快的方向；误解：把梯度当作一个普通数；组件：simulation, diagram, game, visualization3d。
- 方向导数：目标：能比较沿不同方向走的高度变化；误解：以为只要有方向就一定上升；组件：simulation, diagram, game, visualization3d。
- 梯度与等高线垂直：目标：能用地形图解释垂直关系；误解：把沿等高线走误认为高度变化最大；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：梯度、方向导数与等高线学习准备诊断"；quizConfig={"questionCount":5,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点，但不引用未来场景。
2. slide；title="梯度向量"；说明目标：能把偏导数组合成上升最快的方向；点名将要修复的误解：把梯度当作一个普通数。
3. interactive；widgetType="simulation"；title="梯度向量：拖动实验"；widgetOutline.concept="梯度向量"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="梯度向量：关系图"；widgetOutline.concept="梯度向量"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="梯度向量：误解修复挑战"；widgetOutline.concept="梯度向量"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把梯度当作一个普通数。
6. interactive；widgetType="visualization3d"；title="梯度向量：空间视角"；widgetOutline.concept="梯度向量"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="方向导数"；说明目标：能比较沿不同方向走的高度变化；点名将要修复的误解：以为只要有方向就一定上升。
8. interactive；widgetType="simulation"；title="方向导数：拖动实验"；widgetOutline.concept="方向导数"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="方向导数：关系图"；widgetOutline.concept="方向导数"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="方向导数：误解修复挑战"；widgetOutline.concept="方向导数"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：以为只要有方向就一定上升。
11. interactive；widgetType="visualization3d"；title="方向导数：空间视角"；widgetOutline.concept="方向导数"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":5,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q4）：第一组每个知识点（梯度向量 + 方向导数）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q5）：预诊断"梯度与等高线垂直"所需先备直觉，不考未学公式。
13. slide；title="梯度与等高线垂直"；说明目标：能用地形图解释垂直关系；点名将要修复的误解：把沿等高线走误认为高度变化最大。
14. interactive；widgetType="simulation"；title="梯度与等高线垂直：拖动实验"；widgetOutline.concept="梯度与等高线垂直"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
15. interactive；widgetType="diagram"；title="梯度与等高线垂直：关系图"；widgetOutline.concept="梯度与等高线垂直"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
16. interactive；widgetType="game"；title="梯度与等高线垂直：误解修复挑战"；widgetOutline.concept="梯度与等高线垂直"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把沿等高线走误认为高度变化最大。
17. interactive；widgetType="visualization3d"；title="梯度与等高线垂直：空间视角"；widgetOutline.concept="梯度与等高线垂直"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
18. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
19. quiz；title="后测：梯度、方向导数与等高线综合测评"；quizConfig={"questionCount":6,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（梯度向量 + 方向导数），新学证据题覆盖第二组全部知识点（梯度与等高线垂直）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```

## GH-10 多元链式法则与 Jacobian

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：多元链式法则与 Jacobian
学习对象：零基础到弱基础学生。本节只教学基础微积分和高等数学，不使用后段应用语境。
建议时长：45-55 分钟
先修基础：已学梯度、方向导数和链式法则基础。
后续承接：进入 Taylor 和 Hessian：用一阶、二阶信息近似曲面。
参考材料：Mathematics for Machine Learning, PDF pages 154-160,171-172. Use only the concepts in these pages. Do not show local file paths. Do not invent pages.
核心问题：当变量之间层层相连、输出也不止一个时，变化怎样传递和整理？
核心直觉：多元链式法则追踪路径，Jacobian 把多个输出对多个输入的局部变化整理成表格。

本节知识点：
- 多元链式法则：目标：能沿路径追踪变化贡献；误解：把一元链式法则机械套用，忽略矩阵顺序；组件：simulation, diagram, game, visualization3d。
- 向量值函数：目标：能理解一个输入可以产生多个输出；误解：只习惯一个输出的函数；组件：simulation, diagram, game, visualization3d。
- Jacobian 表格：目标：能说明行列分别对应输出和输入；误解：不知道谁对谁求导；组件：simulation, diagram, game, visualization3d。
- 局部线性变形：目标：能把 Jacobian 看成局部空间变形；误解：把矩阵表格和几何变形割裂；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：多元链式法则与 Jacobian学习准备诊断"；quizConfig={"questionCount":5,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点，但不引用未来场景。
2. slide；title="多元链式法则"；说明目标：能沿路径追踪变化贡献；点名将要修复的误解：把一元链式法则机械套用，忽略矩阵顺序。
3. interactive；widgetType="simulation"；title="多元链式法则：拖动实验"；widgetOutline.concept="多元链式法则"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="多元链式法则：关系图"；widgetOutline.concept="多元链式法则"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="多元链式法则：误解修复挑战"；widgetOutline.concept="多元链式法则"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把一元链式法则机械套用，忽略矩阵顺序。
6. interactive；widgetType="visualization3d"；title="多元链式法则：空间视角"；widgetOutline.concept="多元链式法则"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="向量值函数"；说明目标：能理解一个输入可以产生多个输出；点名将要修复的误解：只习惯一个输出的函数。
8. interactive；widgetType="simulation"；title="向量值函数：拖动实验"；widgetOutline.concept="向量值函数"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="向量值函数：关系图"；widgetOutline.concept="向量值函数"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="向量值函数：误解修复挑战"；widgetOutline.concept="向量值函数"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：只习惯一个输出的函数。
11. interactive；widgetType="visualization3d"；title="向量值函数：空间视角"；widgetOutline.concept="向量值函数"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":6,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q4）：第一组每个知识点（多元链式法则 + 向量值函数）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q5-Q6）：第二组每个知识点（Jacobian 表格、局部线性变形）各 1 题预诊断，测试先备直觉，不考未学公式。
13. slide；title="Jacobian 表格"；说明目标：能说明行列分别对应输出和输入；点名将要修复的误解：不知道谁对谁求导。
14. interactive；widgetType="simulation"；title="Jacobian 表格：拖动实验"；widgetOutline.concept="Jacobian 表格"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
15. interactive；widgetType="diagram"；title="Jacobian 表格：关系图"；widgetOutline.concept="Jacobian 表格"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
16. interactive；widgetType="game"；title="Jacobian 表格：误解修复挑战"；widgetOutline.concept="Jacobian 表格"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：不知道谁对谁求导。
17. interactive；widgetType="visualization3d"；title="Jacobian 表格：空间视角"；widgetOutline.concept="Jacobian 表格"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
18. slide；title="局部线性变形"；说明目标：能把 Jacobian 看成局部空间变形；点名将要修复的误解：把矩阵表格和几何变形割裂。
19. interactive；widgetType="simulation"；title="局部线性变形：拖动实验"；widgetOutline.concept="局部线性变形"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
20. interactive；widgetType="diagram"；title="局部线性变形：关系图"；widgetOutline.concept="局部线性变形"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
21. interactive；widgetType="game"；title="局部线性变形：误解修复挑战"；widgetOutline.concept="局部线性变形"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把矩阵表格和几何变形割裂。
22. interactive；widgetType="visualization3d"；title="局部线性变形：空间视角"；widgetOutline.concept="局部线性变形"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
23. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
24. quiz；title="后测：多元链式法则与 Jacobian综合测评"；quizConfig={"questionCount":6,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（多元链式法则 + 向量值函数），新学证据题覆盖第二组全部知识点（Jacobian 表格 + 局部线性变形）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```

## GH-11 Taylor 近似、Hessian 与驻点判断

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：Taylor 近似、Hessian 与驻点判断
学习对象：零基础到弱基础学生。本节只教学基础微积分和高等数学，不使用后段应用语境。
建议时长：45-55 分钟
先修基础：已学梯度、Jacobian 和局部线性。
后续承接：进入连续优化：把函数地形上的判断变成算法。
参考材料：Mathematics for Machine Learning, PDF pages 149-151,171-175,233-235. Use only the concepts in these pages. Do not show local file paths. Do not invent pages.
核心问题：为什么只知道梯度还不够，还要知道曲面怎样弯？
核心直觉：Taylor 近似用局部简单函数代替复杂函数；Hessian 记录二阶弯曲，帮助判断碗底、山顶和鞍点。

本节知识点：
- 一阶 Taylor 近似：目标：能用切线近似局部函数；误解：把近似当成全局等于；组件：simulation, diagram, game, visualization3d。
- 二阶 Taylor 近似：目标：能说明二阶项描述弯曲；误解：只记公式，不解释局部形状；组件：simulation, diagram, game, visualization3d。
- Hessian 矩阵：目标：能把二阶偏导整理成弯曲信息；误解：把 Hessian 当成又一个陌生符号；组件：simulation, diagram, game, visualization3d。
- 驻点类型判断：目标：能区分局部最小、局部最大和鞍点；误解：以为梯度为 0 就一定成功；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：Taylor 近似、Hessian 与驻点判断学习准备诊断"；quizConfig={"questionCount":5,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点，但不引用未来场景。
2. slide；title="一阶 Taylor 近似"；说明目标：能用切线近似局部函数；点名将要修复的误解：把近似当成全局等于。
3. interactive；widgetType="simulation"；title="一阶 Taylor 近似：拖动实验"；widgetOutline.concept="一阶 Taylor 近似"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="一阶 Taylor 近似：关系图"；widgetOutline.concept="一阶 Taylor 近似"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="一阶 Taylor 近似：误解修复挑战"；widgetOutline.concept="一阶 Taylor 近似"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把近似当成全局等于。
6. interactive；widgetType="visualization3d"；title="一阶 Taylor 近似：空间视角"；widgetOutline.concept="一阶 Taylor 近似"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="二阶 Taylor 近似"；说明目标：能说明二阶项描述弯曲；点名将要修复的误解：只记公式，不解释局部形状。
8. interactive；widgetType="simulation"；title="二阶 Taylor 近似：拖动实验"；widgetOutline.concept="二阶 Taylor 近似"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="二阶 Taylor 近似：关系图"；widgetOutline.concept="二阶 Taylor 近似"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="二阶 Taylor 近似：误解修复挑战"；widgetOutline.concept="二阶 Taylor 近似"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：只记公式，不解释局部形状。
11. interactive；widgetType="visualization3d"；title="二阶 Taylor 近似：空间视角"；widgetOutline.concept="二阶 Taylor 近似"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":6,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q4）：第一组每个知识点（一阶 Taylor 近似 + 二阶 Taylor 近似）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q5-Q6）：第二组每个知识点（Hessian 矩阵、驻点类型判断）各 1 题预诊断，测试先备直觉，不考未学公式。
13. slide；title="Hessian 矩阵"；说明目标：能把二阶偏导整理成弯曲信息；点名将要修复的误解：把 Hessian 当成又一个陌生符号。
14. interactive；widgetType="simulation"；title="Hessian 矩阵：拖动实验"；widgetOutline.concept="Hessian 矩阵"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
15. interactive；widgetType="diagram"；title="Hessian 矩阵：关系图"；widgetOutline.concept="Hessian 矩阵"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
16. interactive；widgetType="game"；title="Hessian 矩阵：误解修复挑战"；widgetOutline.concept="Hessian 矩阵"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把 Hessian 当成又一个陌生符号。
17. interactive；widgetType="visualization3d"；title="Hessian 矩阵：空间视角"；widgetOutline.concept="Hessian 矩阵"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
18. slide；title="驻点类型判断"；说明目标：能区分局部最小、局部最大和鞍点；点名将要修复的误解：以为梯度为 0 就一定成功。
19. interactive；widgetType="simulation"；title="驻点类型判断：拖动实验"；widgetOutline.concept="驻点类型判断"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
20. interactive；widgetType="diagram"；title="驻点类型判断：关系图"；widgetOutline.concept="驻点类型判断"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
21. interactive；widgetType="game"；title="驻点类型判断：误解修复挑战"；widgetOutline.concept="驻点类型判断"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：以为梯度为 0 就一定成功。
22. interactive；widgetType="visualization3d"；title="驻点类型判断：空间视角"；widgetOutline.concept="驻点类型判断"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
23. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
24. quiz；title="后测：Taylor 近似、Hessian 与驻点判断综合测评"；quizConfig={"questionCount":6,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（一阶 Taylor 近似 + 二阶 Taylor 近似），新学证据题覆盖第二组全部知识点（Hessian 矩阵 + 驻点类型判断）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```

## GH-12 无约束优化与梯度下降

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：无约束优化与梯度下降
学习对象：零基础到弱基础学生。本节只教学基础微积分和高等数学，不使用后段应用语境。
建议时长：45-55 分钟
先修基础：已学梯度、Hessian 和极值判断。
后续承接：进入约束和凸优化：当行动范围有限时怎样找最好。
参考材料：Mathematics for Machine Learning, PDF pages 231-238. Use only the concepts in these pages. Do not show local file paths. Do not invent pages.
核心问题：怎样从一个起点一步步走向目标函数的低谷？
核心直觉：优化是在地形上找低谷；负梯度给方向，步长决定走得稳不稳，地形形状决定是否容易找到好结果。

本节知识点：
- 目标函数地形：目标：能把最小化问题看成找低谷；误解：把目标函数当成普通公式，不看地形；组件：simulation, diagram, game, visualization3d。
- 负梯度方向：目标：能解释为什么沿负梯度下降；误解：把梯度方向和下降方向混淆；组件：simulation, diagram, game, visualization3d。
- 步长和收敛：目标：能判断步长过大/过小的后果；误解：认为步长越大越快；组件：simulation, diagram, game, visualization3d。
- 迭代路径与停止信号：目标：能记录每一步的位置、函数值和变化幅度，并判断何时可以停止；误解：以为只要一直迭代就一定越来越好；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：无约束优化与梯度下降学习准备诊断"；quizConfig={"questionCount":5,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点，但不引用未来场景。
2. slide；title="目标函数地形"；说明目标：能把最小化问题看成找低谷；点名将要修复的误解：把目标函数当成普通公式，不看地形。
3. interactive；widgetType="simulation"；title="目标函数地形：拖动实验"；widgetOutline.concept="目标函数地形"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="目标函数地形：关系图"；widgetOutline.concept="目标函数地形"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="目标函数地形：误解修复挑战"；widgetOutline.concept="目标函数地形"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把目标函数当成普通公式，不看地形。
6. interactive；widgetType="visualization3d"；title="目标函数地形：空间视角"；widgetOutline.concept="目标函数地形"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="负梯度方向"；说明目标：能解释为什么沿负梯度下降；点名将要修复的误解：把梯度方向和下降方向混淆。
8. interactive；widgetType="simulation"；title="负梯度方向：拖动实验"；widgetOutline.concept="负梯度方向"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="负梯度方向：关系图"；widgetOutline.concept="负梯度方向"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="负梯度方向：误解修复挑战"；widgetOutline.concept="负梯度方向"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把梯度方向和下降方向混淆。
11. interactive；widgetType="visualization3d"；title="负梯度方向：空间视角"；widgetOutline.concept="负梯度方向"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":6,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q4）：第一组每个知识点（目标函数地形 + 负梯度方向）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q5-Q6）：第二组每个知识点（步长和收敛、迭代路径与停止信号）各 1 题预诊断，测试先备直觉，不考未学公式。
13. slide；title="步长和收敛"；说明目标：能判断步长过大/过小的后果；点名将要修复的误解：认为步长越大越快。
14. interactive；widgetType="simulation"；title="步长和收敛：拖动实验"；widgetOutline.concept="步长和收敛"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
15. interactive；widgetType="diagram"；title="步长和收敛：关系图"；widgetOutline.concept="步长和收敛"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
16. interactive；widgetType="game"；title="步长和收敛：误解修复挑战"；widgetOutline.concept="步长和收敛"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：认为步长越大越快。
17. interactive；widgetType="visualization3d"；title="步长和收敛：空间视角"；widgetOutline.concept="步长和收敛"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
18. slide；title="迭代路径与停止信号"；说明目标：能记录每一步的位置、函数值和变化幅度，并判断何时可以停止；点名将要修复的误解：以为只要一直迭代就一定越来越好。
19. interactive；widgetType="simulation"；title="迭代路径与停止信号：拖动实验"；widgetOutline.concept="迭代路径与停止信号"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
20. interactive；widgetType="diagram"；title="迭代路径与停止信号：关系图"；widgetOutline.concept="迭代路径与停止信号"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
21. interactive；widgetType="game"；title="迭代路径与停止信号：误解修复挑战"；widgetOutline.concept="迭代路径与停止信号"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：以为只要一直迭代就一定越来越好。
22. interactive；widgetType="visualization3d"；title="迭代路径与停止信号：空间视角"；widgetOutline.concept="迭代路径与停止信号"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
23. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
24. quiz；title="后测：无约束优化与梯度下降综合测评"；quizConfig={"questionCount":6,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（目标函数地形 + 负梯度方向），新学证据题覆盖第二组全部知识点（步长和收敛 + 迭代路径与停止信号）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```

## GH-13 约束优化、拉格朗日与凸性

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：约束优化、拉格朗日与凸性
学习对象：零基础到弱基础学生。本节只教学基础微积分和高等数学，不使用后段应用语境。
建议时长：45-55 分钟
先修基础：已学无约束优化和梯度下降。
后续承接：进入最终应用桥接模块：把前面高数工具连接成完整解决问题路线。
参考材料：Mathematics for Machine Learning, PDF pages 239-248. Use only the concepts in these pages. Do not show local file paths. Do not invent pages.
核心问题：如果不能随便走，只能在限制范围内行动，最优点在哪里？
核心直觉：约束让最优点必须在可行区域内；拉格朗日乘子描述方向平衡，凸性给全局最优的可靠保证。

本节知识点：
- 可行区域：目标：能区分目标函数和限制条件；误解：只优化目标，不检查限制；组件：simulation, diagram, game, visualization3d。
- 拉格朗日乘子直觉：目标：能用切线/等高线方向平衡解释乘子；误解：把乘子只当成代数技巧；组件：simulation, diagram, game, visualization3d。
- 凸函数和凸集合：目标：能解释为什么凸问题局部最优就是全局最优；误解：把所有碗形地形都想成简单抛物线；组件：simulation, diagram, game, visualization3d。
- 线性/二次规划入口：目标：能识别线性目标、二次目标和线性约束的基本形态；误解：一看到规划就跳到复杂算法；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：约束优化、拉格朗日与凸性学习准备诊断"；quizConfig={"questionCount":5,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点，但不引用未来场景。
2. slide；title="可行区域"；说明目标：能区分目标函数和限制条件；点名将要修复的误解：只优化目标，不检查限制。
3. interactive；widgetType="simulation"；title="可行区域：拖动实验"；widgetOutline.concept="可行区域"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="可行区域：关系图"；widgetOutline.concept="可行区域"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="可行区域：误解修复挑战"；widgetOutline.concept="可行区域"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：只优化目标，不检查限制。
6. interactive；widgetType="visualization3d"；title="可行区域：空间视角"；widgetOutline.concept="可行区域"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="拉格朗日乘子直觉"；说明目标：能用切线/等高线方向平衡解释乘子；点名将要修复的误解：把乘子只当成代数技巧。
8. interactive；widgetType="simulation"；title="拉格朗日乘子直觉：拖动实验"；widgetOutline.concept="拉格朗日乘子直觉"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="拉格朗日乘子直觉：关系图"；widgetOutline.concept="拉格朗日乘子直觉"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="拉格朗日乘子直觉：误解修复挑战"；widgetOutline.concept="拉格朗日乘子直觉"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把乘子只当成代数技巧。
11. interactive；widgetType="visualization3d"；title="拉格朗日乘子直觉：空间视角"；widgetOutline.concept="拉格朗日乘子直觉"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":6,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q4）：第一组每个知识点（可行区域 + 拉格朗日乘子直觉）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q5-Q6）：第二组每个知识点（凸函数和凸集合、线性/二次规划入口）各 1 题预诊断，测试先备直觉，不考未学公式。
13. slide；title="凸函数和凸集合"；说明目标：能解释为什么凸问题局部最优就是全局最优；点名将要修复的误解：把所有碗形地形都想成简单抛物线。
14. interactive；widgetType="simulation"；title="凸函数和凸集合：拖动实验"；widgetOutline.concept="凸函数和凸集合"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
15. interactive；widgetType="diagram"；title="凸函数和凸集合：关系图"；widgetOutline.concept="凸函数和凸集合"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
16. interactive；widgetType="game"；title="凸函数和凸集合：误解修复挑战"；widgetOutline.concept="凸函数和凸集合"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把所有碗形地形都想成简单抛物线。
17. interactive；widgetType="visualization3d"；title="凸函数和凸集合：空间视角"；widgetOutline.concept="凸函数和凸集合"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
18. slide；title="线性/二次规划入口"；说明目标：能识别线性目标、二次目标和线性约束的基本形态；点名将要修复的误解：一看到规划就跳到复杂算法。
19. interactive；widgetType="simulation"；title="线性/二次规划入口：拖动实验"；widgetOutline.concept="线性/二次规划入口"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
20. interactive；widgetType="diagram"；title="线性/二次规划入口：关系图"；widgetOutline.concept="线性/二次规划入口"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
21. interactive；widgetType="game"；title="线性/二次规划入口：误解修复挑战"；widgetOutline.concept="线性/二次规划入口"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：一看到规划就跳到复杂算法。
22. interactive；widgetType="visualization3d"；title="线性/二次规划入口：空间视角"；widgetOutline.concept="线性/二次规划入口"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
23. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
24. quiz；title="后测：约束优化、拉格朗日与凸性综合测评"；quizConfig={"questionCount":6,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（可行区域 + 拉格朗日乘子直觉），新学证据题覆盖第二组全部知识点（凸函数和凸集合 + 线性/二次规划入口）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```

## GH-14 机器学习与深度学习中的高数闭环

```text
请为 OpenMAIC Interactive Mode / Ultra Mode 生成一节多场景课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

输出顶层键只允许 languageDirective、courseTitle、outlines。outlines 中每个 scene 只使用 id、type、title、description、keyPoints、order，以及对应类型需要的 quizConfig 或 widgetType/widgetOutline。

OpenMAIC UI 字段硬约束：type 只允许 slide、quiz、interactive；禁止 pbl、pblConfig、interactiveConfig、顶层 planning、顶层 judge。interactive 必须使用 widgetType 和 widgetOutline.concept；widgetType 只允许 simulation、diagram、game、visualization3d；禁止 code。quiz 必须使用 quizConfig，questionTypes 只允许 single、multiple、text。

流程硬约束：整节课 quiz 总数必须等于 3，且只能是前测、形成性测验、后测。顺序必须是：前测 -> 第一组场景 -> 形成性测验 -> 第二组场景 -> 后测。不要固定 15 场景，场景数量由下面逐场景蓝图决定；蓝图列出的每一行都必须生成。

覆盖硬约束：每个知识点必须覆盖 slide、simulation、diagram、game、visualization3d，并在 widgetOutline 中提供 2D fallback。每个 interactive 的 description 必须写出可被 quiz 引用的 observableEvidence，不要写流程标签。

测验硬约束：前测诊断后续全部知识点但不引用未来 scene；每个知识点至少 1 题；questionCount 不低于知识点数 + 1（下限 5）。形成性测验分为检验部分和桥接部分：检验部分——第一组每个知识点至少 2 题，引用该知识点对应 scene 的标题、操作和 observableEvidence；桥接部分——第二组每个知识点至少 1 题，测试该知识点所需的先备直觉或常见误解预诊断，不考未学公式；questionCount = 第一组知识点数 × 2 + 第二组知识点数（下限 5）。后测必须是最后一个 scene，综合测评全部知识点；每个知识点至少被 1 题覆盖；已学证据题应覆盖第一组全部知识点，新学证据题应覆盖第二组全部知识点；至少包含 1 题迁移题（联合两个以上知识点）、1 题解释题（要求用自己的话描述原理）；迁移题和解释题难度应高于形成性测验；questionCount = max(6, 知识点数 + 2)。quiz 不要写”观察下图””如下图所示””见上图””根据图片”，默认不依赖图片。

Interactive usability hard rules: every interactive scene must describe controls, student actions, feedback, and observableEvidence in keyPoints; the generated component must be self-contained, visible, clickable/draggable/selectable, and must not depend on external CDN, local files, hidden buttons, or unbound events; before output, internally check HTML/JS syntax, brackets, quotes, DOM binding, initialization order, desktop/mobile visibility, and logic consistency.

课程主题：机器学习与深度学习中的高数闭环
学习对象：零基础到弱基础学生。本节是最终应用桥接模块，可以连接模型训练、自动微分和参数更新。
建议时长：45-60 分钟
先修基础：已学导数、链式法则、梯度、Hessian、无约束和约束优化。
后续承接：完成本路线；后续可进入线性代数、概率统计、线性回归、PCA 或深度学习专题。
参考材料：Mathematics for Machine Learning, PDF pages 160,165-170,231-232,237-238. Use only the concepts in these pages. Do not show local file paths. Do not invent pages.
核心问题：前面学的导数、梯度和优化怎样真正进入模型训练？
核心直觉：模型训练就是选参数让损失函数变小；自动微分用链式法则算梯度，梯度下降用这些梯度更新参数。

本节知识点：
- 损失函数和参数：目标：能把训练看成调参数使误差变小；误解：把机器学习看成黑箱，不知道优化对象；组件：simulation, diagram, game, visualization3d。
- 最小二乘梯度：目标：能看出拟合直线和梯度计算的关系；误解：把误差平方和当成孤立公式；组件：simulation, diagram, game, visualization3d。
- 计算图与自动微分：目标：能用节点和边追踪链式法则；误解：把反向传播当成神秘算法；组件：simulation, diagram, game, visualization3d。
- 小批量梯度下降：目标：能解释为什么用一部分数据估计梯度；误解：认为近似梯度一定不可靠；组件：simulation, diagram, game, visualization3d。
- 完整学习路线回看：目标：能把函数-导数-梯度-优化-训练串成闭环；误解：学完高数仍不知道各工具如何连接；组件：simulation, diagram, game, visualization3d。

必须按下面逐场景蓝图生成 outlines，保持顺序、type、quizConfig、widgetType 和 widgetOutline.concept：
1. quiz；title="前测：机器学习与深度学习中的高数闭环学习准备诊断"；quizConfig={"questionCount":7,"difficulty":"easy","questionTypes":["single","multiple","text"]}；覆盖后续全部知识点（损失函数和参数、最小二乘梯度、计算图与自动微分、小批量梯度下降、完整学习路线回看），每个知识点至少 1 题，但不引用未来场景。
2. slide；title="损失函数和参数"；说明目标：能把训练看成调参数使误差变小；点名将要修复的误解：把机器学习看成黑箱，不知道优化对象。
3. interactive；widgetType="simulation"；title="损失函数和参数：拖动实验"；widgetOutline.concept="损失函数和参数"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
4. interactive；widgetType="diagram"；title="损失函数和参数：关系图"；widgetOutline.concept="损失函数和参数"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
5. interactive；widgetType="game"；title="损失函数和参数：误解修复挑战"；widgetOutline.concept="损失函数和参数"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把机器学习看成黑箱，不知道优化对象。
6. interactive；widgetType="visualization3d"；title="损失函数和参数：空间视角"；widgetOutline.concept="损失函数和参数"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
7. slide；title="最小二乘梯度"；说明目标：能看出拟合直线和梯度计算的关系；点名将要修复的误解：把误差平方和当成孤立公式。
8. interactive；widgetType="simulation"；title="最小二乘梯度：拖动实验"；widgetOutline.concept="最小二乘梯度"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
9. interactive；widgetType="diagram"；title="最小二乘梯度：关系图"；widgetOutline.concept="最小二乘梯度"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
10. interactive；widgetType="game"；title="最小二乘梯度：误解修复挑战"；widgetOutline.concept="最小二乘梯度"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把误差平方和当成孤立公式。
11. interactive；widgetType="visualization3d"；title="最小二乘梯度：空间视角"；widgetOutline.concept="最小二乘梯度"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
12. slide；title="计算图与自动微分"；说明目标：能用节点和边追踪链式法则；点名将要修复的误解：把反向传播当成神秘算法。
13. interactive；widgetType="simulation"；title="计算图与自动微分：拖动实验"；widgetOutline.concept="计算图与自动微分"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
14. interactive；widgetType="diagram"；title="计算图与自动微分：关系图"；widgetOutline.concept="计算图与自动微分"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
15. interactive；widgetType="game"；title="计算图与自动微分：误解修复挑战"；widgetOutline.concept="计算图与自动微分"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：把反向传播当成神秘算法。
16. interactive；widgetType="visualization3d"；title="计算图与自动微分：空间视角"；widgetOutline.concept="计算图与自动微分"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
17. quiz；title="形成性测验：检查第一组场景并承接下一组知识点"；quizConfig={"questionCount":8,"difficulty":"medium","questionTypes":["single","multiple","text"]}；检验部分（Q1-Q6）：第一组每个知识点（损失函数和参数、最小二乘梯度、计算图与自动微分）各至少 2 题，引用对应 scene 标题、操作和 observableEvidence；桥接部分（Q7-Q8）：第二组每个知识点（小批量梯度下降、完整学习路线回看）各 1 题预诊断，测试先备直觉，不考未学公式。
18. slide；title="小批量梯度下降"；说明目标：能解释为什么用一部分数据估计梯度；点名将要修复的误解：认为近似梯度一定不可靠。
19. interactive；widgetType="simulation"；title="小批量梯度下降：拖动实验"；widgetOutline.concept="小批量梯度下降"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
20. interactive；widgetType="diagram"；title="小批量梯度下降：关系图"；widgetOutline.concept="小批量梯度下降"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
21. interactive；widgetType="game"；title="小批量梯度下降：误解修复挑战"；widgetOutline.concept="小批量梯度下降"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：认为近似梯度一定不可靠。
22. interactive；widgetType="visualization3d"；title="小批量梯度下降：空间视角"；widgetOutline.concept="小批量梯度下降"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
23. slide；title="完整学习路线回看"；说明目标：能把函数-导数-梯度-优化-训练串成闭环；点名将要修复的误解：学完高数仍不知道各工具如何连接。
24. interactive；widgetType="simulation"；title="完整学习路线回看：拖动实验"；widgetOutline.concept="完整学习路线回看"；keyVariables 包含核心变量、对比开关、读数面板、预测记录；observableEvidence 必须能被后续 quiz 引用。
25. interactive；widgetType="diagram"；title="完整学习路线回看：关系图"；widgetOutline.concept="完整学习路线回看"；diagramType 使用 flowchart/system/hierarchy 中最合适的一种；observableEvidence 包含节点、连接关系、常见误解位置。
26. interactive；widgetType="game"；title="完整学习路线回看：误解修复挑战"；widgetOutline.concept="完整学习路线回看"；gameType 使用 puzzle/card/strategy/action 中最合适的一种；challenge 必须针对误解：学完高数仍不知道各工具如何连接。
27. interactive；widgetType="visualization3d"；title="完整学习路线回看：空间视角"；widgetOutline.concept="完整学习路线回看"；visualizationType="geometry"；必须提供 2D fallback，避免 3D 失败时学习断裂。
28. slide；title="全课整理：证据链回看"；逐条连接前测误解、交互证据、形成性测验反馈和后测综合任务。
29. quiz；title="后测：机器学习与深度学习中的高数闭环综合测评"；quizConfig={"questionCount":7,"difficulty":"hard","questionTypes":["single","multiple","text"]}；最后一个 scene；每个知识点至少 1 题覆盖；已学证据题覆盖第一组全部知识点（损失函数和参数 + 最小二乘梯度 + 计算图与自动微分），新学证据题覆盖第二组全部知识点（小批量梯度下降 + 完整学习路线回看）；至少 1 题迁移题（联合两个以上知识点）、1 题解释题；迁移题和解释题难度应高于形成性测验。

生成前自检但不要输出自检：JSON syntax valid; first scene is quiz; last scene is quiz; quiz count is exactly 3; no pbl/code/interactiveConfig; all interactive scenes have widgetType and widgetOutline.concept; widgetOutline matches widgetType; questionTypes use single/multiple/text; quiz has no empty image reference; every interactive scene is visible and clickable/draggable/selectable; controls/actions/feedback/observableEvidence are stated; pre-test, formative quiz, and post-test form a logical learning loop; no local file paths or conversation traces; generated scene count matches blueprint line count exactly; every knowledge point has at least slide + simulation + diagram + game + visualization3d; post-test includes at least 1 已学证据题 + 1 新学证据题 + 1 迁移题 + 1 解释题; simulation widgetOutline has keyVariables, diagram has diagramType, game has gameType and challenge targeting the stated misconception; formative quiz 检验部分 each reference a specific 第一组场景 title and its observableEvidence; every knowledge point appears in at least 1 pre-test question; formative quiz: each first-group KP is referenced by at least 2 questions, each second-group KP has at least 1 bridge question; post-test: each KP is covered by at least 1 question, 已学证据 covers all first-group KPs, 新学证据 covers all second-group KPs; questionCount matches the formula in 测验硬约束.

```
