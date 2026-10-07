ALTER TABLE characters ADD COLUMN elevenlabs_voice_id TEXT;
ALTER TABLE characters ADD COLUMN voice_lock_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN voice_lock_version INTEGER NOT NULL DEFAULT 1;
