CREATE TABLE blackfist_character_states (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX blackfist_character_states_episode_character_idx ON blackfist_character_states(episode_id,character_id);
ALTER TABLE blackfist_sequences ADD COLUMN inherited_character_states TEXT NOT NULL DEFAULT '{}';
