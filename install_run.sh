# 根据/Users/l/other_git_repos/calculus-quest/README.md 实现
#!/usr/bin/env bash
set -euo pipefail

log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "脚本开始 (pid=$$)"
cd "$(dirname "$0")"
log "工作目录: $(pwd)"

# 端口可通过第一个参数指定，默认使用项目约定端口 3789
PORT="${1:-3789}"
# 监听地址：默认 0.0.0.0（server.js 通过 HOST 环境变量读取），可用 HOST 环境变量覆盖
export HOST="${HOST:-0.0.0.0}"
# 子路径前缀：README 约定访问路径为 /calculus_quest/，server.js 通过 BASE_PATH 剥离该前缀
export BASE_PATH="${BASE_PATH:-/calculus_quest}"
log "PORT=${PORT} HOST=${HOST}"

log "node: $(command -v node || echo 未找到) $(node --version 2>/dev/null || true)"
log "pnpm: $(command -v pnpm || echo 未找到)"
which pnpm

# 端口被占用时直接杀掉占用进程
OCCUPYING_PIDS="$(lsof -tnP -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "${OCCUPYING_PIDS}" ]; then
  log "端口 ${PORT} 已被占用，杀掉占用进程: ${OCCUPYING_PIDS}"
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN || true
  kill ${OCCUPYING_PIDS} 2>/dev/null || true
  # 等待端口释放，最多 5 秒，仍未释放则强杀
  for _ in 1 2 3 4 5; do
    sleep 1
    lsof -tnP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1 || break
  done
  REMAINING="$(lsof -tnP -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "${REMAINING}" ]; then
    log "进程未退出，强制 kill -9: ${REMAINING}"
    kill -9 ${REMAINING} 2>/dev/null || true
    sleep 1
  fi
  log "端口 ${PORT} 已释放"
fi

# 安装依赖
log "开始 pnpm install ..."
pnpm install --reporter=append-only
log "pnpm install 完成"

# 管理后台 token：优先用环境变量 ADMIN_TOKEN；未设置时服务会自动读取 data/admin-token.txt
if [ -z "${ADMIN_TOKEN:-}" ] && [ ! -f data/admin-token.txt ]; then
  log "提示：未设置 ADMIN_TOKEN 且 data/admin-token.txt 不存在，管理后台 token 将由服务自行处理"
fi

log "启动服务："
log "  学习页面：http://127.0.0.1:${PORT}/calculus_quest/"
log "  管理后台：http://127.0.0.1:${PORT}/calculus_quest/admin"
log "  健康检查：http://127.0.0.1:${PORT}/calculus_quest/api/health"

log "exec node server.js ${PORT}（之后的输出来自 server.js）"
set -x
exec node server.js "${PORT}"
