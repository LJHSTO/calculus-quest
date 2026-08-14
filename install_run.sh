diff --git a//Users/l/other_git_repos/calculus-quest/install_run.sh b//Users/l/other_git_repos/calculus-quest/install_run.sh
new file mode 100644
--- /dev/null
+++ b//Users/l/other_git_repos/calculus-quest/install_run.sh
@@ -0,0 +1,7 @@
+#!/usr/bin/env bash
+# Calculus Quest one-click deployment entry, compatible with the historical 3789 default.
+set -e
+cd "$(dirname "$0")"
+NPM="$(command -v npm)" || { echo "错误：未找到 npm。" >&2; exit 1; }
+"$NPM" install
+exec "$NPM" start
