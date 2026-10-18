#!/usr/bin/env bash
# Assembles the rendered film frames into an MP4.
# usage: bash tools/film.sh [framesDir] [outFile] [fps]
set -euo pipefail
DIR="${1:-refs/film}"
OUT="${2:-refs/vesper-film.mp4}"
FPS="${3:-18}"
ffmpeg -y -loglevel error \
  -framerate "$FPS" -i "$DIR/f%04d.jpg" \
  -vf "scale=1280:720:flags=lanczos,format=yuv420p" \
  -c:v libx264 -preset slow -crf 19 -movflags +faststart -r "$FPS" \
  "$OUT"
ffprobe -v error -show_entries format=duration,size -show_entries stream=width,height,avg_frame_rate -of default=noprint_wrappers=1 "$OUT"
