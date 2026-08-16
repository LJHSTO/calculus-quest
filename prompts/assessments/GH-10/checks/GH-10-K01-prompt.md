# GH-10-K01 形测生成提示词

```text
请为 OpenMAIC 生成一套严格围绕单个知识点的形成性测验。这是 assessment-only 任务，只生成题目，不生成课件、讲解、实验、游戏、模拟、关系图、3D 可视化或其他学习资源。

只输出一个合法 JSON object，不要输出 Markdown、代码围栏、说明、自检过程或修改痕迹。

【网站原始信息】

章节 ID：V14-C4
章节名称：多元函数、梯度与 Jacobian
学习模块 ID：GH-10
学习模块名称：多元链式法则与 Jacobian 实战
知识点 ID：GH-10-K01
知识点名称：多元链式法则
知识点目标：能解释「多元链式法则」的核心含义，并用交互证据说明自己的判断。
常见误解：只记住「多元链式法则」的符号或结论，没有把它和图像、操作或应用情境连接起来。

以上名称和 ID 必须逐字保持，不得改名、缩写、翻译、合并、拆分或新增知识点。

【本知识点专用边界】

只使用知识点名称、目标和常见误解直接支持的数学内容，不得从模块标题扩展额外定理或技巧。

【学习场景与形测关系】

该知识点可以有任意数量的候选学习场景，场景数量以后可能增减。无论学生选择哪个现有场景学习，本知识点始终只有这一套共用形测；不得按场景数量生成多套题。

题目必须与具体学习资源无关，不得引用任何场景专属的界面、按钮、拖动操作、游戏规则、图像画面、实验步骤或特定读数，也不得使用“刚才的实验”“课件中”“如图”“见上图”等表达。选择不同场景的学生必须能够公平作答。

【固定输出】

顶层键只允许 languageDirective、courseTitle、outlines。outlines 必须且只能包含一个 quiz：

id="GH-10-K01-check"
type="quiz"
title="即时检查：多元链式法则"
order=1
quizConfig={"questionCount":3,"difficulty":"medium","questionTypes":["single","multiple"]}

只生成 3 道选择题，不生成 text 或简答题。每题固定 10 分，总分 30 分：

1. Q1：single，核心概念辨析。
2. Q2：single，一至两步基础应用。
3. Q3：multiple，围绕常见误解的诊断题。

keyPoints 必须恰好包含 3 个字符串，每个字符串本身必须是可由 JSON.parse 直接解析的单个题目对象，不得使用非 JSON 的字段拼接文本。每题完整写出 id、type、question、4 个 options、answer、analysis、points、knowledgePointIds、cognitiveLevel、estimatedSteps、pairId 和 equivalence；id 必须严格为 GH-10-K01-check-q1 至 GH-10-K01-check-q3。question 只能包含题干，不得内嵌或重复选项清单，question 后必须用 JSON 逗号分隔独立 options 字段。options 必须严格使用 [{"value":"A","label":"选项文字"},...]，answer 必须为数组，单选如 ["B"]、多选如 ["A","C"]，不得使用 correct 字段或 "AC" 字符串。equivalence 必须且只能包含 presentationMode、knownConditionCount、operationCount、symbolComplexity 和 conclusionClass；数表题还必须在题目对象根层级提供可程序复算的 two-sided-table evidence，不得嵌套在 equivalence 中。数表题的 question 必须用“x 值：…；f(x) 值：…”两行纯文本，完整写出左侧 3 组和右侧 3 组、合计 6 组数据；evidence.rows 必须逐项保存同样的 6 组数据，不多不少、不得漏项；不得使用 Markdown 表格、竖线 | 或 --- 分隔线。不得只写“考查某概念”“进行基础应用”“诊断某误解”等题目摘要；缺少完整题干、4 个选项、明确答案或解析时不得输出。每题 points 必须等于 10；knowledgePointIds 必须且只能填写 ["GH-10-K01"]。

【选择题规则】

- single 恰好一个正确答案。
- multiple 的题干必须明确要求选择所有正确说法或所有错误说法；正确项数量可以为 1、2 或 3，不得固定为某一种比例，也不得让全部选项都正确或全部错误。
- 正确答案位置不得形成固定规律。
- 干扰项必须来自上方常见误解或该知识点真实、典型的计算错误和概念混淆，不得使用无意义随机选项。

【内容与质量边界】

只考查“多元链式法则”，不得混入同模块其他知识点、后续知识点或额外内容。参考正式数学教材课后练习题的严谨性、条件完整性和推理结构，但面向高中生控制符号密度、阅读量和计算长度。题意必须能够独立理解，数据适合手算，不使用竞赛技巧，每题只测量一个明确目标。

【输出前静默检查】

逐题重新计算并确认：只输出一个 quiz；keyPoints 恰好有 3 个完整题目字符串且不含纯考查目标摘要；恰好 3 道选择题且每题 10 分、总分 30 分；只考查 GH-10-K01；没有学习场景、课件或图片依赖；single 恰好一个正确答案；multiple 有 1 至 3 个正确项且题干选择目标明确；答案、选项与解析完全一致；没有新增或改写知识点；输出中没有自我纠错或检查过程。
```
