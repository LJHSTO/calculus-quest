# MAIC-UI Agentic OpenMAIC Prompt

This document defines the MAIC-UI companion-courseware prompt for the Calculus Quest agentic recommendation flow. It is based on two authoritative sources:

- OpenMAIC final prompt pack: `D:\Desktop\openmaic-gaoshu-ui-locked-v14\10-openmaic-ready-lesson-codeblocks-v14.md`
- MAIC-UI generation rules and prompt templates: `D:\Projects\MAIC-UI\backend\src\services\prompts\ai_prompts.py`, `D:\Projects\MAIC-UI\backend\src\services\templates\heavy_mode_prompts.py`, and `D:\Projects\MAIC-UI\ops\local-batch\maicui-openmaic-prompts.md`

The prompt below is not a replacement for the OpenMAIC outline prompt. OpenMAIC produces the main multi-scene course JSON. MAIC-UI produces adaptive HTML companion lessons that the host can recommend for skip confirmation, relearning, review, extension, and preview.

## Integration Goal

Generate MAIC-UI HTML lessons that can be inserted into the current recommendation flow without breaking the OpenMAIC course spine.

A generated MAIC-UI lesson must:

- cover one clearly named knowledge point from the OpenMAIC v14 course map;
- use the same concept wording as the OpenMAIC scene or knowledge-point line;
- expose `observableEvidence` that quizzes, Coach narration, and Admin research traces can cite;
- include recommendation metadata for `conceptClusterId`, `representation`, `scenarioType`, and `difficultyBand`;
- emit interaction events that the host already records from iframe DOM tracking and `postMessage`;
- support the project mechanisms: skip, relearn, review, extension, and preview;
- remain self-contained and usable inside the OpenMAIC iframe shell.

## Runtime Contract

The host project currently reads or infers these fields from OpenMAIC scene metadata:

```json
{
  "conceptClusterId": "slope-transfer",
  "conceptClusterLabel": "斜率与变化快慢",
  "conceptClusterFocus": "用两点斜率、排序、关系网等不同场景理解变化率。",
  "representation": "relational",
  "scenarioType": "remediate",
  "difficultyBand": "remedial"
}
```

MAIC-UI HTML cannot currently replace the OpenMAIC JSON manifest by itself, so every generated HTML file must also embed the same data in a parseable script tag. This makes the file self-describing for future import tools and helps humans map it into `AGENTIC_MAIC_UI_ADAPTIVE_MAP`.

```html
<script type="application/json" id="cq-agentic-metadata">
{
  "schemaVersion": "cq-agentic-maic-ui-v1",
  "sourcePromptPack": "openmaic-gaoshu-ui-locked-v14",
  "ghId": "GH-01",
  "hostChapterId": "A1",
  "hostSceneOrder": 11,
  "adaptiveRole": "relearn",
  "conceptClusterId": "slope-transfer",
  "conceptClusterLabel": "斜率与变化快慢",
  "conceptClusterFocus": "用两点斜率、排序、关系网等不同场景理解变化率。",
  "concept": "斜率与变化率",
  "representation": "relational",
  "scenarioType": "remediate",
  "difficultyBand": "remedial",
  "masteryTargets": ["能解释 rise/run", "能比较变化快慢", "能判断斜率正负"],
  "misconceptions": ["只记公式，不知道分子分母代表什么"],
  "observableEvidenceKeys": ["prediction", "parameterCommit", "retry", "confidence", "explanation"],
  "recommendedWhen": {
    "scoreBelow": 60,
    "riskLevel": ["medium", "high"],
    "suggestedMove": ["alternate_scene", "make_interactive"],
    "answerRevealCountAtLeast": 1,
    "repeatCountAtLeast": 2
  },
  "returnToOpenMaic": {
    "resumeSceneOrder": 8,
    "reason": "完成重学后回到形成性测验或下一主线场景"
  }
}
</script>
```

## Recommendation Roles

Use these roles consistently. They are what make the generated lessons readable by the Planner and by the Admin evidence trace.

| Role | `scenarioType` | `difficultyBand` | Recommended when | Required design |
| --- | --- | --- | --- | --- |
| skip-check | `diagnose` or `check` | `diagnostic` | learner shows high mastery and low friction | 2-3 fast evidence tasks, confidence check, no new content |
| relearn | `remediate` | `remedial` | score below 60, high friction, answer reveal, repeated visit, weak short answer | alternate representation, misconception repair, slower guided steps |
| review | `remediate` | `remedial` | post-test or end-of-cluster evidence is incomplete | compact recap, concept map, missing-link repair |
| extension | `extend` | `extension` | mastery high and friction low | transfer challenge, harder context, one-step beyond mainline |
| preview | `preview` | `extension` | chapter handoff or next-cluster preparation | bridge to next OpenMAIC concept without teaching the whole next unit |

Representations must be chosen from: `verbal`, `visual`, `symbolic`, `numeric`, `manipulative`, `relational`, `applied`, `assessment`.

## Event Contract

The host iframe tracker already records clicks, inputs, slider commits, scrolls, wheel events, form submissions, and drag events. A generated MAIC-UI lesson should also implement `trackEvent(eventType, payload)` and call `window.parent.postMessage` so evidence is explicit.

Required implementation pattern:

```html
<script>
const CQ_METADATA = JSON.parse(document.getElementById('cq-agentic-metadata').textContent);
function trackEvent(eventType, payload = {}) {
  const event = {
    eventType,
    source: 'maic-ui-agentic',
    unitId: CQ_METADATA.hostChapterId + '-scene-' + CQ_METADATA.hostSceneOrder,
    data: {
      ...payload,
      cqMetadata: CQ_METADATA,
      conceptClusterId: CQ_METADATA.conceptClusterId,
      scenarioType: CQ_METADATA.scenarioType,
      difficultyBand: CQ_METADATA.difficultyBand
    },
    timing: { clientAt: new Date().toISOString() }
  };
  try {
    const key = 'maic_learning_events';
    const rows = JSON.parse(localStorage.getItem(key) || '[]');
    rows.push(event);
    localStorage.setItem(key, JSON.stringify(rows.slice(-200)));
  } catch (error) {}
  try { window.parent.postMessage(event, '*'); } catch (error) {}
}
</script>
```

Required event names:

- `diagnostic_choice` when the learner selects an initial answer or misconception;
- `parameter_change` on slider/input movement;
- `parameter_commit` when the learner releases a slider, confirms a value, or submits a setting;
- `prediction_made` before revealing a result;
- `observable_evidence_captured` when the lesson records a usable observation;
- `retry_after_feedback` when the learner tries again after a hint;
- `confidence_rating` before and after the task;
- `short_explanation_submitted` when the learner writes a sentence;
- `mastery_confirmed` when the learner passes a skip-check or extension task;
- `needs_relearn` when the learner chooses a misconception or fails repeated checks.

All controls should include `data-action`, `data-role`, `aria-label`, and visible Chinese labels. This lets the host DOM tracker produce useful labels even if `postMessage` fails.

## Copyable Master Prompt

Use this prompt to generate a single MAIC-UI adaptive HTML lesson for one OpenMAIC knowledge point.

```text
你是 MAIC-UI 交互式学习课件生成器，也是 Calculus Quest / OpenMAIC 推荐流的适配器。请生成一个完整、可直接运行、可嵌入 iframe 的 HTML 文件。只输出 HTML，从 <!DOCTYPE html> 到 </html>，不要输出 markdown、代码围栏或解释文字。

【宿主课程信息】
OpenMAIC 提示词版本：openmaic-gaoshu-ui-locked-v14
GH 模块：{GH_ID} {GH_TITLE}
宿主章节：{HOST_CHAPTER_ID}
宿主 OpenMAIC 场景：scene {HOST_SCENE_ORDER}，标题：{HOST_SCENE_TITLE}
推荐角色：{ADAPTIVE_ROLE}，只能是 skip-check / relearn / review / extension / preview 之一
回到主线：完成后回到 scene {RESUME_SCENE_ORDER} 或等待宿主 Coach 决策

【知识点对齐】
知识点：{CONCEPT}
学习目标：{MASTERY_TARGETS}
常见误解：{MISCONCEPTIONS}
前置场景证据：{OPENMAIC_OBSERVABLE_EVIDENCE}
后续承接：{NEXT_OPENMAIC_CONCEPT_OR_SCENE}

【推荐流元数据，必须原样嵌入 HTML】
在 <body> 开头附近加入 <script type="application/json" id="cq-agentic-metadata">，内容必须是合法 JSON，字段如下：
- schemaVersion: "cq-agentic-maic-ui-v1"
- sourcePromptPack: "openmaic-gaoshu-ui-locked-v14"
- ghId: "{GH_ID}"
- hostChapterId: "{HOST_CHAPTER_ID}"
- hostSceneOrder: {HOST_SCENE_ORDER}
- adaptiveRole: "{ADAPTIVE_ROLE}"
- conceptClusterId: "{CONCEPT_CLUSTER_ID}"
- conceptClusterLabel: "{CONCEPT_CLUSTER_LABEL}"
- conceptClusterFocus: "{CONCEPT_CLUSTER_FOCUS}"
- concept: "{CONCEPT}"
- representation: "{REPRESENTATION}"
- scenarioType: "{SCENARIO_TYPE}"
- difficultyBand: "{DIFFICULTY_BAND}"
- masteryTargets: {MASTERY_TARGETS_JSON}
- misconceptions: {MISCONCEPTIONS_JSON}
- observableEvidenceKeys: ["prediction", "parameterCommit", "retry", "confidence", "explanation"]
- recommendedWhen: {RECOMMENDED_WHEN_JSON}
- returnToOpenMaic: {"resumeSceneOrder": {RESUME_SCENE_ORDER}, "reason": "完成后回到 OpenMAIC 主线或等待 Coach 决策"}

【内容目标】
1. 课件只教学当前知识点，不扩散到无关主题。
2. 如果推荐角色是 relearn 或 review：必须先暴露误解，再用不同表征修复误解，最后要求学生用一句话解释。
3. 如果推荐角色是 extension 或 preview：必须把当前知识点迁移到更难或下一个概念，但不能替代下一节 OpenMAIC 主课。
4. 如果推荐角色是 skip-check：必须快速验证掌握，不讲新内容，通过后触发 mastery_confirmed。
5. 所有解释都要服务 OpenMAIC 主体课件，不显示本地文件路径、PDF 页码、模型名、provider 或内部生成信息。

【交互与证据要求】
1. 必须包含一个 Canvas 或 SVG 可视化区，首屏可见。
2. 必须包含至少两个可调参数控件，优先使用 input type="range"。
3. 必须包含“开始/暂停/重置”或等价的运行、停止、重置控件。
4. 必须包含“先预测，再观察，再解释”的循环。
5. 必须有即时数值反馈、图像反馈、文字反馈和一句学习结论。
6. 必须有一个简短解释输入框，要求学生用一句话说明观察结果。
7. 必须有前后信心评分，调用 confidence_rating。
8. 必须实现 trackEvent(eventType, payload)，写入 localStorage.maic_learning_events，并 window.parent.postMessage(event, '*')。
9. 在参数变化、参数提交、预测、解释、重试、掌握确认、需要重学时调用对应事件。
10. 所有按钮、滑块、输入框、可拖拽对象必须有 data-action / data-role / aria-label。

【技术要求】
1. 完整 HTML 文档，中文界面，HTML/CSS/JS 变量名用英文。
2. 自包含运行，不依赖本地文件、隐藏按钮、未绑定事件或外部数据。可以写内联 CSS；如使用 CDN，必须有不依赖 CDN 的基本布局 fallback。
3. JavaScript 无语法错误，所有事件监听器正确绑定。
4. Canvas/SVG 初始化后不能空白，移动端也可见。
5. 移动端触控目标至少 44px，高对比，文字不重叠。
6. 数学公式使用标准文本或 LaTeX。若在 JS 字符串中输出 LaTeX，反斜杠必须双重转义。
7. 不要生成 PBL、登录、导航外壳、整站首页、外部链接或下载按钮。

【输出自检但不要输出自检过程】
- HTML 从 <!DOCTYPE html> 开始，到 </html> 结束。
- cq-agentic-metadata 是合法 JSON。
- conceptClusterId / representation / scenarioType / difficultyBand 与推荐角色一致。
- 每个 interactive 控件都会产生可追踪事件。
- 至少一次 prediction_made、observable_evidence_captured、short_explanation_submitted、confidence_rating 可由学生自然触发。
- relearn/review 能修复指定误解；extension/preview 能迁移但不抢教主线；skip-check 能确认掌握。
```

## Role Field Defaults

Use these defaults unless a chapter-specific design says otherwise.

```json
{
  "skip-check": {
    "representation": "assessment",
    "scenarioType": "check",
    "difficultyBand": "diagnostic",
    "recommendedWhen": { "masteryAtLeast": 0.8, "frictionBelow": 0.35, "answerRevealCount": 0 }
  },
  "relearn": {
    "representation": "relational",
    "scenarioType": "remediate",
    "difficultyBand": "remedial",
    "recommendedWhen": { "scoreBelow": 60, "riskLevel": ["medium", "high"], "suggestedMove": ["alternate_scene", "make_interactive"] }
  },
  "review": {
    "representation": "verbal",
    "scenarioType": "remediate",
    "difficultyBand": "remedial",
    "recommendedWhen": { "phase": ["post", "review"], "pendingReviewAtLeast": 1 }
  },
  "extension": {
    "representation": "applied",
    "scenarioType": "extend",
    "difficultyBand": "extension",
    "recommendedWhen": { "masteryAtLeast": 0.8, "frictionBelow": 0.35, "suggestedMove": ["extend"] }
  },
  "preview": {
    "representation": "relational",
    "scenarioType": "preview",
    "difficultyBand": "extension",
    "recommendedWhen": { "phase": ["chapter_handoff"], "masteryAtLeast": 0.75 }
  }
}
```

## OpenMAIC V14 Coverage Matrix

The final OpenMAIC v14 prompt pack contains 14 GH modules and 51 knowledge points. A complete MAIC-UI adaptive pack should generate at least one `relearn` or `review` lesson for every knowledge point, plus `extension` or `preview` lessons for the concepts marked as bridge concepts.

| GH | Topic | Knowledge points | Scene count |
| --- | --- | --- | --- |
| GH-01 | 函数、坐标与图像读法 | 输入、输出和函数规则；坐标点与函数图像；图像的上升、下降与变化方向 | 19 |
| GH-02 | 极限与连续直觉 | 从数表观察趋近；图像上的左右极限；连续就是不跳断 | 19 |
| GH-03 | 从平均变化率到导数 | 平均变化率和割线；瞬时变化率和切线；导数符号和意义 | 19 |
| GH-04 | 常用求导规则与函数组合 | 幂函数求导；和差积商规则；链式法则；常见函数变化速度 | 24 |
| GH-05 | 导数应用：单调、极值与弯曲 | 导函数图像读法；临界点与极值；二阶变化和凹凸；实际最值建模 | 24 |
| GH-06 | 积分直觉：面积、累积与原函数 | 小矩形逼近面积；定积分作为累积；原函数和不定积分 | 19 |
| GH-07 | 微积分基本定理与积分方法 | 变上限积分；牛顿-莱布尼茨公式；换元法直觉；分部积分直觉 | 24 |
| GH-08 | 多元函数、曲面与偏导数 | 多输入函数；曲面与等高线；偏导数 | 19 |
| GH-09 | 梯度、方向导数与等高线 | 梯度向量；方向导数；梯度与等高线垂直 | 19 |
| GH-10 | 多元链式法则与 Jacobian | 多元链式法则；向量值函数；Jacobian 表格；局部线性变形 | 24 |
| GH-11 | Taylor 近似、Hessian 与驻点判断 | 一阶 Taylor 近似；二阶 Taylor 近似；Hessian 矩阵；驻点类型判断 | 24 |
| GH-12 | 无约束优化与梯度下降 | 目标函数地形；负梯度方向；步长和收敛；迭代路径与停止信号 | 24 |
| GH-13 | 约束优化、拉格朗日与凸性 | 可行区域；拉格朗日乘子直觉；凸函数和凸集合；线性/二次规划入口 | 24 |
| GH-14 | 机器学习与深度学习中的高数闭环 | 损失函数和参数；最小二乘梯度；计算图与自动微分；小批量梯度下降；完整学习路线回看 | 29 |

## Batch Generation Rule

For each row in the coverage matrix, generate a MAIC-UI adaptive pack with this minimum shape:

- one `skip-check` lesson for each module or concept cluster that can verify high mastery before hiding intermediate scenes;
- one `relearn` lesson for every knowledge point;
- one `review` lesson for every module summary or post-test handoff;
- one `extension` lesson for the last knowledge point in each module;
- one `preview` lesson when the module explicitly prepares the next GH module.

The `skip-check` lesson must never merely say "you may skip". It must collect quick evidence: two objective decisions, one confidence rating, and one short explanation. It should emit `mastery_confirmed` only when the learner passes the check; otherwise it should emit `needs_relearn` and point back to the most relevant `relearn` lesson in the same `conceptClusterId`.

File naming convention:

```text
{GH_ID}_{role}_{concept-slug}.html
```

Examples:

```text
GH-01_relearn_slope-transfer.html
GH-01_extension_local-linear.html
GH-02_preview_derivative-readiness.html
GH-14_review_full-route.html
```

## Current A1 Mapping

The current A1 host course already uses these agentic slots:

| Host order | Flow role | Current file label | Recommended metadata |
| --- | --- | --- | --- |
| 5 | 形成性重学 | 函数机器重学 | `function-coordinate`, `remediate`, `remedial` |
| 11 | 后测重学 | 斜率语言重学 | `slope-transfer`, `remediate`, `remedial` |
| 12 | 复盘重学 | 坐标图像复盘 | `review-post`, `remediate`, `remedial` |
| 13 | 一步拓展 | 局部线性拓展 | `local-linear`, `extend`, `extension` |
| 14 | 跨章预告 | 导数极值预告 | `local-linear`, `preview`, `extension` |

### A1 Relearn Example

Use this filled prompt to generate the MAIC-UI lesson that should be recommended after a learner struggles in OpenMAIC `A1-scene-7 两点斜率实验` or `A1-scene-8 过程性测试`.

```text
你是 MAIC-UI 交互式学习课件生成器，也是 Calculus Quest / OpenMAIC 推荐流的适配器。请生成一个完整、可直接运行、可嵌入 iframe 的 HTML 文件。只输出 HTML，从 <!DOCTYPE html> 到 </html>，不要输出 markdown、代码围栏或解释文字。

【宿主课程信息】
OpenMAIC 提示词版本：openmaic-gaoshu-ui-locked-v14
GH 模块：GH-01 函数、坐标与图像读法
宿主章节：A1
宿主 OpenMAIC 场景：scene 11，标题：斜率语言重学
推荐角色：relearn
回到主线：完成后回到 scene 8 或等待宿主 Coach 决策

【知识点对齐】
知识点：斜率与变化率
学习目标：["能用 delta y / delta x 解释两点间平均变化率", "能根据图像比较变化快慢", "能判断正斜率、零斜率、负斜率"]
常见误解：["只记公式，不知道分子分母代表什么", "把斜率大小和图像高度混淆", "只看终点高低，不看水平距离"]
前置场景证据：OpenMAIC A1 的两点斜率实验要求学生拖动两点，观察 rise/run、水平距离和斜率正负；形成性测验会引用这些 observableEvidence。
后续承接：回到变化快慢排序、局部斜率探针，最后承接导数中的瞬时变化率。

【推荐流元数据】
conceptClusterId="slope-transfer"
conceptClusterLabel="斜率与变化快慢"
conceptClusterFocus="用两点斜率、排序、关系网等不同场景理解变化率。"
representation="relational"
scenarioType="remediate"
difficultyBand="remedial"
recommendedWhen={"scoreBelow":60,"riskLevel":["medium","high"],"answerRevealCountAtLeast":1,"repeatCountAtLeast":2,"suggestedMove":["alternate_scene","make_interactive"]}

【交互设计】
1. 首屏显示一个斜率关系图：点 A、点 B、水平变化、竖直变化、rise/run、斜率符号。
2. 学生先预测：拖动 B 点前先选择“斜率会变大/变小/变号/不变”。
3. 学生拖动点 A 和 B，滑块调节水平距离和竖直变化，实时显示斜率。
4. 如果学生只看高度，给出反馈：请同时看水平距离。
5. 加入一个“变化快慢配对”小挑战：把 3 条线段拖到慢/中/快三个区域。
6. 最后要求学生写一句话：为什么同样升高 4，水平距离不同，斜率会不同？
7. 前后各一次信心评分。
8. 调用 trackEvent：diagnostic_choice、parameter_change、parameter_commit、prediction_made、observable_evidence_captured、retry_after_feedback、confidence_rating、short_explanation_submitted、needs_relearn 或 mastery_confirmed。

【技术与自检】
按母版提示词的全部技术要求执行。
```

### A1 Extension Example

Use this when a learner has high mastery and low friction after `A1-scene-10 局部斜率探针`.

```text
GH 模块：GH-01 函数、坐标与图像读法
宿主章节：A1
宿主 OpenMAIC 场景：scene 13，标题：局部线性拓展
推荐角色：extension
知识点：局部变化与导数预备
conceptClusterId="local-linear"
conceptClusterLabel="局部变化与拓展"
representation="applied"
scenarioType="extend"
difficultyBand="extension"
recommendedWhen={"masteryAtLeast":0.8,"frictionBelow":0.35,"suggestedMove":["extend"]}

生成一个“放大后曲线像直线”的 MAIC-UI HTML：学生用窗口宽度滑块逐步缩小观察区间，预测割线是否接近切线，观察局部线性近似误差，最后用一句话解释为什么这会通向导数。不要提前教授完整导数定义，只做 A1 到 GH-03 的桥。
```

## Verification Checklist

Before importing a generated MAIC-UI lesson into the project, check:

- The HTML file opens in an iframe without network or local path dependency.
- `cq-agentic-metadata` parses as JSON.
- `conceptClusterId`, `scenarioType`, and `difficultyBand` match the intended host slot.
- There is at least one visible Canvas or SVG.
- There are at least two controls that trigger `parameter_change` and `parameter_commit`.
- Prediction, observation, explanation, confidence, retry, and mastery/needs-relearn events can all be triggered.
- The lesson does not show answers before the learner acts.
- The lesson cites OpenMAIC observableEvidence in plain learner-facing language.
- The lesson repairs or extends the named concept without replacing the next OpenMAIC main scene.
- Mobile layout has no overlapping text or unreachable controls.

