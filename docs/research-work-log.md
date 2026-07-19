# Calculus Quest 科研工作记录

> 基线日期：2026-07-12（Asia/Shanghai）
>
> 证据范围：当前代码与未提交文件、全部本地/远端 Git 引用、主要提交、项目相关 Codex 历史任务、课件审计报告与现存测试。
>
> 判定原则：代码和可复现实验优先于历史对话中的完成声明。

## 1. 项目概况

Calculus Quest 最初是一个微积分交互学习与研究分析平台，随后演化出两条相互关联但尚未完全收口的研究线：

1. **学生侧 Agentic Learning**：知识图谱、多 Agent 证据融合、三阶段测验、同知识点多场景选择、跳过/重学/扩展建议和学习分析。
2. **教师侧 Agentic Authoring/QA**：OpenMAIC/MAIC-UI 提示词、课件导入、静态与语义审计、真实学生流、自动安全修复、OpenMAIC Pro Mode 修改桥接和发布门控。

目前最大的困难不是缺少功能想法，而是两条研究线在同一工作树中快速迭代，造成提交边界、生成物、编码和产品接线失控。

## 2. 研究问题与技术假设

### 2.1 学生侧核心问题

同一个数学概念可以用讲解、模拟、游戏、关系图、3D、误解修复和练习等不同场景学习。项目研究的问题是：

> 多 Agent 根据测验与交互证据给出可解释建议，并由学生显式选择下一场景，是否比固定线性路径或系统静默跳转更能提高概念掌握、迁移、自我调节和对系统的信任？

当前技术假设：

- 客观题、AI 简答评分和交互轨迹共同使用，比只看总分更可靠。
- 推荐“换表征/换任务”比只推荐“更简单/更难”更符合概念学习。
- Agent 提供理由但不替学生决策，有利于保留学习者能动性。
- 推荐过程需要完整记录候选、理由、选择延迟和后续结果，才具备科研可解释性。

### 2.2 教师侧核心问题

AI 课件生成不能止于一次 prompt。更完整的问题是：

> 能否构建一个有结构化中间表示、真实浏览器证据、可追溯修复和人工边界的课件生成/质检闭环，从而提高 OpenMAIC 课件的正确性、交互可靠性和可维护性？

当前技术假设：

- Lesson Spec 能把教师自然语言需求转成可检查的教学蓝图。
- 静态规则、LLM 语义 Judge 和真实浏览器学生流互补，任何单一检查器都不够。
- 低风险兼容错误可确定性修复；内容和复杂交互问题必须回到 OpenMAIC Pro Mode 或人工审核。
- 发布门控必须保存版本、截图、日志、修复前后 hash 和复验结果。

## 3. 已实现功能

### 3.1 当前已提交到 `origin/main` 的学习平台

#### 基础平台

- 原生 JavaScript 单页学习界面，无前端框架和打包步骤。
- Node.js `http` 服务，静态文件与 REST API 同端口运行。
- `sql.js` 数据库：用户、会话、学习事件、测验结果、快照和管理统计。
- 昵称/邮箱登录、学习状态同步、管理 token、健康检查。
- KaTeX 数学渲染、音频旁白、互动课件 iframe 播放。

#### 课程与测验

- 当前路由包含 11 章（6 主线、5 扩展）、19 模块、72 知识点。
- 33 个三阶段 quiz，当前路由统计为 238 道整理后的 quiz 题目参与过 LLM 审计。
- 288 个互动候选，覆盖 simulation、game、mind map/diagram、3D 等场景。
- quiz 可记录客观题与简答题；简答题支持 OpenAI-compatible 模型评分与 mock 兜底。
- 错题复核、按题得分、总分、人工复核标记和课件回看跳转曾在功能提交中实现。

#### Agentic Learning

- 知识图谱及前置、后继、替代表征、拓展关系。
- 多 Agent 编排：评分、测评、行为分析、规划、QA 与 Coach 解释。
- 前测高分跳过确认、后测不足重学、一步拓展和下一场景候选。
- Planner 当前采用可解释启发式排名，保留候选分数和理由。
- 交互事件、推荐来源、学生选择、选择延迟和后续单元可进入研究证据链。
- 学生必须点击确认路径变化，设计上不允许 Agent 静默替换学习路径。

#### 管理与部署

- 管理端学习进度、测验、活跃度、行为与证据链分析。
- `/calculus_quest/` 子路径适配及一键部署脚本曾提交。
- `admin_flow=1` 的无锁测试模式曾在提交 `577d6fe3` 恢复，但当前暂存版本又混入编码损坏，不能作为可用状态。

### 3.2 已提交的提示词与课程工程

- `b21e1d1b`：证据驱动的 Agentic Coach、多 Agent、Planner、管理证据链和课程生成骨架。
- `675f81de`：MAIC-UI 与 OpenMAIC Agentic 提示词边界。
- `40873efb`：曾生成 51 知识点 x 10 学习方式画像 = 510 条提示词的高成本方案。
- `a74292f2`：将其收口为 51 个单知识点融合提示词，避免课件数量和维护成本爆炸。
- 明确的重要边界：跳过、重学、扩展是宿主系统决策，不是 MAIC-UI 课件内容类型。
- `019bd270`：渐进式 OpenMAIC 课件审计设计规范。

### 3.3 工作树中历史验证过、但尚未提交/接线的课件 QA

现存核心模块：

| 模块 | 作用 | 当前状态 |
|---|---|---|
| `lib/course-audit/index.js` | 静态审计与总编排 | 可加载，未接入主服务 |
| `semantic.js` | LLM quiz/slide 语义审计 | 曾真实运行，当前默认模型仍受配置影响 |
| `browser-smoke.js` | Chrome/Edge 页面与资源 smoke | 可加载 |
| `student-flow.js` | 桌面/移动真实交互学生流 | 曾全量运行 |
| `slide-audit.js` | slide 结构、布局与安全修复 | 曾全量运行 |
| `fix-plan.js` | local patch / Pro Mode / manual 分类 | 可加载 |
| `manager.js` | 资源、作业、报告与修复任务 | 可加载，API 未接线 |
| `openmaic-bridge.js` | Pro Mode 链接与 prompt | 可加载 |
| `openmaic-agent-edit.js` | 编辑会话适配与落盘 | 模拟测试通过 |
| `source-manifest.js` | `.maic.zip` 扫描、hash、版本 | 可加载 |

历史最终验收版本：`openmaic-class-20260707T100855-localfix-20260708T185141Z`。

| 检查 | 范围 | 结果 |
|---|---|---|
| Slide 浏览器验收 | 72 slides x 桌面/移动 | 144 passed，0 warning，0 failed |
| LLM 语义验收 | 11 章、238 题、72 slides | 新语义问题 0，critical 0 |
| 最终学生流 | 11 章、288 资源 x 桌面/移动 | 576 passed，0 warning，0 failed，0 timeout |
| Slide 安全修复 | 4 个文本裁切 | 已修复并复验 |
| 互动安全修复 | 3 个 HTML/JS/CSS 问题 | 已修复并复验 |

这些结论只证明该历史版本曾通过，不证明当前主服务仍能一键运行 QA。

### 3.4 独立教师 Authoring 原型

`openmaic-authoring-loop/` 已实现：

- 教师大白话需求抽取。
- 渐进式追问。
- 可选 PDF grounding。
- Lesson Spec。
- OpenMAIC prompt compiler。
- mock courseware bundle。
- Agent-as-a-Judge。
- Judge-to-Edit 修复计划。

2026-07-12 单元测试结果：5 passed，0 failed。生产适配器仍未接入真实生成平台。

## 4. 当前未完成功能与真实卡点

### 4.1 P0：主学习平台当前不可作为可运行工作树

- 暂存区有 16 个修改文件，558 additions / 451 deletions。
- `app/main/core.js` 在第 144 行附近存在被截断的字符串，`node --check` 失败。
- `admin.html`、`index.html`、`app/main/core.js` 无法严格按 UTF-8 解码。
- `install_run.sh` 有截断引号、乱码和功能退化。
- 部分有效需求（无锁测试模式、子路径资源路径）与编码损坏混在同一批暂存 diff 中，无法直接提交或简单保留整个文件。

这就是当前第一阻塞项。必须从干净 `origin/main` 重建改动，不能继续在损坏文件上补丁叠补丁。

### 4.2 P0：课件资源管理员未接线

- `audit.html` 会请求大量 `/api/courseware/*`。
- 当前 `server.js` 搜不到这些路由，也没有 require `lib/course-audit` 或 `manager`。
- 根 `package.json` 只有 `start`、`migrate`；操作文档列出的 `audit:courseware`、`courseware:*` 命令均不存在。

因此当前页面即使能作为静态文件打开，核心按钮也会 404/无法连接。需要恢复服务端路由、鉴权、脚本和最小集成测试。

### 4.3 OpenMAIC 源课件修改没有形成完整生产闭环

- 本项目成功修过派生 HTML，也有模拟 `/api/agent/edit` 测试。
- 但原始 `.maic.zip` 没有被自动覆盖，这是正确的安全边界。
- `/api/agent/edit` 依赖当前 scene context 和编辑器状态，尚未证明可以稳定批处理任意源包。
- 完整闭环仍需要：任务包 -> Pro Mode 编辑 -> 导出新包 -> 重新导入 -> 全量复验 -> 发布。

### 4.4 通用化仍不完整

- 当前学习播放器、route 和 Agentic Path 对 OpenMAIC v14 结构耦合较深。
- 通用导入器已尝试“一包一章”，但多包合章、MAIC-UI adapter、任意课程 schema 仍需正式接口设计。
- “适合任何 OpenMAIC/MAIC-UI 课件”的产品定位目前是设计方向，不是完成事实。

### 4.5 模型与科研评估

- 默认仍是 `LLM_PROVIDER=mock`；真实模型配置属于部署环境，不应硬编码。
- Planner 是启发式规则，还没有 learned ranking、pairwise judge 或离线策略评估。
- 缺少正式 experiment id、condition/cohort、随机分配、保留率窗口、效应量和干预一致性字段。
- 尚无完整 benchmark：内容正确性、交互成功率、Judge 一致性、修复成功率、成本/时延和真实学习增益需要分开评估。

### 4.6 知识图谱调用与 2026-07-12 修复

- `server.js -> agent-orchestrator -> agentic-coach/planner -> lib/kg.js` 的调用链真实存在。
- Coach 使用 `follows` 计算跳过闭包，按薄弱知识点和多表征资源生成重学候选，使用 `extension` 做一步拓展。
- Planner 使用 KG 章节单元作为候选，再融合掌握度、薄弱概念、摩擦度、参与度和场景元数据排序。
- 修复前 `knowledge-graph.json` 只有 8 个旧章节，与 11 个 V14 route 章节 ID 交集为 0；`V14-C1` 会返回 `unknown_chapter`。
- 修复后由 `lib/kg-build.js` 从 route 生成 11 章、105 单元、430 边和 288 个课件资源引用；`lib/kg.js` 加载时强制校验，失配明确抛出 `kg_route_mismatch`。
- 回归结果：`V14-C1` Coach 可生成 6 个跳过候选、3 个重学候选；Planner 可排序 2 个同模块候选；`V14-C3` 可沿图边得到 1 个扩展候选。
- V14 前端已禁用旧 `5/11/12/13/14` 固定场景序号候选；服务不可用时仍可按错题知识点形成语义重学候选，但不会再把任意序号位置误标为旧版重学/拓展课件。

结论：知识图谱有保留必要，因为删除后 `follows/alt_modality/extension/prerequisite` 复杂度会散回 Coach、Planner 和前端多个调用方；正确修复不是删除 KG，而是从当前 route 自动生成 KG，并增加 route/KG 一致性门控和测试。

## 5. 历史演进记录

### 2026-06-12 至 2026-06-18：可读化、数据分析和知识图谱起步

- 建立公开可读的原生 JS/Node 版本与管理分析面板。
- 改进交互统计、有效停留和学习路径分析。
- 引入知识图谱、Coach 与 mock/真实 LLM 适配构想。
- 开始将线性课程改成“推荐但学生确认”的 Agentic 路径。

### 2026-06-19 至 2026-06-30：测验、路径与 UI 快速迭代

- 多轮修复简答题解析、0 分兜底、人工复核状态和错题答案展示。
- 实现章节折叠、Inside chapter 路径展示、按场景选择与音频包位置调整。
- 反复处理 3789/3790/3791 多端口、浏览器缓存和中文乱码。
- 形成一个重要教训：UI、路径逻辑、编码修复和部署改动不能并行堆在同一未提交工作树。

### 2026-07-01 至 2026-07-02：多 Agent 与提示词收口

- 提交 `b21e1d1b`，形成交互证据、评分、Planner、Coach 和管理端证据链。
- 提示词从错误的“系统动作即课件类型”纠正为“单知识点课件 + 外部系统决策”。
- 510 条多画像方案因成本过高被 51 条融合型单知识点提示词替代。
- 设计 v14 课程结构和知识点/互动场景选择 UI。

### 2026-07-03 至 2026-07-09：课件 QA、修复和资源管理器

- 从静态 route/资源/quiz 检查，发展到 LLM 语义审计、浏览器 smoke、桌面/移动学生流和截图证据。
- 实现安全修复器，并经历了修复规则误污染 HTML 的事故；随后增加精确匹配、污染清理、备份和复验。
- 六章与五个扩展章先后完成验收，最终汇总为 72 slide、288 互动资源、576 次学生流全通过。
- 实现资源管理面板、作业队列、Pro Mode prompt/bridge 和可见浏览器复核包。
- 同期又合入子路径部署、公开资源、README、编码修复和测试模式，最终工作树边界失控。

### 2026-07-09 之后：部署收尾与遗留状态

- `origin/main` 最终到 `00b8c0fd`。
- GitHub 版本包含学习平台、OpenMAIC 资源和子路径适配。
- 服务器是否使用真实模型仍取决于服务器 `.env`；推送不等于服务器自动更新。
- 本地继续产生暂存的编码损坏和大量未跟踪 QA 资产，形成当前清理任务。

## 6. 已踩过且禁止重复的坑

1. **编码猜测式修复**：PowerShell/脚本把 UTF-8 当其他编码读写，产生二次乱码、非法 UTF-8 和截断字符串。
2. **把终端乱码当文件乱码**：必须用严格 UTF-8、Node 语法和浏览器结果三方确认。
3. **在脏工作树用 `git add .`**：会把缓存、备份、真实资源、报告和一次性脚本一起提交。
4. **信任对话中的“完成”**：历史上多次完成声明后来被部署合并覆盖；必须回到代码和测试。
5. **自动修复器正则过宽**：`toFixed`/radial gradient 规则曾污染对象属性和括号结构。修复必须幂等、单文件、可回滚、有前后 hash。
6. **先跑全量再验证 runner**：全量浏览器检查耗时很高；先 1 章/1 资源 canary，再扩到全量。
7. **把 Claude in Chrome 当批量测试框架**：它适合疑难探索，不适合可重复发布门控。
8. **误解 OpenMAIC `/api/agent/edit`**：它不是无状态批量 zip 编辑 API，需要编辑器上下文。
9. **直接改运行中 `sql.js` 数据库**：服务内存状态可能稍后覆盖磁盘写入。
10. **按端口盲杀进程**：历史上多个项目和临时预览共存，必须先核对进程工作目录。
11. **只验证首页 200**：子路径部署必须同时验证静态资源、API、admin、quiz 和 iframe。
12. **把 mock 当真实模型**：页面提示、报告和论文记录都必须明确 provider/model/skipped 状态。
13. **把路径动作写进 MAIC-UI 内容**：跳过/重学/扩展由宿主系统决定，课件只描述知识点、交互和证据。
14. **过量生成提示词/课件**：510 个变体成本和维护性过高，优先复用融合型单知识点资源与运行时选择。
15. **提交真实 token/本机路径/课程隐私**：配置、报告和 UI 必须脱敏，真实密钥只保存在本地或部署环境。

## 7. Git 分支与 worktree 审计

### 7.1 当前引用

| 引用 | 提交 | 相对 `origin/main` | 建议 |
|---|---:|---:|---|
| `origin/main` | `00b8c0fd` | 权威基线 | 保留 |
| `dev/multi-agent` | `00b8c0fd` | 0 ahead / 0 behind | 当前脏分支；恢复后删除或改为新任务分支 |
| `origin/dev/multi-agent` | `c514b633` | 落后 5 | 远端陈旧，删除 |
| `feature/progressive-knowledge-groups` | `5cf89878` | 落后 16，已是祖先 | 删除 |
| `public-main-clean` / remote | `2bd2ee9e` | 落后 18，已是祖先 | 本地和远端均可删除 |
| 本地 `main` | `9a9135ee` | 与当前远端无共同祖先 | 先归档；被 `D:\Projects\Demo` worktree 占用 |
| `readable-refactor` | `0f74277f` | 与当前远端无共同祖先，含 6 个旧提交 | 先归档，再删除 |
| `stash@{0}` | 基于 `5cf89878` | 9 个旧 UI/统计文件 | 大概率被后续提交替代；先转归档分支再删除 stash |

现有 worktree：

- `D:\Projects\Demo` -> 本地旧 `main` (`9a9135ee`)。
- `D:\Projects\Demo-readable-refactor` -> `dev/multi-agent` (`00b8c0fd`)。

### 7.2 推荐的分支清理顺序

以下是建议，不在本次记录任务中自动执行：

1. 在仓库外建立 bundle，或至少给旧历史打 tag：

   ```powershell
   git tag archive/local-main-20260612 main
   git tag archive/readable-refactor-20260612 readable-refactor
   git branch archive/stash-20260618 refs/stash
   git bundle create ..\calculus-quest-pre-cleanup.bundle --all
   ```

2. 处理 `D:\Projects\Demo`：确认无独有未提交内容后，让它切到新的 `origin/main` 派生分支，或删除该 worktree。旧 `main` 没有共同祖先，不能直接 pull/merge 成新主线。
3. 在干净分支恢复当前必要改动后，删除已合并祖先：

   ```powershell
   git branch -d feature/progressive-knowledge-groups public-main-clean
   git push origin --delete dev/multi-agent public-main-clean
   ```

4. 确认归档存在后再强制删除无共同祖先的旧本地分支：

   ```powershell
   git branch -D main readable-refactor
   ```

5. 当前 `dev/multi-agent` 与远端主线同点。迁出脏内容并切到 `codex/recover-worktree` 等恢复分支后，可删除本地同名分支。
6. 确认 `archive/stash-20260618` 能看到旧改动后，再 `git stash drop 'stash@{0}'`。

## 8. 当前未提交文件清理建议

### 8.1 暂存区 16 个文件

#### 直接取消暂存并从干净基线重做

- `.gitignore`：恢复派生资源忽略，再单独增加缓存/临时目录规则。
- `admin.html`、`index.html`、`app/main/core.js`：非法 UTF-8/语法损坏，不能 salvage 整文件。
- `install_run.sh`：引号截断、乱码、错误删除端口诊断逻辑，不能提交。

#### 只提取需求，不保留当前字节

- `app/main/agentic-path.js`
- `app/main/bootstrap.js`
- `app/main/data.js`
- `app/main/quiz.js`
- `app/main/render-learning.js`
- `server.js`

这些文件中有 `admin_flow`、BASE_PATH 或路径行为的有效意图，但应在干净 `origin/main` 上重新写最小补丁并重新验证。

#### 独立人工审阅后决定

- `docs/maic-ui-fused-single-concept-prompt-pack-v14.csv`
- `docs/maic-ui-fused-single-concept-prompt-pack-v14.md`
- `docs/prompt-engineering-eduillustrate-plan.md`
- `docs/superpowers/specs/2026-07-03-openmaic-courseware-audit-design.md`

这些文件严格 UTF-8 可读，但应与代码恢复分开提交。先确认它们是最终版本而非中间生成物。

推荐先保存证据，再清空暂存索引：

```powershell
git diff --cached --binary --output=..\calculus-quest-staged-20260712.patch
git status --porcelain=v2 | Set-Content -Encoding utf8 ..\calculus-quest-status-20260712.txt
git restore --staged -- .
```

不要立即 `git restore --worktree`，因为其中仍有需要人工提取的有效需求。

### 8.2 未跟踪文件：可直接清理/忽略

| 类别 | 规模 | 建议 |
|---|---:|---|
| `tmp/` | 约 2,824 未跟踪条目，232 MB | 删除；加入 `.gitignore` |
| `.playwright-cli/` | 97 条目，2.6 MB | 删除；加入 `.gitignore` |
| `test-results/` | 本地结果 | 删除/忽略 |
| `ops/__pycache__/`、`tools/__pycache__/` | Python 缓存 | 删除/忽略 `__pycache__/`、`*.pyc` |
| `tools/_encoding_test.txt` | 编码实验 | 删除 |
| `flow-test.html` | 已替换为独立只读课件检视器 | 保留；不得恢复旧 `admin_flow` 跳转语义 |
| `output/` | 约 1.2 GB，当前已忽略 | 保留在仓库外或按需删除，不提交 |
| `logs/`、`*.log` | 运行日志 | 已忽略；按需清理 |

建议新增忽略规则：

```gitignore
.playwright-cli/
.superpowers/
test-results/
tmp/
__pycache__/
*.pyc
tools/_encoding_test.txt
```

`.superpowers/` 是否忽略取决于团队是否需要其项目配置；当前内容未形成权威项目文档，建议忽略。

### 8.3 未跟踪文件：先归档再删除

- `resources/open-maic-backups/`：约 2,483 个文件，主要是两代完整 legacy 备份。最终报告和源 `.maic.zip` 已能提供追溯时，完整目录应移到仓库外研究归档，只保留必要的修复 manifest/hash。
- `docs/courseware-audit/`：约 60 份中间报告。建议只保留：
  - `20260709-full-courseware-slide-interactive-repair-report.md`
  - `openmaic-courseware-resource-manager-guide-20260708.zh.md`
  - `openmaic-six-chapters-modification-report-20260707.zh.md`
  - 一个机器可读最终 JSON 的外部归档链接/hash
  - 其余按版本打包到仓库外 `research-artifacts/`。
- 根目录约 130 个 `check_*`、`debug_*`、`fix_*`、`gen_*`、`show_*`、`verify_*` Python 脚本：先压缩归档一次；正式仓库只保留被提升到 `ops/`、有文档和测试的脚本。
- `CLAUDE.md`：内容已过时（章节、端口和架构不准），不要直接提交；本次 `AGENTS.md` 应成为新的权威入口。

### 8.4 未跟踪文件：必须保留并整理成独立提交候选

- `audit.html`、`app/audit/`。
- `lib/course-audit/`、`lib/model-config.js`。
- 课件导入/审计/修复/验证相关 `ops/` 文件。
- `config/model.env.example`、`courseware-inbox/.gitkeep`、`prompts/` 中脱敏模板。
- `docs/agentic-coach-research-design.md`。
- `openmaic-authoring-loop/`（若确定作为论文原型保留）。

整理前必须补齐：

1. 根 `package.json` 脚本。
2. `server.js` 的 `/api/courseware/*` 鉴权和路由。
3. 至少一个 manager API 集成测试。
4. 一个 canary 课件的静态 + 浏览器测试。
5. 文档命令与实际脚本一一对应。
6. 所有本机绝对路径、课程标题、token、key 脱敏。

## 9. 推荐恢复与下一步计划

### 阶段 A：冻结与恢复（P0）

1. 创建 bundle、归档 tag、暂存 patch 和完整文件清单。
2. 从 `origin/main` 新建干净恢复分支。
3. 只重做当前确需的无锁测试模式和子路径适配。
4. 对所有 HTML/JS 做严格 UTF-8 和 `node --check`。
5. 启动一个端口，完成首页、登录、quiz、admin、课件 iframe 的 smoke。

完成标准：主平台恢复可运行，暂存区不再含编码损坏。

### 阶段 B：QA 子系统产品化（P1）

1. 将核心 QA 文件作为独立提交迁入干净分支。
2. 恢复 package scripts 与 server API。
3. 先跑模块 load、model-config、agent-edit mock 测试。
4. 用 1 个课件 canary 运行静态、slide、学生流。
5. 通过后再跑 11 章全量回归，并生成单一最终报告。

完成标准：`audit.html` 的每个主要按钮有真实 API、鉴权、作业状态和可复现实验。

### 阶段 C：源课件编辑闭环（P1-P2）

1. 明确 local safe fix 与 Pro Mode edit 的规则边界。
2. 为 Pro Mode 任务保存 issue、scene context、prompt、事件流和导出包 hash。
3. 禁止直接覆盖源包；新包作为新版本重新导入。
4. 自动复跑相关场景和全量发布门控。

完成标准：至少一个真实 `.maic.zip` 完成“发现问题 -> Pro Mode 修改 -> 导出 -> 复验”的端到端演示。

### 阶段 D：科研实验（P2）

1. 定义实验条件：线性路径、规则自适应、Agent 推荐 + 学生选择。
2. 增加 experiment/cohort/condition、干预时间、推荐理由、选择延迟、保留测验窗口。
3. 预注册主要指标：学习增益、迁移、保留率、完成率、认知负荷、信任/能动性。
4. QA 侧评估 Judge 准确率、修复成功率、误修率、成本、时延和人工一致性。
5. 将研究事件 schema 与产品日志分层，避免为了论文直接堆 UI 字段。

## 10. 本次核验结果（2026-07-12）

已通过：

- `git fetch --all --prune`。
- 课件 QA 核心模块 `require()` 加载。
- `node ops/test-model-config.js`。
- `node ops/test-openmaic-agent-edit.js` 的临时模拟编辑与脱敏断言。
- `openmaic-authoring-loop`：5/5 tests passed。
- 除 `app/main/core.js` 外，扫描到的其他 JS 语法检查未报告失败。

未通过/无法执行：

- `app/main/core.js` 语法检查失败。
- 当前主学习平台不应启动做最终浏览器验收，因为入口脚本已损坏。
- 课件资源管理员无法按文档一键运行，因为 package scripts 和 server API 未接线。

### 2026-07-12 清理执行记录

- 在 `D:\Projects\Demo-readable-refactor-cleanup-20260712` 创建完整 Git bundle、暂存补丁、状态和未跟踪文件清单。
- 新建并切换到 `codex/recover-worktree-20260712`。
- 取消 16 个危险文件的暂存；工作树内容仍保留，没有丢失。
- 删除纯缓存：`.playwright-cli/`、`test-results/`、`tmp/`、两个 `__pycache__/` 和编码测试文件。
- 补充 `.gitignore`，阻止浏览器缓存、临时文件、Python 缓存、新派生课件和课件备份重新污染状态。
- 删除已被 `origin/main` 包含的本地分支：`dev/multi-agent`、`feature/progressive-knowledge-groups`、`public-main-clean`。
- 删除明确标为历史/高成本旧方案的提示词文件：`docs/maic-ui-agentic-openmaic-prompt.md`、`docs/maic-ui-single-concept-prompt-pack-v14.md`、`maicui-openmaic-prompts-v3.md`。
- 将扩展章最新 v15 提示词（5 份总模板、21 份知识点模板及说明）从 legacy 备份提升到 `prompts/openmaic-extensions-v15/`，避免后续删除备份时丢失源提示词。
- 将 130 个根目录一次性脚本/中间文件压缩为外部 `root-scratch.zip` 后从工作区删除。
- 将 60 份中间课件审计报告压缩归档，仅保留最终全量报告、资源管理员指南和六章修改报告。
- 将旧 `maic-ui-local-batch-options.xlsx` 移到外部恢复目录；保留最新 v14 options 工作簿。
- 将 `resources/open-maic-backups/` 的 2,484 个旧派生资源（958.96 MB）整体移到外部恢复目录；项目内只保留当前 `resources/open-maic/`。
- 将 `output/` 的 11,758 个生成/浏览器证据文件（1,233.11 MB）和 `data/courseware-audits/` 的 641 份原始中间证据（73.16 MB）移到外部恢复目录；未永久删除。
- 经用户批准，删除远端 `dev/multi-agent`、`public-main-clean`，删除已由 bundle 保存的旧 stash。
- 经用户批准，删除四套旧模型课件共 104 个 HTML，并从前端移除 `MAIC_UI_MODEL`、`AGENTIC_MAIC_UI_ADAPTIVE_MAP`、旧模型优先级和动态 fallback 构建；当前 route 只引用 `resources/open-maic/`。
- 经用户批准，将 `batch-generate-courses.ps1`、`run-openmaic-local-batch.ps1` 归档为外部 `root-batch-entrypoints.zip` 后移出项目。
- `D:\Projects\Demo` 先做归档审查：它是与 `origin/main` 无共同祖先的 6 月旧平台历史，含 `admin.html/db.js/index.html/script.js/server.js` 五个未提交修改。其用途是审计旧数据库/UI 实验是否有唯一功能，不能作为当前部署主线。
- 第 4 项逐文件审查结果：旧工作树共净增约 728 行，核心内容是交互统计仪表盘、`interaction-dashboard` 等管理 API、事件批量上传和卸载前 `sendBeacon`。当前主线的 `db.js`、`server.js`、`admin/admin.js`、`app/main/analytics.js` 已包含这些能力及后续扩展（Agentic trace、action coverage、排序等）；`index.html` 仅改了旧 `script.js` 缓存版本。因此暂未发现必须从旧工作树摘取的唯一功能。
- 用户批准后，将当前目录迁移为独立 `D:\Projects\calculus-quest` 仓库；迁移前后保持 HEAD `00b8c0f`、121 个 tracked 变更和 92 个 untracked 文件一致。随后删除旧 `D:\Projects\Demo`、旧本地 `main`/`readable-refactor` 载体；完整历史仍由 `all-refs.bundle` 保存。
- 将 `data/backups/` 和旧运行输出共 19 个文件、78.51 MB 移到外部 `ignored-data-cleanup-20260712/`。
- `flow-test.html` 的失败已通过 HTTP 复现为 404：它从未被 Git 跟踪，上轮作为临时跳转页进入 `root-scratch.zip`；页面只跳转 `index.html?admin_flow=1`，而 `admin_flow` 实现只存在于已归档的损坏运行时补丁。因此恢复单个 HTML 不能恢复测试模式。
- 新目录首次启动发现旧 `node_modules` 是不可用的非目录残留，`server.js` 因缺少 `sql.js` 退出；执行 `npm ci` 后恢复 `sql.js@1.14.1`、`katex@0.16.9` 等 3 个依赖，主页、route、KG API 恢复。
- `npm audit` 报告 `katex@0.16.9` 有 1 个 moderate 风险。未自动修复，因为浏览器还直接加载已提交的 `lib/katex.min.js`；后续应同步升级 npm 包和浏览器 bundle，并回归数学公式、URL/HTML 扩展命令和恶意输入限制。
- Windows/Codex 桌面仍占用旧 `D:\Projects\Demo-readable-refactor` 根目录句柄；旧目录已无项目内容，只剩可能被桌面自动重建的空控制目录。关闭当前任务后删除空目录即可。
- 重建 V14 KG 并新增 `npm run kg:build`、`npm run kg:test`；构建校验章节/单元覆盖、重复 ID、悬空边和 288 个资源文件。
- 保留第 7 项仓库外恢复目录，不移动或删除其中既有证据。

### 2026-07-12：独立 Flow Test、KaTeX 0.17.0 与 OpenMAIC guard 迁移设计

- 目标：恢复可用但不污染学生状态的课件测试入口；同步修复 KaTeX 安全告警；厘清 KG/Planner 与课件推荐的实际职责；为课件自检迁入 OpenMAIC 确定接入位置。
- 基线：`codex/recover-worktree-20260712`，HEAD `00b8c0f`；本轮仍未暂存或提交。
- Flow Test：新增 `flow-test.html`、`app/flow-test/flow-test.js`、`app/flow-test/flow-test.css` 和 `ops/test-flow-test.js`。页面直接读取 `/api/course/openmaic-v14-route` 与 `/api/learning/kg`，支持 11 章、知识点、四种课件表征、iframe 预览和全量 HEAD 资源检查；不登录、不写数据库、不使用已废弃的 `admin_flow`。
- Flow Test 根因：旧页面从未被 Git 跟踪，只是 `index.html?admin_flow=1` 跳转器；相应运行时代码只存在于已归档损坏补丁，所以恢复单个旧 HTML 不能恢复功能。
- Flow Test 浏览器结果：桌面 1440x900 与移动 390x844 均通过；章节和表征切换正常；route/KG 一致；288/288 课件可用；console 0 error/0 warning。移动验收先发现 iframe 将隐式 Grid 列撑到 1432px，修正为 `minmax(0, 1fr)` 后 `scrollWidth=390`；随后发现 `[hidden]` 被 `.frame-empty { display:grid }` 覆盖，增加 `.frame-empty[hidden] { display:none }` 后占位层不再叠加。
- KaTeX：npm 包、`lib/katex.min.js`、`lib/katex.min.css` 和 `lib/fonts/` 同步升级为 `0.17.0`；`index.html` 缓存版本同步更新；新增 `ops/test-katex.js`。Node 回归验证分式、MathML 与不可信 link/image 输入；浏览器验证 `window.katex.version === "0.17.0"`，分式渲染成功，`KaTeX_Math-Italic.woff2`、`KaTeX_Main-Regular.woff2` 均返回 200，console 0 warning。
- 执行命令：`npm run flow:test`、`npm run katex:test`、`npm run kg:test`、`git diff --check`、HTTP 200 检查，以及 Playwright CLI 的 desktop/mobile/console/network 回归。
- KG/推荐结论：`data/openmaic-v14-route.json` 是唯一课程事实源，KG 是自动生成的查询与校验索引。跳过沿 `follows`，重学按错题概念和多表征知识点，扩展章沿 route `recommendedAfter` 生成的 `extension` 边；Planner 只在同知识簇有多个合法候选时融合掌握度、摩擦、参与度、表征差异和完成状态排序。保留 KG 与 Planner，但不得让它们维护第二份课件清单或覆盖学生选择。
- OpenMAIC 只读架构核验：异步入口为 `app/api/generate-classroom/route.ts`，生成主链为 `lib/server/classroom-generation.ts`，持久化为 `lib/server/classroom-storage.ts`，成功状态由 `lib/server/classroom-job-runner.ts` 在 `markClassroomGenerationJobSucceeded` 写入；客户端 `.maic.zip` 在 `lib/export/use-export-classroom.ts` 组装 manifest。
- 推荐迁移接口：`guardCourseware(bundle, { mode: "inspect" | "safe-fix", releasePolicy })`，内部执行 deterministic inspect -> 幂等 safe fix -> re-inspect，返回 bundle/report/changed/publishable，并保存 before/after hash。服务端接在 `persistClassroom` 前；导出接在 manifest 组装后、zip 生成前。
- 自动修复边界：允许稳定 ID/order、类型/标签归一、可确定资源引用和低风险兼容修复；禁止自动改 quiz 正确答案语义、数学内容、教学讲稿和复杂互动逻辑；源 `.maic.zip` 永远只读。`/api/agent/edit` 依赖编辑器 scene context，不作为无状态批量修复后端。
- 尚未实施：本轮没有修改 `D:\Projects\OpenMAIC`。迁移时不应直接复制 Calculus Quest 的 CJS manager/UI/route registry；应先将纯检查和修复规则重写为 OpenMAIC TypeScript 深模块，再分别接生成与导出边界并补单元、集成和 canary 浏览器测试。
- Windows 编码陷阱：PowerShell 工具输出可能把正确 UTF-8 显示为乱码。必须用 Node/严格 UTF-8 字节检查和真实浏览器确认，不能仅凭终端显示执行转码修复。

### 2026-07-12：课件检查与修复迁出 Calculus Quest

- 决策：课件生成、结构检查、确定性安全修复、内容修改和 `.maic.zip` 下载统一归 `D:\Projects\OpenMAIC` 所有；Calculus Quest 只保留导入后的只读课件、route、KG、Coach 和 Flow Test。
- 已删除：`audit.html`、`app/audit/`、`lib/course-audit/`、`lib/course-gen/`、`lib/model-config.js`、课件审计/修复/导入 CLI、旧 QA 报告和设计文档、`openmaic-authoring-loop/`、`courseware-inbox/` 与旧 `openmaic-fix-prompt.md`。
- 保留：`resources/open-maic/` 当前发布资源、V15 最新生成提示词、课程 route/KG、`flow-test.html`、KG/Flow/KaTeX 测试和本科研时间线。
- OpenMAIC 基线：fork `origin/main` 已移除 `73ee7d7` 与 `194e3e2`，并精确同步 `THU-MAIC/OpenMAIC upstream/main` 的 `f98a7e0`；6 条 scene-modification/fix 冗余分支已从本地和 GitHub fork 删除。
- OpenMAIC 新实现：纯 TypeScript `guardCourseware` 执行 inspect 或 safe-fix/re-inspect；服务端生成持久化前自动运行；Header 提供课件检查对话框，结构问题可安全修复，内容问题定位到现有 Pro Mode；critical 清零后可下载附带 JSON 检查报告的 `.maic.zip`。
- 不重复实现：没有复制 Pro Mode、`/api/agent/edit`、生成式内容修复或第二套编辑器。答案语义、数学内容和复杂互动继续由用户在 OpenMAIC 现有 Pro Mode 中修改。

### 2026-07-15：管理入口、Quiz 选项与学习建议显示修复

- 目标：诊断线上管理面板误报“服务未运行”，消除 Quiz 的重复选项前缀，并隐藏学习建议中的内部课件标记和单元编号。
- 基线提交/课件版本：`codex/recover-worktree-20260712`，HEAD 与 `origin/main` 均为 `00b8c0f`；保留工作树既有未提交改动。
- 修改文件：`admin.html`、`admin/admin.js`、`index.html`、`app/main/core.js`、`app/main/render-learning.js`、`app/main/quiz.js`、`app/main/agentic-path.js`。
- 运行命令：线上与本地 HTTP 探测、全量 `node --check`、严格 UTF-8 解码、选项数据递归断言、Edge CDP 管理登录与首页运行时断言、`git diff --check`。
- 结果：线上首页、管理页和健康接口均为 200；管理 API 无 Token 时为 403，证明服务在线。管理页改为从脚本 URL 推导部署根路径，并保留实际网络异常。课程数据中 68 个自带字母前缀的选项经显示层清洗后残留重复为 0；题目焦点复用题面链接渲染并可跳转，其他建议中的完整和缺尾 `cq-unit` 标记只显示学生可读标签。`server.js` 的登录、注册、鉴权、管理员和通用错误乱码已从已知良好提交恢复。
- 失败/警告：线上干净浏览器用无效 Token 可正常显示“Token 无效”，因此用户原先报告的 `fetch` 异常仍需在部署新诊断后结合实际 Token/浏览器确认。`data/courseware-jobs/` 的 4 份废弃历史作业记录仍含旧标题乱码，但不被当前服务公开或加载。工作树包含大量既有未提交与未跟踪内容，本轮只暂存功能修复相关补丁。
- 是否真实调用 LLM（provider/model）：否。
- 是否修改源 `.maic.zip`：否。
- Git 提交：`1d4d3c4 fix: repair quiz links and user-facing text`。
- 剩余风险与下一步：服务器管理员拉取、重启后，用实际管理员 Token 验证线上管理入口。

### 2026-07-15：完整章节 UI 竞品研究与三版体验原型

- 目标：在不修改正式学习 UI 的前提下，综合游戏式与非游戏式互动学习产品，设计首页封面和一章完整学习流程，并确保知识点先显示 Slide、四种课件由学生自主选择。
- 基线提交/课件版本：分支 `codex/recover-worktree-20260712`，HEAD `1d4d3c4`；课程版本 `openmaic-class-20260707T100855`。
- 修改文件：新增 `docs/calculus-quest-ui-complete-flow-design.md`；原型位于被忽略的 `tmp/full-flow-prototype/`；Word 版与截图位于被忽略的 `output/design/`、`output/playwright/`。
- 运行命令：严格 UTF-8 解码、`node --check tmp/full-flow-prototype/app.js`、Playwright CLI 桌面 1440x900 与移动 390x844 真实浏览器回归、iframe 滑块操作、控制台与网络检查。
- 结果：完成 A「修复者星图」、B「动态实验手册」、C「专注脉冲」三套结构不同的首页与学习流；B 版从首页依次通过前测、学生路径确认、3 个真实 Slide、3 次学生场景选择、3 个真实 OpenMAIC 课件、形成测验、后测、Coach 建议、学生确认和区域恢复。12 个 V14-X1 课件路径均由 route 提供且文件存在。桌面和移动页面无横向溢出；移动 Slide 按原始 1000x562.5 画布等比缩放；真实斜率场滑块从 `1.0` 调至 `0.5` 后数值和图形状态同步更新。
- 竞品证据：核查 Brilliant、Mathigon、PhET、Desmos、Nearpod、H5P、Ximera/MOOCulus、Numbas、Khan Academy、ExploreLearning Gizmos、Seneca，并综合先前 Codédex、CodeCombat、Duolingo 观察；推荐以 B 为学习主框架，A 承担首页地图，C 承担测验和手机专注流。
- 失败/警告：浏览器直接读取 `data/openmaic-v14-route.json` 会被服务端拒绝，已改用正式只读接口 `/api/course/openmaic-v14-route`。同源课件 iframe 沿用正式播放器的 `allow-scripts allow-same-origin` sandbox 组合，Chromium 会给出安全提示；这是现有只读课件交互与跟踪所需边界，生产接线时需继续评估隔离策略。GSAP CDN 不可用时仅失去转场，不影响流程。
- 是否真实调用 LLM（provider/model）：否；Coach 为规则建议文案。
- 是否修改源 `.maic.zip`：否；只读加载现有派生课件。
- Git 提交：未提交；当前阶段等待用户选择设计方向。
- 剩余风险与下一步：用户确认推荐组合或指定单一版本后，按正式模块边界重写知识点播放器、测验和首页地图；不得直接发布 throwaway 原型。

#### 最终完成审计

- 重新访问设计文档列出的 14 个官方产品页面，全部返回 HTTP 200；当前 route 与只读 API 均确认 `V14-X1` 为 1 个模块、3 个知识点，每个知识点都有必需 Slide 和 `simulation`、`mindMap`、`game`、`visualization3d` 四类候选，12/12 个资源 HEAD 请求为 200。
- 在真实浏览器重新走通 B 完整流程：前测、学生确认、3 个 Slide、3 次自主场景选择、3 个真实 iframe 课件、形成测验、后测、Coach 建议、学生确认、区域恢复；完成态为 1020 XP、世界恢复度 42%。Slide 阶段直接断言为 1 个 Slide、0 个场景按钮、0 个 iframe；选择阶段为 4 个场景、0 个默认选中、0 个 iframe。
- A/B/C 首页在 1440x900 与 390x844 六种组合中均只有 1 个 main、CTA 首屏可见且横向溢出为 0。手机 B 的 Slide 为 320x180，选择页为 4 个未选场景，3D iframe 位于视口内并加载 1 个 canvas 与 7 个控件。
- `prefers-reduced-motion: reduce` 下 CSS 过渡为 0.01ms、Web Animations 和 GSAP 活跃动画均为 0；skip link 可由 Tab 聚焦，Enter 后焦点落到 `main#primary-content`；方向键切换会同步 URL 与标题。
- 按最新 Web Interface Guidelines 复核后，将进度条从 `width` 过渡改为固定宽度上的 `scaleX`，并设置左侧 `transform-origin`；桌面与手机的 6% 状态均计算为 `scaleX(0.06)`。原型静态资源缓存版本升级为 `20260715-complete-flow-4`。
- 最终 Word 可作为有效 DOCX 解析，含 4 张表和 7/7 张可解码截图，并包含竞品研究、三版本、V14-X1、Slide/四场景规则和参考稿路径。最终执行 `node --check`、严格 UTF-8 解码、`git diff --check`、浏览器控制台与网络复核，未发现项目错误；原型仍未暂存、未提交、未替换正式 UI。

### 2026-07-15：五场景原型、开放世界 E 与纯静态部署包

- 目标：在既有 A/B/C 完整章节原型基础上增加 D「Earth Online」与 E「知识荒原」，替换机器人背景，消除按钮操作时的整屏闪动，并交付可免费部署的静态体验目录。
- 基线提交/课件版本：分支 `codex/recover-worktree-20260712`；课程仍使用 `V14-X1 扩展：微分方程直觉` 和现有 12 个只读 OpenMAIC 候选课件。本轮未修改正式学习 UI、源 `.maic.zip`、数据库或 API。
- 修改文件：原型位于被忽略的 `tmp/full-flow-prototype/`；更新 `docs/calculus-quest-ui-complete-flow-design.md`；静态导出位于被忽略的 `output/calculus-quest-five-scenes-static/`。
- 设计结果：A 改为 Calculus Quest 轨道修复站，B 为动态实验手册，C 为专注脉冲，D 独占 Earth Online 任务网络，E 为可移动角色、三个世界信标和右上知识地图的俯视开放世界。A-D 使用 NASA 极光摄影，E 使用 NASA 夜间城市摄影；来源记录在 `ASSET-CREDITS.md`。
- 交互结果：永久保留 `.prototype-app`、`.prototype-stage-host` 和同版本顶栏节点；答案与路径选择原位更新；阶段切换不再降低整舞台透明度。Playwright 断言选择答案、提交答案、E 地图选择和进入任务期间 navigation count 始终为 1，舞台 opacity 始终为 1，应用外壳与顶栏对象保持相同。
- 静态化结果：本地化 GSAP 3.13.0、KaTeX CSS/字体、`course.json`、两张背景图和 12 个课件 HTML；所有资源使用相对 URL。A/B/C/E 当前 DOM 中 `Earth Online` 为 0，D 中存在；正式 Calculus Quest 仍不是静态站。
- 验证：`node --check` 通过；B 从首页到完成页全流程通过，3 个实际选择的 iframe 正文长度分别为 397、462、473，console error 0、page error 0；12/12 个候选资源 HTTP 200。桌面 1440x900 与移动 390x844 的 A-E 首页均实际截图；移动端 `scrollWidth=390`，无页面级横向溢出，A/C/E 的底部控件边界互不重叠。
- 警告：同源 iframe 的 `allow-scripts allow-same-origin` 组合仍触发 Chromium sandbox 警告，但未产生项目错误；这是现有只读互动资源的兼容边界。静态体验不保存进度、不含登录、管理、研究事件或真实模型调用。
- 是否真实调用 LLM（provider/model）：否。
- 是否修改源 `.maic.zip`：否。
- Git 提交：未提交；原型与静态导出仍位于忽略目录，等待用户选择方向。
- 剩余风险与下一步：用户选定方案后，按正式模块边界将 E 首页、B 学习面和 C 测验逐步接入平台；生产接线必须恢复认证、事件记录、Coach 数据、子路径部署和浏览器 smoke，不能把静态原型直接替换正式服务。

### 2026-07-15：A/D 重组、五场景视觉精修与静态包重导出

- 目标：合并旧 A 的知识轨道与旧 D 的任务简报优势形成 A「轨道指挥站」，把 D 改为不使用地图隐喻的「斜率节拍场」，并精修 A-E 的背景、组件、动效、移动端和静态部署体验。
- 基线提交/课件版本：分支 `codex/recover-worktree-20260712`，HEAD 与 `origin/main` 均为 `1d4d3c4`；课程仍为 `V14-X1 扩展：微分方程直觉`，包含 3 个知识点和 12 个只读 OpenMAIC 候选。本轮未修改正式学习 UI、数据库、API 或源 `.maic.zip`。
- 修改文件：原型 `tmp/full-flow-prototype/app.js`、`styles.css`、`index.html`、`ASSET-CREDITS.md`、`DEPLOY.md` 与五张最终背景；更新 `docs/calculus-quest-ui-complete-flow-design.md`；重新生成忽略目录 `output/calculus-quest-five-scenes-static/` 和可移植 ZIP。
- 设计结果：A 现在包含 Explorer 身份、任务简报、当前任务、恢复度、遥测数据带和圆形知识轨道；D 改为 Flux Studio，三个知识点对应 RULE、SOLVE、MODEL 三条音轨，并包含 BPM、示波器、播放头、meter、armed/synced 状态和学习页 transport/dock；E 保留开放世界角色、知识信标和右上知识地图。A-E 运行时代码与 DOM 均不再包含 `Earth Online`。
- 视觉资源：A/E 使用 NASA `iss040e018989`、`iss040e091208`；B 使用 Aaron Burden，C 使用 Jeremy Bishop，D 使用 Caught In Joy 的 Unsplash 摄影。五版各自使用独立背景；旧两张重复 NASA 文件和未采用候选目录已删除，精确来源记录在静态包 `ASSET-CREDITS.md`。
- 交互与动效：版本切换、答案选择和 D 音轨选择均原位更新，不触发整页导航；D timeline 完成或中断后清理 wave/meter/playhead 的 GSAP 内联状态；运行中开启 `prefers-reduced-motion` 会终止已有 timeline/quickTo tween 并落到静态终态。E 使用 `gsap.quickTo()`、`ResizeObserver`、键盘和可长按触控方向键移动角色。
- 浏览器验证：A-E 在 1440x900 和 390x844 实机截图检查，A/D 在 320x844 的标题与页面横向溢出检查通过；五版桌面与移动端 `scrollWidth - clientWidth = 0`。D 音轨切换在 120ms 检测到播放头位移，结束后只有目标波形高亮；减弱动效下播放头 `opacity: 0`、`transform: none`、活动动画数为 0。E 最长知识点名称不再出现单字孤行。
- 完整流程验证：D 从首页依次走过前测、学生路径确认、3 个 Slide、3 次四场景自主选择、3 个真实 iframe、形成测验、后测、建议确认和完成页。每个 Slide 阶段均为 1 个 Slide、0 个场景按钮、0 个 iframe；三份已选课件正文长度为 397、626、436；完成标题为“三条变化率音轨已同步”。全程 `performance.timeOrigin` 和 navigation entry 数保持不变。
- 静态导出验证：源目录与导出目录均为 86 个文件且 SHA-256 差异为 0；20/20 个关键静态 URL 和 12/12 个课件资源返回 HTTP 200。独立静态浏览器依次切换 A-E 后背景均加载、旧品牌文案不可见、D 音轨和 E 键盘移动有效，console error/warning 均为 0。ZIP 为 86 个正斜杠条目，包含 `.nojekyll` 和五张背景，不包含候选目录或旧背景。
- 运行命令：`node --check`、严格 UTF-8 解码、JSON 解析、CSS 花括号平衡、Playwright CLI 桌面/移动/减弱动效/完整流程、静态 HTTP 全资源探测、目录 SHA-256 对比、ZipArchive 条目审计、`git diff --check`。
- 失败/警告：首次静态浏览器检查因缺少 favicon 产生 1 个 404，已用内嵌 favicon 修复并在新浏览器会话复测为 0 error。真实同源课件 iframe 仍产生 3 条 Chromium `allow-scripts allow-same-origin` sandbox 警告；这是既有只读课件兼容边界，不是本轮静态首页错误。原型仍不保存账号、进度或研究事件。
- 是否真实调用 LLM（provider/model）：否；Coach 仍为确定性原型文案。
- 是否修改源 `.maic.zip`：否；仅只读加载现有派生课件。
- Git 提交：未提交；原型与静态导出位于忽略目录，正式仓库只更新设计与研究记录。
- 剩余风险与下一步：仍需用户从 A-E 中确认生产基调；选定后应按正式模块边界接入认证、事件、Coach 数据和子路径部署，不能直接以静态原型替换 Node.js 学习平台。

### 2026-07-15：当前 19 节课提示词与 PDF 切片归档

- 目标：以当前 route 和 19 个已导入课件 manifest 为事实来源，归档每节完整生成提示词及对应 PDF 切片，避免继续依赖桌面源目录名称判断版本。
- 基线提交/课件版本：分支 `codex/recover-worktree-20260712`，HEAD `1d4d3c4c`；课程版本 `openmaic-class-20260707T100855`。
- 修改文件：在被忽略的 `resources/open-maic/prompts/` 下新增 `README.md`、`manifest.json` 和 `lessons/<模块 ID>/`；共 19 份 `complete-prompt.md`、35 份 PDF。保留原有 `10-openmaic-ready-lesson-codeblocks-v14.md`，未修改课件包、route 或 KG。
- 运行命令：PowerShell UTF-8 读取与 JSON 解析、逐课 manifest 场景标题/顺序比对、`Get-FileHash -Algorithm SHA256`、严格 UTF-8 解码、PDF `%PDF-` 文件头检查、PyPDF2 全量页数解析、`git check-ignore -v`。
- 结果：17 节提示词与实际场景标题和顺序完全一致；GH-04 使用与实际 20 场景包匹配的早期 UI-locked v14 稿，仅形成性测验标题被生成包归一化；GH-10 场景数量一致，实际包有 3 处生成或编辑后的标题微调。35/35 份 PDF 源/目标哈希一致、可解析，实际页数与文件名页码范围一致。
- 失败/警告：系统 `pdfinfo.cmd` 包装器因内部路径失效返回“找不到路径”，已改用现有 PyPDF2 独立验证。GH-06、GH-07 的原始提示词明确声明没有直接连续的 MML 切片，后来补出的两份 PDF 仅标记为 `supplemental`。新增归档受现有 `.gitignore` 的 `resources/open-maic/*` 规则保护，未强制暂存。
- 是否真实调用 LLM（provider/model）：否。
- 是否修改源 `.maic.zip`：否；只读取当前派生资源 manifest。
- Git 提交：未提交。
- 剩余风险与下一步：若后续决定把这批本地归档纳入版本控制，应单独评估 24.27 MiB PDF 的仓库策略并精确放行路径，不要使用 `git add .` 或直接解除整个 `resources/open-maic/*` 忽略规则。

### 2026-07-15：五场景交互机制重构、像素 RPG 与视觉小说

- 目标：解决 A-E 只像换色面板、课程中段交互趋同的问题，把年轻化、游戏化和新颖化落实到首页、测验、路径确认、Slide、四场景、课件、Coach 建议和完成反馈。
- 基线提交/课件版本：分支 `codex/recover-worktree-20260712`；课程仍为 `V14-X1 扩展：微分方程直觉`，3 个知识点、12 个只读 OpenMAIC 候选。本轮未修改正式学习 UI、数据库、API 或源 `.maic.zip`。
- 修改文件：原型 `tmp/full-flow-prototype/app.js`、`styles.css`、`index.html`、`ASSET-CREDITS.md`、`DEPLOY.md`；更新 `docs/calculus-quest-ui-complete-flow-design.md`；重新同步 `output/calculus-quest-five-scenes-static/` 和 ZIP。
- 设计结果：A 改为「星轨任务台」，把原 D 有价值的波形、播放头和 RULE/SOLVE/MODEL 编排合入知识轨道；B 保留高可读实验手册；C 改为「导数地牢」，把前测、路径、Slide、场景和后测分别表现为侦察战、技能装备、知识秘卷、挑战房间和迁移 Boss；D 改为「放学后函数社」，以角色对白、剧情分支、今日板书和三幕分镜贯穿完整流程；E 保留角色移动、信标接近和知识地图探索。
- 交互结果：A 信号切换原位更新波形与目标，E 方向键移动角色；C/D 从前测推进到路径和 Slide 后分别显示独有标题与语义。所有内部操作的 navigation entry 均保持 1，A 的 `.prototype-app` 节点保持稳定，console error 和 page error 均为 0。
- 浏览器验证：B 从首页走通前测、学生确认、3 个 Slide、3 次四场景选择、3 个真实 iframe、形成测验、后测、Coach 建议和完成页；三份课件正文长度为 397、462、473。A-E 在 1440x900、390x844 和 320x720 下均无页面横向溢出，版本切换器不遮挡其他交互控件；五版背景均由浏览器确认加载。`prefers-reduced-motion: reduce` 下活动动画数为 0，像素 Boss 动画时长被压到 `0.01ms`。
- 静态导出验证：源目录与导出目录均为 86 个文件，SHA-256 差异为 0；21/21 个核心 URL 与 12/12 个真实课件返回 HTTP 200。ZIP 为 86 个正斜杠条目，包含 `.nojekyll` 和五张背景，不包含账号、数据库、token 或学生数据。
- 运行命令：`node --check`、严格 UTF-8 解码、CSS 禁用模式扫描、Playwright CLI 桌面/390px/320px/完整流程/差异交互/减弱动效、静态 HTTP 全资源探测、目录 SHA-256 对比和 ZipArchive 条目审计。
- 失败/警告：真实同源课件 iframe 仍产生 Chromium `allow-scripts allow-same-origin` sandbox 警告，这是现有只读互动课件的兼容边界；原型自身无 console warning。D 当前角色头像由 CSS 原型构成，若选为正式方向，应替换为统一授权的角色资产。
- 是否真实调用 LLM（provider/model）：否；Coach 为确定性原型文案。
- 是否修改源 `.maic.zip`：否；只读加载现有派生课件。
- Git 提交：未提交；正式代码不变，原型与静态导出仍在忽略目录。
- 剩余风险与下一步：重新上传最新 ZIP 才会更新 `sample.ecnu.xyz`；用户选定生产方向后，再按正式模块边界接入认证、事件、Coach 数据和子路径部署。

### 2026-07-16：静态导出同步与最终体验包验收

- 目标：把最新 A-E 原型同步到真正可上传的静态目录，修复 ZIP 的跨平台路径格式，并在导出服务上复核完整章节、独立进度、全屏、响应式和 Coach 推荐。
- 基线提交/课件版本：工作树分支 `codex/recover-worktree-20260712`；原型课程为 `V14-X1` 扩展「微分方程直觉」，3 个知识点、12 个只读互动课件。
- 修改文件：同步 `tmp/full-flow-prototype/app.js`、`styles.css`、`index.html`、`DEPLOY.md` 到 `output/calculus-quest-five-scenes-static/`；为回归脚本增加 `CQ_BASE_URL` 环境变量；重建 `output/calculus-quest-five-scenes-static.zip`；更新本记录。
- 运行命令：`node --check`（源/导出 app.js）；严格 UTF-8 解码；源/导出逐文件 SHA-256；静态 HTTP HEAD；`tmp/playwright-complete-flow-smoke.js`、`tmp/playwright-all-variant-flow.js`、`tmp/playwright-action-audit.js`、`tmp/playwright-complete-visual.js`（`CQ_BASE_URL=http://127.0.0.1:19106`）；ZIP 条目审计。
- 结果：源目录与导出目录均为 86 个文件，逐文件差异 0；核心三文件哈希一致；ZIP 为 86 个正斜杠条目，含 `.nojekyll`、不含反斜杠；五张背景、`course.json`、GSAP/KaTeX、12/12 个课件 HTML 均 HTTP 200；A-E 首页背景均加载且无 `Earth Online` 串台。
- 交互证据：五版本均完成 3+3+3 题，三个阶段都覆盖 `EXT-01-K01/K02/K03`；形成测验后进入 `checkpoint` Coach 复核而非直接后测；后测后进入 `decision`；五版本切换后状态独立；返回文案为「返回」；Slide 和课件 iframe 全屏均为 `1440×900`；桌面、390px、320px 无页面级横向溢出；导航条目均为 1；console/page error 均为 0；减弱动效下无长时间运行动画。
- 五版本独立进度专测：同一浏览器中人为制造 A=`pre/0`、B=`pre/1`、C=`pre/2`、D=`path/3`、E=`slide/3` 五种不同状态，再逐一切回读取快照，实际值与预期完全一致，导航条目仍为 1。
- Coach 结论：推荐先按知识点匹配分，再按未体验表征奖励、已体验表征降权；形成测验掌握度低于 60% 时提升 game/mindMap/3D，高掌握时可提升 3D 迁移观察；推荐带有掌握度、课件历史和推荐理由证据，但始终由学生确认，不静默改路。
- 失败/警告：同源课件的 `allow-scripts allow-same-origin` Chromium sandbox 提示仍属于既有只读课件边界；本轮没有发现原型自身 console/page error。ZIP 首次使用 PowerShell 默认压缩产生反斜杠条目，已改用显式 `ZipArchive` 归一为正斜杠。
- 是否真实调用 LLM（provider/model）：否；Coach 为静态规则原型。
- 是否修改源 `.maic.zip`：否；只读使用现有派生课件。
- Git 提交：未提交；原型、导出目录、ZIP 和浏览器证据均在忽略目录，正式学习平台未替换。
- 剩余风险与下一步：上传时使用最新 `output/calculus-quest-five-scenes-static.zip` 或目录内容，更新原有 Cloudflare Worker `cool-waterfall-d313`，不要新建 Worker；静态包不保存账号、进度、研究事件，也不代表正式平台的服务端 Coach。

### 2026-07-16：记录/反馈页面与返回学习上下文优化

- 目标：优化学生端“记录”和“反馈”页面的信息层级；让课件反馈明确支持讲解页；从记录/反馈面板返回刚才学习的课件；在不写入真实数据库的前提下完成本地 `8765` 浏览器验证。
- 基线提交/课件版本：分支 `codex/recover-worktree-20260712`，反馈功能基线提交 `31d4719`；当前工作树保留既有恢复内容，未创建新分支、未提交本轮改动。
- 修改文件：`index.html`、`styles.css`、`app/main/core.js`、`app/main/navigation.js`、`app/main/events.js`、`app/main/progress.js`、`app/main/feedback.js`、`app/main/feedback-targets.js`、新增 `app/main/return-context.js`、`lib/feedback.js` 及对应反馈/返回回归测试。
- 运行命令：`node --check`（`server.js`、`app/main/`、`lib/`）；`node ops/test-feedback-targets.js`；`node ops/test-learning-feedback.js`；`node ops/test-return-context.js`；`node ops/test-feedback-static.js`；`node ops/test-feedback-api.js`；`npm run kg:test`；`npm run flow:test`；`npm run katex:test`；`git diff --check`。
- 结果：反馈目标新增合法 `slide` 讲解页目标，管理员接口可见讲解页标题和正文；返回上下文保存章节、课件和互动场景并恢复学习页；记录页改为摘要区、两栏主体和响应式章节/动态布局；反馈页增加先在学习页打开课件的醒目提示。临时数据库副本启动本地 `8765`，浏览器完成注册、前测、进入知识点、反馈类型切换、讲解页选择、提交反馈、管理员只读查询以及从“记录/反馈”返回原课件。`390px` 下 `scrollWidth=375px`，无页面级横向溢出。
- 数据保护：本轮服务使用 `tmp/ui-review-8765.db`，真实 `data/calculus-quest.db` 与停止本地服务前保护副本 SHA-256 均为 `4E99DC0CC286D8279B507429DAC96CF384550633494EA44F3AE6D6B1C77606BB`，长度均为 `49758208` 字节；未修改真实历史库。反馈表仍为增量 `CREATE TABLE IF NOT EXISTS`，重置学习记录不会删除反馈。
- 线上部署核查：`https://edusys3.sii.edu.cn/calculus_quest/` 当前首页没有“反馈”导航，`app/main/feedback.js` 与 `feedback-targets.js` 返回 404，说明线上仍是旧部署。LJH 登录请求到达线上接口并返回 `401`“账号或密码不正确”；当前接口不区分账号不存在和密码错误。管理地址需要独立 Token，工作区 Token 访问线上返回 `403`，因此目前不能从公网确认线上用户行或断言历史数据已丢失。
- 失败/警告：真实课件 iframe 仍产生既有 Chromium `allow-scripts allow-same-origin` sandbox 警告；本轮新增页面和接口没有 console error。`git diff --check` 仅报告工作树现有 LF/CRLF 转换提示，没有空白错误。
- 是否真实调用 LLM（provider/model）：否；反馈和返回逻辑均为确定性代码。
- 是否修改源 `.maic.zip`：否；只读使用当前派生课件。
- Git 提交：未提交、未暂存；按用户要求先完成本地 `8765` 验证，再决定是否提交 GitHub。
- 剩余风险与下一步：线上发布仍需在实际服务器确认部署目录、`DB_PATH`、运行进程和管理员 Token；发布前必须先备份数据库、停止旧 Node 进程、用临时副本做迁移/回归、再原子替换代码并重启单一服务。后续应继续保持稳定 `participant.id`、只做向前兼容迁移、禁止多进程同时写同一 sql.js 数据库，并为每次发布保留行数/哈希/恢复演练证据。

### 2026-07-16：记录/反馈/管理员科研面板二次优化与生产数据门控

- 目标：继续修复管理员反馈正文重复和课程内部编号泄露；消除“记录”“反馈”和管理员用户详情中的大块无效留白；集中展示已有科研证据并补采发布版本、实验条件、学习会话与设备环境；把历史数据库保护从人工约定提升为生产启动门控和可执行发布检查。
- 基线提交/课件版本：分支 `codex/recover-worktree-20260712`，HEAD `31d4719`；课程版本 `openmaic-class-20260707T100855`。当前工作树仍混有既有恢复、资源清理、提示词和研究文档，本轮没有回退、暂存或提交其他改动。
- 主要修改：学生端记录页改为独立左右列，左列连续放置章节进度与最近动态，右列展示测验；反馈页改为上下文说明/表单双栏，并保留讲解页及四类互动课件目标。管理员新增 `admin/presentation.js` 统一隐藏 `V14-C*`、`GH-*` 等课程 ID；反馈正文改为单次完整渲染，不再用相同文本同时充当折叠标题和正文；全局反馈不再伪装成具体学习位置；用户列表增加活跃天数、行为、反馈和 Coach 决策，用户详情增加 6 项研究指标、最近行为和学生反馈。
- 科研采集：新交互事件携带 `APP_VERSION`、课程版本、`EXPERIMENT_ID`、`EXPERIMENT_CONDITION`、`EXPERIMENT_COHORT`；每个浏览器会话新增 `session_start/session_end`，记录设备类型、视口、屏幕、像素比、语言、时区、触控、减弱动效、网络类型和来源域名，不记录密码、输入正文或完整浏览器指纹。管理员可汇总会话数、活跃天数、估算在线时长、模块停留、课件动作、反馈和 Coach 决策。
- 数据保护代码：生产 `NODE_ENV=production` 时必须显式配置仓库外绝对 `DB_PATH`，否则拒绝启动；数据库旁 `.lock` 记录 PID 并阻止第二个 Node 写进程，陈旧锁可在进程不存在时自动清理；新增管理员 Token 保护的 `POST /api/admin/shutdown`，先同步保存数据库，再关闭服务并释放锁，避免把 Windows `Stop-Process` 当作正常发布手段。新增 `ops/database-release-check.js`，输出 SHA-256、字节数和 `users/sessions/quiz_results/events/snapshots/feedback/agent_decisions/interaction_evidence_snapshots` 行数，可比较发布前报告并拒绝行数下降；发布步骤见 `docs/production-release.md`。
- 自动验证：全量 `node --check`（`server.js`、`app/main/`、`lib/`、`admin/`）；严格 UTF-8 解码；`test-admin-presentation`、反馈目标/数据库/静态/API、返回上下文、部署安全测试；`npm run kg:test`、`flow:test`、`katex:test`；`git diff --check`。KG 仍为 11 章、105 单元、430 边、288 资源；Flow 11 章/288 资源；KaTeX `0.17.0`。
- 浏览器验证：系统 Edge Headless + CDP，临时服务 `http://127.0.0.1:8876/`，数据库 `tmp/research-ui-8876/ui-review.db`。真实完成注册、进入“输入、输出和函数规则”、选中讲解页、提交反馈、管理员查询、用户详情以及桌面/390px 记录与反馈页。最终断言：讲解页目标数 1；最新反馈正文出现 1 次；学生反馈、学生记录、管理员反馈、管理员用户详情均不含课程内部编号；桌面和手机均无页面横向溢出；用户详情显示 6 项研究指标，最近行为可读到注册、会话设备、章节、知识点、课件、反馈和返回路径。
- 发布检查验证：把临时数据库复制到仓库外 `%TEMP%`，生成报告 SHA-256 `0A0FBD547B42B79AA4AE74E5A91E5886A9F034014F94E18C2DDFD5E7188966FF`，随后以 `--compare --expect-unchanged` 复核通过；真实 `data/calculus-quest.db` 未用于本轮服务或浏览器测试。
- 失败/警告：Playwright CLI 临时下载因安全审查拒绝，改用系统 Edge CDP，不安装第三方依赖。浏览器仅见既有课件 `allow-scripts allow-same-origin`、`allowfullscreen` 优先级、Edge 密码表单建议和 Chart.js 跟踪保护警告；没有项目 JavaScript exception。`git diff --check` 只有现有 LF/CRLF 转换提示。旧历史事件不会自动补出实验标签或设备环境；在线时长仍是事件估算，不是实验室级计时。
- 是否真实调用 LLM（provider/model）：否；本地 `LLM_PROVIDER=mock`，展示与统计均为确定性代码。
- 是否修改源 `.maic.zip`：否；只读使用当前派生课件。
- Git 提交：未提交、未暂存、未推送；本地 `8876` 由前台浏览器测试编排器按需启动，验证结束后自动停止。
- 剩余风险与下一步：实际服务器必须按 `docs/production-release.md` 完成一次性数据库外置、`.env` 研究标签和服务管理配置，再执行停止服务、报告/备份、`git pull --ff-only`、`npm ci`、启动前测试、健康检查、浏览器 smoke 和发布后行数复核。正式科研仍需补充知情同意版本、随机/准随机分配记录、保留率窗口、效应量和人工复核一致性；这些不能由当前行为日志自动推断。

### 2026-07-16：登录状态细分、管理员全表排序与线上旧账号诊断

- 目标：区分账号不存在、旧账号无密码和密码错误；让管理员全部可分析表格支持排序；消除空图表/空表的固定高度留白；将智能教练证据链中的英文枚举翻译为可直接分析的中文；核对本地 `8765` 与线上 `LJH` 登录失败原因。
- 基线提交/课件版本：分支 `codex/recover-worktree-20260712`，HEAD `31d4719`；课程版本仍为 `openmaic-class-20260707T100855`。工作树包含既有恢复与清理内容，本轮未回退、暂存、提交或推送。
- 认证修改：`POST /api/auth/login` 现在分别返回 `404 account_not_found`、`409 password_not_set` 和 `401 password_incorrect`。旧昵称账号的提示明确要求在“注册”页使用同一昵称设置密码，并说明历史学习记录会保留。新增 `ops/test-auth-login.js`，覆盖不存在账号、无密码旧账号、错误密码和正确密码四条真实 HTTP 流程。
- 管理员修改：新增通用 DOM 表格排序层，对 15 张管理员数据表中的可分析列自动提供鼠标/键盘升降序；保留“操作”列不可排序，并保留模块参与度原有数据级排序。浏览器实际检测到 89 个可排序表头，未发现漏接列。图表改为保留 canvas 的动态空状态，按数据量计算 112–680px 高度；空表压缩到 72px，有数据且超过 10 行时再启用局部滚动。用户详情的空章节表、热图、题型、前后测、学习增益、分时活动和交互图均有明确中文空状态。
- 证据链修改：网页将 `high/medium/low`、`alternate_scene/remediate/continue/extend/skip`、Planner reasons 和 QA 状态翻译为风险等级、学习动作、排序依据和质量检查中文标签；交互证据改为可扫描标签。CSV 同步使用中文列名与中文枚举，原始值仍保留在数据库中。
- 线上诊断：公网管理接口中存在昵称为 `LJH` 的用户，创建时间为 `2026-07-09T15:49:39.972+08:00`，最近活动为 `2026-07-09T17:06:52.836+08:00`，并有历史快照。管理导出的 `loginMode` 为 `nickname`，说明该用户是旧版无密码账号；用记忆中的密码登录返回 401，并不代表用户行或学习数据已被删除。当前线上静态资源和健康响应仍是旧部署，尚未获得本轮认证提示、数据库外置门控和管理员优化。
- 本地端口诊断：`8765` 由旧 Windows PowerShell 5.1 父进程启动，命令显式设置 `DB_PATH=tmp/ui-review-8765.db`；接口的 7 用户、109 测验、9352 事件与该临时库匹配，不是正式 `data/calculus-quest.db`。当前进程实时读取到新版静态文件，但后端仍是启动时载入的旧代码。Codex 桌面策略允许 PowerShell 7 普通命令与前台测试编排，但拒绝 `Start-Process` 创建持久后台服务，因此本轮保留旧 `8765`，避免停止后无法自动恢复；完整同步需要在可见终端按同一临时 `DB_PATH` 重启。
- 浏览器验证：前台 Node 编排器同时启动临时 `8876` 和系统 Edge CDP，验证后自动停止。桌面与 390px 手机无页面横向溢出；反馈正文出现 1 次；89 个表头排序可用；用户昵称升序/降序切换正确；证据链不含 `high/alternate_scene/remediate/continue/reasons/pass/check/planner` 英文枚举；空图表最大高度 112px，空表最大高度 72px。截图位于 `output/ui-review/`。
- 自动验证：全量 `node --check`（`server.js`、`app/main/`、`lib/`、`admin/`、`ops/`）；`test-auth-login`、`test-admin-presentation`、反馈静态/目标/数据库/API、返回上下文、部署安全；严格 UTF-8；`npm run kg:test`、`flow:test`、`katex:test`；`git diff --check`。KG 为 11 章、105 单元、430 边、288 资源；Flow 为 11 章、288 资源；KaTeX 为 0.17.0。
- 失败/警告：PowerShell 7 `7.6.3` 可正常运行；此前失败不是安装损坏，而是后台 `Start-Process` 命令被桌面安全策略拒绝。浏览器仍有既有 iframe sandbox、`allowfullscreen`、密码表单建议和 Chart.js 跟踪保护警告，没有项目 JavaScript exception。`git diff --check` 仅有 LF/CRLF 转换提示。
- 是否真实调用 LLM（provider/model）：本轮功能与测试均未调用真实 LLM；浏览器临时服务使用 `LLM_PROVIDER=mock`。
- 是否修改源 `.maic.zip`：否；只读使用当前派生课件。
- Git 提交：未提交、未暂存、未推送。
- 剩余风险与下一步：在可见 PowerShell 7 终端使用 `tmp/ui-review-8765.db` 重启本地 `8765` 后，重新请求 `/api/health`，应看到 `appVersion`，并复测三类登录提示。线上需要先按 `docs/production-release.md` 外置固定 `DB_PATH`、备份并核对行数，再拉取代码、测试和重启；`LJH` 应使用同一昵称完成密码升级，而不是新建不同昵称账号。

### 2026-07-16：反馈默认课件、导航精简与线上数据库位置核对

- 目标：移除反馈对象中的“全部课件”；让“课件反馈”成为反馈页首项和默认类型；交换顶部“反馈/记录”顺序；移除个人面板内重复的“记录”入口；验证并重启本地 `8765`；判断公网数据库位于本机还是服务器。
- 修改文件：`index.html` 调整主导航、个人菜单、反馈类型顺序、反馈说明和资源缓存版本；`app/main/feedback-targets.js` 删除全局课件候选；`app/main/feedback.js` 默认使用 `courseware`，无具体课件时显示引导并阻止课件反馈提交；`styles.css` 增加具体课件缺失状态；更新反馈目标与静态回归测试。
- 行为结果：反馈对象只包含具体讲解页和互动课件；未打开知识课件时返回空候选，并提示先到学习页打开具体课件。反馈类型顺序为课件反馈、学习内容、平台功能、其他建议，默认选中课件反馈。顶部主导航顺序为首页、学习、反馈、记录；个人面板只保留账号信息、重置和退出。
- 浏览器验证：系统 Edge CDP + 临时 `8876` 前台编排。断言 `feedbackDefaultType=courseware`、`feedbackHasAllCourseware=false`、主导航顺序 `home/learn/feedback/progress`、个人面板不存在 `progress` 入口；讲解页目标数 1；桌面和 390px 手机无页面横向溢出；反馈提交和管理员查询仍通过。
- 自动验证：全量 `node --check`；反馈目标/静态/数据库/API、返回上下文、认证、管理员展示和部署安全测试；`npm run kg:test`、`flow:test`、`katex:test`；严格 UTF-8；`git diff --check`。KG 仍为 11 章、105 单元、430 边、288 资源，Flow 为 288 资源，KaTeX 为 0.17.0。
- `8765` 数据保护：当前 PID `6092` 仍由旧 Windows PowerShell 5.1 父进程运行，显式使用 `tmp/ui-review-8765.db`。重启前保护副本为 `tmp/ui-review-8765.before-feedback-nav-20260716.db`，大小 `53673984` 字节，SHA-256 `3654E9EB085D148C6614E4D17A020DA6175B909BCC6E734603BC6CF83CA89E4A`，与源库完全一致。新版前端静态文件已被旧进程实时读取；Node 后端仍需重启。
- 重启限制：使用 `Start-Process -WindowStyle Hidden` 在独立 `8877` 做安全启动探针时，被 Codex 桌面持久后台进程策略在执行前拒绝；没有停止 `8765`，也没有使用批处理、替代 Shell 或间接进程创建绕过策略。需要用户在可见 PowerShell 7 终端以前台方式重启，之后再由 Codex复核健康版本与登录接口。
- 线上数据库结论：`edusys3.sii.edu.cn` 指向远程站点 `site.sii.edu.cn` / `59.78.86.22`；公网健康接口与本机 `8765` 为独立响应，公网首页仍未包含本轮 `20260716-feedback-navigation-v5` 资源，而本机已包含。因此公网应用和数据库运行在远程服务器环境，不依赖本机 `D:\Projects\calculus-quest` 数据库。若部署中使用 `127.0.0.1:3789`，该地址表示远程服务器自身回环接口。具体生产数据库绝对路径仍需在服务器读取 `DB_PATH` 确认。
- 失败/警告：浏览器仅有既有 iframe sandbox、`allowfullscreen`、密码表单建议和 Chart.js 跟踪保护警告，没有项目 JavaScript exception。`git diff --check` 只有 LF/CRLF 转换提示。
- 是否真实调用 LLM（provider/model）：否；临时浏览器服务使用 `LLM_PROVIDER=mock`。
- 是否修改源 `.maic.zip`：否；只读使用当前派生课件。
- Git 提交：未提交、未暂存、未推送。
- 剩余风险与下一步：用户在可见 PowerShell 7 终端以同一 `tmp/ui-review-8765.db` 启动新版 `server.js` 后，应检查 `/api/health` 包含 `appVersion`，并确认不存在第二个写进程。线上发布仍需服务器管理员固定仓库外 `DB_PATH`、备份、拉取、测试和重启。

### 2026-07-18：线上学习记录消失与重置后回流诊断

- 目标：解释公网学习平台中“隔一段时间进入后学习记录消失，但点击重置后旧记录又出现”的现象，判断是否为数据删除、账号切换或快照同步缺陷。
- 线上核对：匿名读取 `https://edusys3.sii.edu.cn/calculus_quest/`、健康接口及 `app/main/core.js`、`app/main/bootstrap.js`；公网 `core.js` 与 `origin/main` Git blob `44aa8101a52139d3f7f4b9e46e899b2ed977c546` 完全一致，`bootstrap.js` 与 `origin/main` Git blob `e09e48d6895a00e9ad7d21774bd93c71c0256f74` 完全一致，健康响应仍不含 `appVersion`，确认线上运行旧主线逻辑。
- 根因机制：客户端快照没有单调 revision、写入序列、重置 generation 或进行中的请求取消。服务端收到任意合法 Token 的快照后直接插入，并仅按服务器接收时间 `created_at DESC` 选择最新快照，不比较快照原始 `capturedAt`。重置只取消尚未触发的 900ms 定时器，无法取消已经发出的快照请求，也无法阻止旧标签页或旧浏览器状态在重置后继续写入。
- 确定性复现：使用临时端口、临时账号和 `%TEMP%` 临时数据库启动当前同逻辑服务，依次写入有历史记录快照、晚到空快照、执行重置、再模拟重置前旧快照晚到。断言结果为：晚到空快照后 `completed=[]`、`quizResults=[]`；重置后仍为空；旧快照在重置后到达时，原 `completed`、`quizResults` 和日志重新成为最新快照。复现成功后停止临时服务并删除临时数据库。
- 结论：这是快照乱序覆盖 Bug，不是按时间自动清理数据。空或旧快照谁最后到达，谁就成为当前学习状态，因此会出现记录消失、随后又回流。点击“重置”不是恢复操作；它本应清空 `quiz_results` 和 `snapshots`，在没有晚到旧快照时会造成真实删除，不能作为恢复手段。
- 生产确认方式：对受影响用户按时间检查 `snapshots.reason`、`snapshots.created_at` 和 `data` 内客户端时间；若 `reset` 后又出现携带旧完成项的 `state_change`、`login` 或其他快照，即可确认该用户走了同一竞态。检查前先备份生产数据库，不注册新账号、不点击重置、不手工改库。
- 修复方向：服务器为每个用户维护单调 revision 和 reset generation，拒绝旧 revision/旧 generation 写入；客户端启动时先完成服务器恢复再允许上传，所有快照写入串行化并可取消；重置等待或取消进行中的保存，并让重置后的服务端 generation 成为后续写入门槛。
- 是否修改运行代码：否；本轮只完成匿名线上核对、本地临时数据库复现和诊断记录。
- 是否真实调用 LLM（provider/model）：否。
- 是否修改源 `.maic.zip`：否。
- Git 提交：未提交、未暂存、未推送。

### 2026-07-18：学习快照版本化、管理员全量导出与交互记录智能化

- 目标：修复“隔一段时间进入后学习记录消失、重置后旧记录又出现”的快照竞态；让管理员反馈、简答题、智能教练证据链和交互记录支持全部导出；优化管理员宽屏/移动端排版；把交互记录改为中文学习位置、关键行为和行为摘要，并默认折叠低价值技术事件；确保 `/calculus_quest/` 子路径和浏览器缓存版本可直接发布。
- 基线提交/课件版本：分支 `codex/recover-worktree-20260712`，开始时 HEAD `31d4719`，相对 `origin/main` 领先 7 个已提交的反馈功能提交；课程版本 `openmaic-class-20260707T100855`。工作树另有 V14/KG、旧资源清理、KaTeX、提示词和原型文档改动，本轮不把这些未确认内容混入发布提交。
- 学习记录修复：数据库为每个用户维护单调 `generation/revision`；同代快照按字段合并并拒绝旧代写入；重置在事务中清理学习数据、提升 generation 并写入权威空快照。客户端启动时先水合服务器状态再允许上传，快照串行保存，账号切换和退出前等待保存完成。服务器已有空重置快照时也覆盖旧本地缓存，只在服务器从未保存过快照时迁移旧版纯本地记录。
- 管理员导出：反馈、简答题、交互记录和智能教练证据链接口统一返回 `rows/total/limit/offset`，排序使用 `created_at DESC, id DESC`；管理员以每页 1000 条循环拉取全部数据。交互记录保留当前页导出并新增全部导出，其他三类直接导出全部；CSV 使用 UTF-8 BOM、中文列名和公式注入防护。
- 交互智能化：新增共享 `lib/interaction-policy.js`，默认隐藏心跳、可见性、重复渲染、通用键盘/滚轮、指针按下/松开、拖动过程和重复离开等低价值记录；原始记录不删除，可切换查看和导出。导航不再重复写 `click/ui_click`，参数连续变化只保留本地证据、提交时持久化，不再同时写 `time_on_unit/unit_leave`。管理员把 `GH-01-K01`、`V14-C1-post` 和题型枚举转换为直观中文，表格使用“学习位置、关键行为、行为摘要”三列。
- 管理员排版：总览和学习效果使用明确两列，题目分析使用主辅两列，活跃趋势和交互追踪主体改为全宽布局；交互类型分布、课件动作覆盖、有效学习路径顺序排列，消除宽屏半列空洞；移动端指标自动单列，页签和宽表只在各自容器内滚动。资源缓存版本提升为学习端 `20260718-release-v2`、管理员端 `20260718-admin-quality-v2`。
- 浏览器额外发现与修复：真实退出/重新登录流程发现旧行为请求会在令牌撤销后返回 401。现改为批量交互绑定产生它的账号令牌，单条事件跟踪进行中的请求，退出先排空两类上报和快照再撤销会话；干净浏览器等待超过 5 秒后为 0 error。管理员真实数据还发现 `chapterName("V14-C1")` 自递归导致交互表、模块参与度和证据链堆栈溢出，已改为只在标准化 ID 发生变化时递归。
- 子路径与缓存：`BASE_PATH` 规范化为无尾斜杠形式，按完整路径边界匹配，`/calculus_quest` 自动重定向到 `/calculus_quest/`，健康接口返回实际 `basePath`。生产文档推荐 Nginx 保留前缀并使用不带尾斜杠的 `proxy_pass`；所有停机、健康和 smoke 命令使用 `/calculus_quest/`。
- 真实浏览器验证：临时服务 `http://127.0.0.1:8876/calculus_quest/`，隔离数据库 `tmp/browser-smoke-20260718/calculus-quest-smoke.db`，`LLM_PROVIDER=mock`。测试账号完成 10 题前测并选择知识点后，刷新和退出再登录均恢复 `completed=1`、`quizResults=10`、当前单元 `GH-01-K01`。重置后为 0/0；再故意注入旧本地缓存的 1/10 并刷新，服务器权威空快照把运行时和本地缓存都恢复为 0/0。管理员关键行为表完整渲染且可见文本不含 `GH-*`/`V14-*`；原始模式正确分页；全部导出下载为 UTF-8 BOM 中文 CSV，导出时按最新总量跨页读取。
- 视觉验证：管理员 1920×1080 检查总览、题目分析、学习效果、活跃趋势和交互追踪；390×844 全新移动会话页面 `scrollWidth=clientWidth=375`，顶栏、页签、指标卡和表格无互相遮挡。交互追踪全宽调整后前三块宽度均为 1857px，不再出现旧版右侧大块空白。
- 自动验证：`node --check` 覆盖 `server.js`、`app/main/`、`admin/` 和 `lib/`；严格 UTF-8 解码；15 个 `ops/test-*.js` 全部通过，包括认证、反馈 API/目标/静态/数据库、返回上下文、管理员展示/全部导出、交互质量、学习快照版本、部署安全、子路径、KG、Flow Test 和 KaTeX。`git diff --check` 无空白错误。数据库安全停机后两次发布检查 SHA-256 一致，受保护表没有丢行。
- 失败/警告：从 1920px 动态缩小既有 Chart.js 实例时短暂保留桌面画布宽度；全新 390px 首次加载无页面溢出，因此不属于真实手机首载问题。互动课件仍有 Chromium 对 `allow-scripts allow-same-origin` 和 `allowfullscreen` 的既有警告；主应用与管理员面板最终干净会话均为 0 个项目错误。未访问、修改或迁移真实生产数据库。
- 是否真实调用 LLM（provider/model）：否；浏览器服务使用 `LLM_PROVIDER=mock`。
- 是否修改源 `.maic.zip`：否；只读使用当前派生课件。
- Git 提交：本条与本次修复一起提交；最终提交号见 Git 历史。
- 剩余风险与下一步：推送 GitHub 不会自动更新 `https://edusys3.sii.edu.cn/calculus_quest/`。服务器管理员仍需按 `docs/production-release.md` 备份和检查外置 `DB_PATH`、安全停止旧进程、`git pull --ff-only origin main`、`npm ci`、运行发布测试、注入 `BASE_PATH=/calculus_quest`、启动单一 Node 进程并完成真实历史账号 smoke。生产 smoke 禁止点击真实用户的重置。

### 2026-07-18：四场景自主选择与管理员语义化收尾验证

- 目标：补齐知识点四互动场景的学生自主选择；复核管理员有效路径、交互记录和智能教练证据链不泄露内部编号；进一步折叠重复技术事件；修正所有答题记录都显示为“第 1 题”的展示错误；完成最终缓存、移动端和提交前验证。
- 基线提交/课件版本：分支 `codex/recover-worktree-20260712`，HEAD `31d4719`；课程版本 `openmaic-class-20260707T100855`。工作树仍包含 V14/KG、KaTeX、课件资源清理、提示词和原型文档等其他改动，本次继续明确排除。
- 学生端修改：首次进入知识点只加载讲解页，不再静默选择“交互模拟”；四个场景改为“动手调一调、找错并改正、知识怎么连、换个角度看”四个等权按钮。学生未明确选择时不创建互动 iframe，顶部和底部完成按钮同时禁用；选择后才加载对应课件并恢复完成操作。场景切换会分段记录停留时间，并携带知识点、场景中文名和课件标题。
- 管理员语义化：有效学习路径显示“输入、输出和函数规则 · 找错并改正”等知识点/场景组合；历史无场景记录显示“互动场景未选择”，不猜测默认值。智能教练动作 `select_knowledge` 等统一翻译为中文，学生选择的目标改为真实知识点，不再误用按钮文案。`agentic_decision_executed` 显示为“落实智能教练选择”，不再出现“未分类事件”。
- 交互降噪与答题摘要：默认关键行为进一步折叠通用 `click`、底层 `ui_change` 和每五分钟 `online_period`；原始事件仍可切换查看并全部导出。管理员从 V14 路线建立题目索引，旧答题记录也能显示“所属模块 · 前测第 N 题「题干摘要」”；新事件同时写入题号、阶段、模块、题干和知识点范围。
- 子路径与缓存：学生端缓存版本最终为 `20260718-release-v4`，管理员脚本为 `20260718-admin-quality-v4`，交互策略为 `20260718-interaction-quality-v2`。本地服务以 `BASE_PATH=/calculus_quest` 启动，前缀健康接口返回 `ok=true` 和 `basePath=/calculus_quest`。
- 浏览器验证：临时服务 `http://127.0.0.1:8877/calculus_quest/`，隔离数据库 `tmp/ui-verify.db`，`LLM_PROVIDER=mock`。首次未选场景时 `selectedAfter=""`、上下完成按钮均禁用、互动 iframe 为 0；手机端 `scrollWidth=clientWidth=375`。选择“知识怎么连”后 iframe 正常加载，管理员最新记录显示对应知识点与场景。
- 管理员最终结果：默认关键行为由 85 条原始记录压缩为 33 条，折叠 52 条低价值记录；高频行为依次为选择答案、模块停留、实验打开和选择互动场景。桌面 `1440×1000` 与手机 `390×844` 均无页面级横向溢出；可见文本不含 `GH-*`、`EXT-*`、`V14-*`、`select_knowledge` 或“未分类事件”。有效路径、证据链和十道不同前测题均使用中文语义。
- 自动验证：按文件名顺序执行全部 16 个 `ops/test-*.js`，全部通过；`node --check` 覆盖 56 个 `server/app/main/admin/lib/ops` JavaScript 文件；42 个拟提交文本文件通过严格 UTF-8 解码且无替换字符；`git diff --check` 无空白错误，仅有 Windows LF/CRLF 提示。
- 失败/警告：浏览器仍有互动课件既有的 iframe sandbox/`allowfullscreen` 警告，没有项目 JavaScript error。测试服务只读写隔离数据库，未访问、修改或迁移真实生产数据库。
- 是否真实调用 LLM（provider/model）：否；使用 `LLM_PROVIDER=mock`。
- 是否修改源 `.maic.zip`：否；只读使用当前派生课件。
- Git 提交：与本次修复一起精确暂存并提交，最终提交号见 Git 历史。
- 剩余风险与下一步：GitHub 推送后仍需服务器管理员按 `docs/production-release.md` 在生产机备份并检查仓库外 `DB_PATH`，执行 `git pull --ff-only origin main`、`npm ci`、发布测试和单进程重启，再验证 `/calculus_quest/` 首页、登录、管理端、测验、四场景 iframe 和历史账号恢复。禁止用真实学生账号点击重置做 smoke。

### 2026-07-19：旧库迁移兼容、管理员真实数据清理与本地根路径复核

- 目标：修复已有数据库在快照版本化升级时缺少 `generation` 列导致的启动顺序问题；用现有真实数据复核管理员中文语义、有效学习路径和用户详情；让本地开发继续使用 `http://127.0.0.1:8765/` 根路径，同时保留生产 `/calculus_quest/` 子路径能力。
- 数据保护与迁移：迁移前备份本地数据库到 `tmp/calculus-quest-pre-generation-migration-20260718-223934.db`；升级后数据库仍有 651 条快照，历史记录未被清空。旧库兼容测试覆盖“先补列、再创建依赖索引”的启动顺序，避免已有数据库因缺列而无法启动。另以该升级前备份的独立副本重跑真实迁移，6 个用户、26 个会话、99 条测验、8745 条事件、651 条快照、19 条 Agent 决策和 63 条证据快照均零减行。
- 管理员真实数据复核：有效学习路径会从同一学生、会话和知识点的场景选择事件回填场景；48 条旧停留记录中 45 条可可靠回填，其余明确显示“历史记录未包含场景”，不猜测默认值。默认关键行为从 7871 条原始记录压缩为 1602 条，折叠 6269 条滚动、页面切换和底层控件噪声。
- 展示与安全修复：用户详情不再显示滚动、页面切换、“未分类事件”、内部知识点编号或“未知模块”；登录和注册的旧/新双写事件按 10 秒窗口合并，且去重键忽略新事件附带的当前知识点，避免同一分钟出现两条“学生登录成功”。代码审查还修复了热图、前后测表和活动表中学生昵称未转义导致的管理员端存储型 XSS 风险。管理员缓存版本提升为 `admin-quality-v6`。
- 浏览器验证：管理员总览、交互追踪和用户详情在桌面 `1440×1000` 下无页面级横向溢出，可见内部代码为 0；交互明细中的页面切换为 0；有效路径显示“输入、输出和函数规则 · 动手调一调”等具体知识点场景。本轮按用户要求主要聚焦桌面端，移动端只保留基本不溢出的发布门槛。
- 数据库写盘与旧导入入口：延迟保存和停机 `saveNow()` 统一改为临时文件写完后原子替换，避免停机写盘直接覆盖数据库；移除可绕过代际机制直接删快照/测验的未使用公共函数。早期 `migrate.js` 不再先清空五张历史表，改为默认拒绝、显式确认、目标库自动备份、单写锁、事务内非破坏性合并，并增加已有记录保留测试。
- 依赖安全：独立暂存快照的 `npm audit` 发现 KaTeX `0.16.9` 存在 1 个中危安全项；只提取并纳入 `0.17.0` 包/锁文件、浏览器 JS/CSS、缓存版本和专用回归测试，不混入同一工作树中的 KG/Flow 脚本。升级后的工作树 `npm audit --omit=dev` 为 0 个漏洞。
- 本地运行：开发服务使用 `PORT=8765`、空 `BASE_PATH`，入口为 `http://127.0.0.1:8765/`；生产仍通过 `BASE_PATH=/calculus_quest` 和 Nginx 子路径访问，两种模式由同一套路径回归测试覆盖。2026-07-19 重启前备份 `data/calculus-quest.before-local-restart-20260719-082605.db` 与重启后运行库 SHA-256 均为 `8DB0ED678BBE5B15538743457789FB94B53BA92EDE1FF9A01F8ABB40C3516704`，受保护表行数完全一致。
- 自动验证：登录双写真实 payload 回归测试先稳定复现 `2 !== 1`，修复后通过；管理员未转义静态回归和数据库原子保存测试均先失败后通过；`ops/test-migrate-safety.js` 验证未确认导入不改库，确认导入会先备份并同时保留已有与导入记录。最终独立 Git 索引快照包含 49 个拟提交路径，15 项功能/安全测试全部通过，56 个 JavaScript 文件通过语法检查，499 个 Git 跟踪文本文件通过严格 UTF-8 检查，`git diff --cached --check` 通过，`npm audit --omit=dev` 为 0 个漏洞；同一快照对升级前数据库副本迁移后所有受保护表零减行。
- 失败/警告：未访问、修改或迁移真实生产数据库；所有迁移演练只在本地备份副本上执行。本地备份和测试数据库位于被忽略目录，不得提交。推送 GitHub 不会自动完成生产拉取与重启。
- 是否真实调用 LLM（provider/model）：否。
- 是否修改源 `.maic.zip`：否；只读使用当前派生课件。
- Git 提交：与学习快照、反馈、管理员导出和四场景选择修复一起提交，最终提交号见 Git 历史。
- 剩余风险与下一步：完成最新暂存快照全量验证和提交范围审计后推送；服务器管理员仍需按 `docs/production-release.md` 在生产机备份数据库、快进拉取、安装锁定依赖、运行门控、以 `BASE_PATH=/calculus_quest` 单进程重启并执行历史账号 smoke。

### 2026-07-19：无尾斜杠子路径资源前缀加固

- 目标：修复访问 `https://edusys3.sii.edu.cn/calculus_quest` 时，浏览器在 301 跳转提交前可能把相对 CSS/JS 解析为站点根路径 `/app/...`、`/styles.css` 的竞态，避免页面退化为无样式 HTML。
- 线上取证：公网首页字节长度为 `16604`，Git blob 为 `8c647fe9b371ab0c645e026ee82087da7fecea03`，与提交 `1d4d3c4` 的 `index.html` 完全一致；公网无尾斜杠入口当前返回 `301 Location: /calculus_quest/`，健康接口仍只返回 `ok/time`。远端 `origin/main` 在修复前为 `9972f7c`。
- 根因：旧启动脚本先调用 `location.replace()` 并立即返回，尚未给文档安装 `<base>`、设置 `window.__BASE_PATH__` 或包装 `/api/` 请求。浏览器可在导航完成前继续解析后续相对资源，因此截图中出现 `/app/main/*.js` 404；这不是课程数据或数据库问题。
- 修改：`index.html` 根据规范化后的路径同步安装同源 `<base href="/calculus_quest/">`，并在跳转前设置 API 前缀；`ops/test-subpath-deployment.js` 新增 `/`、`/calculus_quest`、`/calculus_quest/`、`/calculus_quest/index.html` 四种入口的启动脚本回归，断言资源路径和 API 前缀只应用一次。
- 自动验证：从 Git 索引导出不含本地未提交 V14 的纯净快照，15 个已跟踪 `ops/test-*.js` 全部通过；51 个 JavaScript 文件通过 `node --check`；暂存文件通过严格 UTF-8；`npm audit --omit=dev` 为 0；`git diff --cached --check` 无空白错误。
- 浏览器验证：隔离临时数据库和随机端口、`BASE_PATH=/calculus_quest`、`LLM_PROVIDER=mock`。Chromium 从无尾斜杠入口进入后，301、首页、CSS、KaTeX、17 个学习端脚本、课程 API 和图片均从 `/calculus_quest/...` 返回 200；控制台 0 error，`document.baseURI` 为 `/calculus_quest/`，页面样式正常。
- 数据保护：未重启本地 `8765`，其 PID 仍为 `28324`、`basePath=""`、`appVersion="4cb9dbb"`；本地数据库仍为 6 用户、27 会话、99 条测验、8816 条事件、657 条快照、19 条 Agent 决策和 63 条交互证据快照，没有减行。未访问或修改生产数据库。
- 是否真实调用 LLM（provider/model）：否；浏览器隔离服务使用 `LLM_PROVIDER=mock`。
- 是否修改源 `.maic.zip`：否。
- Git 提交：本条与前缀修复一起精确提交，最终提交号见 Git 历史。
- 剩余风险与下一步：GitHub 推送不会自动更新公网服务；服务器管理员仍需备份外置数据库、快进拉取、运行发布门控并以 `BASE_PATH=/calculus_quest` 重启。生产 smoke 应访问无尾斜杠和带尾斜杠两个入口，但不得用真实学生账号点击重置。

## 11. 后续记录模板

每次工作完成后追加：

```markdown
### YYYY-MM-DD：工作标题

- 目标：
- 基线提交/课件版本：
- 修改文件：
- 运行命令：
- 结果：
- 失败/警告：
- 是否真实调用 LLM（provider/model）：
- 是否修改源 `.maic.zip`：
- Git 提交：
- 剩余风险与下一步：
```

这份记录应持续区分“实现”“验证”“部署”和“科研结论”。一次浏览器通过不是学习效果证据，一次 LLM 判断也不是内容正确性的最终证明。
