# MAIC-UI 推荐流提示词说明

> 修订说明：本文件保留为历史入口。最终可执行产物已迁移到 `docs/maic-ui-single-concept-prompt-pack-v14.md`、`docs/maic-ui-single-concept-prompt-pack-v14.json` 和 `docs/maic-ui-single-concept-prompt-pack-v14.csv`。

## 关键边界

路径动作不是 MAIC-UI 课件内容类型，而是 Calculus Quest 宿主系统在课件生成后，根据测验结果、交互证据、知识图谱和 Agentic Coach 规划作出的推荐决策。

MAIC-UI 课件本身只应该承担一件事：围绕某一个单独知识点生成一种可操作、可反馈、可观察证据的互动学习页面。它可以被系统用于不同路径动作后的资源选择，但页面内容不应自称任何路径动作课件。

## 最终产物

- `docs/maic-ui-single-concept-prompt-pack-v14.md`：中文说明、规模统计、学习方式画像、模块覆盖表和示例提示词。
- `docs/maic-ui-single-concept-prompt-pack-v14.json`：机器可读提示词包，包含 510 条 MAIC-UI 单页课件提示词。
- `docs/maic-ui-single-concept-prompt-pack-v14.csv`：轻量索引，便于内置 agent 按模块、知识点、学习方式画像、表征方式和系统用途筛选。

## 设计来源

- OpenMAIC v14 最终提示词：`D:\Desktop\openmaic-gaoshu-ui-locked-v14\10-openmaic-ready-lesson-codeblocks-v14.md`
- 旧 MAIC-UI 提示词：`D:\Desktop\maicui-openmaic-prompts.md`
- 本地 MAIC-UI 规则：`D:\Projects\MAIC-UI\backend\src\services\templates\heavy_mode_prompts.py` 与 `D:\Projects\MAIC-UI\backend\src\services\prompts\ai_prompts.py`
- GitHub 参考：`https://github.com/THU-MAIC/MAIC-UI`

## 使用原则

1. 先让宿主系统判断学生需要跳过确认、重学、继续、复盘还是扩展。
2. 再从 JSON/CSV 中选择对应知识点和学习方式画像的 MAIC-UI prompt。
3. 生成后的 MAIC-UI 页面嵌入 `cq-agentic-metadata`，并通过 `trackEvent` / `postMessage` 产出证据。
4. 下一轮推荐仍由宿主系统完成，而不是由 MAIC-UI 页面自己决定路径。