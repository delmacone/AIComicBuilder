ALTER TABLE blackfist_sequences ADD COLUMN provider_task_id TEXT;
ALTER TABLE blackfist_sequences ADD COLUMN provider_metadata TEXT NOT NULL DEFAULT '{}';
