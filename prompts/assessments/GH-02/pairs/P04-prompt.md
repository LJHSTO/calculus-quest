# GH-02 P04 独立配对生成提示词

```text
你只生成一对前后测平行题，不生成整卷，不生成课件。只输出一个合法 JSON object，顶层只能有 pre 和 post 两个键，不要输出 Markdown、代码围栏、解释或自检文字。

本题对规则：
P04：GH-02-K02；multiple；辨析双侧极限存在条件；A/B 的左极限与右极限都必须相等，因此两题的双侧极限都存在；不得让一卷存在而另一卷不存在；equivalence.conclusionClass 固定为 two_sided_limit_exists；4 个选项，正确项数量在 A/B 中相同。A 卷直接给出左右极限与函数值，要求选择所有正确结论；B 卷改为给出学生对左右趋势的四条判断，要求选择所有判断正确的说法，不得沿用 A 卷的题干开头、信息顺序或选项句式；8 分。

现有知识点名称和 ID 不得修改：
- GH-02-K01：从数表观察趋近
- GH-02-K02：图像上的左右极限
- GH-02-K03：连续就是不跳断

pre.id 必须为 "GH-02-pre-q4"；post.id 必须为 "GH-02-post-q4"。两题的 pairId 都必须为 "P04"，type 都必须为 "multiple"，points 都必须为 8。

每个题目对象必须完整包含 id、type、question、answer、analysis、points、knowledgePointIds、cognitiveLevel、estimatedSteps、pairId、equivalence。必须输出 4 个 value/label 选项；answer 必须是选项 value 数组。正确项为 1 至 3 个。

equivalence 必须且只能包含 presentationMode、knownConditionCount、operationCount、symbolComplexity、conclusionClass；pre 与 post 的五项值必须逐项相同。两题还必须保持相同知识点、认知层级、步骤数、正确项数量和评分负荷。

测量等值不等于题干复刻。pre 与 post 严禁仅替换数字、函数名、变量、坐标或选项顺序；删除数字和变量后，两题不得仍是相同或近似题干。两题至少改变提问句式、信息组织顺序、熟悉语境、干扰项误解来源中的两项，同时保持核心推理链不变。

question 不得包含空引号占位符、Markdown 表格、图片依赖或选项清单。选择题的 options 必须是独立字段。若 presentationMode="table"，题目根层级必须包含 two-sided-table evidence，且题干和 evidence.rows 都完整保存左 3、右 3 共 6 组数据。

输出前确认：顶层只有 pre、post；恰好两个题目对象；ID、题型、分值和 pairId 正确；答案与解析一致；两题测量等值但题干表面异构。
```
