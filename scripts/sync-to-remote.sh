#!/bin/sh

set -euo pipefail

APPLY=false

# Parse optional flags
while [ $# -gt 0 ]; do
  case "$1" in
    --apply)
      APPLY=true
      shift
      ;;
    *)
      break
      ;;
  esac
done

if [ $# -ne 2 ]; then
  echo "Usage: $0 [--apply] <remote> <path>"
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

DRY_RUN_FLAG="--dry-run"
if [ "$APPLY" = true ]; then
  DRY_RUN_FLAG=""
  echo "⚠️  APPLY MODE: changes will be made"
else
  echo "🧪 DRY-RUN MODE: no changes will be made"
fi

rclone sync "$BACKUP_PATH" "$REMOTE:$SUBPATH" \
  --checksum \
  --progress \
  $DRY_RUN_FLAG \
  --backup-dir "$REMOTE:${SUBPATH}_deleted/$(date +%Y-%m-%d)" \
  --log-file="$BACKUP_PATH/sync.log" \
  --log-level=INFO \
  --exclude "*.log"
