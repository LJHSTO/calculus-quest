## GH-01-K01 即时检查生成提示词

```text
请为 OpenMAIC 生成 assessment-only 大纲，只输出 JSON object。忽略互动场景比例；outlines 必须且只能包含 1 个 quiz，禁止生成其他场景。

顶层键只能是 languageDirective、courseTitle、outlines。outline 只能使用 id、type、title、description、keyPoints、order、quizConfig。

固定输出：id="GH-01-K01-check"；type="quiz"；title="即时检查：输入、输出和函数规则"；order=1；quizConfig={"questionCount":3,"difficulty":"medium","questionTypes":["single","multiple"]}。名称必须逐字保持。

本 quiz 是该知识点四个候选实验场景共用的唯一即时检查。学生只需任选一个实验场景完成后作答；不得为四个场景分别生成题目，也不得依赖任何一个场景专属的界面、控件、操作过程、画面或实验数值。

面向零基础到弱基础高中生，只考“输入、输出和函数规则”：区分 x、f(x) 和函数规则；修复“函数是一个数”“f(x) 是 f×x”“输入不经过规则”等误解。只用一次函数、整数和一至两步手算，不考坐标图像、趋势、极限或导数。

keyPoints 必须恰好 3 个字符串，每个包含完整题干、4 个选项、答案和解析：Q1 single 概念辨析，答案固定 A；Q2 single 基础代入，答案固定 C；Q3 multiple 错误诊断，题干写“选择所有错误说法”，答案固定 B、C，A/D 必须为正确说法。不得写“选择所有正确选项”。

题目不得引用图片、课件或“如图”。输出前逐题反算，答案字母、选项值和解析必须一致；不得出现自我纠错痕迹。只输出 1 个 quiz JSON。
```
