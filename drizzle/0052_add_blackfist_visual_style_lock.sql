-- BlackFist project-level Visual Style Lock.
-- Keeps the production render language stable across every generated shot.
ALTER TABLE projects ADD COLUMN visual_style_preset TEXT NOT NULL DEFAULT 'blackfist_comic_shader';
ALTER TABLE projects ADD COLUMN visual_style_lock TEXT DEFAULT '{}';
ALTER TABLE projects ADD COLUMN visual_style_lock_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN visual_style_lock_version INTEGER NOT NULL DEFAULT 1;
