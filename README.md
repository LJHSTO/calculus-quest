# Calculus Quest

微积分闯关学习平台，包含前台学习页面、管理后台和本地 SQLite 数据文件生成逻辑。

## 本地运行

```bash
npm install
npm start
```

默认访问地址：

- 学习页面：http://127.0.0.1:8765/
- 管理后台：http://127.0.0.1:8765/admin.html

也可以指定端口：

```bash
node server.js 3000
```

## 管理员 token

管理后台需要管理员 token。推荐在本机用环境变量配置：

```bash
set ADMIN_TOKEN=your-token
npm start
```

PowerShell：

```powershell
$env:ADMIN_TOKEN="your-token"
npm start
```

## 数据文件

运行后会自动在 `data/` 下生成数据库和运行数据。

- `data/calculus-quest.db`
- `data/learning-records.json`
