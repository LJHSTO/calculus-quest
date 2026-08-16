# GH-02 分题对生成流程

整卷提示词一次要求模型输出 12 道完整题目，容易出现响应截断、题目重复或额外生成 q7 以后题号。本目录把 GH-02 拆为 P01-P06 六次短生成，每次只输出一对 `pre`、`post` 题目。

1. 依次在 OpenMAIC 中使用 `P01-prompt.md` 至 `P06-prompt.md`；每次只生成两个单题 quiz。
2. 从审阅页提取两个 quiz 的题目对象，整理为 `{ "pre": {...}, "post": {...} }`，分别保存为 `pair-outputs/P01.json` 至 `pair-outputs/P06.json`。
3. 运行：

   `node ops/assemble-gh02-pairs.js prompts/assessments/GH-02/pair-outputs`

4. 脚本只会在六个题对全部通过结构、题量、配对等值、同卷多样性和表面异构校验后，生成 `GH-02-openmaic.json`。
5. 将通过验证的完整 JSON 交给 OpenMAIC；不要人工拼接、跳过错误或采用只生成部分题目的结果。

重新生成六份题对提示词：

`node ops/generate-gh02-pair-prompts.js`
