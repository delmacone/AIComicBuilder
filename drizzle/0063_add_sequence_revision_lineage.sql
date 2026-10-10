ALTER TABLE blackfist_sequences ADD COLUMN revision_of_sequence_id TEXT;
ALTER TABLE blackfist_sequences ADD COLUMN revision_number INTEGER NOT NULL DEFAULT 1;
