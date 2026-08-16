## GH-01 前后测平行卷生成提示词

```text
请为 OpenMAIC 生成一个 assessment-only 测评大纲。只输出最终 JSON object，不输出 markdown、代码围栏或解释。

本任务只生成前测 A 卷和后测 B 卷，不生成任何课件资源。忽略常规课程的互动场景比例：outlines 必须且只能包含 2 个 quiz，不得生成 slide、interactive、pbl、code、simulation、diagram、game 或 visualization3d。

顶层键必须且只能是 languageDirective、courseTitle、outlines。每个 outline 只使用 id、type、title、description、keyPoints、order、quizConfig。type 必须为 quiz。quizConfig 只使用 questionCount、difficulty、questionTypes。

课程主题：函数、坐标与图像读法。
学习对象：零基础到弱基础高中生。
三个知识点名称必须逐字保持：输入、输出和函数规则；坐标点与函数图像；图像的上升、下降与变化方向。不得改名、合并、拆分或新增知识点。

两个 outlines 固定为：
1. id="GH-01-pre"；title="前测：函数、坐标与图像读法学习准备诊断（A卷）"；order=1；quizConfig={"questionCount":6,"difficulty":"medium","questionTypes":["single","multiple","text"]}。
2. id="GH-01-post"；title="后测：函数、坐标与图像读法综合测评（B卷）"；order=2；quizConfig={"questionCount":6,"difficulty":"medium","questionTypes":["single","multiple","text"]}。

前后测必须是等值平行卷：题量、总分、知识点权重、题型顺序、函数族、系数正负结构、已知条件数量、运算次数、认知层级、题干长度和评分规则一致。B 卷只更换数值、字母或等价情境，不增加迁移性、阅读量、符号复杂度或步骤数。题目不依赖图片和课件。

每个 outline 的 keyPoints 必须恰好包含 6 个字符串，分别为 P01-P06。每个字符串必须给出：题位、知识点、题型、认知目标、步骤数、分值、完整题干、全部选项、正确答案、简短解析。text 题给出参考答案和两个独立评分点。每题 10 分，总分 60 分。

逐题平行蓝图：
- P01：输入、输出和函数规则；single；概念辨析；1 步。A/B 都用正斜率一次函数 ax+b；不做计算，只辨析 x、f(x) 和函数规则。4 个选项，恰好 1 个正确。
- P02：输入、输出和函数规则；single；基础代入；2 步。A/B 都用正斜率一次函数 ax+b、负整数输入、一次乘法和一次加减法。4 个选项，恰好 1 个正确。
- P03：坐标点与函数图像；single；坐标读取；2 步。A/B 都用正斜率一次函数 ax+b 和正整数横坐标，只提供一个目标点，不给无关数据。4 个选项，恰好 1 个正确。
- P04：坐标点与函数图像；multiple；表示转换；2 步。A/B 都用正斜率一次函数 ax+b 和 4 个选项。正确项数量不预先固定，可以为 1、2 或 3，但 A/B 配对题的正确项数量必须相同；不得让 4 个选项全部正确或全部错误。
- P05：图像的上升、下降与变化方向；single；总体趋势判断；1 步。A/B 都给出恰好 3 个按 x 递增排列的数据点，三个数据点全部用于判断完整区间趋势，不给无关数据。4 个选项，恰好 1 个正确。
- P06：图像的上升、下降与变化方向；text；解释变化；2 个评分点。A/B 都只给出恰好 3 个按 x 递增排列的数据点，函数值结构均为先上升后下降；评分点一判断前一区间，评分点二判断后一区间。

计算与答案硬约束：
- 不使用二次函数、分式、根式、小数或超出绝对值 20 的计算结果。
- 生成后逐题重新计算，不得让答案字母、选项值和解析互相矛盾。
- P04 必须逐项代入验证，并在解析中明确 A/C 正确、B/D 错误。
- description 只概述测评目的和等值设计，不得写错误的知识点分值小计。
- 不得在输出中出现“需修正”“重新设置”“可能正确”等自我纠错痕迹；发现错误必须在输出前直接改好。

生成前静默自检：outlines exactly 2; both type quiz; ids/titles/orders verbatim; both 6 questions and medium; keyPoints exactly 6 per outline; P01-P06 one-to-one parallel; every single exactly one correct; P04 exactly A/C correct; all arithmetic verified; no unused data; no image dependency; no renamed knowledge point; no local path or conversation trace.

```
