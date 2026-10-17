import assert from "node:assert/strict";
import test from "node:test";
import { checkEpisodeMediaRecords } from "../src/lib/blackfist/episode-media-readiness.ts";

const video = { fileUrl: "/media/video.mp4", status: "review_required", durationSeconds: 1200 };
const audio = { fileUrl: "/media/audio.wav", status: "review_required", durationSeconds: 1200 };
const review = { fileUrl: "/media/review.mp4", status: "review_required", videoSourceUrl: video.fileUrl, soundtrackSourceUrl: audio.fileUrl, videoDurationSeconds: 1200, soundtrackDurationSeconds: 1200 };

test("matching unpublished review master passes metadata checks", () => {
  const result = checkEpisodeMediaRecords(video, audio, review);
  assert.deepEqual(result, {videoIssues: [], audioIssues: [], reviewIssues: []});
});
test("missing all records blocks all media stages", () => {
  const result = checkEpisodeMediaRecords(null, null, null);
  assert.ok(result.videoIssues.length);
  assert.ok(result.audioIssues.length);
  assert.ok(result.reviewIssues.length);
});
test("blank saved file URLs block readiness", () => {
  const result = checkEpisodeMediaRecords({...video, fileUrl: " "}, {...audio, fileUrl: ""}, {...review, fileUrl: ""});
  assert.ok(result.videoIssues.length);
  assert.ok(result.audioIssues.length);
  assert.ok(result.reviewIssues.length);
});
test("old video revision blocks review", () => {
  assert.match(checkEpisodeMediaRecords({...video, fileUrl: "/media/new.mp4"}, audio, review).reviewIssues.join(" "), /video revision/);
});
test("old soundtrack revision blocks review", () => {
  assert.match(checkEpisodeMediaRecords(video, {...audio, fileUrl: "/media/new.wav"}, review).reviewIssues.join(" "), /soundtrack revision/);
});
test("published or invalid review status blocks unpublished review readiness", () => {
  assert.match(checkEpisodeMediaRecords(video, audio, {...review, status: "published"}).reviewIssues.join(" "), /unpublished/);
});
test("mismatched source durations block review", () => {
  assert.match(checkEpisodeMediaRecords(video, audio, {...review, videoDurationSeconds: 1100}).reviewIssues.join(" "), /duration metadata/);
});
test("missing source media blocks review", () => {
  assert.match(checkEpisodeMediaRecords(null, audio, review).reviewIssues.join(" "), /requires saved/);
});
