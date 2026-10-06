-- BlackFist Motion Studio: Canon Visual Lock + continuity gate state
ALTER TABLE characters ADD COLUMN canon_visual_lock TEXT DEFAULT '{}';
ALTER TABLE characters ADD COLUMN canon_lock_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN canon_lock_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE shots ADD COLUMN continuity_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE shots ADD COLUMN continuity_score INTEGER DEFAULT 0;
ALTER TABLE shots ADD COLUMN continuity_issues TEXT DEFAULT '[]';
ALTER TABLE shots ADD COLUMN continuity_retry_count INTEGER NOT NULL DEFAULT 0;
