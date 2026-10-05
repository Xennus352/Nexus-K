#!/bin/sh
# Entrypoint for Slotopol engine on Railway/Render
# Handles database initialization and configuration

set -eu

CONFIG_DIR="/go/bin/config"
APPDATA_DIR="/go/bin/appdata"
CONFIG_FILE="${CONFIG_DIR}/slot-app.yaml"

echo "🎰 Starting Slotopol Engine..."

# Ensure config directory exists
mkdir -p "${CONFIG_DIR}" "${APPDATA_DIR}"

# Copy appdata if not already present
if [ ! -f "${CONFIG_FILE}" ]; then
    echo "📋 Copying configuration from appdata..."
    cp -ruv /appdata/* "${CONFIG_DIR}/"
fi

# Override config with environment variables if provided
if [ -n "${DATABASE_DRIVER:-}" ]; then
    echo "🔧 Overriding database driver to: ${DATABASE_DRIVER}"
    sed -i "s/driver-name: .*/driver-name: ${DATABASE_DRIVER}/" "${CONFIG_FILE}"
fi

if [ -n "${CLUB_SOURCE_NAME:-}" ]; then
    echo "🔧 Overriding club source: ${CLUB_SOURCE_NAME}"
    sed -i "s|club-source-name: .*|club-source-name: ${CLUB_SOURCE_NAME}|" "${CONFIG_FILE}"
fi

if [ -n "${SPIN_SOURCE_NAME:-}" ]; then
    echo "🔧 Overriding spin source: ${SPIN_SOURCE_NAME}"
    sed -i "s|spin-source-name: .*|spin-source-name: ${SPIN_SOURCE_NAME}|" "${CONFIG_FILE}"
fi

# Update JWT keys from environment if provided
if [ -n "${ACCESS_KEY:-}" ]; then
    sed -i "s|access-key: .*|access-key: ${ACCESS_KEY}|" "${CONFIG_FILE}"
fi

if [ -n "${REFRESH_KEY:-}" ]; then
    sed -i "s|refresh-key: .*|refresh-key: ${REFRESH_KEY}|" "${CONFIG_FILE}"
fi

echo "✅ Configuration ready"
echo "📄 Config file: ${CONFIG_FILE}"

# Execute the engine
exec /go/bin/app -c "${CONFIG_FILE}" "$@"