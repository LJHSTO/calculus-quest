# GH-02 P06 独立配对生成提示词

```text
你只生成一对前后测平行题，不生成整卷，不生成课件。这是 assessment-only 任务。只输出一个 OpenMAIC 可解析的合法 JSON object，不要输出 Markdown、代码围栏、解释或自检文字。

顶层键只允许 languageDirective、courseTitle、outlines。outlines.length 必须严格等于 2，且两个对象都必须是 type="quiz"；绝对不得输出 slide、html、simulation、discussion、讲解、导入或总结场景。outlines 必须且只能包含：
1. id="GH-02-pre-P06"，title="前测题对 P06"，order=1，difficulty="medium"，quizConfig={"questionCount":1,"difficulty":"medium","questionTypes":["text"]}。
2. id="GH-02-post-P06"，title="后测题对 P06"，order=2，difficulty="medium"，quizConfig={"questionCount":1,"difficulty":"medium","questionTypes":["text"]}。
每个 quiz 的 keyPoints 必须恰好包含一个字符串，该字符串是可由 JSON.parse 直接解析的完整题目对象。pre 题只能放入第一个 quiz，post 题只能放入第二个 quiz。

本题对规则：
P06：GH-02-K03；text；固定最后；给出相等的左极限和右极限，以及与极限值不相等的函数值，要求完整说明连续性。A 卷使用‘三条观察记录’的形式依次列出左侧趋势、右侧趋势和该点取值，再要求形成判断；B 卷必须改为‘纠正一份错误解答’，先给出函数值和一名学生‘左右极限相等所以连续’的错误结论，再补充左右极限数据，要求写出反驳与正确推理。不得沿用 P05 的选择式问法。A/B 都得到不连续结论，equivalence.conclusionClass 固定为 discontinuous；两卷信息量、核心三步推理和评分标准相同，但题干开头、信息顺序、作答语境与提问句式全部不同，不得仅替换数值；题目对象必须同时具有 answer、analysis 和 rubric；rubric 必须恰好 3 项且逐项完全同构：①判断双侧极限是否存在（6 分），②比较极限值与函数值（6 分），③给出连续性结论并完整说明理由（8 分），合计 20 分，不得拆成第 4 项或使用分值区间；20 分。

现有知识点名称和 ID 不得修改：
- GH-02-K01：从数表观察趋近
- GH-02-K02：图像上的左右极限
- GH-02-K03：连续就是不跳断

pre.id 必须为 "GH-02-pre-q6"；post.id 必须为 "GH-02-post-q6"。两题的 pairId 都必须为 "P06"，type 都必须为 "text"，points 都必须为 20。

每个题目对象必须完整包含 id、type、question、answer、analysis、points、knowledgePointIds、cognitiveLevel、estimatedSteps、pairId、equivalence。不得输出 options；必须输出非空 answer、非空 analysis，以及根层级 rubric。rubric 恰好为 6、6、8 分三项。

equivalence 必须且只能包含 presentationMode、knownConditionCount、operationCount、symbolComplexity、conclusionClass；pre 与 post 的五项值必须逐项相同。两题还必须保持相同知识点、认知层级、步骤数、正确项数量和评分负荷。

测量等值不等于题干复刻。pre 与 post 严禁仅替换数字、函数名、变量、坐标或选项顺序；删除数字和变量后，两题不得仍是相同或近似题干。两题至少改变提问句式、信息组织顺序、熟悉语境、干扰项误解来源中的两项，同时保持核心推理链不变。

question 不得包含空引号、连续下划线等未填占位符，不得包含 Markdown 表格、图片依赖或选项清单。选择题的 options 必须是独立字段。若 presentationMode="table"，题目根层级必须且只能按以下结构提供证据：evidence={"kind":"two-sided-table","targetX":有限数,"targetY":有限数,"correctOptionId":"正确选项value","rows":[{"x":数,"y":数},...]};rows 恰好 6 项，左侧 3 项的 x<targetX，右侧 3 项的 x>targetX。不得使用 twoSidedTable、left/right 嵌套对象、headers 或其他 evidence 变体。题干必须用两行纯文本逐项写出同样的 6 组 x 与 f(x) 数据。分别把左侧和右侧数据按 |x-targetX| 从大到小排列时，|y-targetY| 必须每一步严格减小；生成后必须逐项复算，任何一侧出现反向、持平或跳离 targetY 都不得输出。pre 与 post 可以使用不同数表，但精度、行数和误差收敛速度应相当。

输出前确认：outlines 恰好 2 项且全部为 quiz，没有任何第三场景；两个 keyPoints 各恰好一个题目对象字符串；ID、题型、分值和 pairId 正确；答案与解析一致；两题测量等值但题干表面异构；JSON.parse 能直接解析整个响应和两个 keyPoint 字符串。
```
