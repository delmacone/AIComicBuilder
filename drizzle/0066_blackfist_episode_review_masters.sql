CREATE TABLE IF NOT EXISTS blackfist_episode_review_masters (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
 video_source_url TEXT NOT NULL,
 soundtrack_source_url TEXT NOT NULL,
 file_url TEXT NOT NULL,
 video_duration_seconds REAL NOT NULL,
 soundtrack_duration_seconds REAL NOT NULL,
 status TEXT NOT NULL DEFAULT 'review_required',
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS blackfist_episode_review_masters_episode_idx ON blackfist_episode_review_masters(episode_id,created_at);
