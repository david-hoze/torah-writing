#!/bin/sh

set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <remote> <path>"
  exit 1
fi

REMOTE="$1"
SUBPATH="$2"

if ! BACKUP_PATH="$(find-backup-drive.sh "$SUBPATH")"; then
  echo "Backup drive not found"
  exit 1
fi

echo "Backup is at: $BACKUP_PATH"
echo "Syncing to: $REMOTE:$SUBPATH"

# Safety check: refuse to sync root-like paths
case "$SUBPATH" in
  ""|"/"|".")
    echo "Refusing to sync unsafe path: '$SUBPATH'"
    exit 1
    ;;
esac

# Dry-run first (remove --dry-run after verifying output)
rclone sync "$BACKUP_PATH" "$REMOTE:$SUBPATH" \
  --checksum \
  --progress \
  --dry-run \
  --backup-dir "$REMOTE:${SUBPATH}_deleted/$(date +%Y-%m-%d)" \
  --log-file="$BACKUP_PATH/sync.log" \
  --log-level=INFO \
  --exclude "*.log"

echo
echo "Dry-run completed."
echo "If everything looks correct, re-run after removing --dry-run."
