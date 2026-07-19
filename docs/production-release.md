# Calculus Quest 生产发布与历史数据保护

本文适用于 Windows + PowerShell 部署。目标是让代码更新与历史学习数据彻底分离，并确保任何发布都可核对、可回退。

## 一次性改造

### 1. 把生产数据库移出 Git 仓库

先停止当前服务，再建立独立数据目录。以下路径只是示例：

```powershell
$AppDir = 'D:\Sites\calculus-quest'
$DataDir = 'D:\CalculusQuestData'
$DbPath = Join-Path $DataDir 'calculus-quest.db'

New-Item -ItemType Directory -Path $DataDir -Force
Copy-Item -LiteralPath (Join-Path $AppDir 'data\calculus-quest.db') -Destination $DbPath
```

旧数据库先保留，不要删除。确认新版本读取到全部用户和学习记录后再归档。

### 2. 配置生产环境

在服务器的 `$AppDir\.env` 中配置：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=8765
BASE_PATH=/calculus_quest
DB_PATH=D:\CalculusQuestData\calculus-quest.db
ADMIN_TOKEN=使用现有管理员Token
LLM_PROVIDER=mock

APP_VERSION=填写本次Git提交或发布号
EXPERIMENT_ID=填写研究实验编号
EXPERIMENT_CONDITION=填写实验条件
EXPERIMENT_COHORT=填写学生队列
```

生产模式下，如果没有设置 `DB_PATH`，或者数据库仍位于代码仓库内，服务会拒绝启动。服务还会创建同路径 `.lock` 文件，阻止两个 Node 进程同时写同一个数据库。

应用会在启动时读取当前工作目录下的 `.env`。因此 Windows 服务或 `Start-Process` 的工作目录必须是 `$AppDir`；如果从其他目录启动，即使仓库里有 `.env` 也不会生效。进程环境变量仍然优先于 `.env` 中的同名配置。

`BASE_PATH` 表示浏览器看到的公开前缀，固定写成 `/calculus_quest`，不要带尾斜杠。当前服务端同时接受两种 Nginx 转发语义：

- **保留前缀（推荐）**：`proxy_pass` 后不带尾斜杠，Node 收到 `/calculus_quest/api/...` 后按 `BASE_PATH` 剥离。
- **剥离前缀（兼容现有部署）**：`proxy_pass` 后带尾斜杠，Node 收到 `/api/...`；服务仍会正常处理，并继续向前端报告公开前缀 `/calculus_quest`。

新部署推荐保留前缀，配置如下：

```nginx
location = /calculus_quest {
    return 301 /calculus_quest/;
}

location /calculus_quest/ {
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:8765;
}
```

如果服务器现有配置是 `proxy_pass http://127.0.0.1:8765/;`，不必仅为了本次升级修改它；新版本已经对“前缀被 Nginx 剥离”的请求做了回归测试。不要把上游写成 `http://127.0.0.1:8765/calculus_quest/`，也不要额外叠加 rewrite，否则会产生重复前缀。

启动后访问 `/calculus_quest/api/health`，响应中的 `basePath` 必须是 `/calculus_quest`。不能只检查首页，还要检查 CSS/JS、登录、管理员、测验和课件 iframe。

### 3. 识别并升级旧昵称账号

早期版本允许只用昵称保存学习记录，没有密码。此类用户会继续出现在管理员面板中，历史快照也仍然存在，但不能直接使用任意密码登录。

新版本登录接口会区分三种情况：

- 没有找到账号：提示检查昵称或邮箱，或先注册。
- 历史账号尚未设置密码：提示切换到“注册”，使用同一昵称设置密码。
- 账号存在但密码不正确：只提示密码错误。

旧账号升级时，学生应在“注册”页填写原昵称和新密码。服务会复用原 `users.id`，保留该用户已有的快照、测验、事件和反馈，不会创建一个空白新账号。升级前可通过管理员导出的 `loginMode` 辨别：`nickname` 表示旧账号尚无密码，`password` 表示已经完成密码设置。

不要直接在数据库中手工填写明文密码。密码必须经过应用的 `scrypt` 流程生成哈希。

## 每次发布

### 1. 确认生产进程

不要按端口盲目结束 Node。先检查 PID 和命令行：

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*calculus-quest*server.js*' } |
  Select-Object ProcessId, CommandLine
```

新版本部署完成后，首选使用管理员 Token 调用安全停机接口。Token 在提示时输入，不要写进脚本：

```powershell
$AdminToken = Read-Host 'Admin Token'
Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8765/calculus_quest/api/admin/shutdown' `
  -Headers @{ Authorization = "Bearer $AdminToken" }
```

该接口会先同步保存内存数据库，再关闭监听并释放数据库锁。确认健康接口已经不可访问、`.lock` 已删除后再继续。

第一次从不支持安全停机接口的旧版本迁移时，优先在可见控制台按 `Ctrl+C`，或使用已配置为发送控制台关闭信号的 Windows 服务管理器。维护窗口开始后先停止外部流量并等待至少 3 秒，让延迟保存完成。

只有服务无响应时才把 `Stop-Process` 当作应急手段。它可能跳过 Node 的退出处理，因此执行前必须接受最近几秒内存写入可能尚未落盘的风险：

```powershell
Stop-Process -Id <已确认的PID>
```

### 2. 生成发布前证据并备份

```powershell
$AppDir = 'D:\Sites\calculus-quest'
$DataDir = 'D:\CalculusQuestData'
$DbPath = Join-Path $DataDir 'calculus-quest.db'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$ReportBefore = Join-Path $DataDir "release-before-$Stamp.json"
$BackupPath = Join-Path $DataDir "calculus-quest.before-$Stamp.db"

Set-Location $AppDir
node ops/database-release-check.js --db $DbPath --assert-external --write-report $ReportBefore
Copy-Item -LiteralPath $DbPath -Destination $BackupPath
Get-FileHash -LiteralPath $DbPath -Algorithm SHA256
Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256
```

两个 SHA-256 必须一致。报告会记录用户、会话、测验、事件、快照、反馈和 Agent 决策等表的行数。

### 3. 只更新代码和依赖

```powershell
Set-Location $AppDir
$PreviousCommit = git rev-parse HEAD
git status --short
git fetch origin
git switch main
git pull --ff-only origin main
npm ci
```

服务器工作树必须干净。不要在生产服务器直接编辑受 Git 管理的文件，也不要把生产数据库复制回仓库的 `data\`。

本次发布不要运行 `npm run migrate`。该命令仅用于把早期 `learning-records.json` 导入数据库，不是版本升级步骤；脚本现在默认拒绝执行，只有停服、确认目标路径并显式传入 `--confirm-import` 时才会做带备份、单写锁和事务保护的非破坏性合并。

`git pull` 本身不会删除仓库外的 `DB_PATH`。历史数据“看起来丢失”通常来自以下配置错误：

- 新进程没有读取原来的 `.env`，回退到了仓库内默认数据库。
- 从另一个工作目录启动，导致相对数据库路径解析到新位置。
- 发布脚本重新创建部署目录，却没有继续指向固定的数据目录。
- 两个 Node 进程分别打开不同数据库，管理员和学生访问到了不同实例。

因此每次启动后都要同时核对健康版本、数据库绝对路径、受保护表行数和一个已知历史用户，不能只检查首页是否返回 200。

### 4. 启动前验证

```powershell
node --check server.js
Get-ChildItem app\main -Filter *.js | ForEach-Object { node --check $_.FullName }
Get-ChildItem lib -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
node ops/test-deployment-safety.js
node ops/test-migrate-safety.js
node ops/test-katex.js
node ops/test-auth-login.js
node ops/test-feedback-static.js
node ops/test-learning-feedback.js
node ops/test-admin-presentation.js
node ops/test-admin-export-all.js
node ops/test-interaction-quality.js
node ops/test-knowledge-scene-selection.js
node ops/test-learning-snapshot-versioning.js
node ops/test-subpath-deployment.js
node ops/database-release-check.js --db $DbPath --compare $ReportBefore --expect-unchanged
```

最后一条命令必须通过，证明拉取代码和安装依赖没有改动生产数据库。

### 5. 启动并做浏览器 smoke

使用 Windows 服务时：

```powershell
Start-Service -Name 'CalculusQuest'
```

手工启动时：

```powershell
$env:NODE_ENV = 'production'
$env:HOST = '127.0.0.1'
$env:PORT = '8765'
$env:BASE_PATH = '/calculus_quest'
$env:DB_PATH = 'D:\CalculusQuestData\calculus-quest.db'
$env:APP_VERSION = (git rev-parse --short HEAD)
$env:ADMIN_TOKEN = Read-Host 'Admin Token'
$env:LLM_PROVIDER = 'mock'

Start-Process -FilePath 'node.exe' `
  -ArgumentList 'server.js' `
  -WorkingDirectory $AppDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $AppDir 'server.out.log') `
  -RedirectStandardError (Join-Path $AppDir 'server.err.log')
```

检查健康接口：

```powershell
Invoke-RestMethod 'http://127.0.0.1:8765/calculus_quest/api/health'
```

随后实际验证：

- `/calculus_quest/` 首页、CSS 和全部 JS 返回 200。
- 历史账号登录后可恢复已有进度，刷新和重新登录后记录仍存在。
- 测验提交、反馈、课件 iframe 和 `/calculus_quest/admin.html` 正常。
- 管理员“交互记录”默认显示中文关键行为，可切换原始记录。
- 反馈、简答题、证据链和交互记录的“全部导出”可以跨分页完成。

不要注册或重置真实历史账号来做 smoke。

### 6. 发布后核对

```powershell
node ops/database-release-check.js --db $DbPath --compare $ReportBefore
```

该比较允许正常新增记录，但任何受保护表的行数减少都会失败。发布报告、数据库备份、Git 提交号和 smoke 结果应一起归档。

## 回退

如果新代码有问题，只回退代码，不回退正在继续产生数据的数据库：

```powershell
$AdminToken = Read-Host 'Admin Token'
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8765/calculus_quest/api/admin/shutdown' -Headers @{ Authorization = "Bearer $AdminToken" }
Set-Location $AppDir
git switch --detach $PreviousCommit
npm ci
Start-Service -Name 'CalculusQuest'
```

只有确认数据库本身损坏、并且已经停止所有写入后，才使用发布前备份恢复数据库。恢复前还要再备份当前故障数据库，避免丢失发布后新增的数据。

## 开发代码需要遵守的规则

- 数据库迁移只能新增表、列或索引，不得在启动时执行 `DROP TABLE`、清表或批量删除。
- 旧 JSON 导入必须停服、显式确认目标数据库并自动备份；不得以“幂等”为由先删除现有记录。
- 用户主键 `users.id` 永久稳定；修改昵称或邮箱不能创建新用户或替换主键。
- 重置学习记录只能由学生明确确认，且反馈记录不随学习重置删除。
- 新字段优先放入向前兼容的列或事件 JSON；旧版本代码应能忽略不认识的新字段。
- 每次修改数据库结构，都必须在生产数据库副本上运行测试和发布检查，不能直接拿生产库试迁移。
- Git 发布只更新代码；`DB_PATH`、`.env`、备份、报告、Token 和日志都不进入仓库。
