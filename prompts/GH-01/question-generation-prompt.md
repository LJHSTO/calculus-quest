## GH-01 函数、坐标与图像读法（测评设计规范，不直接提交 OpenMAIC）

> 实测说明：单次生成 5 个完整测验容易被模型截断。本文件保留总体设计规范；实际生成请分别使用 `pre-post-paired-prompt.md` 和 `checks/` 下三个单知识点提示词。

```text
请为 OpenMAIC 生成一个仅包含测评题目的课程大纲。只输出最终 JSON object，不要输出 markdown、代码围栏、解释或检查过程。

这是 assessment-only 任务，不生成课件资源。忽略常规课程的互动场景比例和 slide/interactive 分布建议：outlines 必须且只能包含 5 个 quiz scene，不得生成 slide、interactive、pbl、code、simulation、diagram、game 或 visualization3d。

输出顶层键只允许 languageDirective、courseTitle、outlines。每个 outline 只使用 id、type、title、description、keyPoints、order、quizConfig。type 必须为 quiz。quizConfig 只使用 questionCount、difficulty、questionTypes；questionTypes 只允许 single、multiple、text。

名称保护硬约束：课程主题和以下三个知识点名称必须逐字保持，不得改名、缩写、合并、拆分或新增知识点：
1. 输入、输出和函数规则
2. 坐标点与函数图像
3. 图像的上升、下降与变化方向

学习对象：零基础到弱基础高中生。
先修基础：四则运算、坐标平面和简单代入。
内容边界：只考函数输入输出、坐标点、函数图像读取、图像上升下降和变化方向；不得考极限、连续、导数、复杂函数、机器学习或大学先修知识。
质量参考：参考 Mathematics for Machine Learning 课后练习的严谨性、条件完整性和推理结构，但降低符号密度、阅读负担和计算长度，使数据可手算、问题可独立作答。

测评结构硬约束：outlines 数量必须等于 5，顺序固定为：
1. 前测 A 卷
2. “输入、输出和函数规则”即时检查
3. “坐标点与函数图像”即时检查
4. “图像的上升、下降与变化方向”即时检查
5. 后测 B 卷

前后测等值硬约束：前测和后测必须采用同一份六题测验蓝图。两卷 questionCount、总分、知识点权重、题型顺序、认知层级、预计解题步骤、阅读量和评分规则必须一致；两卷整体 difficulty 都为 medium。后测不得增加综合性、迁移性、符号复杂度、计算量或步骤数。A/B 卷不得使用完全相同的题干、数值或选项顺序，只允许更换数值、函数规则、坐标或等价生活情境。

前后测六题平行蓝图必须逐题写入前测与后测 scene 的 description 和 keyPoints：
- P01：输入、输出和函数规则；single；概念辨析；1 步；10 分；A/B 都使用一次函数 ax+b，且 a、b 均为小整数、a 为正数。
- P02：输入、输出和函数规则；single；基础代入；2 步；10 分；A/B 都使用一次函数 ax+b、负整数输入、一次乘法和一次加减法，不得一卷用二次函数而另一卷用一次函数。
- P03：坐标点与函数图像；single；坐标读取；2 步；10 分；A/B 都使用正斜率一次函数 ax+b 和正整数横坐标，只提供一个目标点的数据，不加入无关点。
- P04：坐标点与函数图像；multiple；表示转换；2 步；10 分；A/B 都使用正斜率一次函数 ax+b，固定 4 个选项，其中恰好 2 个正确、2 个错误，四个选项采用相同的验证结构。
- P05：图像的上升、下降与变化方向；single；局部趋势判断；1 步；10 分；A/B 都提供 3 个有序数据点并询问完整区间的总体趋势，不加入题目未使用的数据。
- P06：图像的上升、下降与变化方向；text；解释变化；两个明确评分点；10 分；A/B 都提供 3 个有序数据点，变化结构均为先上升后下降。

前测不得引用尚未学习的课件、操作记录或图片。后测也不得依赖学生记住课件中的特定读数。两卷所有题目必须脱离课件和图片独立作答。

即时检查硬约束：每个即时检查 questionCount 等于 3，只考标题对应的一个知识点，不得混入其他知识点或后续内容。题序固定为：Q1 single 概念辨析；Q2 single 一至两步基础应用；Q3 multiple 常见错误诊断。difficulty 为 medium；不使用 text，以便立即自动反馈。题干必须简短、条件充分；single 题答案唯一；multiple 错误诊断题必须明确写“选择所有错误说法”，不得再写“选择所有正确选项”，并固定为 4 个选项、恰好 2 个错误说法和 2 个正确说法。错误说法必须对应下面列出的真实误解。

知识点目标和误解：
- 输入、输出和函数规则：目标是区分 x、f(x) 和函数规则；误解是把函数看成一个数、把 f(x) 误读成 f×x，或忽略输入经过规则才得到输出。
- 坐标点与函数图像：目标是把 (x,f(x)) 放到图像上并正确读取横轴纵轴；误解是交换横纵坐标、把图像当装饰，或只看点的高度不看横坐标。
- 图像的上升、下降与变化方向：目标是用图像语言描述局部变化趋势；误解是把“函数值为正”等同于“函数正在上升”，或只会代数计算而不会解释图像变化。

通用题目质量硬约束：
- 每题只测量一个明确目标，避免一题同时考多个知识点。
- 使用高中生熟悉的语言，不用偏题、竞赛技巧和故意绕弯的表述。
- 所有必要数据必须出现在题干中，不使用“观察下图”“如下图所示”“见上图”“根据图片”等表达。
- 不得加入解题不需要的无关数据；A/B 对应题提供的信息条数必须相同，题干长度差不超过约 20%。
- 每道 single 题固定 4 个选项且恰好 1 个正确答案；每道 multiple 题固定 4 个选项且恰好 2 个正确答案。选项必须互斥、语法平行、长度接近，不得出现全部选项都正确、全部选项都错误或用明显最长选项暗示答案。
- 干扰项必须来自计算错误、符号误读、坐标交换或概念混淆，不得使用无意义随机答案。
- 每道题在 keyPoints 中必须给出完整题干、全部选项（text 除外）、正确答案和简短解析，不得只写考查目标。text 题必须给出参考答案和两个可独立判分的评分点，不按措辞是否一致评分。
- A/B 对应题必须使用相同数量的已知条件、相同数量的选项、相同的正确选项数量和相同的数值复杂度；若 A 卷使用负数输入，B 卷也使用负数输入。
- A/B 对应题必须属于同一函数族，具有相同的最高次数、系数正负结构和运算次数；不得用一次函数配对二次函数，不得用正斜率函数配对负斜率函数。
- 在输出前逐题反算：把标注的正确答案代回题干验证，并逐一验证所有干扰项。若计算结果与答案字母、选项值或解析不一致，必须先修正再输出。解析中的方程求解结果必须与最终选项完全一致。
- 不得把数字更大、阅读更长、步骤更多或情境更陌生当作后测难度。

必须生成以下 5 个 outlines，逐字保持 id、title、order 和 quizConfig：

1. id="GH-01-pre"；type="quiz"；title="前测：函数、坐标与图像读法学习准备诊断（A卷）"；order=1；quizConfig={"questionCount":6,"difficulty":"medium","questionTypes":["single","multiple","text"]}；description 和 keyPoints 必须完整写入 P01-P06 A 卷蓝图、知识点对应关系、步骤数和分值。

2. id="GH-01-K01-check"；type="quiz"；title="即时检查：输入、输出和函数规则"；order=2；quizConfig={"questionCount":3,"difficulty":"medium","questionTypes":["single","multiple"]}；只考“输入、输出和函数规则”，覆盖概念辨析、基础代入和错误诊断。

3. id="GH-01-K02-check"；type="quiz"；title="即时检查：坐标点与函数图像"；order=3；quizConfig={"questionCount":3,"difficulty":"medium","questionTypes":["single","multiple"]}；只考“坐标点与函数图像”，覆盖坐标读取、表示转换和错误诊断。

4. id="GH-01-K03-check"；type="quiz"；title="即时检查：图像的上升、下降与变化方向"；order=4；quizConfig={"questionCount":3,"difficulty":"medium","questionTypes":["single","multiple"]}；只考“图像的上升、下降与变化方向”，覆盖趋势判断、语言解释和错误诊断。

5. id="GH-01-post"；type="quiz"；title="后测：函数、坐标与图像读法综合测评（B卷）"；order=5；quizConfig={"questionCount":6,"difficulty":"medium","questionTypes":["single","multiple","text"]}；description 和 keyPoints 必须完整写入与前测一一对应的 P01-P06 B 卷蓝图、知识点对应关系、步骤数和分值，并明确 B 卷不得比 A 卷更难。

生成前自检但不要输出自检：top-level keys exactly languageDirective/courseTitle/outlines; outlines count exactly 5; every outline type is quiz; no slide or interactive; ids/titles/orders match verbatim; pre and post both have 6 questions and medium difficulty; pre/post use identical P01-P06 blueprint, weights, information counts and option counts; every single has exactly one correct option; every multiple has exactly two correct options; no unused data; every keyPoint includes answer and analysis; three immediate checks each have exactly 3 questions and only one named knowledge point; no contradictory multiple-choice instruction; no future-content bridge question; no image dependency; no renamed or added knowledge point; no local file path or conversation trace.

```
