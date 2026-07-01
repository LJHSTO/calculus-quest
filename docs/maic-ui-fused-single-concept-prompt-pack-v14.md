# MAIC-UI 融合型单知识点提示词包 v14

本提示词包将 v14 的知识点按章节分组，但每条 MAIC-UI 提示词只生成一个单独知识点的自包含互动页面。

## 核心修正

学习安排由宿主系统根据前测、形成性测验、后测和交互证据决定；MAIC-UI 页面只呈现单知识点学习活动本身。

## 规模

- 章节/模块数：14
- 知识点数：51
- 每个知识点提示词数：1
- 总 MAIC-UI 页面提示词数：51

## 页面融合内容

每个页面融合：入口诊断、直觉实验、关系整理、误解对比、微练习、迁移挑战、证据总结。

## 文件

- JSON: `docs/maic-ui-fused-single-concept-prompt-pack-v14.json`
- CSV: `docs/maic-ui-fused-single-concept-prompt-pack-v14.csv`

## 章节覆盖

| 章节 | 主题 | 知识点数 | 提示词数 | 知识点 |
| --- | --- | ---: | ---: | --- |
| GH-01 | 函数、坐标与图像读法 | 3 | 3 | 输入、输出和函数规则；坐标点与函数图像；图像的上升、下降与变化方向 |
| GH-02 | 极限与连续直觉 | 3 | 3 | 从数表观察趋近；图像上的左右极限；连续就是不跳断 |
| GH-03 | 从平均变化率到导数 | 3 | 3 | 平均变化率和割线；瞬时变化率和切线；导数符号和意义 |
| GH-04 | 常用求导规则与函数组合 | 4 | 4 | 幂函数求导；和差积商规则；链式法则；常见函数变化速度 |
| GH-05 | 导数应用：单调、极值与弯曲 | 4 | 4 | 导函数图像读法；临界点与极值；二阶变化和凹凸；实际最值建模 |
| GH-06 | 积分直觉：面积、累积与原函数 | 3 | 3 | 小矩形逼近面积；定积分作为累积；原函数和不定积分 |
| GH-07 | 微积分基本定理与积分方法 | 4 | 4 | 变上限积分；牛顿-莱布尼茨公式；换元法直觉；分部积分直觉 |
| GH-08 | 多元函数、曲面与偏导数 | 3 | 3 | 多输入函数；曲面与等高线；偏导数 |
| GH-09 | 梯度、方向导数与等高线 | 3 | 3 | 梯度向量；方向导数；梯度与等高线垂直 |
| GH-10 | 多元链式法则与 Jacobian | 4 | 4 | 多元链式法则；向量值函数；Jacobian 表格；局部线性变形 |
| GH-11 | Taylor 近似、Hessian 与驻点判断 | 4 | 4 | 一阶 Taylor 近似；二阶 Taylor 近似；Hessian 矩阵；驻点类型判断 |
| GH-12 | 无约束优化与梯度下降 | 4 | 4 | 目标函数地形；负梯度方向；步长和收敛；迭代路径与停止信号 |
| GH-13 | 约束优化、拉格朗日与凸性 | 4 | 4 | 可行区域；拉格朗日乘子直觉；凸函数和凸集合；线性/二次规划入口 |
| GH-14 | 机器学习与深度学习中的高数闭环 | 5 | 5 | 损失函数和参数；最小二乘梯度；计算图与自动微分；小批量梯度下降；完整学习路线回看 |

## 示例提示词

```text
请生成一个适合 MAIC-UI 的单页自包含互动 HTML 课件。只输出完整 HTML，从 <!DOCTYPE html> 到 </html>，不要输出 Markdown、解释文字、TODO、外部 CDN、远程图片、MathJax 或外部库。

【页面边界】
本页只围绕一个知识点设计交互场景，不要生成整章目录页，不要生成多课网页，页面只呈现学习活动本身。

【学习对象】
零基础到弱基础的准大学生。语言全部使用简体中文，解释先直觉、后符号、再应用。

【知识点】
页面可见标题：输入、输出和函数规则
学习目标：能区分 x、f(x) 和函数规则
常见误解：把函数看成一个数或一个公式名字
核心问题：怎样把一个变化过程写成函数，并在坐标图像上读懂它？
核心直觉：函数是输入到输出的规则，坐标图像把这条规则变成可观察的变化轨迹。
相关学习素材：输入、输出和函数规则；输入、输出和函数规则：拖动实验；输入、输出和函数规则：关系图；输入、输出和函数规则：误解修复挑战；输入、输出和函数规则：空间视角

【页面元数据】
在 body 开头附近嵌入 <script type="application/json" id="cq-learning-metadata">，JSON 内容必须等于：
{"schemaVersion":"maic-ui-single-concept-v1","concept":"输入、输出和函数规则","learningFocus":"能区分 x、f(x) 和函数规则","misconceptionFocus":"把函数看成一个数或一个公式名字","pageType":"fused_single_concept_interaction","evidenceKeys":["pre_check","prediction","parameter_commit","observable_evidence","confidence","short_explanation","formative_check","challenge_result"]}

【融合型页面结构】
1. 标题区：只出现知识点名称和一句学习目标。
2. 入口诊断：一个低门槛判断或选择题，用来暴露常见误解；提交后给不泄露答案的短反馈。
3. 直觉实验区：一个首屏可见的 SVG 或 canvas，至少两个可调参数控件，能实时显示数值反馈和图像反馈。
4. 关系整理区：用小型关系图、流程图或配对图，把本知识点中的对象、变量、符号和图像关系连起来。
5. 误解对比区：把常见误解与正确想法并排展示，让学生拖拽、配对、分类或选择依据来修正。
6. 微练习区：2-3 个短任务，必须包含一个判断、一个应用、一个一句话解释。
7. 迁移挑战区：一个稍不同的情境，只迁移当前知识点，不提前讲新的知识点。
8. 证据总结区：只总结学生在本页产生的观察、解释和信心变化，不写学习安排建议。

【交互要求】
- 所有按钮、滑块、输入框、可拖拽对象必须有 data-action、data-role、aria-label 和可见中文标签。
- 必须包含“先预测 -> 再操作/观察 -> 再解释”的循环。
- 必须有即时反馈：数值、图像、文字至少各一种。
- 必须有前后信心评分。
- 必须有一个一句话解释输入框。
- 移动端触控目标至少 44px，文字不重叠，布局响应式。
- 复杂效果不稳定时，降级为朴素但完整可运行的 SVG/canvas 互动。

【事件记录】
必须实现 function trackEvent(eventType, payload)，同时写入 localStorage.maic_learning_events，并调用 window.parent.postMessage({type:'maic_learning_event', payload:event}, '*')。
事件 payload 必须包含：concept_tag="输入、输出和函数规则"、learning_focus="能区分 x、f(x) 和函数规则"、misconception_tag="把函数看成一个数或一个公式名字"、interaction_state、confidence、attempt_count、evidence_summary。
至少自然触发：page_loaded、pre_check_submitted、prediction_made、parameter_change、parameter_commit、observable_evidence_captured、confidence_rating、short_explanation_submitted、formative_check_submitted、challenge_result、page_summary_shown。
不要记录姓名、学校、手机号、邮箱或任何敏感个人信息。

【生成前自检但不要输出自检过程】
HTML 完整；JavaScript 无语法错误；SVG/canvas 初始化后可见；所有控件有响应；页面只围绕“输入、输出和函数规则”；只呈现学习活动本身；所有学习活动都服务于学习目标和常见误解修复。
```
