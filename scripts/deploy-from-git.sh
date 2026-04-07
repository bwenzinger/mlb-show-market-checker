#!/usr/bin/env bash
set -Eeuo pipefail

app_dir="${APP_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
branch="${GIT_BRANCH:-main}"
remote="${GIT_REMOTE:-origin}"
service_name="${SERVICE_NAME:-mlb-show-market-checker}"
required_node_major=25
lock_file="${DEPLOY_LOCK_FILE:-${app_dir}/.deploy.lock}"

cd "$app_dir"

exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another deploy is already running for ${app_dir}."
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Refusing to deploy over local changes:" >&2
  git status --short >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed or is not on PATH. Install Node ${required_node_major}+ first." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed or is not on PATH. Install Node ${required_node_major}+ with npm first." >&2
  exit 1
fi

node_major="$(node -p "Number.parseInt(process.versions.node.split('.')[0], 10)" 2>/dev/null || echo 0)"
if (( node_major < required_node_major )); then
  echo "Node ${required_node_major}+ is required, but PATH resolves node to $(node --version)." >&2
  exit 1
fi

before="$(git rev-parse HEAD)"
current_branch="$(git branch --show-current)"

if [[ "$current_branch" != "$branch" ]]; then
  echo "Expected ${app_dir} to be on branch ${branch}, but it is on ${current_branch}." >&2
  exit 1
fi

git fetch --prune "$remote"

after="$(git rev-parse "${remote}/${branch}")"
if [[ "$before" == "$after" ]]; then
  echo "Already deployed ${branch} at ${before}."
  exit 0
fi

git merge --ff-only "${remote}/${branch}"
npm ci
npm run build

if [[ "${SKIP_SERVICE_RESTART:-}" == "1" ]]; then
  echo "Updated to ${after}; service restart skipped because SKIP_SERVICE_RESTART=1."
  exit 0
fi

if [[ "$(uname -s)" != "Linux" ]] || ! command -v systemctl >/dev/null 2>&1; then
  echo "Updated to ${after}; restart ${service_name} manually on this machine."
  exit 0
fi

if [[ "${SYSTEMCTL_USER:-}" == "1" ]]; then
  systemctl --user restart "$service_name"
elif [[ "$EUID" -eq 0 ]]; then
  systemctl restart "$service_name"
elif sudo -n systemctl restart "$service_name"; then
  :
else
  echo "Updated to ${after}, but this user cannot restart ${service_name} without a sudo password." >&2
  echo "Restart manually with: sudo systemctl restart ${service_name}" >&2
  exit 1
fi

echo "Deployed ${before} -> ${after} and restarted ${service_name}."
