#!/usr/bin/env bash
set -Eeuo pipefail

app_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
service_name="${SERVICE_NAME:-mlb-show-market-checker}"
run_user="${RUN_USER:-$(id -un)}"
run_group="${RUN_GROUP:-$(id -gn)}"
service_file="/etc/systemd/system/${service_name}.service"
required_node_major=25

cd "$app_dir"

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
  echo "Install Node ${required_node_major}+ first, then rerun this script." >&2
  exit 1
fi

npm ci
npm run build

chmod +x "$app_dir/start.sh"
chmod +x "$app_dir/scripts/deploy-from-git.sh"

sudo tee "$service_file" >/dev/null <<EOF
[Unit]
Description=MLB The Show Market Checker
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=${run_user}
Group=${run_group}
WorkingDirectory=${app_dir}
Environment=NODE_ENV=production
Environment=PATH=${PATH}
ExecStart=${app_dir}/start.sh
Restart=always
RestartSec=10
StartLimitIntervalSec=0
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=${app_dir}

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "$service_name"

echo
echo "Installed and started ${service_name}."
echo "Status: sudo systemctl status ${service_name}"
echo "Logs:   sudo journalctl -u ${service_name} -f"
echo "Health: curl http://127.0.0.1:4000/api/health"
