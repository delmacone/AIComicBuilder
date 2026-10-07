ALTER TABLE blackfist_sequences ADD COLUMN inherited_state TEXT NOT NULL DEFAULT '{}';
ALTER TABLE blackfist_sequences ADD COLUMN inherited_state_version INTEGER NOT NULL DEFAULT 0;
