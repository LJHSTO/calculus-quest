#!/usr/bin/env bash
# Calculus Quest one-click deployment entry, compatible with the historical 3789 default.
set -euo pipefail

log() { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { log "错误：$*"; exit 1; }

cd "$(dirname "${BASH_SOURCE[0]}")"
APP_DIR="$(pwd -P)"

env_value() {
  node - "$1" <<'NODE'
const fs = require("fs");
const path = require("path");
const key = process.argv[2];
if (process.env[key] !== undefined) {
  process.stdout.write(process.env[key]);
  process.exit(0);
}
const envPath = path.join(process.cwd(), ".env");
if (!fs.existsSync(envPath)) process.exit(0);
const text = fs.readFileSync(envPath, "utf8");
for (const line of text.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const index = trimmed.indexOf("=");
  if (index < 0 || trimmed.slice(0, index).trim() !== key) continue;
  let value = trimmed.slice(index + 1).trim();
  if (
    value.length >= 2
    && value.charCodeAt(0) === value.charCodeAt(value.length - 1)
    && [34, 39].includes(value.charCodeAt(0))
  ) {
    value = value.slice(1, -1);
  }
  process.stdout.write(value);
  break;
}
NODE
}

command -v node >/dev/null 2>&1 || fail "未找到 node。"
command -v pnpm >/dev/null 2>&1 || fail "未找到 pnpm。"
command -v lsof >/dev/null 2>&1 || fail "未找到 lsof，无法安全识别监听进程。"
command -v curl >/dev/null 2>&1 || fail "未找到 curl，无法执行启动健康检查。"

ENV_PORT="$(env_value PORT)"
ENV_HOST="$(env_value HOST)"
ENV_BASE_PATH="$(env_value BASE_PATH)"
NODE_ENV_VALUE="$(env_value NODE_ENV)"
DB_PATH_VALUE="$(env_value DB_PATH)"

# 保留历史一键部署的 3789 默认端口；可用第一个参数或 PORT 覆盖。
PORT="${1:-${PORT:-${ENV_PORT:-3789}}}"
# HOST 以 .env 为准：shell 里漏进来的 HOST（例如集群环境设的 HOST=cpu3，
# 解析到 127.0.1.1）会让服务绑到非预期地址，端口转发和健康检查都连不上。
SHELL_HOST="${HOST:-}"
export HOST="${ENV_HOST:-${SHELL_HOST:-127.0.0.1}}"
export BASE_PATH="${BASE_PATH:-${ENV_BASE_PATH:-/calculus_quest}}"
export APP_VERSION="${APP_VERSION:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"

# 一键部署始终按生产模式运行，与 db.js 的 assertProductionDatabasePath 保持一致。
if [[ -n "${NODE_ENV_VALUE}" && "${NODE_ENV_VALUE}" != "production" ]]; then
  log "提示：.env 中 NODE_ENV=${NODE_ENV_VALUE}，一键部署将强制覆盖为 production。"
fi
export NODE_ENV=production

# DB_PATH 必须是仓库外的绝对路径，避免 git pull / 重装依赖时覆盖生产数据。
DB_PATH_INPUT="${DB_PATH:-${DB_PATH_VALUE}}"
[[ -n "${DB_PATH_INPUT}" ]] || fail "DB_PATH 必须是仓库外的绝对路径：请先在 .env 中设置 DB_PATH。"
[[ "${DB_PATH_INPUT}" == /* ]] || fail "DB_PATH 必须是仓库外的绝对路径：${DB_PATH_INPUT} 不是绝对路径。"
DB_DIR_ABS="$(cd "$(dirname "${DB_PATH_INPUT}")" 2>/dev/null && pwd -P)" \
  || fail "DB_PATH 所在目录不存在：$(dirname "${DB_PATH_INPUT}")"
DB_PATH_ABS="${DB_DIR_ABS%/}/$(basename "${DB_PATH_INPUT}")"
case "${DB_PATH_ABS}" in
  "${APP_DIR}" | "${APP_DIR}"/*)
    fail "DB_PATH 必须是仓库外的绝对路径：${DB_PATH_ABS} 位于代码仓库 ${APP_DIR} 内。"
    ;;
esac
[[ -f "${DB_PATH_ABS}" ]] || fail "数据库文件不存在：${DB_PATH_ABS}（首次部署请先把历史库迁移到该位置）。"
export DB_PATH="${DB_PATH_ABS}"

if [[ -n "${SHELL_HOST}" && "${SHELL_HOST}" != "${HOST}" ]]; then
  log "提示：已忽略 shell 环境变量 HOST=${SHELL_HOST}，按 .env 绑定 ${HOST}。"
fi

log "工作目录：${APP_DIR}"
log "运行配置：PORT=${PORT} HOST=${HOST} BASE_PATH=${BASE_PATH}"
log "数据库：${DB_PATH_ABS}"
log "Node：$(node --version)"
log "先安装锁定依赖并执行部署前检查。"
pnpm install --frozen-lockfile --reporter=append-only
node --check server.js
node ops/test-deployment-safety.js
node ops/test-subpath-deployment.js
node ops/test-install-run-safety.js

OCCUPYING_PIDS="$(lsof -tnP -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | sort -u || true)"
if [[ -n "${OCCUPYING_PIDS}" ]]; then
  for pid in ${OCCUPYING_PIDS}; do
    [[ -r "/proc/${pid}/cmdline" && -e "/proc/${pid}/cwd" ]] || fail "无法核验端口 ${PORT} 上的进程 ${pid}。"
    command_line="$(tr '\0' ' ' < "/proc/${pid}/cmdline")"
    process_cwd="$(readlink -f "/proc/${pid}/cwd")"
    [[ "${process_cwd}" == "${APP_DIR}" ]] || fail "端口 ${PORT} 被其他目录的进程占用：PID ${pid}，${process_cwd}"
    [[ "${command_line}" == *"node"*"server.js"* ]] || fail "端口 ${PORT} 不是 Calculus Quest 服务：PID ${pid}，${command_line}"
  done

  log "向已核验的 Calculus Quest 进程发送 SIGTERM：${OCCUPYING_PIDS}"
  kill -TERM ${OCCUPYING_PIDS}
  for _ in $(seq 1 30); do
    remaining=""
    for pid in ${OCCUPYING_PIDS}; do
      kill -0 "${pid}" 2>/dev/null && remaining="${remaining} ${pid}"
    done
    [[ -z "${remaining}" ]] && break
    sleep 1
  done
  for pid in ${OCCUPYING_PIDS}; do
    kill -0 "${pid}" 2>/dev/null && fail "进程 ${pid} 未能优雅退出；已停止部署，不会强制终止。"
  done
fi

[[ ! -e "${DB_PATH_ABS}.lock" ]] || fail "数据库锁仍存在：${DB_PATH_ABS}.lock"

STAMP="$(date '+%Y%m%d-%H%M%S')"
BACKUP_DIR="$(dirname "${DB_PATH_ABS}")/backups"
REPORT_PATH="${BACKUP_DIR}/release-before-${STAMP}.json"
BACKUP_PATH="${BACKUP_DIR}/$(basename "${DB_PATH_ABS}" .db).before-${STAMP}.db"
mkdir -p "${BACKUP_DIR}"

log "生成发布前数据库报告并备份历史数据。"
node ops/database-release-check.js \
  --db "${DB_PATH_ABS}" \
  --assert-external \
  --write-report "${REPORT_PATH}"
cp -p -- "${DB_PATH_ABS}" "${BACKUP_PATH}"
node - "${DB_PATH_ABS}" "${BACKUP_PATH}" <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const [source, backup] = process.argv.slice(2);
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (digest(source) !== digest(backup)) {
  console.error("数据库备份 SHA-256 不一致。");
  process.exit(1);
}
NODE
log "数据库备份完成：${BACKUP_PATH}"

PUBLIC_BASE_PATH="/${BASE_PATH#/}"
PUBLIC_BASE_PATH="${PUBLIC_BASE_PATH%/}"

# 健康检查必须打到 server.js 实际绑定的地址：绑通配地址时回落到 127.0.0.1，
# 否则直连 HOST 本身（例如 HOST=cpu3 只监听 127.0.1.1，写死 127.0.0.1 会连不上）。
case "${HOST}" in
  "" | "0.0.0.0" | "*") HEALTH_HOST="127.0.0.1" ;;
  "::" | "[::]") HEALTH_HOST="[::1]" ;;
  *:*) HEALTH_HOST="[${HOST}]" ;;
  *) HEALTH_HOST="${HOST}" ;;
esac
HEALTH_URL="http://${HEALTH_HOST}:${PORT}${PUBLIC_BASE_PATH}/api/health"

log "启动 Calculus Quest，健康检查：${HEALTH_URL}"
node server.js "${PORT}" &
APP_PID=$!

forward_signal() {
  kill -TERM "${APP_PID}" 2>/dev/null || true
  wait "${APP_PID}" || true
}
trap forward_signal INT TERM

for _ in $(seq 1 60); do
  if ! kill -0 "${APP_PID}" 2>/dev/null; then
    wait "${APP_PID}" || true
    fail "服务在健康检查前退出。"
  fi
  if curl --fail --silent --show-error "${HEALTH_URL}" >/dev/null; then
    node ops/database-release-check.js --db "${DB_PATH_ABS}" --compare "${REPORT_PATH}"
    log "部署完成：服务健康，历史数据库备份已保留。"
    wait "${APP_PID}"
    exit $?
  fi
  sleep 1
done

kill -TERM "${APP_PID}" 2>/dev/null || true
wait "${APP_PID}" || true
fail "服务启动后 60 秒内未通过健康检查。"
