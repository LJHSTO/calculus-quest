# Calculus Quest 课件检视页部署到 Cloudflare Pages

## 先说结论

`flow-test.html` 现在是独立静态检视页，不需要 Node.js、sql.js、数据库或 `8765` 后端。页面直接读取：

- `data/multi-scene-learning-route.json`：章节、Slide、Quiz 和互动资源索引；
- `data/knowledge-graph.json`：知识图谱索引；
- `resources/open-maic/`：最新互动课件文件；
- `app/flow-test/`：检视页脚本和样式。

本地的 `http://127.0.0.1:8765/flow-test.html` 只是用项目现有 Node 静态文件服务做预览。Cloudflare Pages 发布后不需要保持本地服务运行。

注意：检视页会显示 Quiz 标准答案、解析和知识点覆盖。发布后必须用 **Cloudflare Access** 保护整个 Pages 域名，不能把它作为公开教学站点。

## 方案 A：Wrangler 命令行发布

### 1. 生成只包含检视页的发布目录

在项目根目录执行：

```powershell
npm ci
npm run flow:static
```

脚本会生成 `dist/flow-test/`，只复制检视页、两个静态 JSON、课件资源和所需的前端文件。它不会把数据库、`server.js`、管理员 token、文档或 OpenMAIC 的 `prompts`/`versions` 目录发布出去。

### 2. 登录 Cloudflare 并创建 Pages 项目

```powershell
npx wrangler login
npx wrangler pages project create calculus-quest-flow-test
```

首次登录会打开浏览器授权。项目名可以改成你自己的唯一名称。

### 3. 上传静态目录

```powershell
npx wrangler pages deploy dist/flow-test --project-name calculus-quest-flow-test
```

命令结束后会输出一个 `pages.dev` 地址。打开该地址的 `/flow-test.html`，检查章节、Slide、互动 iframe 和 Quiz 是否完整。

### 4. 绑定正式域名

在 Cloudflare 控制台进入 **Workers & Pages > calculus-quest-flow-test > Custom domains**，绑定例如 `review.example.com`。Pages 会自动签发 HTTPS 证书。

## 方案 B：Cloudflare Pages 控制台自动部署

1. 在 **Workers & Pages > Create application > Pages > Connect to Git** 选择仓库。
2. Framework 选择 **None**。
3. Build command 填 `npm run flow:static`。
4. Build output directory 填 `dist/flow-test`。
5. 保存并部署。

每次更新课件资源、route 或 Flow Test 代码后推送 Git，Pages 会重新执行脚本并发布新版本。不要把输出目录改成仓库根目录，否则会把数据库和服务端文件一起暴露。

## 配置 Cloudflare Access

1. 打开 Cloudflare Zero Trust 控制台，进入 **Access controls > Applications > Add an application > Self-hosted**。
2. Domain 填 `review.example.com`，路径使用 `/*`。
3. 创建 Allow policy，只允许审课成员邮箱或组织身份提供商群组。
4. 用允许账户和拒绝账户各测试一次：

```text
https://review.example.com/flow-test.html
https://review.example.com/data/multi-scene-learning-route.json
```

拒绝账户不应读取页面或 JSON。因为答案就在静态 JSON 中，只保护 HTML 页面是不够的，必须保护整个域名路径。

## 发布验收

在 Pages 地址执行以下检查：

1. 页面能显示 11 个章节、Slide 和 Quiz 数量。
2. Slide 首屏完整可见；`−`、`+`、`↺` 可以缩放/恢复适应窗口，`⛶` 可以在当前页全屏查看，退出全屏后仍能继续操作。
3. 四类互动资源 iframe 能加载，浏览器控制台没有项目资源 404。
4. 点击“检查全部资源”后显示 `360 可用 / 0 失败`（当前课程资源总数）。
5. 浏览器 Network 中只看到 `data/*.json` 和 `resources/open-maic/*`，不应请求 `/api/course/flow-test-route` 或 `/api/learning/kg`。

## 本地预览与正式发布的区别

```text
本地：Node server.js（仅提供静态文件，方便预览）
正式：Cloudflare Pages（直接托管 dist/flow-test）
```

不要用 `file://` 双击打开 `flow-test.html` 作为正式测试方式。浏览器可能阻止它读取同目录 JSON；使用 Pages、`8765` 或其他静态 HTTP 服务即可。
