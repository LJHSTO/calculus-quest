# Calculus Quest

Calculus Quest 是一个微积分闯关学习平台，包含学生学习页面、交互课件播放器、测验流程、学习记录和研究用管理后台。

## 本地运行

```bash
npm install
node server.js 3789
```

访问地址：

- 学习页面：`http://127.0.0.1:3789/calculus_quest/`
- 管理后台：`http://127.0.0.1:3789/calculus_quest/admin`
- 健康检查：`http://127.0.0.1:3789/calculus_quest/api/health`

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
