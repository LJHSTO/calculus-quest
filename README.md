# Calculus Quest

面向桌面浏览器的高等数学学习平台，将讲解、互动探索、测验和 AI 学习伙伴“知点”放在同一个学习空间中。当前课程围绕函数与极限展开，涵盖函数关系、坐标图像、变化方向、极限、单侧极限与连续性。

## 学习与帮助

- **连续的学习流程**：阅读讲解、操作课件、完成形成性检测，再进入下一知识点。操作指引介绍课件控件、知点和独立检查的使用方法。
- **可调节的主动帮助**：六项设置分别控制判断依据、介入时机、讲解方式、出现位置、是否先询问和是否继续帮助，共有 96 种组合。每项设置都有示例和与该维度相关的选择理由。
- **围绕当前任务的对话**：知点结合当前题目、课程材料、作答结果和最近对话解释概念，支持追问、换例子与分步讨论。切换题目时更新讨论上下文。
- **完整的帮助过程**：从提醒、阅读帮助、继续讨论到独立检查或结束，均提供明确的下一步。学生可以拒绝、暂停或结束帮助。
- **可视化学习回顾**：展示各阶段的配置、实际收到的帮助、追问和独立检查结果，支持在阶段回顾后调整设置。
- **学习记录与管理**：管理员可按学生和学习轮次查看交互时间线，并导出事件、模型调用、作答、独立检查和帮助轮次等 JSON 或 CSV 数据。

## 知点如何工作

服务端根据学习事件、作答结果、学生设置和当前帮助状态，决定何时提供支持。课程题库、知识点适配器和帮助模板提供任务依据；语言模型负责结合上下文进行解释与交流。部分可计算问题会额外核对数值和结论。

一次帮助通常经过“发现困难 → 询问或展示 → 阅读与交流 → 独立尝试 → 继续学习”。学生的选择、题目切换和检查结果共同推进流程。聊天与独立检查分别维护上下文，独立作答期间暂停提示。

当前课程上下文直接来自本地课程结构、题库和支架资料，没有使用向量检索服务。相关实现位于 `lib/learning-assistant.js`、`lib/assistant-prompt-r17.js`、`lib/assistant-math-check-r18.js`、`lib/proactive-policy/` 和 `lib/support-goals.js`。

## 快速开始

建议使用 Node.js 22 LTS 或更新的 LTS 版本。

```bash
git clone https://github.com/LJHSTO/calculus-quest.git
cd calculus-quest
git switch proactive_test
npm ci
cp .env.example .env
npm start
```

打开 [学习平台](http://127.0.0.1:8765/)。健康检查地址为 `/api/health`，管理后台入口为 `/admin/`。

默认 `LLM_PROVIDER=mock`，可以运行本地流程并使用课程内置帮助；配置模型服务后可进行真实对话。仓库包含应用源码、课程结构和题库，完整的讲解与互动课件需要另行导入。

## 三组学习入口

| 入口 | 配置与回顾方式 |
| --- | --- |
| `/?study=A` | 使用共同固定配置，查看常规学习回顾 |
| `/?study=B` | 自主配置，查看设置与实际帮助之间的关联回顾 |
| `/?study=C` | 自主配置，查看常规学习回顾 |
| `/?study=assigned` | 管理员完成实验设置后，参与者确认同意并由系统分配组别 |

A、B、C 入口用于体验对应流程。三组都先完成阶段学习回顾，再填写结束问卷；B、C 可在指定阶段调整配置。三组共用模型服务和生成参数，区别在于配置权限与回顾方式。

当前流程分为两个阶段，每阶段三个知识点，每个知识点有两道形成性检测题。完成前三个知识点后进行一次中段回顾；B、C 可以保持或调整设置。三组回顾均累计前台阅读至少 90 秒，关闭或切到后台时暂停，可通过 `THREE_ARM_REVIEW_MIN_SECONDS` 统一配置。全部学习与独立后测完成后，先做最终回顾，再填写结束问卷。

前后测采用 X/Y 两套卷，每卷 12 题、32 分。首次现场按 80 分钟安排，正式轮次最多 90 分钟；满 72 小时后开放保持、近迁移和 14 分钟调节任务。调节任务分别记录行为分（12 分）和情境分（12 分），行为分为当前协议的主要结果指标。

正式研究使用 `/?study=assigned`，需负责人先确认当前协议。体验入口保留体验标识，不能通过隐藏提示或添加 URL 参数变成正式入组。正式轮次绑定题库、问卷和运行版本；更新前须检查尚未结束的正式参与者，包含等待随访的参与者。学习设置权限独立于工程演示开关，仍受组别、准备阶段、独立测量和配置窗口约束。

“等待多个线索”仍要求至少两类困难证据；没有主动提醒时，学生可自行提问。主动请求一次补充会立即开始准备，不等待自动提醒的冷却间隔，仍保留独立测量保护和次数限制。共同独立检查的难度不随帮助的展开程度改变。

## 模型与服务配置

在 `.env` 中设置 OpenAI 兼容服务，例如：

```dotenv
LLM_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_BASE_URL=https://api.example.com/v1
OPENAI_COMPATIBLE_API_KEY=replace-with-your-key
OPENAI_COMPATIBLE_MODEL=replace-with-your-model
OPENAI_COMPATIBLE_WIRE_API=chat-completions
```

也可使用 `LLM_CONFIG_FILE` 指向服务器上的凭据文件，支持纯密钥、`KEY=value`、JSON 和供应商提供的 curl 配置。`OPENAI_COMPATIBLE_WIRE_API=responses` 可切换为 Responses API。供应商支持时，可用 `OPENAI_COMPATIBLE_ENABLE_THINKING` 显式设置思考模式。

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `8765` | 监听地址与端口 |
| `DB_PATH` | `data/calculus-quest.db` | SQLite 数据文件；生产环境使用仓库外的绝对路径 |
| `BASE_PATH` | 空 | 反向代理使用的站点前缀，例如 `/calculus_quest` |
| `ADMIN_TOKEN` | 自动生成 | 管理后台密码 |
| `LLM_MAX_CONCURRENT` | `24` | 每个服务进程同时执行的模型请求数 |
| `LLM_MAX_PENDING` | `128` | 等待队列容量 |
| `LLM_QUEUE_TIMEOUT_MS` | `90000` | 请求在队列中的最长等待时间，单位为毫秒 |
| `GRADING_CONCURRENCY` | `4` | 同时执行的简答题批改任务数 |
| `LEARNING_ASSISTANT_DAILY_QUOTA` | `120` | 每位学生每天可发起的对话请求数 |
| `PROACTIVE_POLICY_MODE` | `shadow` | 通用策略模式：`off`、`shadow` 或 `active` |

`shadow` 记录策略判断，`active` 按配置展示主动帮助。完整的配置项和可选功能见 [.env.example](.env.example)。

对话和批改共用有容量限制的先入先出队列，等待时可反馈排队状态。离开任务或取消请求时释放相应资源；模型服务连续失败时暂停发送新请求，并在恢复探测后继续。记录分别保存队列等待、模型执行耗时、请求模型和服务返回模型，便于分析响应速度。队列超时是等待上限，实际耗时取决于请求量、模型服务和回复长度。

## 导入与调整课程

课程路线位于 `data/multi-scene-learning-route.json`，其中维护章节、知识点、题目和资源路径。讲解与互动资源放在 `resources/open-maic/`。

将 OpenMAIC 课程包解压后，可从 `manifest.json` 导入互动场景：

```bash
node ops/import-courseware-package.js /path/to/course/manifest.json
```

脚本默认写入 `GH-01-新课件` 和 `GH-02-新课件`，可重复传入 `--module` 指定模块目录，或用 `--root` 指定资源根目录。导入后将课程路线中的资源路径指向对应文件。该脚本提取互动场景；完整讲解、音频等资源应随课程包一同准备。

扩展课程时，为知识点补充学习目标、典型误解、帮助内容和独立检查题，再在 `lib/proactive-policy/adapters/` 中接入对应适配器。课件通过学习事件把操作和挑战结果传给平台。

## 开发

前端使用原生 JavaScript、HTML 和 CSS，通过 esbuild 生成学习工作区资源；后端使用 Node.js HTTP 服务和 sql.js。修改前端后运行：

```bash
npm run runtime:build
```

以下离线测试覆盖配置理由与介入时机、课程数学核对、回顾证据和管理端时间线：

```bash
node ops/test-student-flow-r19.cjs
node ops/test-assistant-math-check-r18.cjs
node ops/test-review-evidence-r19.cjs
node ops/test-study-timeline-r18.cjs
```

其他测试和内容工具见 `package.json` 与 `ops/`。

| 目录 | 内容 |
| --- | --- |
| `app/main/` | 学习工作区、操作指引、对话、帮助流程与回顾界面 |
| `app/shared/` | 六维配置与学习阶段定义 |
| `lib/` | 课程上下文、模型调用、主动策略、测验与学习记录 |
| `lib/assessments/` | 题库、问卷和独立检查 |
| `admin/` | 管理后台与交互记录回放 |
| `resources/` | 课件运行脚本与导入资源 |
| `assets/` | 编译后的前端资源与静态素材 |
| `ops/` | 构建、内容处理和测试工具 |

最近更新见 [CHANGELOG.md](CHANGELOG.md)。
