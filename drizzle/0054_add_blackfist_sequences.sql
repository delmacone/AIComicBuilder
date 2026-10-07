-- BlackFist provider-agnostic multi-shot sequence plans.
CREATE TABLE IF NOT EXISTS blackfist_sequences (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
  scene_id TEXT REFERENCES scenes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  engine TEXT NOT NULL DEFAULT 'unassigned',
  status TEXT NOT NULL DEFAULT 'draft',
  shot_ids TEXT NOT NULL DEFAULT '[]',
  plan TEXT NOT NULL DEFAULT '{}',
  continuity_snapshot TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS blackfist_sequences_project_idx ON blackfist_sequences(project_id);
CREATE INDEX IF NOT EXISTS blackfist_sequences_scene_idx ON blackfist_sequences(scene_id);
