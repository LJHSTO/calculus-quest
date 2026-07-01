> 成本修订说明：本文件对应早期“多学习方式画像逐条生成”的高覆盖方案，成本较高。当前推荐使用 `docs/maic-ui-fused-single-concept-prompt-pack-v14.md/json/csv`，每个知识点只生成 1 个融合型 MAIC-UI 页面提示词。

# MAIC-UI 单知识点提示词包 v14

这是面向 Calculus Quest / OpenMAIC 推荐流的中文 MAIC-UI 单知识点课件提示词包。

## 核心边界

路径动作不是 MAIC-UI 课件内容类型，而是宿主系统在课件生成后根据测验和交互证据做出的推荐决定。本提示词包只生成单知识点学习资源，并通过 metadata 和事件证据方便后续内置 agent 分析推荐。

## 来源

- OpenMAIC v14 最终提示词：`D:\Desktop\openmaic-gaoshu-ui-locked-v14\10-openmaic-ready-lesson-codeblocks-v14.md`
- 旧 MAIC-UI 提示词：`D:\Desktop\maicui-openmaic-prompts.md`
- 本地 MAIC-UI 规则：`D:\Projects\MAIC-UI\backend\src\services\templates\heavy_mode_prompts.py` 与 `prompts\ai_prompts.py`
- GitHub 参考：`https://github.com/THU-MAIC/MAIC-UI`

## 规模

- GH 模块数：14
- 知识点数：51
- 每个知识点学习方式画像数：10
- 总 MAIC-UI 单页课件提示词数：510

- JSON: `docs/maic-ui-single-concept-prompt-pack-v14.json`
- CSV: `docs/maic-ui-single-concept-prompt-pack-v14.csv`

## 学习方式画像

| contentProfileId | learning_mode | representation | 页面用途 | 系统可如何使用 |
| --- | --- | --- | --- | --- |
| intuition_simulation | experiment | manipulative | 直觉操作实验 | 适合需要补充直觉操作证据、提升低交互参与或验证变量关系时调用 |
| relationship_diagram | lecture | relational | 关系图谱 | 适合需要补充概念关系、表示转换或前后连接证据时调用 |
| symbolic_bridge | lecture | symbolic | 符号桥接 | 适合需要补充符号含义、公式语言或简答表达证据时调用 |
| misconception_contrast | game | relational | 误解对比 | 适合需要暴露并对比典型误解、收集纠错解释证据时调用 |
| error_repair_challenge | game | applied | 纠错挑战 | 适合需要通过可重试挑战收集纠错过程证据时调用 |
| micro_practice | practice | assessment | 微练习确认 | 适合需要快速确认掌握、继续学习前补充检查证据时调用 |
| transfer_context | practice | applied | 迁移应用 | 适合需要收集近迁移应用证据时调用 |
| challenge_experiment | experiment | visual | 挑战实验 | 适合需要收集更高挑战度的操作、比较或边界情况证据时调用 |
| spatial_or_2d_view | experiment | visual | 空间/二维视角 | 适合需要补充空间视角、二维兜底或可视化理解证据时调用 |
| teach_back_card | practice | verbal | 讲给同伴听 | 适合需要收集口头化解释、同伴讲解或反例说明证据时调用 |

## 模块与知识点覆盖

| GH | 主题 | 知识点数 | 生成课件数 | 知识点 |
| --- | --- | ---: | ---: | --- |
| GH-01 | 函数、坐标与图像读法 | 3 | 30 | 输入、输出和函数规则；坐标点与函数图像；图像的上升、下降与变化方向 |
| GH-02 | 极限与连续直觉 | 3 | 30 | 从数表观察趋近；图像上的左右极限；连续就是不跳断 |
| GH-03 | 从平均变化率到导数 | 3 | 30 | 平均变化率和割线；瞬时变化率和切线；导数符号和意义 |
| GH-04 | 常用求导规则与函数组合 | 4 | 40 | 幂函数求导；和差积商规则；链式法则；常见函数变化速度 |
| GH-05 | 导数应用：单调、极值与弯曲 | 4 | 40 | 导函数图像读法；临界点与极值；二阶变化和凹凸；实际最值建模 |
| GH-06 | 积分直觉：面积、累积与原函数 | 3 | 30 | 小矩形逼近面积；定积分作为累积；原函数和不定积分 |
| GH-07 | 微积分基本定理与积分方法 | 4 | 40 | 变上限积分；牛顿-莱布尼茨公式；换元法直觉；分部积分直觉 |
| GH-08 | 多元函数、曲面与偏导数 | 3 | 30 | 多输入函数；曲面与等高线；偏导数 |
| GH-09 | 梯度、方向导数与等高线 | 3 | 30 | 梯度向量；方向导数；梯度与等高线垂直 |
| GH-10 | 多元链式法则与 Jacobian | 4 | 40 | 多元链式法则；向量值函数；Jacobian 表格；局部线性变形 |
| GH-11 | Taylor 近似、Hessian 与驻点判断 | 4 | 40 | 一阶 Taylor 近似；二阶 Taylor 近似；Hessian 矩阵；驻点类型判断 |
| GH-12 | 无约束优化与梯度下降 | 4 | 40 | 目标函数地形；负梯度方向；步长和收敛；迭代路径与停止信号 |
| GH-13 | 约束优化、拉格朗日与凸性 | 4 | 40 | 可行区域；拉格朗日乘子直觉；凸函数和凸集合；线性/二次规划入口 |
| GH-14 | 机器学习与深度学习中的高数闭环 | 5 | 50 | 损失函数和参数；最小二乘梯度；计算图与自动微分；小批量梯度下降；完整学习路线回看 |

## 使用方式

1. 内置 agent 根据学生证据先决定下一步路径动作。
2. 决策之后，agent 从 CSV/JSON 中按 `conceptClusterId`、`learningModeProfile`、`representation`、`systemUse` 选择合适的 MAIC-UI prompt。
3. MAIC-UI 生成的页面只承担单知识点互动学习，不在页面里提任何系统路径动作。
4. 页面通过 `trackEvent` / `postMessage` 产出证据，供下一轮推荐。

## 示例提示词

```text
请生成一个适合 MAIC-UI 的单页自包含互动 HTML 课件。只输出完整 HTML，从 <!DOCTYPE html> 到 </html>，不要输出 Markdown、解释文字、TODO、外部 CDN、远程图片、MathJax 或外部库。

【最重要边界】
学习路径动作由宿主系统在课件生成后根据测验和交互证据决定，不是本页课件内容。本页不要自称任何路径动作课件，不要替学生做路径决定。本页只围绕一个知识点生成一种可操作学习场景，并产出可被宿主系统分析的证据。

【课件定位】
- 课件编号：gh-01-c01-1db701c5-intuition_simulation
- OpenMAIC 模块：GH-01 函数、坐标与图像读法
- 模块主题：函数、坐标与图像读法
- 单独知识点：输入、输出和函数规则
- 学习方式画像：直觉操作实验（learning_mode_profile=experiment，representation=manipulative）
- 可供系统使用的证据场景：适合需要补充直觉操作证据、提升低交互参与或验证变量关系时调用

【只围绕一个知识点】
本页只讲“输入、输出和函数规则”。不要扩展到整章，不要生成目录页，不要替代 OpenMAIC 主体课件。
学习目标：能区分 x、f(x) 和函数规则
常见误解：把函数看成一个数或一个公式名字
OpenMAIC 场景证据：scene 2 输入、输出和函数规则；scene 3 输入、输出和函数规则：拖动实验；scene 4 输入、输出和函数规则：关系图；scene 5 输入、输出和函数规则：误解修复挑战；scene 6 输入、输出和函数规则：空间视角
核心问题：怎样把一个变化过程写成函数，并在坐标图像上读懂它？
核心直觉：函数是输入到输出的规则，坐标图像把这条规则变成可观察的变化轨迹。
后续承接：进入极限和连续：当输入越来越接近某个点时，输出怎样变化。

【推荐流元数据】
在 body 开头附近嵌入 <script type="application/json" id="cq-agentic-metadata">，JSON 内容必须等于：
{"schemaVersion":"cq-maic-ui-single-concept-v1","sourcePromptPack":"openmaic-gaoshu-ui-locked-v14","sourcePromptPath":"D:\\Desktop\\openmaic-gaoshu-ui-locked-v14\\10-openmaic-ready-lesson-codeblocks-v14.md","maicUiReferencePromptPath":"D:\\Desktop\\maicui-openmaic-prompts.md","githubReference":"https://github.com/THU-MAIC/MAIC-UI","ghId":"GH-01","ghTitle":"函数、坐标与图像读法","topic":"函数、坐标与图像读法","conceptIndex":1,"concept":"输入、输出和函数规则","conceptClusterId":"gh-01-c01-1db701c5","conceptClusterLabel":"输入、输出和函数规则","conceptClusterFocus":"能区分 x、f(x) 和函数规则","learningModeProfile":"experiment","contentProfileId":"intuition_simulation","contentProfileLabel":"直觉操作实验","representation":"manipulative","systemUse":"适合需要补充直觉操作证据、提升低交互参与或验证变量关系时调用","systemDecisionNote":"路径动作由宿主系统根据测验和交互证据决定；本页只提供单知识点学习资源和可观察证据。","observableEvidenceKeys":["pre_check","prediction","parameter_commit","observable_evidence","confidence","short_explanation","formative_check"]}

【MAIC-UI 页面结构】
1. 标题区：页面标题和一句学习目标，标题必须包含“输入、输出和函数规则”。
2. 入口诊断：1 个低门槛问题，暴露“把函数看成一个数或一个公式名字”这个误解。
3. 模式声明：定义 window.MAIC_LEARNING_MODE_PROFILE="experiment"，不要在页面可见区解释内部变量。
4. 核心互动：围绕核心变量做滑块/拖拽实验，先预测再观察，突出可观察证据。
5. 概念卡：最小定义、最小公式/关系、一个常见误解、一个判断口令。
6. 形成性检查：1-2 个与本页互动直接相关的问题，答错只给本页内重试或提示。
7. 下一步提示：只给“重做本页活动 / 回看前置概念 / 继续下一概念 / 尝试更难应用”等普通学习建议，不自动跳转、不提宿主推荐逻辑。

【交互与证据硬约束】
- 必须有一个首屏可见的 SVG 或 canvas，可视化初始化后不能空白。
- 必须有至少两个可调参数控件；按钮和滑块都要绑定事件。
- 必须包含“先预测 -> 再操作/观察 -> 再解释”的循环。
- 必须有即时数值反馈、图像反馈、文字反馈和一句学习结论。
- 必须有一个一句话解释输入框和前后信心评分。
- 所有按钮、滑块、输入、拖拽对象必须有 data-action、data-role、aria-label 和可见中文标签。
- 移动端触控目标至少 44px，文字不重叠，布局响应式。

【事件埋点】
必须实现 function trackEvent(eventType, payload)，同时写入 localStorage.maic_learning_events，并调用 window.parent.postMessage({type:'maic_learning_event', payload:event}, '*')。
事件 payload 必须包含：concept_tag="输入、输出和函数规则"、gh_id="GH-01"、content_profile_id="intuition_simulation"、learning_mode="experiment"、conceptClusterId="gh-01-c01-1db701c5"、representation="manipulative"、misconception_tag="把函数看成一个数或一个公式名字"。
至少自然触发：page_loaded、learning_mode_selected、pre_check_submitted、diagnostic_choice、prediction_made、parameter_change、parameter_commit、observable_evidence_captured、confidence_rating、short_explanation_submitted、formative_check_submitted、interaction_complete、next_suggestion_shown。
如果学生通过本页检查，触发 mastery_signal='ready'；如果失败或选择误解，触发 mastery_signal='needs_support'。不要在页面里解释系统会如何使用这些信号。

【稳定性自检但不要输出自检过程】
HTML 完整；JSON 元数据合法；JS 无语法错误；所有控件有响应；SVG/canvas 可见；页面只围绕“输入、输出和函数规则”；学习方式画像与页面活动一致；不显示本地路径、PDF 页码、模型名、provider 或推荐系统内部说明。
```
