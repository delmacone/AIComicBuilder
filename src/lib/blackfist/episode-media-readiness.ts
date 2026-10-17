/** Editorial metadata checks only; these do not prove media is playable or stored. */
type Media = { fileUrl: string; status: string; durationSeconds: number };
type Review = { fileUrl: string; status: string; videoSourceUrl: string; soundtrackSourceUrl: string; videoDurationSeconds: number; soundtrackDurationSeconds: number };
const saved = (url: unknown) => typeof url === "string" && url.trim().length > 0;
export function checkEpisodeMediaRecords(video: Media | null | undefined, audio: Media | null | undefined, review: Review | null | undefined) {
  const videoIssues: string[] = [];
  const audioIssues: string[] = [];
  const reviewIssues: string[] = [];
  if (!video) videoIssues.push("Assemble and save episode video");
  else if (!saved(video.fileUrl)) videoIssues.push("Episode video has no saved file URL");
  if (!audio) audioIssues.push("Mix and save episode soundtrack");
  else if (!saved(audio.fileUrl)) audioIssues.push("Episode soundtrack has no saved file URL");
  if (!review) reviewIssues.push("Create unpublished review MP4 after editorial approval");
  else {
    if (!saved(review.fileUrl)) reviewIssues.push("Review MP4 has no saved file URL");
    if (review.status !== "review_required") reviewIssues.push("Review MP4 is not in unpublished review state");
    if (!video || !audio || !saved(video.fileUrl) || !saved(audio.fileUrl)) reviewIssues.push("Review MP4 requires saved video and soundtrack sources");
    else {
      if (review.videoSourceUrl !== video.fileUrl) reviewIssues.push("Review MP4 uses a different video revision");
      if (review.soundtrackSourceUrl !== audio.fileUrl) reviewIssues.push("Review MP4 uses a different soundtrack revision");
      if (review.videoDurationSeconds !== video.durationSeconds || review.soundtrackDurationSeconds !== audio.durationSeconds)
        reviewIssues.push("Review MP4 duration metadata differs from current source revisions");
    }
  }
  return { videoIssues, audioIssues, reviewIssues };
}
