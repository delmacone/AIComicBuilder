CREATE TABLE IF NOT EXISTS blackfist_sequence_audio_assets (
  id TEXT PRIMARY KEY NOT NULL,
  sequence_id TEXT NOT NULL REFERENCES blackfist_sequences(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shot_id TEXT,
  kind TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  file_url TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bf_seq_audio_assets_sequence ON blackfist_sequence_audio_assets(sequence_id);
CREATE INDEX IF NOT EXISTS idx_bf_seq_audio_assets_project ON blackfist_sequence_audio_assets(project_id);
