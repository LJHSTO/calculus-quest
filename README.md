# Calculus Quest

一个面向高等数学的交互式学习平台。章节路线、讲解页、互动课件、三段式测验、学习记录和管理后台。前端零框架、零打包工具，后端仅依赖 Node.js 内置模块和 SQLite。

`proactive_test` 分支以 `v2` 为页面和题库基线，当前学生端默认投影完整章 `V14-C1`（函数与极限），包含 6 个知识点与 24 份互动课件。源课程路线仍由 `data/multi-scene-learning-route.json` 唯一维护；历史 V14-C3 适配器保留供回归与研究版本隔离。

## 功能

三组实验入口现为 `/?study=A`、`/?study=B`、`/?study=C`。三组都使用主动助手，分别提供固定配置、可配置并附关联反馈、可配置并附常规回顾。体验记录按账号和组别隔离；正式研究使用 `/?study=assigned` 统一分配。流程、测量、管理员入口及复核命令见 [三组实验上线说明](research/三组实验上线说明-20261031.md)。下文旧的演练、工作台与任务内嵌入说明属于其他研究入口。

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

运行 `node ops/verify-functions-limits.js` 执行当前44项综合回归，覆盖六知识点L1至L5、曝光边界、D3/D4/D5真实候选、18种布局、六维契约缺失值、两种桌面尺寸的24课件，以及新版课件包、共同探针工作台与评测导出。`node ops/test-student-learning-flow.js` 另行验证新注册学生到保持测量的完整UI流程；保持时间仅在隔离测试库中模拟。工程通过不能证明课件数学表述、任务有效性或学习效果合格。

2026-10-17 更新：帮助设置在课件上方展开，避免遮挡与裁切，支持 Escape 收起；长对话摘录保留末尾更正；缺失推断、取消与未知曝光分开记录。`EvidencePackage` 等独立契约模块用于工程约束检查，不等同于主策略接线、真人操纵检验或学习效果证据。研究同步、文献复核和 30–60 人实验建议见本地 `research/平台优化与真人实验研究总报告-2026-10-17.md`；可阅读版位于 `output/平台优化与实验方案-2026-10-17/项目总结与实验方案.html`。

## 快速开始

### 2026-10-18 常规入口更新

任务内提示现已接入首页“学习”入口，不再只在独立预演页运行。六份滑块实验在原生操作区接收提示和作答，知识图使用已展开侧栏；游戏、3D 和静态讲解采用课件下方的正常流答题区，保持画面尺寸。前后测和形成性检查提交前关闭帮助，提交后支持原题旁复盘；完整聊天保留在学习侧栏。

后台已移除 Jev 运行时与专用环境配置，主动策略使用规则，客观题由服务端判分。新增带来源、时间和学习轮次的跨会话测验记忆，以及已接受帮助的服务重启恢复；历史表现不等于当前掌握，未实现离线自主推送。

`node ops/test-student-learning-flow.js` 走完整常规学习流程；`node ops/verify-functions-limits.js` 运行综合验收。最新说明由 `node ops/build-main-entry-report.js` 生成于 `output/正式学习入口升级-2026-10-18/常规学习入口、智能体与实验路线核验.html`。六维均有基础实现，但共同探针与正式条件锁定迁入常规入口、全部授权/渐退取值、真实模型校准及真人研究仍须继续完成，不能把工程通过等同论文证据。

### 研究工程预演与新版课件迁移

`node ops/start-study-workbench-preview.js recheck`（或`placement`）启动隔离数据库的研究工作台，支持六知识点共同探针、服务端分配/判分、固定L2提示、条件锁定、退出与完整机会导出。题目和问卷尚未审定，默认关闭且禁止生产环境启用；它与主平台rule/adaptive研究是不同协议。启动器输出的PID用于结束本次预览，种子仅保留在该进程环境，正式发布需另行完成安全种子保管和备份恢复。

`node ops/start-study-workbench-preview.js embedded` 启动真正的任务内提示预演：六个知识点的已适配互动课件内，在操作控件后嵌入线索；聚焦练习输入框后，线索移到题干和输入框之间。切换保留课件状态与作答草稿，独立测量阶段收起帮助。它是单条件工程演示，不进行随机分组，不替换主平台既有呈现条件；新增课件需审核并提供明确锚点。运行 `node ops/test-embedded-help-browser.js` 验证六单元完整流程，图示说明位于 `output/课件内与作答区嵌入-2026-10-18/嵌入式提示说明.html`。

`ops/inspect-openmaic-package.js`读取1.2.0结构包或离线HTML；`ops/stage-openmaic-courseware.js`暂存经人工审核的映射，不自动替换现有课程。离线课堂播放不等于已经接入主动策略。

`ops/build-education-replay.js`按人划分研究轨迹并隔离未来结果；`ops/evaluate-education-replay.js`只对已裁决标签评分，不把工程数据或实际规则动作当真人金标准。操作和研究材料见本地`research/OpenMAIC迁移与六维开发复核-2026-10-17.md`、`research/真人研究方向与执行材料-2026-10-17.md`及`research/教育主动帮助评测平台方案-2026-10-17.md`；阅读入口由`node ops/build-study-package.js`生成于`output/OpenMAIC迁移与研究方案-2026-10-17/项目更新与研究选择.html`。

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

当 LLM_PROVIDER=mock 或评分失败时，简答题保留为未评分并标记待复核，分数与正确性为缺失值；不能将接口不可用记作学生答错。真实评分得到的有效 0 分仍保留。

### 自主配置验收

学习者界面提供六维共 13 个可选等级、96 种实验组组合。每维提供 6 个简短理由；历史理由不在新列表时作为第 7 项保留。逐项预览与核对页解释帮助的实际边界；历史设置仍可读取，保存会生成新版本，不改写旧选择。

`node ops/test-learner-configuration-contract.js` 验证全部组合的保存、实际策略决策、知识支持程度、确认、静默、备用内容和补充轮数。`node ops/test-learner-pilot-browser.js` 另检验全部 13 个等级在四种尺寸下的界面、20 人合成分组、保存恢复、研究权限和问卷流程。真实接口需显式设置 `LIVE_MODEL_SMOKE=1`，以现有服务端 `LLM_CONFIG_FILE` 运行 `node ops/test-live-learner-configurations.js`；结果分别保留成功与 fallback，不能用备用路径代替真实模型通过。

这些属于工程验收。真人能否区分六维、选择是否更适合学习、问卷与测验效度，应通过独立预试和冻结的研究方案评估；20 人设计用于可行性探索，不自动支持六维因果主效应或学习收益结论。

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

预览地址写入 `output/函数极限预览.json`。启动器默认持续复用固定端口与数据库，首次会就地接管上次发布的预览，保留账号、密码、登录会话与学习记录。`--restart` 安全保存、备份后重启；只有显式 `--isolated` 才创建临时测试库，且不会覆盖用户入口。`output/函数极限固定入口.json` 含本地配置，勿提交、公开或清理；其指向的数据目录和备份也须保留。配置改变时，本地工程预览可以创建新的实验 ID，账号数据库仍不变；正式研究必须人工审核并冻结新协议，不能用这个模拟启动器运行真人实验。

预览当前使用 mock 回复。学生全流程脚本使用真实 UI、真实规则和真实客观判分，无学习进度注入。保持 UI 的隔离测试把测试库的后测时间提前73小时，以模拟等待；正式72小时门槛保留。工程测试不代表真人学习效果。持续使用验收：`node ops/test-persistent-preview.js`。

生产站点部署到 `/calculus_quest/` 时，设置 `BASE_PATH=/calculus_quest`。服务兼容 Nginx 保留或剥离前缀两种转发方式。

Linux 一键部署继续使用 `./install_run.sh [端口]`，未传端口时为兼容历史服务器使用 3789。部署脚本要求 `.env` 中设置 `NODE_ENV=production` 和仓库外绝对 `DB_PATH`；它会先安装锁定依赖并运行部署检查，再核验并优雅停止本项目进程，生成数据库报告和备份，启动后验证健康接口。脚本不会按端口强杀未知进程，也不会使用 `kill -9`。

首次从旧版仓库内数据库迁移时，不能只覆盖 `.env`：应先停止旧服务并确认数据库已落盘，再把现有 `data/calculus-quest.db` 备份并复制到 `.env` 指定的仓库外路径。完成这一次迁移后，后续发布只需保留服务器 `.env` 和外部数据库，再拉取代码并运行部署脚本。

## 课程数据

六维观察台支持两类工程环境：output 下的隔离测试库，以及显式开启的全量展示服务。展示服务同时设置 `RESEARCH_CONTROLS_ENABLED=true`、`RESEARCH_CONTROLS_DEMO=true` 与 `PROACTIVE_PARTICIPATION_MODE=implicit-pilot`，所有登录账号均可调整自己的六维设置，普通学习入口直接显示观察台。配置按账号持久化，保存时关闭旧建议并取消旧延迟任务；不能替学生授权，也不关闭独立测验保护。正式同意模式或加载正式共同任务协议时始终只读。

D1 提供证据、规则阈值和最少证据类别；D2 提供自然边界、延迟队列、到期复核与过期取消；D3 提供 L1–L5 起始支持与上限；D4 提供任务内／侧栏及四种同内容形式；D5 提供反应式、固定／自适应建议、A1–A4 权限；D6 提供独立检查、升级上限、渐退、冷却和授权复习。规则分数尚未通过真人标注校准，持久记忆不等于经过验证的知识追踪模型。

真实接口使用显式模型名，避免 `auto` 隐式改变供应商路由。对话保存请求／报告模型、提示词摘要和耗时；理由评分保存量规及模型审计，客观题由服务器规则判分。连通检查只使用合成内容：设置 `LIVE_MODEL_SMOKE=1` 和 `LLM_CONFIG_FILE` 后运行 `node ops/test-live-model-integration.js`；可通过 `LIVE_GRADING_MODEL` 指定评分模型。该检查会调用付费接口，但不使用已有学生记录。

验收入口：`node ops/test-research-controls.js`、`node ops/test-research-controls-browser.js`、`node ops/test-six-dimension-runtime.js`。Jev 专用运行时与配置已移除；主策略使用可追溯规则，模型决策比较由独立回放工具承担。
核心课程路线文件：data/multi-scene-learning-route.json。它是“多场景自适应学习路线”的课程事实源，包含章节、知识点、讲解页、互动资源引用和每章三段 quiz。

2026-10-19：常规六知识点入口已接入“判断与验证”，包含初判、课件探索、独立复查、固定线索、无辅助迁移与单元问卷。默认属于普通学习，不进入研究回放数据集。`MAIN_LEARNING_PROTOCOL_FILE` 可指定经过审题和机构审核的 `recheck` 或 `placement` 配置；摘要和必填告知项不匹配时拒绝启动，字段齐全并不代表系统替机构核验过审批。配置摘要由管理员接口 `/api/admin/research/common-tasks` 的 `specification` 获取，分配种子使用独立的 `PROACTIVE_STUDY_SEED`。冻结协议使用相同二维课件，禁用通用助教绕过条件；学生始终可退出。修改正式协议须使用新 ID，不能覆盖已有分配。

原课件的讲解由 `lib/course-playback.js` 驱动，保留现有音频和作者动作。修订过数学表述的旧录音引用停用，转文字讲解；作者演示事件不作为学生能力证据。游戏和三维探索不自动代表学习进步。判断只采用经审查的数学参数和可追溯作答；“当前作答得分率”不是已经验证的潜在知识掌握概率。

新增验收：`node ops/test-main-common-tasks.js`、`node ops/test-main-human-browser.js`、`node ops/test-course-playback.js`。真人协议浏览器测试使用合成审核信息和隔离测试账号，实际等待45秒探索，并检查同意、固定课件、通用助教隔离、独立题与刷新恢复。

研究回放工具依次为 `ops/build-education-replay.js`、`ops/prepare-replay-annotation.js`、`ops/merge-replay-annotations.js`、`ops/run-education-replay.js`、`ops/evaluate-education-replay.js`、`ops/judge-education-replay.js`。运行器与辅助裁判默认仅展示计划，传入 `--execute` 才调用服务。回放只判断已观察前缀上的决策质量，不推断替代策略的真人学习效果；教师双标、裁决与有效同意不能由模型生成代替。核验入口：`node ops/test-education-replay-runner.js`。

课程范围仍为原六知识点，研究人群为尚未系统学习极限的大一学生，总样本30–60人，正式课题尚未选择。

互动课件资源（HTML 交互、音频、图片）位于 resources/open-maic/ 目录。

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Node.js（内置 http、fs、zlib） |
| 数据库 | sql.js（内存运行、延迟原子落盘） |
| 前端 | 原生 JavaScript，无框架，无打包工具 |
| 数学渲染 | KaTeX |
| AI | OpenAI 兼容接口（可选） |
