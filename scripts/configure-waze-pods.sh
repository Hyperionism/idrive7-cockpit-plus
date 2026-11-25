#!/bin/sh
# Optional head-unit helper for MGU SSH users who run waze-on-cluster manually
# (Note: installing Cockpit+ from MGU Store also automatically installs the
# cockpit-fullview companion tool which applies this profile without SSH).
#
# Usage (on MGU shell):
#   sh configure-waze-pods.sh          # clone ID7 -> ID7-cockpit with speed/guidance/trip pods = 0
#   sh configure-waze-pods.sh --revert # restore original waze-on-cluster profile

set -eu

CONF_DIR="${WAZE_CONF_DIR:-/var/opt/waze-on-cluster}"
LOCAL_CONF="$CONF_DIR/waze-on-cluster.local.conf"
VEHICLES_DIR="$CONF_DIR/vehicles"
SRC_PROFILE="$VEHICLES_DIR/ID7.conf"
COCKPIT_PROFILE="$VEHICLES_DIR/ID7-cockpit.conf"

if [ ! -f "$SRC_PROFILE" ] && [ -f "$CONF_DIR/current/vehicles/ID7.conf" ]; then
    SRC_PROFILE="$CONF_DIR/current/vehicles/ID7.conf"
fi

if [ "${1:-}" = "--revert" ]; then
    rm -f "$LOCAL_CONF" "$COCKPIT_PROFILE"
    if command -v systemctl >/dev/null 2>&1; then
        systemctl try-restart waze-on-cluster.service >/dev/null 2>&1 || true
    fi
    echo "[cockpit-plus] Removed $LOCAL_CONF and $COCKPIT_PROFILE (Waze default profile restored)."
    exit 0
fi

mkdir -p "$VEHICLES_DIR"

if [ -f "$SRC_PROFILE" ]; then
    sed \
        -e 's/^[[:space:]]*speed_pod[[:space:]]*=.*$/speed_pod = 0/' \
        -e 's/^[[:space:]]*guidance_pod[[:space:]]*=.*$/guidance_pod = 0/' \
        -e 's/^[[:space:]]*trip_pod[[:space:]]*=.*$/trip_pod = 0/' \
        "$SRC_PROFILE" > "$COCKPIT_PROFILE"
fi

cat > "$LOCAL_CONF" <<'EOF'
# Managed by id7_cockpit_plus: pure FullView map with C++ pods disabled
fullview_profile = ID7-cockpit
speed_pod = 0
guidance_pod = 0
trip_pod = 0
EOF

if command -v systemctl >/dev/null 2>&1; then
    systemctl try-restart waze-on-cluster.service >/dev/null 2>&1 || true
fi

echo "[cockpit-plus] Wrote $LOCAL_CONF and $COCKPIT_PROFILE (FullView pure map mode active)."
