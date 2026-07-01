# MAIC-UI 与 OpenMAIC 微积分先修闭环提示词 v3.0

生成时间：2026-06-26
版本：v3.0（Calculus Quest Demo 对齐 + Agentic Coach 交互 + UI 可折叠章节 + 图示模块卡片）

---

## v3.0 核心变更（相对 v2.0）

| 变更项 | v2.0 | v3.0 |
|--------|------|------|
| 项目对齐 | 通用模板 | 对齐 Calculus Quest 实际架构（server.js + agentic-coach.js + agent-orchestrator.js + KG 知识图谱） |
| 测验反馈 | 提交直接显示答案 | Agentic Coach 优先：错题先展示 Coach 提示卡，再提供"显示正确答案"按钮 |
| 章节导航 | 章节始终可见 | 可折叠章节栏：一键收起/展开，localStorage 记忆 |
| 模块卡片 | 纯文本列表 | 图示卡片：前测 讲解 实验 形成性 后测 各有图标 |
| Multi-Agent | 文档描述 | 实际链路：grading assessment analytics coach.plan coach.explain QA check |
| 部署 | 单端口 | 双端口：3789=main(Cloudflare原版) / 3791=feature(新功能) |

---

## 设计逻辑

这份提示词用于把《Mathematics for Machine Learning》中的微积分、线性代数直觉和连续优化内容改造成适合零基础到弱基础准大学生的学习资源。

### Calculus Quest Demo 架构（3791 端口）

```
浏览器 (index.html + app/main/*.js)
    |
    +-- GET /api/learning/kg           kg.js (知识图谱)
    +-- GET /api/learning/quiz-results db.js (测验结果)
    +-- POST /api/learning/grade       agent-orchestrator.js agents/grading.js (AI评分)
    +-- POST /api/learning/kg/plan     agent-orchestrator.js
                                          +-- grading.gradeShortAnswers()
                                          +-- assessment.analyze()
                                          +-- analytics.evaluate()
                                          +-- coach.plan()          KG规则推荐
                                          +-- coach.explain()      LLM旁白
                                          +-- qa.check()           质量检查
```

LLM适配层 (lib/llm.js)：
- mock模式：从KG草稿拼中文叙述，本地开发不依赖网络
- pioneer模式：设置LLM_PROVIDER=pioneer + PIONEER_API_KEY启用真实API

### 前端三大UI改进

1. 可折叠章节栏：左侧Chapters侧边栏增加折叠按钮，收起后48px宽，localStorage记忆
2. 图示模块卡片：每个模块显示类型图标（前测 讲解 互动实验 形成性测验 后测）
3. Agentic Coach答案隐藏：测验提交后错题默认不显示答案，展示Coach提示卡+反思引导，点击按钮后展开

### 章节体系（data.js，8章）

| ID | 标签 | 核心直觉 | 配方 |
|----|------|----------|------|
| A1 | 变化与斜率 | 函数图像让变化可见 | 几何型 |
| A2a | 向量：方向与长度 | 方向+长度=变化的信息量 | 代数型 |
| A2b | 内积与投影 | 投影是方向匹配的度量 | 代数型 |
| A3 | 空间变换与局部线性 | 线性变换保持网格平行 | 代数型 |
| A4 | 曲面与正定性 | 等高线是曲面的地形图 | 几何型 |
| C1 | 导数、梯度与驻点 | 梯度指向增长最快方向 | 综合型 |
| D1 | 梯度下降 | 沿负梯度走向更低点 | 优化型 |
| D2 | 凸性与全局最优 | 凸函数局部最优=全局最优 | 优化型 |

---

## 生成流程（3阶段精简版）

### Stage 1: Planning
输出JSON：narrative_thread + concept_dependencies + misconception_risks + scene_recipe + scene_plan

### Stage 2: Generation
基于Planning生成8场景outlines：
前测(1) 交互(2) 形成性(1) 交互(1) 迁移(1) 复盘(1) 后测(1)
v3新增：quiz场景hideAnswersForWrong=true，每题含coachHint字段

### Stage 3: Assembly + Self-Check
- 叙事连续性检查
- 概念覆盖检查
- 答案隐藏逻辑检查

---

## 通用提示词

### Planning阶段
```
请为OpenMAIC生成Planning大纲。
课程主题：{主题}
核心问题：{核心问题}
核心直觉：{核心直觉}
细分概念：{概念列表}
配方类型：{几何型/代数型/优化型}

输出JSON：narrative_thread, concept_dependencies, misconception_risks, scene_recipe, scene_plan
```

### Scene Generation阶段
```
基于Planning JSON生成8场景outlines。
v3约束：quiz场景hideAnswersForWrong=true，每题含coachHint{concepts,guidance}
叙事连续性：每场景引用前一场景输出
学习闭环：前测暴露 互动回应 形成性检查 后测对比
```

---

## 部署说明

- 3789端口：D:/Projects/Demo (main分支，Cloudflare部署版本)
- 3791端口：D:/Projects/Demo-readable-refactor (feature/progressive-knowledge-groups，含完整multi-agent + v3 UI)
- 本地启动：node server.js [port]
- 生产API：.env中设置LLM_PROVIDER=pioneer + PIONEER_API_KEY

---

## UI关键CSS类名（v3新增）

| 类名 | 用途 |
|------|------|
| .chapter-rail.collapsed | 章节栏折叠 |
| .rail-toggle | 折叠按钮 |
| .lesson-card-icon | 模块类型图标 |
| .coach-hint-box | Coach提示卡片 |
| .coach-reveal-btn | 显示答案按钮 |
| .question-answer-hidden | 隐藏答案区 |