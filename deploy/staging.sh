#!/usr/bin/env bash
# 预发环境部署/回滚脚本（在运行时主机上执行）。
#   部署最新主干：bash deploy/staging.sh
#   回滚到某提交：bash deploy/staging.sh <commit-sha>
# 做的事：把指定 ref 检出到固定目录 → 渲染并安装 systemd 用户单元 → 重启服务 → 健康检查。
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/apps/multica-company-demo}"
REPO_URL="${REPO_URL:-https://github.com/yanking/multica-company-demo.git}"
REF="${1:-origin/main}"
SERVICE="multica-company-demo-staging"
PORT="${PORT:-3100}"
UNIT_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$SERVICE.service"

# 1) 检出/更新代码（固定目录，与智能体各自的工作目录无关）
if [ ! -d "$APP_DIR/.git" ]; then
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --quiet "$REPO_URL" "$APP_DIR"
fi
git -C "$APP_DIR" fetch --quiet origin
git -C "$APP_DIR" checkout --quiet --detach "$REF"
DEPLOYED="$(git -C "$APP_DIR" rev-parse --short HEAD)"

# 2) 渲染并安装 systemd 用户单元（node 路径以当前 shell 能找到的为准）
NODE_BIN="$(command -v node)"
mkdir -p "$HOME/.config/systemd/user"
sed -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__NODE__#$NODE_BIN#g" -e "s#__PORT__#$PORT#g" \
  "$UNIT_SRC" > "$HOME/.config/systemd/user/$SERVICE.service"
systemctl --user daemon-reload
systemctl --user enable "$SERVICE" >/dev/null 2>&1 || true
systemctl --user restart "$SERVICE"

# 3) 健康检查：最多等 10 秒
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PORT/api/todos" >/dev/null 2>&1; then
    echo "staging 已部署 $DEPLOYED → http://127.0.0.1:$PORT （服务 $SERVICE）"
    exit 0
  fi
  sleep 0.5
done
echo "健康检查失败：http://127.0.0.1:$PORT/api/todos 无响应。查看日志：journalctl --user -u $SERVICE -n 50" >&2
exit 1
