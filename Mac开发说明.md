# 在 Mac 继续开发微积分学习平台

先安装 Git、Node.js 24 和 Google Chrome。打开终端运行：

```bash
mkdir -p ~/Projects
cd ~/Projects
git clone --branch proactive_test https://github.com/LJHSTO/calculus-quest.git calculus-quest
cd calculus-quest
npm ci
cp config/mac-development.env.example .env
npm start
```

访问 `http://127.0.0.1:8765`。Ctrl+C 停止本次服务。该配置只用于本机开发，使用新的开发数据库和模拟模型；真实模型配置需在本机私下补充。

后续继续工作：

- 私有资料包中的 `项目补充文件` 只含现行研究资料与工作脚本。复制到仓库的对应位置即可；不再覆盖已发布的平台代码。
- 当前正式交付文档在 `runs/ideascientist/learner-config-feedback-简明版/纯净版交付-20261111/`。以最新 Word 为准；没有同版 PDF 时从 Word 重新导出。
- 继续修改前查看 `git status`；同步远程前保存并提交自己的修改。不要在已有本地修改时强制重置或整目录覆盖。
- `node ops/test-assessment-quality-r13.cjs` 与 `node ops/test-study-task-copy-r13.cjs` 检查题库和学生任务文案；`node ops/test-three-arm-study.js` 检查三组研究流程。
- 需要浏览器测试时安装 Chrome。部分其他历史脚本仍有 Windows 路径，按需要逐项适配。
- `.env`、模型密钥、私有文档、数据库及真实学生记录不提交 GitHub。`node_modules` 在 Mac 上通过 `npm ci` 安装。

首次迁移核对：网站能打开、课件图音正常、资料能打开、Git 分支为 `proactive_test`。本机开发和正式网站使用不同数据库；本机预览配置不能用于正式研究部署。
