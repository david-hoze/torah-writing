#!/usr/bin/env bash

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path>"
  exit 1
fi

BACKUP_DIR="$1"

for drive in /d /e /f /g /h; do
  if [ -d "$drive/$BACKUP_DIR" ]; then
    echo "$drive/$BACKUP_DIR"
    exit 0
  fi
done

# Not found
exit 1
