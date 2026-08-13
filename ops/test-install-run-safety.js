const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.join(__dirname, "../install_run.sh"), "utf8");

assert.ok(script.startsWith("#!/usr/bin/env bash\n"), "the deployment script must have a valid first-line shebang");
assert.match(script, /PORT="\$\{1:-\$\{PORT:-\$\{ENV_PORT:-3789\}\}\}"/);
assert.match(script, /NODE_ENV=production/);
assert.match(script, /DB_PATH 必须是仓库外的绝对路径/);
assert.match(script, /\/proc\/\$\{pid\}\/cmdline/);
assert.match(script, /\/proc\/\$\{pid\}\/cwd/);
assert.match(script, /kill -TERM \$\{OCCUPYING_PIDS\}/);
assert.doesNotMatch(script, /kill\s+-9/);
assert.match(script, /pnpm install --frozen-lockfile/);
assert.match(script, /node ops\/database-release-check\.js/);
assert.match(script, /--compare "\$\{REPORT_PATH\}"/);
assert.match(script, /release-before-\$\{STAMP\}\.json/);
assert.match(script, /before-\$\{STAMP\}\.db/);
assert.match(script, /\/api\/health/);

const installIndex = script.indexOf("pnpm install --frozen-lockfile");
const stopIndex = script.indexOf("kill -TERM ${OCCUPYING_PIDS}");
assert.ok(installIndex >= 0 && stopIndex > installIndex, "dependency installation must finish before stopping production");

console.log("install_run deployment safety tests passed");
