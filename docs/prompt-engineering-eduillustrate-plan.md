# 提示词工程与 EduIllustrate 平台标准化生成流程结合方案

## 核心结论

**先标准化提示词，再生成课件，最后从课件提取 KG。**

当前项目的真实依赖方向是：
1. 你定义 chapter 级教学设计（章节 id、标题、目标、知识点列表）
2. 用标准化提示词喂给 Open MAIC 生成互动课件
3. 从生成的课件 JSON 自动提取 KG 的 node 和 edge
4. 合并到 knowledge-graph.json，前端自动加载

EduIllustrate 的标准化流程插在第 1-2 步之间，约束提示词质量，不改变依赖方向。

## 现有提示词体系

项目三层 LLM 调用，已通过 Pioneer API 接通：

| Agent | 文件 | API | 模型 | 功能 |
|-------|------|-----|------|------|
| Grading | `lib/agents/grading.js` | Chat Completions | `claude-sonnet-4-6` | 简答题评分 + 错误分类 + Reflective 自检 |
| Assessment | `lib/agents/assessment.js` | Chat Completions | `claude-sonnet-4-6` | 学习诊断（消费 quiz + grading + 交互数据） |
| Coach | `lib/agentic-coach.js` | Responses API | `pioneer/auto` | 自然语言推荐讲解 |

## 完整自动化 Pipeline（已实现）

代码位置：`lib/course-gen/pipeline.js`

### 流程图

```
你定义 chapter 级教学设计
  { id, title, objective, concepts[] }
       |
       v
  Step 1: protocol.generateCourseOutline()
  LLM 把 chapter 设计展开为 8-10 scene 大纲
  输出: [{ sceneOrder, role, anchorConcept, modality }]
       |
       v
  Step 2: protocol.generateVisualAnchor()
  为每个 scene 选择视觉锚点类型
  输出: { visualAnchorType, description }
       |
       v
  Step 3: protocol.buildScenePrompt()
  把大纲 + 视觉锚点 + 前置概念构建成标准化提示词
  输出: 提示词字符串（喂给 Open MAIC）
       |
       v
  Step 4: 提交给 Open MAIC 的 /api/generate-classroom
  Open MAIC 内部用 agent 生成完整互动课件 JSON
  (或直接传入已有的 courseware JSON 跳过此步)
  输出: 课件 JSON（含 scenes、slides、quizzes、interactive 组件）
       |
       v
  Step 5: protocol.assembleChapter()
  LLM-as-judge 做 Sequential Anchoring 质量检查
  检查: 概念断裂 / 前测覆盖 / 难度跳跃 / 模态同质 / 后测对照
  输出: { gapReport, suggestions, qualityScore, pass }
       |
       v
  Step 6: kg-extract.extractKgFromCourseware()
  从课件 JSON 自动提取 KG nodes + edges
  提取: scene -> node(role/modality), follows 边, alt_modality 边
  输出: { chapterNode, unitNodes[], edges[] }
       |
       v
  Step 7: kg-extract.mergeKg() + 保存课件
  合并到 data/knowledge-graph.json
  保存课件到 resources/open-maic/{chapterId}/index.json
  前端自动加载，无需改代码
```

### 使用方式

```javascript
const { runPipeline } = require("./lib/course-gen/pipeline");

// 方式 A: 全自动（调 Open MAIC API 生成新课件）
const result = await runPipeline({
  chapterId: "E1",
  chapterMeta: {
    title: "E1 极限与连续",
    objective: "用 epsilon-delta 理解极限...",
    concepts: ["极限定义", "连续性", "夹逼定理"]
  },
  openMaicConfig: {
    baseUrl: "http://localhost:3001",
    pollMs: 15000,
    timeoutMs: 7200000
  },
  kgPath: "data/knowledge-graph.json",
  coursewareDir: "resources/open-maic"
});

// 方式 B: 已有课件 JSON，只跑 QA + KG 提取
const courseware = require("./resources/open-maic/A1/index.json");
const result = await runPipeline({
  chapterId: "A1",
  chapterMeta: { title: "...", objective: "...", concepts: [...] },
  coursewareJson: courseware,  // 跳过 Step 1-4
  kgPath: "data/knowledge-graph.json",
  coursewareDir: "resources/open-maic"
});
```

### KG 提取器（`lib/course-gen/kg-extract.js`）

从课件 JSON 自动推断：
- node.role: quiz@scene-1 -> pre_test, quiz@last -> post_test, quiz@middle -> formative_quiz, slide@scene-2 -> concept_map, interactive -> experiment
- node.modality: quiz -> assessment, slide -> narrative, interactive+widgetConfig -> visual/symbolic/relational
- edge.follows: 按 scene order 顺序连接
- edge.alt_modality: 相邻 interactive scene 且 modality 不同时连接
- edge.chapter_handoff: 根据 chapterOrder 重建跨章边

实测对比：从 A1 课件提取 15 个 node，13/15 role 与手写 KG 完全匹配（2 个差异是 formula_bridge 和 recap 这两个更细粒度的 role，提取器推断为 lecture，可手动微调）。

## EduIllustrate 四阶段协议（已实现）

代码位置：`lib/course-gen/protocol.js`

### Stage 1: Outline（大纲生成）
提示词约束：scene-1 = pre_test 覆盖全部 concepts，最后 scene = post_test 对照，scene-2 = concept_map，概念链连续。

### Stage 2: Visual Anchor（视觉锚点选择）
为每个 scene 的 anchorConcept 选择：coordinate_graph / geometric_diagram / dynamic_process / data_table / formula_block

### Stage 3: Parallel Generation
`buildScenePrompt()` 构建标准化提示词，注入 anchorConcept + visualAnchor + prerequisiteConcepts + 生成约束。

### Stage 4: Assembly + Sequential Anchoring Check
LLM-as-judge 检查 5 类问题，输出 `{gapReport, suggestions, qualityScore, pass}`

## 8 维质量评估 Rubric

1. concept_accuracy
2. visual_text_alignment
3. interaction_usability
4. knowledge_chain_continuity
5. pretest_coverage
6. difficulty_gradient
7. language_style
8. accessibility

## Reflective Prompt（已实现）

### Grading Agent 自检
解析 LLM 返回后验证 score/errorType 合法性，检测 score 与 isCorrect 矛盾并自动降置信度。

### Assessment Agent 增强
`buildPrompt` 接收 `interactionEvents`，向 LLM 传递总交互事件数、总停留时长、参数调整次数、事件类型分布。

## Agent-as-Judge 架构（待实现）

参考 Mind2Web 2（arXiv:2506.21506），创建 `lib/agents/qa-vision.js`：
1. 静态代码检查：HTML 结构完整性、交互元素可达性
2. Playwright 截图：捕获课件渲染后页面
3. 多模态 LLM 评分：9 维 rubric（8 维 + 交互可用性）
4. 存储 QA 报告到 DB，admin 页面展示"课件质量"标签页

## 信号链（已打通并验证）

```
学生提交测验
  |-> /api/learning/grade
  |     \-> grading.gradeShortAnswers (Reflective 自检)
  |           \-> DB: ai_score, ai_confidence, ai_feedback, ai_error_type
  |
  \-> agenticAfterQuizSubmit(unit, records)
        \-> agenticRequestPlan(unit, records)  [S10: 传 quizQuestions]
              \-> /api/learning/kg/plan
                    \-> orchestrator.orchestrate
                          |-> grading.gradeShortAnswers(quizQuestions)
                          |-> assessment.analyze(quizSummary, gradingResults, interactionEvents)
                          |-> analytics.evaluate(interactionEvents)
                          |-> coach.plan + coach.explain(assessmentInsight, gradingFeedback)
                          \-> qa.check(plan, assessment)
```

## 迁移到新课件的能力

新增一个章节只需：
1. 定义 chapterMeta（id、title、objective、concepts）
2. 调用 `runPipeline()`（全自动调 Open MAIC，或传入已有 courseware JSON）
3. Pipeline 自动完成：大纲生成 -> 标准化提示词 -> 课件生成 -> QA 检查 -> KG 提取 -> 合并保存
4. Agent 流（Coach/Assessment/Grading）自动适配，无需改代码

## 三篇论文应用

| 论文 | 应用点 | 代码位置 | 状态 |
|------|--------|----------|------|
| EduIllustrate (2604.05005) | 四阶段标准化生成 + 8 维 rubric + KG 提取 | `lib/course-gen/protocol.js`, `kg-extract.js`, `pipeline.js` | 已实现骨架 |
| MATHAGENT (2503.18132) | Grading 升级为 Mixture-of-Graders | `lib/agents/grading.js` | 待扩展 |
| Mind2Web 2 (2506.21506) | QA-Vision Agent：截图 + 多模态判官 | `lib/agents/qa-vision.js` | 待创建 |

## 目标期刊对齐

目标：Agentic AI in Education (BJER SI 2026-000285)

评估三层架构：
- Layer 1（自动）：8 维 rubric + LLM-as-judge 自动评分
- Layer 2（专家）：教师人工评估课件质量和学习效果
- Layer 3（真实世界）：RCT 追踪实验，分析 benchmark / expert / real-world 的 gap
