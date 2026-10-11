CREATE TABLE IF NOT EXISTS blackfist_director_drafts (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
 proposals_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft_review_required',
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS blackfist_director_drafts_episode_idx ON blackfist_director_drafts(episode_id, created_at);
