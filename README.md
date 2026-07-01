# Calculus Quest

Calculus Quest 是一个微积分闯关学习平台，包含学生学习页面、交互课件播放器、测验流程、学习记录和研究用管理后台。

## 本地运行

```bash
npm install
node server.js 3789
```

访问地址：

- 学习页面：`http://127.0.0.1:3789/`
- 管理后台：`http://127.0.0.1:3789/admin.html`
- 健康检查：`http://127.0.0.1:3789/api/health`

也可以指定其他端口：

```bash
node server.js 3000
```

`npm start` 也可以启动服务，但默认端口取决于 `server.js` 的配置；如果要使用项目约定端口，建议显式运行 `node server.js 3789`。

## 管理员 token

管理后台需要管理员 token。推荐在本机用环境变量配置：

```bash
set ADMIN_TOKEN=your-token
node server.js 3789
```

PowerShell：

```powershell
$env:ADMIN_TOKEN="your-token"
node server.js 3789
```

如果未配置环境变量，服务会尝试读取本地文件：

```text
data/admin-token.txt
```

## 大模型 API（AI 判题 / 诊断 / 助教）

简答题判分、学习诊断、Coach 助教话术都走 `lib/llm.js` 适配的 Pioneer（OpenAI 兼容）接口。未配置时全部回退到本地 mock：

- mock 下 Coach 话术仍可生成（基于规则草案），但简答题不会伪造 0 分；系统会返回 `score: null`、`errorType: "mock_provider"`，并保留为"待复核"，避免把本地开发环境误判成学生答错。
- 要接通真实判题，把 `.env.example` 复制为 `.env` 并填写：

```
LLM_PROVIDER=pioneer
PIONEER_API_KEY=你的 key
# PIONEER_BASE_URL=https://api.pioneer.ai/v1
# PIONEER_MODEL=pioneer/auto
```

服务启动时会自动读取项目根目录的 `.env`（已有 shell 环境变量优先）。也可以直接在 PowerShell 里设置：

```powershell
$env:LLM_PROVIDER="pioneer"
$env:PIONEER_API_KEY="你的 key"
node server.js 3789
```

判题/诊断模型默认使用 `PIONEER_MODEL`（未设置时为 `pioneer/auto`）；也可以分别用 `GRADING_MODEL`、`ASSESSMENT_MODEL` 覆盖。不要在当前区域不可用的模型上硬编码，否则简答题会降级为人工复核。

## 数据文件

运行后会自动在 `data/` 下生成本地数据文件。

- `data/calculus-quest.db`
- `data/admin-token.txt`
- `data/runtime-learn-ecnu.json`

这些运行数据不会提交到 Git。课程知识图谱文件 `data/knowledge-graph.json` 会随项目代码保留。

## 技术栈

- 前端：HTML、CSS、JavaScript
- 后端：Node.js
- 数据库：sql.js / SQLite 文件
- 数学渲染：KaTeX
- 课件资源：站内 HTML 交互课件
