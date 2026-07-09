# Calculus Quest

Calculus Quest 是一个面向高等数学学习的互动学习平台，包含章节路线、讲解页、互动课件、前测、形成性测验、后测、学习记录和管理后台。

当前版本使用 Open MAIC 生成的高数路线作为课程内容来源，并把每章 quiz 调整为适合网页学习流程的三段式测验。

## 本地运行

```powershell
npm install
Copy-Item .env.example .env
npm start
```

默认访问：

```text
http://127.0.0.1:8765/
```

健康检查：

```text
http://127.0.0.1:8765/api/health
```

## 环境变量

`.env.example` 只提供占位配置，不包含真实密钥。

```dotenv
HOST=127.0.0.1
PORT=8765

LLM_PROVIDER=mock
# LLM_PROVIDER=openai-compatible
# OPENAI_COMPATIBLE_BASE_URL=https://api.example.com/v1
# OPENAI_COMPATIBLE_API_KEY=replace-with-your-key
# OPENAI_COMPATIBLE_MODEL=replace-with-your-model
# GRADING_MODEL=replace-with-your-model
# ASSESSMENT_MODEL=replace-with-your-model

# Optional admin password for the learning analytics dashboard.
# ADMIN_TOKEN=replace-with-a-strong-password
```

`LLM_PROVIDER=mock` 时不会调用真实模型，简答题会按 0 分兜底并标记需复核，以免学习流程被卡住。需要真实简答题批改时，部署环境中设置 `LLM_PROVIDER=openai-compatible`、接口地址、密钥和模型名即可。不要提交 `.env`、密钥文件或任何真实 token。

## 课程数据

核心课程路线位于：

```text
data/openmaic-v14-route.json
```

该文件包含章节、知识点、讲解页、互动资源候选、前测、形成性测验和后测。当前 quiz 已按以下规则校验：

- 每章前测、形成性测验、后测各 10 题。
- 形成性测验和后测至少包含 1 道简答题。
- 每章 quiz 覆盖该章全部知识点。
- 题干不再出现 `scene x` 这类 Open MAIC 内部场景编号。
- 需要回看课件的题目使用可点击的 `[[cq-unit:...]]` 标记渲染为“回看课件”按钮。
- 题面提示需要图片但没有媒体或回看链接的题目已清理。

## 部署到子路径

如果通过反向代理挂到：

```text
https://edusys3.sii.edu.cn/calculus_quest/
```

建议让代理把 `/calculus_quest/` 转发到本服务根路径，并保留静态资源与 API 路径。示例思路：

```nginx
location /calculus_quest/ {
  proxy_pass http://127.0.0.1:8765/;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 常用命令

```powershell
npm start
node server.js 8765
node migrate.js
```

## Git 提交注意

只提交学习平台运行所需文件。不要提交本地真实数据、临时脚本、浏览器测试产物、模型密钥或管理员 token。
