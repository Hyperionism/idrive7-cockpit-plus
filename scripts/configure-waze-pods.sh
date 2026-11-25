#!/bin/sh
# Optional head-unit helper for MGU SSH users who also run waze-on-cluster:
# hides Waze's stock lower-left speed_pod / guidance_pod / trip_pod so they do not
# overlap Cockpit+'s centered speed / 5AU lanes / iOS turn card / ETA pill.
#
# Usage (on MGU shell):
#   sh configure-waze-pods.sh          # write waze-on-cluster.local.conf to hide duplicate pods
#   sh configure-waze-pods.sh --revert # restore Waze default pod visibility

set -eu

CONF_DIR="${WAZE_CONF_DIR:-/var/opt/waze-on-cluster}"
LOCAL_CONF="$CONF_DIR/waze-on-cluster.local.conf"

if [ "${1:-}" = "--revert" ]; then
    rm -f "$LOCAL_CONF"
    echo "[cockpit-plus] Removed $LOCAL_CONF (Waze default pods restored)."
    exit 0
fi

mkdir -p "$CONF_DIR"
cat > "$LOCAL_CONF" <<'EOF'
# Managed by id7_cockpit_plus: hide Waze pods replaced by Cockpit+ overlays
speed_pod = false
guidance_pod = false
trip_pod = false
EOF

echo "[cockpit-plus] Wrote $LOCAL_CONF (restart waze-on-cluster or reboot HMI to apply)."
