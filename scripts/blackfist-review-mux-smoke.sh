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
# Two independently encoded scene clips, concatenated into a longer episode edit.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=640x360:rate=24:duration=2" -c:v libx264 -pix_fmt yuv420p -an "$tmp/scene1.mp4"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=640x360:rate=24:duration=2" -vf hflip -c:v libx264 -pix_fmt yuv420p -an "$tmp/scene2.mp4"
printf "file '%s'\\nfile '%s'\\n" "$tmp/scene1.mp4" "$tmp/scene2.mp4" > "$tmp/scenes.txt"
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$tmp/scenes.txt" -c copy "$tmp/episode-video.mp4"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=440:duration=4" -c:a libmp3lame "$tmp/episode-audio.mp3"
ffmpeg -hide_banner -loglevel error -y -i "$tmp/episode-video.mp4" -i "$tmp/episode-audio.mp3" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$tmp/episode-review.mp4"
ffmpeg -hide_banner -loglevel error -xerror -i "$tmp/episode-review.mp4" -f null -
python3 - "$tmp/episode-review.mp4" <<'PY'
import json, subprocess, sys
data=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration:stream=codec_type,duration","-of","json",sys.argv[1]]))
streams=data["streams"]
assert any(s["codec_type"]=="video" for s in streams)
assert any(s["codec_type"]=="audio" for s in streams)
video=float(next(s["duration"] for s in streams if s["codec_type"]=="video"))
audio=float(next(s["duration"] for s in streams if s["codec_type"]=="audio"))
assert 3.8<=video<=4.2, f"Unexpected concatenated video duration: {video}"
assert abs(video-audio)<=0.15, f"Episode soundtrack drift: {video} vs {audio}"
print(f"Two-scene episode test passed: video {video:.3f}s, audio {audio:.3f}s")
PY
echo "BlackFist review MP4 smoke test passed: H.264 video, AAC audio, duration $duration s, decodes without errors"
