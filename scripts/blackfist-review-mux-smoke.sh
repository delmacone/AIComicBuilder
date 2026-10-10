#!/usr/bin/env bash
set -euo pipefail
# Synthetic FFmpeg media test: validates the production mux settings, not a full application API request.
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=640x360:rate=24:duration=3" -c:v libx264 -pix_fmt yuv420p -an "$tmp/video.mp4"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=440:duration=3" -c:a libmp3lame "$tmp/soundtrack.mp3"
ffmpeg -hide_banner -loglevel error -y -i "$tmp/video.mp4" -i "$tmp/soundtrack.mp3" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$tmp/review.mp4"
video_codec="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$tmp/review.mp4")"
audio_codec="$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$tmp/review.mp4")"
duration="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$tmp/review.mp4")"
test "$video_codec" = "h264"
test "$audio_codec" = "aac"
awk -v d="$duration" 'BEGIN {exit !(d>=2.8 && d<=3.2)}'
ffmpeg -hide_banner -loglevel error -xerror -i "$tmp/review.mp4" -f null -
echo "BlackFist review MP4 smoke test passed: H.264 video, AAC audio, duration $duration s, decodes without errors"
