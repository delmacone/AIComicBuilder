ALTER TABLE blackfist_sequences ADD COLUMN video_url TEXT;
ALTER TABLE blackfist_sequences ADD COLUMN final_video_url TEXT;
ALTER TABLE blackfist_sequences ADD COLUMN av_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE blackfist_sequences ADD COLUMN av_qc TEXT NOT NULL DEFAULT '{}';
