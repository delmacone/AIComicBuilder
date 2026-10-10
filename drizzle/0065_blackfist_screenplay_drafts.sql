CREATE TABLE blackfist_screenplay_drafts (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
 version INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'review_required',
 story_idea TEXT NOT NULL,
 screenplay_json TEXT NOT NULL,
 cast_snapshot_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 approved_at INTEGER
);
CREATE UNIQUE INDEX blackfist_screenplay_episode_version ON blackfist_screenplay_drafts(episode_id,version);
