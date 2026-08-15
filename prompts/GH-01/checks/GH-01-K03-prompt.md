## GH-01-K03 即时检查生成提示词

```text
请为 OpenMAIC 生成 assessment-only 大纲，只输出 JSON object。忽略互动场景比例；outlines 必须且只能包含 1 个 quiz，禁止生成其他场景。

顶层键只能是 languageDirective、courseTitle、outlines。outline 只能使用 id、type、title、description、keyPoints、order、quizConfig。

固定输出：id="GH-01-K03-check"；type="quiz"；title="即时检查：图像的上升、下降与变化方向"；order=1；quizConfig={"questionCount":3,"difficulty":"medium","questionTypes":["single","multiple"]}。名称必须逐字保持。

面向零基础到弱基础高中生，只考“图像的上升、下降与变化方向”：根据 2-3 个按 x 递增的有序数据点判断函数值变化；修复“函数值为正等于上升”“下降等于函数值为负”等误解。不使用导数、极限或二次函数术语。

keyPoints 必须恰好 3 个字符串，每个包含完整题干、4 个选项、答案和解析：Q1 single 趋势概念辨析，答案固定 A；Q2 single 根据 3 个有序数据点判断完整区间趋势，答案固定 C；Q3 multiple 错误诊断，题干写“选择所有错误说法”，答案固定 B、C，A/D 必须为正确说法。不得写“选择所有正确选项”。

题目所有数据必须写在文字中，不得引用图片、课件、“如图”或“观察图像”。输出前逐题核对数据顺序和趋势，答案字母、选项值和解析必须一致；不得出现自我纠错痕迹。只输出 1 个 quiz JSON。
```
