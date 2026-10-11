CREATE TABLE IF NOT EXISTS blackfist_episode_soundtracks (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
 file_url TEXT NOT NULL UNIQUE,
 duration_seconds REAL NOT NULL,
 status TEXT NOT NULL DEFAULT 'review_required',
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS blackfist_episode_soundtracks_episode_idx ON blackfist_episode_soundtracks(episode_id, created_at);
