# Calculus Quest

一个面向高等数学的交互式学习平台。章节路线、讲解页、互动课件、三段式测验、学习记录和管理后台。前端零框架、零打包工具，后端仅依赖 Node.js 内置模块和 SQLite。

`proactive_test` 分支以 `v2` 为页面和题库基线，当前学生端默认投影完整章 `V14-C1`（函数与极限），包含 6 个知识点与 24 份互动课件。源课程路线仍由 `data/multi-scene-learning-route.json` 唯一维护；历史 V14-C3 适配器保留供回归与研究版本隔离。

## 功能

- 章节式学习路径 — 每章包含讲解 slides、互动课件、以及前测/形成性测验/后测三段评估
- AI 简答题批改 — 接入任意 OpenAI 兼容接口的大模型，自动批改简答题并给出反馈
- 知识点图谱 — 按知识点追踪掌握程度，可视化学习进度
- 学习分析后台 — 查看学生进度、测验正确率、活跃度图表、简答题复核
- 主动实验账本 — 记录可配置实验臂、政策判断、实际呈现、证据来源、原因码、学生反馈与 L1→L5→渐退/退出策略链
- 无提示近端验证 — 每一级支架后由服务端签发知识点验证题；学生可跳过，答案不会下发到浏览器
- 学生主动权 — 支持“稍后”“换一种帮助”“关闭当前知识点提醒”以及全局“标准 / 少提醒 / 关闭”
- 独立学习结果 — 章后提供近迁移、跨表征迁移与延迟保持测量；测量期间暂停知点，学生端不显示即时得分
- 六维观察台 — 通过 `?research=1` 打开研究预览，展示真实操作、服务端证据、时机原因及生命周期；学生默认界面保留学习空间，缺失值明确标示
- 帮助呈现 — 学习者选择课件旁/助教栏 × 提示/例子/动手试/对话八组合，复用同一服务端支架和独立检查；主动打开的补充练习单独记录
- 可选诊断 — 完成知识点后可选择“小题测一测”或直接继续；实际诊断使用现有服务端题库与判分
- 实际曝光 — 候选卡在前台且至少一半进入可见区域，连续一秒才记合格可见；快速点击、旧版业务显示回执与合格曝光分别记录
- 会话连续性 — 同一服务器选定会话保留最多60条消息，以最近消息和带角色/位置的早期原文摘录控制上下文长度；不据历史聊天判断掌握

学习工作区在1180px及以下使用路径、课件、助手独立面板。中等桌面进入互动时优先释放课件空间，学生可手动恢复侧栏和讲解。`?research=1` 只切换界面模式，数据访问仍由服务端鉴权。

运行 `node ops/verify-functions-limits.js` 执行当前37项综合回归，覆盖六知识点L1至L5、曝光边界、D3/D4/D5真实候选、18种布局及两种桌面尺寸的24课件。`node ops/test-student-learning-flow.js` 另行验证新注册学生到保持测量的完整UI流程；保持时间仅在隔离测试库中模拟。

## 快速开始

```bash
npm install
cp .env.example .env
npm start
```

访问 http://127.0.0.1:8765/。

健康检查：http://127.0.0.1:8765/api/health

## 环境变量

复制 .env.example 为 .env，按需修改。下表列出通用及历史配置；当前函数与极限试点以 `.env.example` 的 V14-C1、functions-limits-adapter-r2、72 小时保持配置为准。

| 变量 | 默认值 | 说明 |
|---|---|---|
| HOST | 127.0.0.1 | 监听地址 |
| PORT | 8765 | 监听端口 |
| NODE_ENV | development | 生产环境设为 production |
| BASE_PATH | — | 生产站点公开前缀，例如 `/calculus_quest` |
| DB_PATH | data/calculus-quest.db | 生产环境必须设为仓库外的绝对路径 |
| LLM_PROVIDER | mock | mock（不调用真实模型）或 openai-compatible |
| LLM_CONFIG_FILE | — | 服务端密钥配置文件；支持纯密钥、`KEY=value`、JSON 或 `curl` 示例 |
| OPENAI_COMPATIBLE_BASE_URL | — | API 基础地址 |
| OPENAI_COMPATIBLE_API_KEY | — | API 密钥 |
| OPENAI_COMPATIBLE_MODEL | — | 默认模型名 |
| OPENAI_COMPATIBLE_WIRE_API | chat-completions | `chat-completions` 或 `responses` |
| GRADING_LLM_PROVIDER | 跟随 LLM_PROVIDER | 历史简答题重评使用的评分提供方 |
| GRADING_BASE_URL | 跟随默认模型接口 | 历史简答题重评专用 API 地址 |
| GRADING_API_KEY | 跟随默认模型密钥 | 历史简答题重评专用密钥 |
| GRADING_CONFIG_FILE | 跟随 LLM_CONFIG_FILE | 历史简答题重评专用配置文件 |
| GRADING_WIRE_API | 跟随默认接口 | 历史简答题重评专用请求形态 |
| GRADING_MODEL | — | 简答题批改专用模型 |
| GRADING_TIMEOUT_MS | 25000 | 单道简答题模型评分超时毫秒数 |
| ASSESSMENT_LLM_ENABLED | false | 是否启用模型生成学习诊断；默认使用固定规则 |
| ASSESSMENT_MODEL | — | 学习诊断专用模型 |
| ASSESSMENT_TIMEOUT_MS | 12000 | 学习诊断模型超时毫秒数 |
| COACH_NARRATION_MODEL | 跟随默认模型 | Coach 建议叙述专用模型 |
| COACH_NARRATION_TIMEOUT_MS | 12000 | Coach 建议叙述超时毫秒数 |
| ADMIN_TOKEN | — | 管理后台登录密码 |
| APP_VERSION | package.json 版本 | 写入新交互事件的发布版本 |
| EXPERIMENT_ID | — | 研究实验编号 |
| EXPERIMENT_CONDITION | — | 实验条件 |
| EXPERIMENT_COHORT | — | 学生队列 |
| PROACTIVE_POLICY_MODE | shadow | `off`、`shadow` 或 `active`；只有 `active` 且实验臂允许展示时才签发主动建议 |
| PROACTIVE_EXPERIMENT_ID | functions-limits-proactive-pilot-20260915 | 主动实验编号；新协议应使用新实验编号与冻结版本 |
| PROACTIVE_EXPERIMENT_CHAPTER_ID | V14-C1 | 当前默认主动政策适配章节；V14-C3为保留的旧章适配器 |
| PROACTIVE_POLICY_VERSION | functions-limits-r3-evidence-audit | 固定政策版本 |
| PROACTIVE_ADAPTER_VERSION | functions-limits-adapter-r2 | 当前章节知识点支架、验证题与呈现规则版本 |
| PROACTIVE_ASSIGNMENT_STRATEGY | hash | `hash` 为层内加盐哈希；`stratified-balanced` 为层内最少人数优先、加盐哈希打破平局的小样本平衡分配 |
| PROACTIVE_ASSIGNMENT_VERSION | student-hash-v1 | 分配算法版本；切换策略时必须使用新版本与新实验 ID |
| PROACTIVE_ASSIGNMENT_SALT | — | 创建任何实验分组前必须在 `.env` 中设置稳定私有值；`active` 缺失时主动展示失败关闭 |
| PROACTIVE_PUBLIC_CHAPTER_ONLY | true | 学生端只投影试点完整章，服务端和管理端仍以完整 route 为课程事实源 |
| PROACTIVE_PARTICIPATION_MODE | implicit-pilot | `implicit-pilot` 仅供工程联调；正式研究使用 `explicit-consent` |
| PROACTIVE_CONSENT_VERSION | engineering-pilot-v1 | 冻结到协议指纹的研究说明/同意版本 |
| PROACTIVE_CONSENT_NOTICE_URL | — | 显式同意模式必填；只接受同源路径或 HTTPS 地址 |
| PROACTIVE_EXPERIMENT_ARMS | control,treatment | 参与稳定哈希随机分组的实验臂，支持两个以上 |
| PROACTIVE_DISPLAY_ARMS | treatment | 允许实际展示主动介入的实验臂 |
| PROACTIVE_ARM_PROFILES_JSON | — | 按实验臂设置 `display`、`maxSupportLevel` 与 `allowRepresentationSwitch` |
| PROACTIVE_RETENTION_DELAY_HOURS | 168 | 延迟保持测量相对章后测的开放时长 |

当 LLM_PROVIDER=mock 时，简答题统一按 0 分兜底并标记需人工复核，不会卡住学习流程。

推荐只在本地 `.env` 中保存 `LLM_CONFIG_FILE` 的绝对路径。文件中的密钥只在服务端内存中使用；不要把真实密钥写进 `.env`、源码、日志或 Git。若配置文件是供应商提供的 `curl` 示例，系统会同时识别其中的请求地址、Bearer 密钥、模型名和 `chat/completions`/`responses` 请求形态。

主动政策的触发、沉默、动作和支架强度由服务端确定性规则决定，不依赖实时大模型。V14-C3 当前支持 L1 自我解释、L2 概念线索、L3 子目标拆分、L4 下一步提示、L5 部分示例，并在每一级后要求无提示独立验证；成功后渐退并延长冷却，持续失败才升级，达到 L5 后停止继续加码。当前 OpenMAIC 场景没有完整的主动策略语义结果事件，因此支架后闭环默认使用平台自有、服务端评分的验证题；未来课件可按统一事件契约接入同一政策生命周期。学生偏好由服务端持久化并进入审计：`reduced` 屏蔽停留/调参等行为型候选，`off` 关闭主动提示并结束当前未完成回合；开始新的学习代次时会清理旧知识点生命周期，但保留学生偏好与实验 assignment。知点的学生主动问答仍沿用现有 OpenAI-compatible 配置；仓库不会读取或提交 Codex 的密钥。

当前默认内容化覆盖范围是 `V14-C1` 的 2 个模块、6 个知识点与 24 份互动课件。Adapter registry 同时保留函数与极限和 V14-C3 适配器。Policy Kernel、生命周期、预算/冷却、实验臂、学生自主权、独立结果测量和管理 Harness 可跨章复用；新增章节仍需提供目标与误解、任务里程碑、合法支架、验证题、换表征映射和迁移蓝图。

管理端“主动实验”页将过程指标与独立学习结果分开呈现。接受率、支架次数和换表征次数只描述交互过程；近迁移、跨表征迁移和延迟保持才属于学习结果。页面同时显示不可变 protocol fingerprint、运行时暂停/恢复记录、停止规则信号和 assignment→证据→曝光→测量→保持的参与者样本流；暂停会收束未决提示，但不会修改协议或重新分组。Shadow 编码模板会导出结构化证据及空白的 `reviewer_id`、`help_need_label`、`interruptibility_label`、`should_intervene`、`false_positive` 和 `notes` 列。小样本阶段只做描述性比较，正式因果分析仍需预注册实验臂、样本量、排除规则和主结果。

`explicit-consent` 模式会在知点侧栏提供研究说明、版本确认、加入和退出入口。退出在当前实验中不可撤销，停止新的实验性主动提示、候选收集和研究测量，并收束未决支架回合；课程、普通知点提问和已有学习记录仍可使用，既有 assignment 保留用于 ITT。管理端可分别导出已提交测量结果与全部测量会话/失访状态。平台流程只是正式研究的工程载体，不替代伦理审批、未成年人监护人同意/assent、招募说明或数据保留与删除政策。

服务启动时会把 route、Policy Kernel、生命周期、V14-C3 Adapter、学生端呈现器、结果量表、阈值、实验臂、分配策略、参与模式与同意版本、模型配置摘要和停止规则冻结为同一协议指纹。同一 `PROACTIVE_EXPERIMENT_ID` 下出现漂移时服务拒绝启动；需要修改协议时必须创建新的实验 ID。`stratified-balanced` 只影响尚未分组的新学生，数据库中的既有 assignment 不会被重写。

运行主动试点专项回归：

```bash
npm run proactive:test
```

当前 V14-C1 验收与隔离预览：

```powershell
node ops/verify-functions-limits.js
node ops/test-design-space-projection.js
$env:TEST_PROACTIVE_CHAPTER='V14-C1'
$env:TEST_PROACTIVE_SURFACES='1'
node ops/test-proactive-submission-browser.js
node ops/test-student-learning-flow.js
node ops/start-functions-limits-preview.js --show-proactive
```

预览地址写入 `output/函数极限预览.json`。预览使用独立数据库和 mock 回复；学生全流程脚本使用真实 UI、真实策略和真实客观判分，无学习进度注入。保持 UI 的隔离测试把测试库的后测时间提前73小时，以模拟等待；正式72小时门槛保留，另由 `test-retention-v4-api.js` 验证。工程测试不代表真人学习效果。改变支架内容、呈现器或课程结构后需新建实验 ID，避免复用冻结协议下的旧数据库。

生产站点部署到 `/calculus_quest/` 时，设置 `BASE_PATH=/calculus_quest`。服务兼容 Nginx 保留或剥离前缀两种转发方式。

Linux 一键部署继续使用 `./install_run.sh [端口]`，未传端口时为兼容历史服务器使用 3789。部署脚本要求 `.env` 中设置 `NODE_ENV=production` 和仓库外绝对 `DB_PATH`；它会先安装锁定依赖并运行部署检查，再核验并优雅停止本项目进程，生成数据库报告和备份，启动后验证健康接口。脚本不会按端口强杀未知进程，也不会使用 `kill -9`。

首次从旧版仓库内数据库迁移时，不能只覆盖 `.env`：应先停止旧服务并确认数据库已落盘，再把现有 `data/calculus-quest.db` 备份并复制到 `.env` 指定的仓库外路径。完成这一次迁移后，后续发布只需保留服务器 `.env` 和外部数据库，再拉取代码并运行部署脚本。

## 课程数据

核心课程路线文件：data/multi-scene-learning-route.json。它是“多场景自适应学习路线”的课程事实源，包含章节、知识点、讲解页、互动资源引用和每章三段 quiz。

互动课件资源（HTML 交互、音频、图片）位于 resources/open-maic/ 目录。

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Node.js（内置 http、fs、zlib） |
| 数据库 | sql.js（内存运行、延迟原子落盘） |
| 前端 | 原生 JavaScript，无框架，无打包工具 |
| 数学渲染 | KaTeX |
| AI | OpenAI 兼容接口（可选） |
