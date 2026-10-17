/** Validate saved media duration metadata before claiming editorial A/V alignment. */
export function checkAvDurationAlignment(videoSeconds: unknown, audioSeconds: unknown): string[] {
  if (typeof videoSeconds !== "number" || !Number.isFinite(videoSeconds) || videoSeconds <= 0 ||
      typeof audioSeconds !== "number" || !Number.isFinite(audioSeconds) || audioSeconds <= 0) {
    return ["Video and soundtrack must both have valid positive durations"];
  }
  if (Math.abs(videoSeconds - audioSeconds) > 0.25) {
    return ["Audio/video duration mismatch exceeds 0.25 seconds"];
  }
  return [];
}
