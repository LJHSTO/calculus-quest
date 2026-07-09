# 根据/Users/l/other_git_repos/calculus-quest/README.md 实现
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# 端口可通过第一个参数指定，默认使用项目约定端口 3789
PORT="${1:-3789}"
# 监听地址：默认 0.0.0.0（server.js 通过 HOST 环境变量读取），可用 HOST 环境变量覆盖
export HOST="${HOST:-0.0.0.0}"
which pnpm
# 安装依赖
pnpm install

# 管理后台 token：优先用环境变量 ADMIN_TOKEN；未设置时服务会自动读取 data/admin-token.txt
if [ -z "${ADMIN_TOKEN:-}" ] && [ ! -f data/admin-token.txt ]; then
  echo "提示：未设置 ADMIN_TOKEN 且 data/admin-token.txt 不存在，管理后台 token 将由服务自行处理"
fi

echo "启动服务："
echo "  学习页面：http://127.0.0.1:${PORT}/calculus_quest/"
echo "  管理后台：http://127.0.0.1:${PORT}/calculus_quest/admin"
echo "  健康检查：http://127.0.0.1:${PORT}/calculus_quest/api/health"

exec node server.js "${PORT}"
