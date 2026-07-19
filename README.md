# Calculus Quest

一个面向高等数学的交互式学习平台。章节路线、讲解页、互动课件、三段式测验、学习记录和管理后台。前端零框架、零打包工具，后端仅依赖 Node.js 内置模块和 SQLite。

## 功能

- 章节式学习路径 — 每章包含讲解 slides、互动课件、以及前测/形成性测验/后测三段评估
- AI 简答题批改 — 接入任意 OpenAI 兼容接口的大模型，自动批改简答题并给出反馈
- 知识点图谱 — 按知识点追踪掌握程度，可视化学习进度
- 学习分析后台 — 查看学生进度、测验正确率、活跃度图表、简答题复核

## 快速开始

```bash
npm install
cp .env.example .env
npm start
```

访问 http://127.0.0.1:8765/。

健康检查：http://127.0.0.1:8765/api/health

## 环境变量

复制 .env.example 为 .env，按需修改：

| 变量 | 默认值 | 说明 |
|---|---|---|
| HOST | 127.0.0.1 | 监听地址 |
| PORT | 8765 | 监听端口 |
| NODE_ENV | development | 生产环境设为 production |
| BASE_PATH | — | 生产站点公开前缀，例如 `/calculus_quest` |
| DB_PATH | data/calculus-quest.db | 生产环境必须设为仓库外的绝对路径 |
| LLM_PROVIDER | mock | mock（不调用真实模型）或 openai-compatible |
| OPENAI_COMPATIBLE_BASE_URL | — | API 基础地址 |
| OPENAI_COMPATIBLE_API_KEY | — | API 密钥 |
| OPENAI_COMPATIBLE_MODEL | — | 默认模型名 |
| GRADING_MODEL | — | 简答题批改专用模型 |
| ASSESSMENT_MODEL | — | 评估生成专用模型 |
| ADMIN_TOKEN | — | 管理后台登录密码 |
| APP_VERSION | package.json 版本 | 写入新交互事件的发布版本 |
| EXPERIMENT_ID | — | 研究实验编号 |
| EXPERIMENT_CONDITION | — | 实验条件 |
| EXPERIMENT_COHORT | — | 学生队列 |

当 LLM_PROVIDER=mock 时，简答题统一按 0 分兜底并标记需人工复核，不会卡住学习流程。

生产站点部署到 `/calculus_quest/` 时，设置 `BASE_PATH=/calculus_quest`。服务兼容 Nginx 保留或剥离前缀两种转发方式；生产发布、数据库迁移、备份与回退步骤见 `docs/production-release.md`。

## 课程数据

核心课程路线文件：data/openmaic-v14-route.json。包含章节、知识点、讲解页、互动资源引用和每章三段 quiz。

互动课件资源（HTML 交互、音频、图片）位于 resources/open-maic/ 目录。

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Node.js（内置 http、fs、zlib） |
| 数据库 | sql.js（内存运行、延迟原子落盘） |
| 前端 | 原生 JavaScript，无框架，无打包工具 |
| 数学渲染 | KaTeX |
| AI | OpenAI 兼容接口（可选） |
