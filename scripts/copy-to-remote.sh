#!/bin/sh

set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <remote> <path>"
  exit 1
fi

if ! BACKUP_PATH="$(find-backup-drive.sh "$2")"; then
  echo "Backup drive not found"
  exit 1
fi

echo "Backup is at: $BACKUP_PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

rclone copy "$BACKUP_PATH" "$1:$2" \
  --checksum \
  --progress \
  --log-file="$BACKUP_PATH/backup.log" \
  --log-level=INFO \
  --exclude-from "$SCRIPT_DIR/exclude-common.txt"


