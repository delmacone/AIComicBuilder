ALTER TABLE blackfist_sequences ADD COLUMN audio_plan TEXT NOT NULL DEFAULT '{}';
ALTER TABLE blackfist_sequences ADD COLUMN audio_status TEXT NOT NULL DEFAULT 'draft';
