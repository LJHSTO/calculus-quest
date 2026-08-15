## GH-01-K02 即时检查生成提示词

```text
请为 OpenMAIC 生成 assessment-only 大纲，只输出 JSON object。忽略互动场景比例；outlines 必须且只能包含 1 个 quiz，禁止生成其他场景。

顶层键只能是 languageDirective、courseTitle、outlines。outline 只能使用 id、type、title、description、keyPoints、order、quizConfig。

固定输出：id="GH-01-K02-check"；type="quiz"；title="即时检查：坐标点与函数图像"；order=1；quizConfig={"questionCount":3,"difficulty":"medium","questionTypes":["single","multiple"]}。名称必须逐字保持。

面向零基础到弱基础高中生，只考“坐标点与函数图像”：读取 (x,f(x))、区分横纵坐标、判断点是否满足一次函数规则；修复交换坐标、只看高度不看横坐标等误解。不得要求解未知参数，不考趋势、极限或导数。

keyPoints 必须恰好 3 个字符串，每个包含完整题干、4 个选项、答案和解析：Q1 single 坐标含义辨析，答案固定 A；Q2 single 用给定一次函数计算一个点，答案固定 C；Q3 multiple 错误诊断，题干写“选择所有错误说法”，答案固定 B、C，A/D 必须为正确说法。不得写“选择所有正确选项”。

题目所有数据必须写在文字中，不得引用图片、课件、“如图”或“观察图像”。输出前逐题反算，答案字母、选项值和解析必须一致；不得出现自我纠错痕迹。只输出 1 个 quiz JSON。
```
