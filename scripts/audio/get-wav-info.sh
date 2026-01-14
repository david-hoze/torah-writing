#!/bin/sh

find . -type f -name "*.WAV" -print0 | while IFS= read -r -d '' file; do
    echo -n "File: $file | "
    ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate,bits_per_sample -of csv=p=0 "$file"
done

