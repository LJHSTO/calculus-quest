# GH-02 P02 独立配对生成提示词

```text
你只生成一对前后测平行题，不生成整卷，不生成课件。只输出一个合法 JSON object，顶层只能有 pre 和 post 两个键，不要输出 Markdown、代码围栏、解释或自检文字。

本题对规则：
P02：GH-02-K01；single；给出完整的双侧数表，辨析趋近值不必等于表中任何一个数；A/B 都使用大于 0 的 targetX、targetY，题干与 evidence.rows 都固定为左侧 3 组、右侧 3 组共 6 组正数，不得出现 0 或负数，两卷逐列使用完全相同的小数位数分布。P02 必须是学生观点诊断题，题干先引用‘趋近值必须在表中实际出现’这一错误观点，再要求评价；不得像 P01 一样直接询问趋近值。A/B 使用不同的学生推理表达、不同的信息叙述顺序和不同干扰项误解，不得使用同一题干模板；equivalence.conclusionClass 固定为 limit_not_in_table；8 分。

现有知识点名称和 ID 不得修改：
- GH-02-K01：从数表观察趋近
- GH-02-K02：图像上的左右极限
- GH-02-K03：连续就是不跳断

pre.id 必须为 "GH-02-pre-q2"；post.id 必须为 "GH-02-post-q2"。两题的 pairId 都必须为 "P02"，type 都必须为 "single"，points 都必须为 8。

每个题目对象必须完整包含 id、type、question、answer、analysis、points、knowledgePointIds、cognitiveLevel、estimatedSteps、pairId、equivalence。必须输出 4 个 value/label 选项；answer 必须是选项 value 数组。恰好 1 个正确项。

equivalence 必须且只能包含 presentationMode、knownConditionCount、operationCount、symbolComplexity、conclusionClass；pre 与 post 的五项值必须逐项相同。两题还必须保持相同知识点、认知层级、步骤数、正确项数量和评分负荷。

测量等值不等于题干复刻。pre 与 post 严禁仅替换数字、函数名、变量、坐标或选项顺序；删除数字和变量后，两题不得仍是相同或近似题干。两题至少改变提问句式、信息组织顺序、熟悉语境、干扰项误解来源中的两项，同时保持核心推理链不变。

question 不得包含空引号占位符、Markdown 表格、图片依赖或选项清单。选择题的 options 必须是独立字段。若 presentationMode="table"，题目根层级必须包含 two-sided-table evidence，且题干和 evidence.rows 都完整保存左 3、右 3 共 6 组数据。

输出前确认：顶层只有 pre、post；恰好两个题目对象；ID、题型、分值和 pairId 正确；答案与解析一致；两题测量等值但题干表面异构。
```
