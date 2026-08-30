# Calculus Quest V14-C3 完整主动 Agent 策略设计

> 状态：Phase 1-2 纵向支架闭环、代次隔离 Harness 与小范围实验蓝图 v8
> 核实日期：2026-08-30
> 实验分支：`proactive_test`
> 实验对象：Calculus Quest 网站完整章 `V14-C3`，不是单个 OpenMAIC 课件包

## 0. 执行结论

### 0.1 十六维是否太大

十六维作为**设计、治理和报告本体**并不太大，因为主动教学 Agent 的风险恰恰来自遗漏维度：只做触发器会忽略教学动作，只做个性化会忽略权限，只看即时正确率会忽略撤除 Agent 后的独立学习。

十六维作为**首轮十六因子实验**则过大。第一轮应只操纵一个组间因素：

```text
主动政策包关闭
vs.
主动政策包开启
```

十六维在首轮中的用途是：

1. 冻结完整干预包，避免研究过程中随意改政策。
2. 证明每次介入来自哪条规则、用了什么证据、保留了什么学生权利。
3. 为后续拆分单一机制提供变量地图。
4. 防止把“多发几条提示”误写成完整主动学习设计。

### 0.2 是否已有完全相同的论文

不能主张“没有论文研究主动教学 Agent”，也不能主张所有部件都是首次提出。现有研究已经分别覆盖：

- `when × what × how` 设计空间；
- HelpNeed、帮助回避和主动提示；
- 任务阶段、自然停顿和可打断性；
- 多模态状态识别与未来困难预测；
- 自适应支架、重复、升级和渐退；
- 学生选择、教师覆盖和 bounded autonomy；
- 模块化 Agent 后端、责任治理和审计；
- 无 AI 测验、迁移、保持和微随机实验方法。

本轮检索已确认至少七条不能回避的强先例或边界证据：

- **NUMI**：Oreopoulos、Liut、Sungu 和 Low 在 6,000 多名中学生中实施 mastery-based 随机现场实验，比较 AI 与 CAL-only、mastery 与 non-mastery。系统在错误后自动启动分步 walkthrough，同时保留学生主动请求首步提示和跳过；一周后测量练习过与未练习内容。它已经覆盖真实课堂、主动错误后介入、护栏、学生级随机和延迟评价。
- **主动视频学习 chatbot**：Pi、Zhou、Wei、Zheng 和 Li 随机分配 99 名大学生，直接比较用户发起、走神相关主动路径和内容相关主动路径，并报告社会临场感、动机和保持结果。它已经覆盖主动触发路径的实验比较。
- **HelpNeed 主动提示**：Maniktala 等在同一项研究中提出 HelpNeed 分类与预测方法，并通过受控研究比较基于 HelpNeed 的 Adaptive 主动提示政策与 Control。另一项 *Avoiding Help Avoidance* 研究比较的是 unsolicited Assertions 与学生不活动后出现的 Messages，主要回答“如何呈现主动帮助”。两者分别支持触发政策与呈现机制，不能混成同一实验。
- **注意状态主动介入**：Hutt 等在 287 名高中生的真实课堂中比较基于视线的实时注意介入与两个对照条件，说明从潜在状态识别到主动动作再到学习结果的链条已有课堂实验先例。
- **早期 proactive pedagogical agent RCT**：Kim、Baylor 与 PALS Group 早在 2006 年就将 72 名大学生随机分到能力高低 × proactive/responsive 四种学习伙伴条件，并报告 proactive 交互对回忆成绩的主效应。因此“比较主动与响应式 Agent”已有近二十年的直接先例。
- **差异化 proactive/reactive 人机辅导**：Gurung 等在 635 名 5-8 年级学生中按年级内先前成绩阈值分配主动人工辅导或响应式按需辅导，并用 difference-in-discontinuities 评估人机辅导政策。它不是自动 Agent 触发 RCT，但已经覆盖学习者分层、帮助权限分配、主动/响应政策和差距结果。
- **系统综述边界**：Ba 等对 2014-2025 年 46 项 CSCL 实证研究的系统综述显示，AI Agent 的主动促进、认知支架、社会促进和教学编排已经形成研究群，而不是孤立个案。

因此不能再把“完整课堂主动 AI Tutor + 随机实验”写成空白。Oreopoulos 与 Low 的 Khanmigo 两年集群随机试验覆盖 18 所田纳西州中学：96% 的学生至少尝试过一次，但中位学生只在约三分之一的练习日发送消息，并且只在 17% 的出错练习会话中使用它。这表明仅提供 reactive tutor 不足以保证有效参与，主动政策需要同时控制介入价值与参与成本。

两项 2026 年概念框架进一步收紧了可主张空间：Borchers、Viberg 与 Kizilcec 的 Agency Allocation Framework 已经把“谁拥有决策权”操作化为分析对象；Khosravi 等的 AI learning companions 框架已把持久学习、迁移、元认知、透明度、问责与学习者自主权放在短期表现之前。它们尚不是本研究这种运行中的整章主动政策实验，但 D3、D4、D12 与 D16 不能再作为单独的新颖性来源。

截至 2026-08-30，在本地 96 篇全文证据集和本轮有边界的外网反例检索中，**尚未识别出一项研究同时满足以下条件**：

1. 把四平面十六维操作化为版本化、可审计的主动政策；
2. 在网站的一章完整课程中持续运行，而不是单题、单活动或单包；
3. 联合判断 HelpNeed 与可打断性；
4. 明确建模不确定性和误报成本；
5. 实现从低强度到高强度的重复、升级、渐退和退出；
6. 由服务端执行权限、预算、实验分配和防伪门控；
7. 保留学生对帮助和路径的最终确认权；
8. 使用学生级随机分配；
9. 在无 Agent 条件下测量近迁移、远迁移和延迟保持。

因此，合理的新颖性主张是：

> 本研究不是首个主动教育 Agent，也不是首个主动 AI 导师随机实验；贡献候选是把分散在 AIEd、HCI、学习科学、JITAI 和 Agent 治理中的部件整合为整章、版本化、可审计、HelpNeed 与可打断性双门控、保留学生关闭权且带撤除后迁移评价的政策包。

### 0.3 代码从哪里开始

第一段代码不应从新提示卡或实时 LLM 开始，而应从：

```text
学生级实验分配
  + 服务端确定性政策
  + 决策与证据持久化
  + 整章 shadow mode
```

开始。

`proactive_test` 已按这个顺序完成首个垂直切片：浏览器只产生候选，服务端完成分组、证据重建、政策判断、预算和持久化。这样可以在不改动 v2 学生页面与题目的前提下观察整章候选、估计误报并冻结首轮阈值。

当前 `proactive-learning.js` 与 `knowledge-assistant.js` 中的主动提示应视为**历史原型**，不能直接成为 Control 的一部分。进入 V14-C3 正式实验后，`off`、`shadow` 和 Control 都必须同时关闭历史原型的展示与网络失败本地 fallback；Treatment 只展示新服务端政策签发的干预。

---

# 一、研究范围与当前系统事实

## 1.1 完整章定义

`V14-C3` 的网站课程事实来自 `data/multi-scene-learning-route.json`：

| 项目 | 当前事实 |
|---|---|
| 章 | `V14-C3` 积分直觉与积分方法 |
| 模块 | `GH-06`、`GH-07` |
| 知识点 | 7 个 |
| 每知识点互动候选 | simulation、game、mindMap、visualization3d，共 4 种 |
| 互动候选总数 | 28 个 |
| 学生流程测验 | 章前测 10 题、7 个知识点即时形成性检测、章后测 10 题，共 9 个测验单元 |
| 知识点检测题库 | 每知识点 2 题：先做 1 道核心题，仅在核心题错误时出现 1 道诊断题 |
| 预计学习时长 | 两模块合计约 80-110 分钟 |
| 路径原则 | Agent 推荐，学生确认，不得静默替学生改路 |

七个知识点是：

1. `GH-06-K01` 小矩形逼近面积
2. `GH-06-K02` 定积分作为累积
3. `GH-06-K03` 原函数和不定积分
4. `GH-07-K01` 变上限积分
5. `GH-07-K02` 牛顿-莱布尼茨公式
6. `GH-07-K03` 换元法直觉
7. `GH-07-K04` 分部积分直觉

## 1.2 当前已经具备的基础

当前代码不是从零开始，已有：

- `app/main/proactive-learning.js`
  - 连续三次调参候选；
  - 互动停留 90 秒、阅读停留 150 秒候选；
  - 测验完成后的错题复盘候选；
  - 10 分钟冷却，连续拒绝后延长；
  - 切换场景、切换账号、恢复操作时取消旧候选。
- `app/main/knowledge-assistant.js`
  - 主动建议展示、接受、关闭、忽略；
  - 学生可编辑草稿或回答诊断问题；
  - 主动建议不会自动发送学生消息；
  - 已有主动漏斗事件。
- `server.js` 与 `lib/learning-assistant.js`
  - 服务端核验当前单元、场景和测验提交状态；
  - 拒绝伪造的错题、调参和过早停留信号；
  - 每日主动预算；
  - 限时、一次性 intervention id；
  - 允许动作白名单和 `stay_silent`；
  - mock、实时模型和确定性 fallback。
- `lib/agentic-coach.js` 与 `app/main/agentic-path.js`
  - 前测跳过、后测重学、单步拓展；
  - 路径建议与学生选择分离；
  - Planner 只对合法候选排序。
- `db.js`
  - 事件、测验、快照、Agent 决策、互动证据快照；
  - 管理端主动行为漏斗；
  - 幂等事件和同步落盘。

## 1.3 `proactive_test` 当前实现状态

当前分支已完成首个可运行垂直切片：

| 已实现 | 当前行为 |
|---|---|
| v2 单章继承 | 完整 route 仍是唯一事实源；学生端只投影 `V14-C3`，题目与页面结构不复制 |
| 严格分组门槛 | 完整提交 10 道章前测前不创建 assignment；所有候选只记为 `unassigned + stay_silent` |
| 可复现分层 | 当前按 9 道服务端即时评分客观题的 80 分部分划分 `pre-high/pre-low`，阈值为 `0.60`；简答题不进入分层，避免异步 LLM 评分时机改变条件 |
| 服务端政策 | `off / shadow / active`、Control/Treatment、双阈值、预算、冷却、测验保护和确定性动作白名单 |
| 决策账本 | assignment、decision、intervention、policy state 均持久化；decision 保存决策时的条件、队列和层级快照 |
| 条件盲化 | 学生状态与干预响应只返回不含 `condition` 的 assignment 收据；真实 Control/Treatment 仅保留在服务端决策账本和管理端 |
| 学生端隔离 | V14-C3 只展示服务端签发的 Active Treatment 决策；网络失败时静默，不启用历史本地展示 fallback |
| 学生反馈 | `offered -> shown -> accepted/dismissed` 由服务端强制；`ignored/expired` 可在上下文离开或超时时结束，跨用户、越序、伪造和重放被拒绝 |
| 测量保护 | 章前测、章后测、迁移与保持阶段即使已经提交也持续强制静默，避免把答后教学暴露混入独立测量 |
| 重复打扰保护 | 同一学生、同一知识点已有未决 offer 时不再签发第二条建议，也不重复消耗预算 |
| 纵向支架闭环 | 知识点形成性错误先触发 L1 自我解释；学生接受并实际回复后，平台签发无提示近端验证；失败才允许升级到 L2，成功则渐退并退出 |
| 双通道独立证据 | 当前运行 `policy_owned_probe`；未来课件可通过 `courseware_challenge_result` 或 `courseware_formative_check_submitted` 接入同一生命周期 |
| 拒绝与等待保护 | 未回复、拒绝、跳过验证或无独立证据时不升级；拒绝后本轮闭环结束 |
| 未交付升级收束 | L1 后独立失败虽满足 L2 升级条件，但若预算、已有提示、模式或 renderer 门控使 L2 未实际交付，生命周期进入 `closed`，不会停在没有验证题的等待状态 |
| 学生主动权 | 知点侧栏已提供“标准 / 少提醒 / 关闭”三档；少提醒屏蔽停留和调参等行为型候选，关闭结束当前未完成回合但保留学生主动提问 |
| 学习代次隔离 | 重置学习后清除旧知识点生命周期，保留 assignment 与学生偏好；每条主动决策固化 `learning_generation`，Harness 不跨代串联策略链 |
| 分组配置门控 | 未设置稳定私有分组盐时不创建新 assignment；`active` 缺失时失败关闭；assignment 创建后同步落盘 |
| 管理端 Harness | 查看与导出条件、反事实政策判断、实际呈现、三项分数、理由码、中文证据来源、回复、独立结果、决策前后状态转移和同一学习代次内的知识点 L1→L2→退出策略链 |

### 1.4 已完成验证

- `proactive_test` 的 HEAD 为 `v2@522e54c`；工作树中的 `data/multi-scene-learning-route.json` 与 `v2` 的 Git blob 均为 `36534480161b7edecc4c52dad5ed09890099f9ff`。
- 题目仍由完整 v2 route 唯一维护；学生 API 只投影 `V14-C3`，管理端与 Flow Test 仍可读取完整 route。
- V14-C3 含 7 个知识点、28 个资源候选；对 GH-06/GH-07 导入资源的全量静态检索没有发现 `courseware_challenge_result`、`courseware_formative_check_submitted` 或 `maic_learning_event`。
- 已通过 `proactive:test`、`assistant:test`、`admin:test`、`durability:test`、`security:test`、`auth:test`、`quiz:test`、`path:test` 和 `browser:smoke:test`。
- 浏览器使用独立临时数据库完成桌面与 390×844 移动端验收：单章导航、10 题章前测、刷新恢复、主动提示卡、跨账号行为隔离、主动实验账本、CSV 入口与大数据管理布局均通过；页面无横向溢出，宽表保留横向滚动。
- 浏览器验收发现并修复主动实验表从空态刷新到有数据后仍保持 `overflow: hidden` 的问题。
- 回归验收发现并修复学习助手同一时间戳消息以随机 UUID 排序、导致重启后 user/assistant 顺序不稳定的问题；现在以数据库插入顺序恢复。
- 本轮策略没有调用实时 LLM，也没有读取、复制或提交 Codex/API 凭据。

当前仍不是正式效果实验：

- 现有 assignment 是“层内加盐确定性哈希”，能保证稳定和近似 1:1，不能保证小样本严格平衡；正式试验应在预注册前决定是否改为分层置换区组或中心化分配。
- 独立近迁移、跨表征迁移和 7 天保持测验尚未接入。
- L1、知识点专属 L2、14 道平台无提示 probe、一次独立成功后的本次帮助渐退/退出已经实现；L3、跨帮助回合的长期渐退、OpenMAIC 生成期语义事件和教师内容复核尚未完成。
- 三档学生偏好、学习代次隔离、决策前后状态快照和未交付升级的 `closed` 安全收束已经实现；自动第三次负向反馈关闭、L3 与人工转介仍未实现。
- 当前一次可核验独立成功只表示“本次帮助可以退出”，不表示该知识点已稳定掌握；掌握、迁移和保持仍必须由后续无 Agent 测量判断。
- Shadow 人工双人复核、停止规则告警和正式伦理流程尚未完成。
- 服务端不会接受客户端指定的 condition、action 或 support level，但普通浏览器学习事件仍是客户端来源，当前防护是结构校验与服务端重建，不是密码学防伪；正式对抗性试验还需签名桥接事件或更强的服务端序列校验。
- 私有分组盐必须从 shadow 分组开始前固定；不得先用公开默认值分组、再在 active 阶段更换盐。更改盐或分组算法时必须新建 experiment id 或 assignment version。
- 首轮策略不调用实时 LLM；后续若只做语言呈现，应复用现有服务端 OpenAI-compatible 适配与环境配置，不读取、复制或提交 Codex 凭据。

---

# 二、先例检索与新颖性审计

## 2.1 检索问题

本轮检索不是问“有没有主动 Agent”，而是寻找最强反例：

> 是否已经存在一项教育研究，在完整课程范围内同时实现状态证据、HelpNeed、可打断性、不确定性、分级支架、学生自主权、生命周期、治理、随机因果评价和撤除后迁移？

## 2.2 证据来源

1. 本地证据库：`D:\Desktop\Proactive_AI_for_Learning_Guide`
   - 78 篇具体主动策略论文；
   - 18 篇领域基础与边界论文；
   - 96 份本地 PDF 原件；
   - 总索引：`05_96篇论文总索引.tsv`。
2. 外网反例检索：
   - arXiv；
   - ACM Digital Library；
   - Springer；
   - PNAS；
   - ScienceDirect；
   - AAAI；
   - 官方项目或机构页面。
3. 检索词族：
   - proactive pedagogical agent；
   - HelpNeed；
   - interruptibility；
   - adaptive scaffolding；
   - fading；
   - learner agency；
   - multimodal learner state；
   - agentic learning analytics；
   - assistance governance；
   - transfer、retention、no-AI assessment；
   - JITAI、micro-randomized trial。

## 2.3 纳入与排除

纳入：

- 明确涉及教育或学习支持；
- 至少覆盖主动时机、状态、动作、治理或效果评价中的一项；
- 有可核验论文页、DOI、arXiv 或官方项目页；
- 优先采用全文和第一方页面。

排除：

- 只生成教案或教师材料，不面向学习过程；
- 只做问答质量 benchmark；
- 只报告 Agent 数量或模型架构，没有教学政策；
- 没有可核验原始来源；
- 把任务完成、满意度或对话数量直接当长期学习。

## 2.4 检索限制

- 这是有边界的先例与反例检索，不是 PRISMA 系统综述。
- 本地证据库已有完整 PDF，但本轮没有重新逐页编码全部 96 篇。
- OpenAlex scholar-search 两轮受到 HTTP 429 限流，未把返回量写成穷尽性依据。
- 外网复核同时使用题名、DOI、作者组合和反例式关键词，重点核对 ACM、Springer、NBER、Annenberg、PNAS、arXiv 与作者/项目主页；未将搜索摘要替代全文证据。
- 2026-08-27 的第二轮权威页复核纠正了 NUMI 的 NBER 编号、Khanmigo 的作者与学校数、Hutt 论文 DOI，以及两篇 Maniktala HelpNeed 论文的混合引用；下列参考来源采用修正后的版本。
- Bastani 等的 PNAS 论文在 2025-08-20 发布了正式更正；本方案保留原论文 DOI，并在参考来源中同时标注更正 DOI。
- 同日第三轮反例检索补入 2006 年 proactive/responsive pedagogical agent 随机研究、2026 年差异化人机辅导政策、Agency Allocation Framework、AI learning companions 框架和 CSCL Agent 系统综述；它们扩大了“已有先例”的边界，但仍未构成九项完整组合条件的单篇反例。
- 2026 年研究更新很快，“尚未识别”不等于逻辑证明“绝对不存在”。
- 覆盖矩阵只记录论文明确报告或本地全文已核实内容，不从系统名称推断能力。

## 2.5 覆盖标记

| 标记 | 含义 |
|---|---|
| `O` | 已在系统或研究协议中操作化 |
| `C` | 作为概念、框架或设计要求提出 |
| `P` | 只覆盖一部分或通过相邻机制间接覆盖 |
| `-` | 未识别或未报告 |

这些标记不代表效果大小，也不用于给论文排名。

## 2.6 平面一：教学契约覆盖

| 先例 | D1 目标 | D2 学习者/阶段 | D3 角色/权限 | D4 学习科学护栏 |
|---|---:|---:|---:|---:|
| Lei 等：`when × what × how` | C | C | C | C |
| Woollaston 等：automation-learning tension | C | C | C | C |
| Cohn 等：Inquizzitor / ECD scaffolding | O | O | O | O |
| Wang 等：MR 主动/反应促进 | O | O | P | P |
| NUMI 课堂 AI Tutor | O | O | P | O |
| Pi 等：主动视频 chatbot | O | O | P | P |
| Maniktala 等：HelpNeed 主动提示 | O | O | P | O |
| Hutt 等：注意状态主动介入 | O | O | P | P |
| Kim、Baylor 等：proactive/responsive PAL | O | O | P | P |
| Gurung 等：差异化人机辅导 | O | O | O | O |
| ProPACT 预测式协作导师 | O | O | P | O |
| Copa / EDF | O | O | P | O |
| MALA 模块化学习辅助 | O | O | O | O |
| PEA assistance governance | P | P | C | C |
| Agency Allocation Framework | P | P | C | C |
| AI learning companions | C | C | C | C |
| GIFT | O | O | O | O |
| JITAI / MRT | P | O | P | P |
| MAIC + Mapping dynamics | O | O | O | P |

## 2.7 平面二：状态与决策覆盖

| 先例 | D5 可观察证据 | D6 潜在状态 | D7 不确定性/误报成本 | D8 HelpNeed/可打断性 |
|---|---:|---:|---:|---:|
| Lei 等 | C | C | - | P |
| Woollaston 等 | C | C | C | C |
| Cohn 等 | O | O | P | P |
| Wang 等 | O | O | P | O |
| NUMI | O | P | P | P |
| Pi 等主动视频 chatbot | O | O | P | P |
| HelpNeed 主动提示 | O | O | P | O |
| 注意状态主动介入 | O | O | P | P |
| Kim、Baylor 等 proactive PAL | O | P | - | P |
| Gurung 等差异化人机辅导 | O | P | P | O |
| ProPACT | O | O | P | P |
| Copa / EDF | O | O | P | P |
| MALA | O | P | C | P |
| PEA | - | - | P | - |
| Agency Allocation Framework | C | C | C | P |
| AI learning companions | C | C | C | C |
| GIFT | O | O | P | P |
| JITAI / MRT | O | O | O | O |
| MAIC + Mapping dynamics | O | P | - | - |

## 2.8 平面三：介入政策覆盖

| 先例 | D9 动作 | D10 强度 | D11 呈现 | D12 自主权 | D13 生命周期 | D14 记忆 |
|---|---:|---:|---:|---:|---:|---:|
| Lei 等 | C | P | C | C | - | C |
| Woollaston 等 | C | C | P | C | C | C |
| Cohn 等 | O | O | O | P | O | O |
| Wang 等 | O | P | O | P | - | P |
| NUMI | O | O | O | P | P | P |
| Pi 等主动视频 chatbot | O | P | O | P | - | - |
| HelpNeed 主动提示 | O | P | O | P | P | - |
| 注意状态主动介入 | O | P | O | P | - | - |
| Kim、Baylor 等 proactive PAL | O | P | O | P | - | P |
| Gurung 等差异化人机辅导 | O | O | O | O | P | P |
| ProPACT | O | O | O | P | O | P |
| Copa / EDF | O | O | O | P | O | O |
| MALA | O | P | O | C | P | O |
| PEA | P | P | P | C | P | - |
| Agency Allocation Framework | C | C | C | C | C | C |
| AI learning companions | C | C | C | C | C | C |
| GIFT | O | O | O | P | P | O |
| JITAI / MRT | O | O | P | P | O | O |
| MAIC + Mapping dynamics | O | P | O | O | P | O |

## 2.9 平面四：系统与证据覆盖

| 先例 | D15 模块化/治理 | D16 学习效果/因果 | 最强证据与剩余缺口 |
|---|---:|---:|---|
| Lei 等 | C | - | 设计空间广，但没有统一政策和策略实验 |
| Woollaston 等 | C | C | 护栏与退出要求强，但没有参与者实验 |
| Cohn 等 | O | P | 104 名学生，验证评分和理论忠实度；无学习增益 RCT |
| Wang 等 | O | O | 主动/反应比较并撤去 AI 实操；样本小，生命周期与自主权不完整 |
| NUMI | O | O | 6,000 多名中学生、2×2 随机现场实验、错误后自动 walkthrough 和一周延迟测量；未联合建模可打断性、误报成本与完整生命周期 |
| Pi 等主动视频 chatbot | P | O | 99 人随机比较三种触发路径并测保持；单次视频学习，未形成整章治理与支架生命周期 |
| HelpNeed 主动提示 | P | O | 随机比较 HelpNeed 触发与固定错误触发；聚焦主动时机，未覆盖整章权限、可打断性和治理 |
| 注意状态主动介入 | P | O | 287 名高中生真实课堂三条件实验；依赖视线状态，未覆盖帮助内容、学生关闭权和完整生命周期 |
| Kim、Baylor 等 proactive PAL | P | O | 72 人四条件随机比较 proactive/responsive 与 Agent 能力；没有动态 HelpNeed、治理账本或整章生命周期 |
| Gurung 等差异化人机辅导 | O | O | 635 人 difference-in-discontinuities；主动方是人工导师，分配依据是先前成绩阈值，不是实时 Agent 双门控 |
| ProPACT | O | O | 26 对学生组内比较；预测、分级、渐退强，无长期独立迁移 |
| Copa / EDF | O | P | 真实课堂多周运行；无随机对照学习效果 |
| MALA | O | - | 模块化、可审计、责任设计强；不是主动政策效果研究 |
| PEA | C | - | Policy-Enforcement-Authority 治理框架；没有单一运行系统 |
| Agency Allocation Framework | C | - | 明确分析学习者、教师、机构与 AI 的决策权分配；不是运行政策或效果实验 |
| AI learning companions | C | C | 学习优先、适应性与责任设计覆盖广；是综合框架与案例说明，不是统一主动政策试验 |
| GIFT | O | P | 通用 ITS 架构成熟；没有本研究这种完整 LLM 主动章节试验 |
| JITAI / MRT | O | O | 决策点和近端因果优化成熟；不是具体教学内容与学习护栏方案 |
| MAIC + Mapping dynamics | O | P | 平台、多 Agent 和过程机制强；未实现完整主动双门控与随机撤除评价 |

## 2.10 最接近的组合，而不是单篇赢家

完整方案应组合不同研究线，而不是声称由一篇论文直接推出：

```text
Lei：设计空间
+ Woollaston：学习护栏、认知摩擦、渐退与退出
+ HelpNeed / Cody / Yalçın：主动触发、自主权和重复介入
+ Hutt：潜在注意状态、主动时机和真实课堂比较
+ Wang：任务阶段与可打断性
+ Kim / Baylor：主动与响应式 Agent 的历史随机比较
+ Gurung：按学习需要分配 proactive/reactive 人机辅导
+ NUMI：真实课堂、错误后主动 walkthrough、随机与延迟测量
+ Pi：主动触发路径的直接实验比较
+ ProPACT / Copa：多模态状态、预测和分级支架
+ Cohn：证据中心评价与理论忠实度
+ MALA / PEA / Agency Allocation / GIFT：模块化、权限和治理
+ AI learning companions：持久学习、迁移、元认知和责任设计
+ JITAI / MRT：版本化政策与因果优化
+ Bastani / Khanmigo：必须区分可用性、实际使用、在场表现和撤除后的学习
+ MAIC / Mapping / Chen：平台叙事、互动机制和帮助寻求过程
```

---

# 三、四平面十六维完整设计

## 3.1 平面一：教学契约

### D1 学习目标

V14-C3 的目标不是提高提示接受率，而是：

1. 建立面积、累积与原函数之间的概念连接；
2. 解释微积分基本定理中的变化率与累积互逆；
3. 在新函数、新表征和新情境中选择积分方法；
4. 撤去 Agent 后仍能独立解释、判断和迁移。

系统优化目标按优先级排序：

```text
独立学习与迁移
> 概念理解
> 有效帮助寻求
> 当场任务完成
> 互动数量与接受率
```

### D2 学习者与任务阶段

政策必须显式识别：

- 章前准备；
- 前测；
- 概念讲解；
- 互动探索；
- 形成测验；
- 错因复盘；
- 场景选择；
- 后测；
- 无 Agent 迁移；
- 7 天保持。

受保护测量窗口：

- 前测作答至提交；
- 形成测验作答至成绩快照；
- 后测全程；
- 迁移测验全程；
- 保持测验全程。

这些窗口一律 `stay_silent`，不能用前端隐藏替代服务端权限检查。

### D3 Agent 角色与权限

| 角色 | 可以做 | 不可以做 |
|---|---|---|
| Evidence Agent | 聚合日志、测验和互动证据 | 直接决定教学动作 |
| State Estimator | 输出带不确定性的状态估计 | 把停留直接写成“困惑” |
| Policy Agent | 在白名单内选择沉默、动作和强度 | 自由生成新课程事实 |
| Pedagogy Adapter | 为知识点提供误解与支架模板 | 修改 route 或课件 |
| Language Renderer | 把已选动作转成自然语言 | 改变动作、强度、答案边界 |
| Path Coach | 提出跳过、重学、拓展建议 | 自动替学生改变路径 |
| Research Governor | 分配条件、锁定版本、记录审计 | 在试验中途按结果改条件 |
| 教师/研究者 | 暂停实验、复核误报、处理风险 | 修改历史日志掩盖失败 |
| 学生 | 接受、拒绝、延后、降频、关闭、选路径 | 不承担解释系统内部错误的责任 |

### D4 学习科学护栏

1. **先预测再反馈**：需要学生形成判断的场景，先要求预测。
2. **最小充分帮助**：从最低可用强度开始。
3. **不替代目标认知活动**：不直接替学生完成分解、方法选择、解释和核验。
4. **答案保护**：所有测量窗口禁止泄题。
5. **表征桥接**：换场景必须说明要比较的关系，不只说“换个视频看看”。
6. **自我解释**：高强度帮助后要求学生用自己的话或新题验证。
7. **渐退与退出**：恢复进展后降低强度，掌握后停止。
8. **可反驳性**：学生可以拒绝 Agent 对其状态的判断。

## 3.2 平面二：状态与决策

### D5 可观察证据

证据按来源分层：

| 证据族 | 例子 | 可信度 |
|---|---|---|
| 结果证据 | 已提交错题、迁移题表现、短答评分 | 高 |
| 任务证据 | 场景完成、挑战失败、观察记录、预测与结果不一致 | 高至中 |
| 过程证据 | 参数提交、反复进入、答案揭示、场景切换 | 中 |
| 时间证据 | 有效停留、停顿、恢复活动 | 低至中 |
| 自报证据 | “我卡在条件”“我只是想一想” | 高，但可能不完整 |
| 历史证据 | 过去接受、拒绝、同类误解 | 中 |

原始鼠标移动、后台停留和单次点击不得独立触发。

每份证据必须带：

- `eventId` 或测验记录 id；
- `sourceType`；
- `capturedAt`；
- `unitId`、`sceneType`；
- `quality`；
- `expiresAt`；
- 是否受实验测量窗口保护。

### D6 潜在学习状态

首轮只估计可审计状态，不诊断人格或心理疾病：

```text
mastery: unknown / emerging / stable
misconception: none / suspected / confirmed
friction: low / medium / high
progress: advancing / stalled / regressing
help_orientation: independent / receptive / avoidant-uncertain
representation_need: none / visual / symbolic / verbal / contextual
```

状态必须同时输出：

- 概率或置信区间；
- 支持证据；
- 反证；
- 数据缺口；
- 是否应 abstain。

### D7 不确定性与误报成本

首轮不追求“模型总要给答案”，而是允许拒判。

```text
expected_value =
  P(help_needed) * expected_learning_benefit
  - P(false_positive) * interruption_cost
  - autonomy_cost
  - dependency_cost
```

误报成本高的情境：

- 学生正在拖动、输入、阅读公式或口头解释；
- 学生刚开始尝试；
- 学生在受保护测验中；
- 停顿可能是生产性思考；
- 学生已连续拒绝；
- 系统只有一种弱证据；
- 介入可能暴露方法或答案。

首轮固定门槛：

- 至少两个独立证据族，或一个已确认结果证据；
- `helpNeedScore >= 0.70`；
- `interruptibilityScore >= 0.75`；
- `uncertaintyScore <= 0.30`；
- 未命中权限、预算、冷却和学生偏好门控。

`quiet_dwell` 单独出现时不得超过 `helpNeedScore = 0.45`。它只能触发 shadow 候选或低强度 check-in，不能触发概念讲解。

### D8 HelpNeed 与可打断性

两个门必须分开：

```text
Gate A: 学生是否可能需要帮助
Gate B: 现在是否适合出现
```

可打断性规则：

| 情境 | 分数或处理 |
|---|---|
| 测验作答、输入、拖动、全屏互动 | `0` |
| 页面隐藏、离开学习视图 | `0` |
| 任务刚开始 30 秒内 | 最多 `0.40` |
| 参数提交后 4-12 秒自然停顿 | `0.80` |
| 场景完成、挑战结束、页面切换 | `0.90` |
| 测验提交并完成成绩快照 | `1.00`，仅允许复盘类动作 |
| 学生主动打开助教 | 不再视为主动介入 |

如果 HelpNeed 高但当前不可打断，系统保存短期候选，在最近自然边界重新评价；不得排队后无条件弹出。

## 3.3 平面三：介入政策

### D9 教学动作

首轮动作白名单：

```text
stay_silent
check_in
focus_attention
elicit_prediction
elicit_self_explanation
contrast_representations
concept_hint
subgoal_hint
review_misconception
recommend_scene
recommend_break
handoff_human
```

动作不能由 LLM 自由发明。V14-C3 adapter 决定每个知识点允许哪些动作。

### D10 支架强度

| 等级 | 名称 | 典型动作 | 答案边界 |
|---|---|---|---|
| L0 | 确认与选择 | check-in、继续/稍后/关闭 | 不提供概念内容 |
| L1 | 注意与自检 | 预测、观察点、自我解释 | 不给方法和结果 |
| L2 | 概念与表征线索 | 对比图像/符号、关键关系、子目标 | 不完成核心推理 |
| L3 | 部分示例 | 一个中间步骤、部分 worked example | 仅在明确同意后；不用于测量题 |

首轮策略总是从 L0 或 L1 开始。只有学生接受帮助、仍有持续证据且未恢复进展，才允许升级。

### D11 呈现方式

- 默认使用页面边缘的低显著度建议条，不自动打开聊天。
- 不自动播放语音。
- 一次只出现一个主动作。
- 提供简短的“为什么现在提示”。
- 需要学生回复时，允许点选起点或自由输入。
- 推荐场景时展示真实场景名称和表征类型。
- L3 使用题旁局部支架，不把完整解答塞入聊天。
- 支持键盘和屏幕阅读器，移动端不遮挡主内容。

### D12 学生自主权

每次建议至少提供：

```text
继续自己试
给我一个观察点
稍后提醒
本知识点少提醒
```

全局设置提供：

```text
标准
更少
关闭主动提示
```

以下决定必须由学生确认：

- 是否展开帮助；
- 是否发送草稿或回复；
- 是否切换场景；
- 是否回看、重学、拓展或进入下一章。

### D13 重复、升级、渐退与退出

状态机：

```text
ELIGIBLE
  -> SILENT
  -> OFFERED_L0/L1
  -> ACCEPTED | DISMISSED | IGNORED | EXPIRED

FORMATIVE_ERROR
  -> OFFERED_L1_SELF_EXPLANATION
  -> ACCEPTED_PENDING_RESPONSE
  -> AWAITING_INDEPENDENT_ATTEMPT

AWAITING_INDEPENDENT_ATTEMPT
  -> SUCCESS -> FADE_AND_EXIT_HELP_EPISODE
  -> FAILURE_AT_L1 -> OFFERED_L2_CONCEPT_HINT
  -> FAILURE_AT_L1_BUT_L2_NOT_DELIVERED -> CLOSED
  -> FAILURE_AT_L2 -> MAXIMUM_SUPPORT_REACHED
  -> VERIFY_DECLINED -> EXIT_WITHOUT_ESCALATION

DISMISSED | IGNORED
  -> DECLINED
  -> EXIT_WITHOUT_ESCALATION
```

固定规则：

1. 同一知识点同一原因 10 分钟内不重复。
2. 第一次拒绝后冷却 10 分钟。
3. 第二次拒绝后冷却 20 分钟，并关闭本知识点同类建议。
4. 第三次负向反馈后，本章主动提示默认关闭，学生仍可主动提问。
5. 拒绝后绝不升级。
6. 形成性测验只负责开启 L1；不得重复提交或重复读取同一份一次性测验来触发 L2。
7. 学生接受并实际回复后，才允许签发平台无提示验证或监听课件语义结果。
8. 一次可核验独立成功足以结束当前帮助回合并把强度恢复到 L0，但不把知识点标成稳定掌握。
9. L1 后独立失败只升级一级到 L2；L2 后仍失败则停止自动升级，当前试点不自动进入 L3。
10. 学生跳过平台验证时，本轮进入 `declined`，不得把跳过解释成失败并继续升级。
11. 跨帮助回合的长期渐退需要至少两个独立成功证据，当前只保留计数字段，尚未用于正式政策。
12. 候选超过时限、场景改变、学生恢复操作或证据失效时退出。
13. 知识点达到稳定掌握后退出，不为了增加曝光继续发消息。
14. 如果独立失败已经产生，但升级动作因预算、开放中的提示、Shadow/Control 或 renderer 门控未实际交付，则进入 `closed` 并记录未交付原因；不能继续等待一个不存在的验证题。

### D14 个性化记忆

允许保存：

- 参与实验的固定条件；
- 各知识点的掌握与误解证据；
- 学生接受、拒绝和忽略的动作类型；
- 偏好的帮助强度和呈现方式；
- 已使用场景与是否完成；
- 冷却、渐退和退出状态。
- 当前学习代次，以及该代次内的知识点支架回合。

默认不用于政策：

- 受保护人口属性；
- 从聊天猜测人格；
- 未经同意的情绪诊断；
- 原始眼动、音视频和完整自由文本。

记忆规则：

- 偏好可由学生查看和重置；
- 策略状态按章失效，长期保留只存稳定偏好；
- 学习重置保留 assignment 和学生偏好，但清除旧知识点生命周期；历史 decision 以 `learning_generation` 隔离，不能跨代串成同一支架链；
- 研究导出使用去标识 participant id；
- 任何模型升级不得静默改写历史决策。

## 3.4 平面四：系统与证据

### D15 模块化后端与治理

建议建立一个深模块：

```js
const result = proactivePolicy.evaluate({
  participantId,
  chapterId,
  unitId,
  sceneType,
  candidate,
  now
});
```

调用者只需要知道：

- 输入是当前学习位置和候选；
- 返回是 `stay_silent` 或一个版本化干预；
- 所有证据聚合、状态估计、权限、预算、生命周期和持久化都在模块内完成。

返回对象：

```js
{
  decisionId,
  policyVersion,
  contractVersion,
  experimentId,
  condition,
  learningGeneration,
  decision: "stay_silent" | "intervene",
  deliveryDecision: "stay_silent" | "intervene",
  action,
  supportLevel,
  presentation,
  reasonCodes,
  helpNeedScore,
  interruptibilityScore,
  uncertaintyScore,
  evidenceRefs,
  policyStateBefore,
  stateTransition,
  policyStateAfter,
  expiresAt
}
```

治理要求：

- policy、contract、adapter 都有不可变版本；
- 服务端是最终权限方；
- 每次沉默也记录原因；
- 每条决策保存决策前状态、本次转移和决策后状态，不能只保存最终动作；
- 每条决策固化学习代次，当前状态只允许挂接到同一代次；
- 首轮 LLM 只负责语言表达，不负责触发、动作和强度；
- 模型不可用时仍能执行同一确定性政策；
- 管理端可以暂停实验，但不能修改历史条件；
- 所有高影响动作支持人工复核和审计导出。

### D16 学习效果评价与因果实验

第一轮目标是“可行性 + 探索性学习效果”，不是宣布最优政策。

主要可行性指标：

- 服务端决策成功率；
- 候选到决策延迟；
- 建议实际展示率；
- 人工回放判断的情境相关率；
- 误报率；
- 学生感知打断和控制；
- 接受、关闭、忽略和全章关闭比例；
- 受保护测量窗口零介入。

首要探索性学习指标：

- 无 Agent 章后近迁移；
- 无 Agent 章后跨表征迁移；
- 无 Agent 章后方法选择；
- 7 天无 Agent 保持。

不能把以下指标作为学习效果替代：

- 提示数量；
- 接受率；
- 对话轮数；
- 完成速度；
- Agent 在场时的即时正确率。

---

# 四、通用政策内核

## 4.1 决策流水线

```text
1. Scope Gate
   是否属于实验、V14-C3 和允许阶段

2. Assignment Gate
   学生条件是否已固定，是否为 shadow / control / treatment

3. Evidence Assembly
   聚合结果、任务、过程、时间、自报和历史证据

4. State Estimation
   HelpNeed、误解、摩擦、进展和表征需要

5. Interruptibility
   当前是否自然边界，是否正在输入/拖动/测验

6. Uncertainty-Cost Gate
   证据是否足够，误报成本是否可接受

7. Autonomy-Budget Gate
   偏好、冷却、频率、拒绝历史和每日预算

8. Action Selection
   从知识点允许动作中选择最低充分强度

9. Durable Decision
   先写 decision，再向前端返回

10. Resolution
    shown / accepted / dismissed / ignored / expired / acted

11. Outcome Update
    恢复、持续卡点、升级、渐退或退出
```

## 4.2 首轮确定性规则

```js
if (!scopeAllowed || protectedAssessment) return SILENT("protected_stage");
if (condition === "control") return SILENT("control_condition");
if (studentPreference === "off") return SILENT("student_disabled");
if (activeInput || activeDrag || pageHidden) return SILENT("not_interruptible");
if (cooldownActive || budgetExhausted) return SILENT("frequency_guard");

const strongResultEvidence = confirmedMisconception || scoredFailure;
const independentFamilies = countIndependentEvidenceFamilies(evidence);

if (!strongResultEvidence && independentFamilies < 2) {
  return SILENT("insufficient_evidence");
}
if (helpNeedScore < 0.70) return SILENT("help_need_below_threshold");
if (interruptibilityScore < 0.75) return SILENT("wait_for_boundary");
if (uncertaintyScore > 0.30) return SILENT("uncertain_state");

return lowestSufficientAllowedAction();
```

## 4.3 原因码

沉默原因码：

```text
protected_stage
out_of_scope
control_condition
student_disabled
not_interruptible
wait_for_boundary
insufficient_evidence
help_need_below_threshold
uncertain_state
productive_struggle_possible
cooldown_active
budget_exhausted
stale_candidate
no_legal_action
mastery_stable
```

介入原因码：

```text
confirmed_misconception
repeated_unproductive_action
prediction_observation_mismatch
failed_challenge
cross_representation_gap
post_quiz_review_ready
explicit_low_confidence
repeated_same_error
```

---

# 五、V14-C3 学科适配包

适配包只描述学科知识、误解、证据映射和合法支架，不承担实验分配、预算或权限。课程结构仍以 route 为唯一事实源。

## 5.1 七知识点策略

| 知识点 | 高价值证据 | L1 | L2 | L3 | 无 Agent 迁移 |
|---|---|---|---|---|---|
| 小矩形逼近面积 | 多次改变分割数但不观察误差；认为所有矩形和都高估；忽略负区间 | 先预测分割加倍后误差方向 | 对比左/右端点与上下和 | 给一个单调函数上的部分估计步骤 | 新函数、非等距分割、符号面积 |
| 定积分作为累积 | 把有向累积等同路程；负流量仍判断总量增加；只看终点值 | 标记区间正负并预测累计量升降 | 建立“变化率×小时间→小增量→总和”链 | 分段处理正负区间但不替学生完成总和 | 电荷、现金流、温度变化等新情境 |
| 原函数和不定积分 | 漏写 `+C`；把函数族当单一函数；混淆原函数与定积分 | 对两个相差常数的函数求导 | 用垂直平移解释导数不变 | 从斜率与一个初值恢复函数族 | 更换初值、比较多个原函数 |
| 变上限积分 | 把上限 `x` 当常数；遗漏链式法则 | 移动上限并预测新增面积 | 用末端窄条解释导数 | 给 `g(x)` 上限的局部变化框架 | 上限 `x^2`、复合边界 |
| 牛顿-莱布尼茨公式 | 写成 `f(b)-f(a)`；不能连接面积与原函数变化 | 先判断每个符号代表率还是累计量 | 使用变化率-累积桥接图 | 只给“选原函数、代上下限”的第一步 | 参数化上下限、新生活情境 |
| 换元法直觉 | 选的替换不简化；漏掉微分因子；定积分不换界 | 圈出内层函数与其导数 | 颜色匹配 `u`、`du` 和剩余因子 | 完成替换与新界限中的一个步骤 | 干扰项更多的新被积函数 |
| 分部积分直觉 | `u`/`dv` 选择无效；符号错误；递归回原式 | 从乘积求导式反向识别角色 | 比较两种选择后的复杂度 | 完成一次分部循环的部分示例 | `x e^x`、`ln x`、重复分部 |

## 5.2 场景推荐规则

不使用固定场景序号。根据语义和当前证据选择：

| 需要 | 优先候选 |
|---|---|
| 观察连续变化 | simulation |
| 修复稳定误解 | game |
| 连接多个概念 | mindMap |
| 空间或函数族关系 | visualization3d |

推荐只能来自该知识点 route 中真实存在的候选。若只有一个合法候选，直接使用规则候选；若有多个合法候选，再交给现有 Planner 排序。推荐仍须由学生确认。

## 5.3 内容质量门槛

正式试点前，七个知识点每一级支架都需：

1. 两名微积分教师独立复核；
2. 一名学习科学研究者复核认知负荷与答案边界；
3. 对照 route 和实际课件验证引用场景存在；
4. 检查中文、公式、移动端和屏幕阅读器；
5. 为每条支架标明禁止使用的测量题和阶段；
6. 保留版本指纹。

---

# 六、系统与数据设计

## 6.1 建议代码结构

```text
lib/
  proactive-policy/
    index.js              # 唯一外部 seam
    contract.js           # 教学契约与受保护阶段
    evidence.js           # 证据聚合与质量
    state.js              # HelpNeed 与潜在状态
    interruptibility.js   # 可打断性
    lifecycle.js          # 冷却、升级、渐退、退出
    decision.js           # 固定政策
    repository.js         # db adapter
    adapters/
      v14-c3.js           # 七知识点学科适配

ops/
  test-proactive-policy.js
  test-proactive-study-api.js
  test-proactive-assignment.js
  test-proactive-durability.js
  test-proactive-shadow-replay.js
```

避免把十六维拆成十六个对外模块。对外只暴露少量接口，复杂性留在深模块内部。

## 6.2 现有模块的职责调整

| 文件 | 调整 |
|---|---|
| `app/main/proactive-learning.js` | 只产生带证据引用的低级候选，不再拥有最终冷却和实验政策 |
| `app/main/knowledge-assistant.js` | 渲染服务端决策、L2 内联确认和无提示验证，并提交 resolution/check |
| `server.js` | 认证、participant assignment、调用政策模块、持久化后再返回 |
| `lib/learning-assistant.js` | 保留上下文安全和语言表达；首轮不得选择动作或强度 |
| `lib/agentic-coach.js` | 继续负责章级路径建议，不与时刻级主动政策混合 |
| `lib/agents/planner.js` | 只对合法场景候选排序 |
| `db.js` | 新增实验分配、主动决策、干预生命周期和政策状态 |
| `admin/admin.js` | 增加政策版本、误报复核、条件平衡和受保护窗口违例 |

## 6.3 数据表

### `experiment_assignments`

```text
user_id
experiment_id
condition
cohort
stratum
assignment_version
assigned_at
```

约束：`(user_id, experiment_id)` 唯一。条件一经分配不可被前端覆盖。

### `proactive_decisions`

```text
id
user_id
experiment_id
condition
cohort
stratum
assignment_version
policy_mode
chapter_id
unit_id
scene_type
candidate_kind
policy_version
contract_version
adapter_version
decision
delivery_decision
action
support_level
help_need_score
interruptibility_score
uncertainty_score
reason_codes_json
evidence_refs_json
evidence_snapshot_json
budget_snapshot_json
created_at
expires_at
```

### `proactive_interventions`

```text
id
decision_id
status
presentation
shown_at
resolved_at
resolution
latency_ms
followup_outcome_json
```

合法状态：

```text
offered
shown
accepted
dismissed
ignored
expired
acted
resolved
```

### `proactive_policy_state`

```text
user_id
experiment_id
scope_key
dismiss_streak
cooldown_until
current_level
fade_level
student_preference
last_reason_code
updated_at
```

## 6.4 接口

首轮可以保留现有 endpoint 作为适配层，内部改为调用新政策模块：

```text
POST /api/learning/assistant/intervention
```

新增：

```text
POST /api/learning/proactive/:decisionId/resolution
GET  /api/learning/proactive/state?chapterId=V14-C3
GET  /api/admin/research/proactive-decisions
POST /api/admin/research/proactive-pause
```

关键不变量：

- 客户端不能提交 condition、policyVersion、supportLevel 或最终 action；
- 客户端候选只是唤醒服务端评价的 decision point，不是真值证据；
- 客户端信号必须能关联到已落盘事件，服务端从事件和测验记录重建证据；
- resolution 必须属于当前用户和未过期 decision；
- 同一个 decision 只能从合法状态迁移一次；
- 服务端成功响应前先落盘；
- 受保护阶段即使前端伪造也返回 `stay_silent`。

## 6.5 功能开关

```text
PROACTIVE_POLICY_MODE=off|shadow|active
PROACTIVE_EXPERIMENT_ID=v14-c3-proactive-pilot-2026
PROACTIVE_POLICY_VERSION=v14-c3-fixed-v2
PROACTIVE_ADAPTER_VERSION=v14-c3-adapter-v2
```

- `off`：完全关闭新政策。
- `shadow`：完整决策和记录，但不展示。
- `active`：仅 treatment 条件展示。

以上三种模式都覆盖 V14-C3 的历史前端主动原型。`off` 与 `shadow` 不得展示历史建议；Control 不得触发本地 repeated-parameter fallback；只有服务端签发、处于 Treatment 且未过期的 decision 可以展示。

不要再使用部署级 `EXPERIMENT_CONDITION` 代替学生级随机分配。

---

# 七、事件字典

复用现有 `knowledge_proactive_*` 行为事件，同时补足研究决策链：

```text
proactive_candidate_created
proactive_evidence_assembled
proactive_state_estimated
proactive_decision_silent
proactive_decision_intervene
proactive_waiting_for_boundary
proactive_offer_shown
proactive_offer_accepted
proactive_offer_dismissed
proactive_offer_ignored
proactive_offer_expired
proactive_action_started
proactive_action_completed
proactive_progress_resumed
proactive_friction_persisted
proactive_support_escalated
proactive_support_faded
proactive_support_exited
proactive_student_preference_changed
proactive_policy_paused
proactive_protected_stage_blocked
```

通用字段：

```text
eventId
decisionId
interventionId
participantId
learningGeneration
experimentId
condition
policyVersion
contractVersion
adapterVersion
chapterId
unitId
sceneType
action
supportLevel
reasonCodes
clientAt
serverAt
```

不要把完整聊天内容复制进研究事件；只保存必要的结构化分类和原消息引用。

---

# 八、V14-C3 小范围实验

## 8.1 阶段 S0：冻结研究契约

完成：

- 十六维政策表；
- 七知识点支架模板；
- 受保护测量窗口；
- 实验条件；
- 主要和次要结果；
- 停止规则；
- policy、contract、adapter 版本。

未冻结前不能招募正式随机试点。

## 8.2 阶段 S1：整章 shadow mode

所有参与者保留 reactive assistant、课程场景选择和 Agentic 路径，但 V14-C3 的所有时刻级主动提示均不展示。新政策只做后台决策，历史前端主动原型和本地 fallback 同时关闭。

目标：

- 收集至少 100 个候选决策窗口，覆盖 7 个知识点和 4 种场景；
- 人工回放判断是否真正需要帮助、是否适合打断；
- 估计单一停留、连续调参、挑战失败和错题信号的误报；
- 检查服务端与浏览器证据是否一致；
- 验证 protected stage 零介入。

两名复核者独立编码：

```text
help_needed: yes / no / uncertain
interruptible: yes / no / uncertain
best_action: silent / L0 / L1 / L2 / L3
```

先报告一致率和分歧，不用模型替代人工真值。

进入 active 的最低门槛：

- 所有受保护窗口零展示；
- 决策持久化成功率不低于 99%；
- intervention id 伪造、重放和跨用户测试全部通过；
- 人工判断的明显误报率低于预注册门槛；
- 每个知识点至少有已复核候选；
- 教师确认没有泄题或错误支架。

## 8.3 阶段 S2：学生级两组随机可行性试点

| 条件 | 体验 |
|---|---|
| Control | reactive assistant、现有场景选择与 Agentic 路径；关闭历史与新时刻级主动政策 |
| Treatment | 在相同基础上，仅开启服务端签发的固定版主动政策包 |

随机化：

- 单位：学生；
- 分层：章前测掌握度高/低；当前代码在完整提交 10 题后，只用 9 道服务端即时评分客观题的 80 分部分划层，`>= 0.60` 为 `pre-high`；
- assignment 在前测完整提交后、进入第一个学习场景前由服务端固定；前测前的候选只记 `unassigned + stay_silent`；
- 同一学生跨设备保持原条件；
- 分析使用 ITT。

当前代码使用层内加盐确定性哈希，适合工程 pilot 的稳定分配与重放，但小样本可能失衡。正式试验在冻结 `assignment_version` 前应二选一：

1. 保留哈希分配，并预注册可接受的条件失衡范围与协变量调整；
2. 改为分层置换区组或中心化随机服务，保证每层小样本更接近 1:1。

一旦首位正式参与者进入学习阶段，不得在同一实验 id 下更换算法、salt、阈值或重新分配。

样本：

- 40 人以下只定位为技术与流程 pilot；
- 60-100 人可做随机可行性和效应量探索；
- 正式效能样本量应基于 shadow/pilot 的方差、缺失率和预期最小效应重新计算。

## 8.4 学习流程

```text
同意与基线
-> 无主动前测
-> GH-06 学习
-> 形成测验作答期间无主动支持
-> 成绩快照后可进入学习性复盘
-> GH-07 学习
-> 后测全程无主动支持
-> 无 Agent 近迁移与跨表征迁移
-> 体验量表与访谈
-> 7 天无 Agent 保持测验
```

从进入后测到完成章后迁移之前，冻结 reactive assistant、主动建议、答案反馈和 Path Coach。迁移完成后才显示后测反馈与章级路径建议，防止推荐内容污染独立迁移。

## 8.5 研究问题

### RQ1 可行性

完整政策能否在真实整章流程中稳定执行，并把不相关或不可打断的建议控制在可接受范围？

### RQ2 学习

相对于 reactive-only 条件，完整主动政策是否改善无 Agent 章后迁移和 7 天保持？

### RQ3 机制

效果是否通过更早暴露误解、表征切换、自我解释和有效错题复盘产生，而不是仅通过增加互动次数？

### RQ4 自主权与差距

政策是否维持学生感知控制，并对低前测学生产生不低于高前测学生的收益？

## 8.6 假设

- H1：Treatment 的无 Agent 近迁移均值高于 Control。
- H2：Treatment 的 7 天保持不低于 Control，并探索是否更高。
- H3：Treatment 提高有效帮助曝光，但不显著提高被打断感。
- H4：在低前测组中，Treatment 减少完全无帮助的高 HelpNeed 窗口。
- H5：接受率不是必要成功条件；即使学生拒绝，系统也应维持自主权和低负担。

## 8.7 测量

### 主要结果

- 章后无 Agent 近迁移复合分数；
- shadow/active 的人工判定误报率；
- 受保护窗口违例数。

### 次要结果

- 跨表征迁移；
- 方法选择；
- 7 天保持；
- 概念解释质量；
- 学习时间；
- 主动建议接受、关闭、忽略；
- 被打断感；
- 感知控制；
- 帮助依赖；
- 条件间表现差距。

### 过程机制

- HelpNeed 高窗口中获得帮助的比例；
- 从 L0/L1 到恢复进展的比例；
- 升级率、渐退率和退出率；
- 推荐场景是否被选择；
- 支架后第一次独立尝试；
- 错误类型是否复现。

## 8.8 分析

主要学习分析：

```text
post_transfer ~ condition + pretest + stratum
```

报告：

- 调整后均值差；
- 标准化效应量；
- 95% CI；
- 缺失与流失；
- ITT 与预注册的敏感性分析。

题目级分析可使用学生和题目随机截距的混合模型。

原则：

- 不把 intervention count 作为 ITT 主模型的普通控制变量，它是处理后的中介；
- 不只分析接受帮助的人；
- 次要结果做多重比较控制；
- 先报告效应量和区间，再解释显著性；
- 小样本无显著差异不能写成“两个条件等效”。

## 8.9 停止规则

立即暂停 active：

- 任一测量题答案泄露；
- 跨用户 decision 或 intervention id；
- 条件分配改变；
- 受保护测量窗口出现主动展示；
- 教师确认存在实质性数学错误；
- 同一知识点短时间重复轰炸；
- 学生关闭后仍继续出现；
- 事件或决策无法可靠落盘。

---

# 九、伦理、隐私与研究治理

## 9.1 人体研究状态

本方案是研究设计和工程蓝图，不构成 IRB/REC 批准或机构授权。正式招募前必须由所属机构判断：

- 是否属于人体研究；
- 需要何种伦理审查；
- 数据保护与跨境处理要求；
- 研究者、学校、教师和平台分别承担什么责任。

如果参与者可能未满 18 岁，应根据机构和当地规则处理监护人同意与学生 assent，不能仅凭平台勾选框推定有效授权。

## 9.2 参与者权利

- 参与或退出不得影响课程成绩、教师评价或平台基本使用。
- Control 与 Treatment 都保留 reactive assistant，避免把必要支持完全撤走。
- 学生可关闭主动提示，但仍保留在原随机条件中进行 ITT 分析。
- 学生可以要求查看、纠正或删除适用范围内的研究数据。
- 同意材料应区分教学服务、研究日志和可选访谈。
- 不使用欺骗性文案把研究条件伪装成能力差异。

## 9.3 数据最小化

默认收集：

- 去标识 participant id；
- 课程位置、结构化学习事件和测验结果；
- 决策、证据引用、政策版本和 resolution；
- 经同意的量表与访谈。

默认不收集：

- 摄像头、麦克风、眼动和生物特征；
- 与研究无关的完整浏览历史；
- 明文身份信息进入模型提示；
- 未经必要性论证的完整聊天内容副本。

研究方案必须预先写明保存期限、访问角色、导出字段、备份、删除和事故响应。

## 9.4 公平与伤害监测

- 按前测水平报告条件效果和误报，不只报告总体均值。
- 可以审计不同群体是否承受不同打断负担，但 protected attributes 不进入首轮决策政策。
- 监测低前测学生是否被过度提示、高前测学生是否被错误打断。
- 发现数学错误、泄题、持续打扰、跨用户数据或明显不利差异时按停止规则暂停。
- 任何 `handoff_human` 都必须指向真实可用的支持渠道，不能显示虚假的“已通知教师”。

---

# 十、泛化与迁移

## 10.1 通用内核与学科适配

可跨章节迁移的内核：

- 教学契约；
- 证据质量；
- HelpNeed 与可打断性双门；
- 不确定性和误报成本；
- 动作白名单；
- L0-L3 支架；
- 自主权、预算、冷却；
- 重复、升级、渐退、退出；
- assignment、审计和因果评价。

必须按学科适配：

- 目标概念；
- 常见误解；
- 哪些互动代表进展；
- 什么是高价值错误；
- 合法支架内容；
- 场景语义；
- 迁移题蓝图。

## 10.2 迁移层级

1. **同知识点新题**：不复用原数值和表面形式。
2. **跨表征**：图像、符号、语言、数值和情境互换。
3. **跨任务**：从解释转到判断、计算或方法选择。
4. **跨知识点**：面积与累积迁移到基本定理和积分方法。
5. **跨章节**：V14-C3 到微分方程直觉扩展章。
6. **跨学科**：把同一政策内核迁移到物理累积或编程问题，但更换 adapter。

## 10.3 防止“只对七个知识点过拟合”

- 政策代码不得出现七个知识点的硬编码阈值分支；
- adapter 使用统一 schema；
- 阈值由证据类型和阶段决定，不由具体题号决定；
- 验证时按知识点留一、按表征留一；
- 保留完全未参与阈值调整的迁移题；
- 新章节接入时只允许新增 adapter，不复制整套政策代码；
- 分布外证据默认 abstain，不强行介入。

## 10.4 后续研究阶梯

```text
固定政策包 RCT
-> 单轴实验：HelpNeed 后立即 vs 等自然边界
-> 单轴实验：L1 vs L2
-> 单轴实验：先询问 vs 低显著度直接展示
-> Micro-randomized trial 优化近端决策
-> 跨章节复现
-> 跨学科 adapter 复现
```

只有固定政策被证明安全、事件量足够且近端结果可靠后，才考虑 learned policy 或 LLM judge。

---

# 十一、分阶段代码路线

## Phase 1：第一个垂直切片

状态：**当前分支已实现，专项 API 与浏览器回归已通过；正式 Shadow 数据尚未采集。**

目标：不改 UI，完成学生级 assignment、服务端 shadow decision 和持久化。

修改：

- 新建 `lib/proactive-policy/index.js`；
- 在 `db.js` 增加 assignment、decision、intervention、policy state；
- 在现有 intervention endpoint 内调用确定性政策；
- 新增 `PROACTIVE_POLICY_MODE=shadow`；
- 在 V14-C3 的 off、shadow 和 Control 中关闭历史主动 UI 与本地 fallback；
- 新增 assignment、权限、直接信号伪造、跨用户、重放和落盘测试；
- 管理导出能看到 silent 与 intervene。

完成标准：

- 同一学生条件稳定；
- 重启后 assignment 和冷却仍在；
- 每个候选都产生可复演 decision；
- control 与 protected stage 永远 silent；
- 不改变当前学生界面。

## Phase 2：V14-C3 adapter

状态：**部分实现。** 已有七知识点元数据、五类候选画像、统一政策入口、七知识点 L1 自我解释、L2 概念线索及 L1/L2 共 14 道平台 probe；OpenMAIC 场景语义事件、L3 内容与教师复核尚未完成。

目标：把七知识点误解、动作和迁移规则结构化。

完成：

- adapter schema；
- route id 校验；
- 28 个场景语义映射；
- L0-L3 支架；
- 教师复核；
- 按知识点的政策单测。

## Phase 3：shadow 回放

目标：校准阈值和误报，不展示。

完成：

- 决策回放工具；
- 双人编码界面或导出；
- 一致率；
- 每类信号 precision、coverage 和 abstain；
- 冻结 `v14-c3-fixed-v2`。

## Phase 4：active UI

状态：**部分实现。** 已接通服务端签发、展示、`shown / accepted / dismissed / ignored` 回传、学生实际回复、平台无提示验证、课件语义事件兼容通道、L1→L2、渐退退出、“标准 / 少提醒 / 关闭”三档偏好、学习代次隔离与未交付升级收束；L3、人工转介、自动第三次负向反馈关闭和跨帮助回合长期渐退仍待实现。

目标：Treatment 展示，Control 不展示。

完成：

- 服务端决策卡；
- 继续、接受、稍后、降频和关闭；
- resolution 状态机；
- 刷新、跨标签、跨设备一致；
- 三档主动提示偏好及服务端持久化；
- 学习重置后生命周期隔离；
- 决策前状态、本次转移、决策后状态的 Harness；
- 移动端与可访问性浏览器测试。

## Phase 5：实验闭环

完成：

- 独立迁移题；
- 保持测验调度；
- 条件平衡管理页；
- ITT 导出；
- 停止规则告警；
- 预注册版本锁定。

## Phase 6：机制拆分与泛化

完成：

- 单一设计轴实验；
- MRT 可行性；
- 下一章 adapter；
- leave-one-knowledge-point-out 与跨表征验证；
- 再评估是否需要 learned policy。

---

# 十二、首轮明确不做

- 不把十六维做成十六因子实验。
- 不让实时 LLM 决定是否介入。
- 不用情绪识别、摄像头、麦克风或眼动。
- 不把停留时间直接命名为困惑。
- 不在测验中提供主动支持。
- 不自动替学生改变路径。
- 不把接受率或即时完成速度当学习效果。
- 不根据 protected attributes 个性化。
- 不在 Calculus Quest 修改 OpenMAIC 源课件。
- 不在 shadow 数据不足时直接训练强化学习政策。

---

# 十三、论文叙事建议

论文可以按以下结构组织：

1. **Introduction**
   - 主动 Agent 从“能先说话”转向“何时应该保持沉默”；
   - 现有部件分散，整章可审计政策不足。
2. **Related Work**
   - proactive tutoring 与 HelpNeed；
   - interruptibility 与 learner agency；
   - adaptive scaffolding 与 fading；
   - agent architecture 与 assistance governance；
   - learning outcomes、transfer 与 JITAI。
3. **Design Space**
   - 四平面十六维；
   - 概念本体与实验因素分离。
4. **System**
   - Calculus Quest 完整章；
   - 通用政策内核与 V14-C3 adapter；
   - 服务端治理与学生控制。
5. **Method**
   - shadow mode；
   - 学生级随机；
   - 无 Agent 迁移与保持；
   - mixed-methods 过程编码。
6. **Results**
   - 技术可靠性和误报；
   - 学习结果；
   - 自主权和表现差距；
   - 机制。
7. **Discussion**
   - 哪些维度能泛化；
   - 哪些必须学科适配；
   - 固定政策到 MRT/learned policy 的边界。

最稳妥的标题主张不是“首个主动教育 Agent”，而是类似：

> From Fragmented Proactive Features to an Auditable Intervention Policy: A Full-Chapter Pilot in Calculus Learning

---

# 十四、最终验收清单

## 设计

- [x] 四平面十六维全部有定义、实现位置和证据指标。
- [x] `stay_silent` 是正式动作。
- [x] HelpNeed 与可打断性独立。
- [x] 明确不确定性、误报和 abstain。
- [x] L0-L3、重复、升级、渐退和退出已在设计中定义。
- [x] 学生保留帮助和路径决定权。

## 系统

- [x] participant assignment 在完整章前测后由服务端固定。
- [x] policy、contract、adapter 版本化。
- [x] decision 在响应前持久化。
- [x] 刷新、重启和跨设备不重置条件与冷却。
- [x] 客户端不能伪造 action、condition 和 support level。
- [x] 控制组、未分组阶段与受保护阶段由服务端强制 silent。
- [x] 同一知识点存在未决 offer 时由服务端阻止重复签发。
- [x] `active` 缺少稳定私有分组盐时失败关闭。
- [x] 平台 probe 答案只在服务端；题目 ID、知识点、强度、重放和跳过均受校验。
- [x] `policy_owned_probe` 与 `courseware_semantic_event` 进入同一生命周期，并在 Harness 中区分来源。
- [x] 每条 decision 固化 `learning_generation`，知识点策略链不跨学习代次拼接。
- [x] 每条 decision 保存 `policyStateBefore`、`stateTransition` 和 `policyStateAfter`，Harness 提供中文状态转移视图。
- [x] 升级动作未实际交付时进入 `closed`，保留独立失败证据和未交付原因。
- [x] 学生可选择“标准 / 少提醒 / 关闭”，关闭不会禁用主动提问。
- [ ] 普通浏览器学习事件尚未达到密码学防伪；正式对抗性试验需增加签名或可信序列来源。

## 研究

- [ ] 整章 shadow mode 完成。
- [ ] 人工 HelpNeed/interruptibility 双编码。
- [ ] 迁移和保持完全无 Agent。
- [ ] ITT 为主分析。
- [ ] 预注册主要结果和停止规则。
- [ ] 不把过程指标替代学习效果。

## 泛化

- [x] 政策内核通过 adapter 查询章节、单元与候选政策，不直接硬编码七个知识点。
- [x] V14-C3 已实现统一的 `chapterId/version/supportsUnit/candidateProfile` adapter 接口。
- [ ] 按知识点和表征留出验证。
- [ ] 新章节只新增 adapter 的迁移成本尚未通过第二章实作验证。
- [x] 未管理章节、未知单元、未知候选、证据不足和高不确定性默认 `stay_silent`。

---

# 参考来源

## 核心设计与实证

1. Lei et al. (2026). *Co-Designing Digital Humans for Online Learning: A Framework for Human-AI Pedagogical Integration*. arXiv:2601.17434; DOI: 10.1007/978-3-032-30784-2_34.
2. Woollaston et al. (2026). *Agentic AI and Pedagogical Best Practice: The Tension Between Automation and Learning*. arXiv:2606.04543.
3. Cohn et al. (2026). *A Theory of Adaptive Scaffolding for LLM-Based Pedagogical Agents*. DOI: 10.1609/aaai.v40i3.37154.
4. Wang et al. (2026). *Should the AI Speak First? Evaluating Proactive vs. Reactive Facilitation in Mixed-Reality Medical Training*. DOI: 10.1145/3772318.3791910.
5. Golrang et al. (2026). *ProPACT: A Proactive AI-Driven Adaptive Collaborative Tutor for Pair Programming*. arXiv:2605.02703.
6. Cohn et al. (2026). *Evidence-Decision-Feedback: Theory-Driven Adaptive Scaffolding for LLM Agents*. arXiv:2602.01415; DOI: 10.1007/978-3-032-29744-0_1.
7. Gabelmann et al. (2026). *Modularizing Educational LLM-Agency for Fostering Responsible Learning Assistance*. arXiv:2605.30187.
8. Kim et al. (2026). *Exploring the Design Space of LLM-Based Programming Support in CS Education: A Scoping Review through the Lens of Assistance Governance*. arXiv:2607.21257.
9. Cody et al. (2020). *Does Autonomy Help Help? The Impact of Unsolicited Hints and Choice on Help Avoidance and Learning*. EDM 2020, pp. 591-595.
10. Maniktala et al. (2020). *Avoiding Help Avoidance: Using Interface Design Changes to Promote Unsolicited Hint Usage in an Intelligent Tutor*. DOI: 10.1007/s40593-020-00213-3; arXiv:2009.13371.
11. Maniktala et al. (2020). *Extending the Hint Factory for the Assistance Dilemma: A Novel, Data-Driven HelpNeed Predictor for Proactive Problem-Solving Help*. arXiv:2010.04124.
12. Maniktala, Chi, and Barnes (2022). *Enhancing a Student Productivity Model for Adaptive Problem-Solving Assistance*. arXiv:2207.03025.
13. Yalçın, Lallé, and Conati (2023). *The Impact of Intelligent Pedagogical Agents' Interventions on Learning and Behavior in Open-Ended Learning Environments*. DOI: 10.1145/3578523.
14. Hutt, Krasich, Brockmole, and D'Mello (2021). *Breaking Out of the Lab: Mitigating Mind Wandering with Gaze-Based Attention-Aware Technology in Classrooms*. CHI 2021. DOI: 10.1145/3411764.3445269.

## 架构、评价与边界

15. Generalized Intelligent Framework for Tutoring (GIFT), U.S. Army Research Laboratory.
16. Nahum-Shani et al. (2017). *Just-in-Time Adaptive Interventions (JITAIs) in Mobile Health: Key Components and Design Principles for Ongoing Health Behavior Support*. *Annals of Behavioral Medicine*, 52(6), 446-462.
17. Klasnja et al. (2015). *Micro-Randomized Trials: An Experimental Design for Developing Just-in-Time Adaptive Interventions*. *Health Psychology*, 34S, 1220-1228.
18. Wang, Zou, Xie, and Qin (2026). *A Scoping Review of Generative AI-Powered Agentic AI in Education: Research Landscape, Agentic Capabilities, and Insights from the Frontier Agent Paradigm, Exemplified by OpenClaw*. DOI: 10.1016/j.caeai.2026.100653.
19. Li and Zheng (2026). *A Scoping Review of Large Language Model-Based Pedagogical Agents*. arXiv:2604.12253.
20. Yu et al. (2024; journal version 2026). Preprint: *From MOOC to MAIC: Reshaping Online Teaching and Learning through LLM-Driven Agents*, arXiv:2409.03512; journal version: *From MOOC to MAIC: Reimagine Online Teaching and Learning Through LLM-Driven Agents*, DOI: 10.1007/s11390-025-6000-0.
21. Hao et al. (2026). *Mapping Student-AI Interaction Dynamics in Multi-Agent Learning Environments: Supporting Personalized Learning and Reducing Performance Gaps*. *Computers & Education, 241*, 105472; arXiv:2506.02993; DOI: 10.1016/j.compedu.2025.105472.
22. Bastani et al. (2025). *Generative AI without Guardrails Can Harm Learning: Evidence from High School Mathematics*. *PNAS*. DOI: 10.1073/pnas.2422633122; correction: 10.1073/pnas.2518204122.
23. Chen et al. (2025). *Unpacking Help-Seeking Process through Multimodal Learning Analytics: A Comparative Study of ChatGPT vs Human Expert*. DOI: 10.1016/j.compedu.2024.105198.
24. Oreopoulos, Liut, Sungu, and Low (2026). *Making AI Tutoring Productive: Evidence from a Mastery-Based Math Practice Experiment*. NBER Working Paper 35621; Annenberg EdWorkingPaper 26-1552; DOI: 10.26300/01qv-6c22.
25. Pi, Zhou, Wei, Zheng, and Li (2026). *Enhancing Learning from Video Lectures with Proactive AI Chatbots*. *Education and Information Technologies*. DOI: 10.1007/s10639-026-14081-2.
26. Oreopoulos and Low (2026). *One Click Away: AI Tutoring with Khanmigo in a Two-Year School Experiment*. Annenberg EdWorkingPaper 26-1551; DOI: 10.26300/kner-hv33.
27. Kim, Baylor, and PALS Group (2006). *Pedagogical Agents as Learning Companions: The Role of Agent Competency and Type of Interaction*. *Educational Technology Research and Development*, 54, 223-243. DOI: 10.1007/s11423-006-8805-z.
28. Gurung et al. (2026). *Improving Hybrid Human-AI Tutoring by Differentiating Human Tutor Roles Based on Student Needs*. EDM 2026; arXiv:2605.11155.
29. Borchers, Viberg, and Kizilcec (2026). *Who Decides in AI-Mediated Learning? The Agency Allocation Framework*. Learning@Scale 2026; arXiv:2604.13534; DOI: 10.1145/3774398.3811627.
30. Khosravi et al. (2026). *Building AI Companions that Prioritise Learning over Performance*. arXiv:2605.04816.
31. Ba, Shi, Wu, and Lu (2026). *Artificial Intelligence Agents in Computer-Supported Collaborative Learning: A Systematic Literature Review*. *Computers and Education: Artificial Intelligence*, 10, 100579. DOI: 10.1016/j.caeai.2026.100579.

## 本地事实来源

- `D:\Desktop\Proactive_AI_for_Learning_Guide\05_96篇论文总索引.tsv`
- `D:\Desktop\Proactive_AI_for_Learning_Guide\01_五篇核心论文精读与主动策略地图.md`
- `D:\Desktop\Proactive_AI_for_Learning_Guide\02_78篇主动策略设计完整精读.md`
- `D:\Desktop\Proactive_AI_for_Learning_Guide\03_18篇领域基础与边界完整精读.md`
- `data/multi-scene-learning-route.json`
- `app/main/proactive-learning.js`
- `app/main/knowledge-assistant.js`
- `lib/learning-assistant.js`
- `lib/agentic-coach.js`
- `lib/agent-orchestrator.js`
- `db.js`
- `server.js`
