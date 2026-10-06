-- BlackFist reusable virtual production sets.
CREATE TABLE IF NOT EXISTS virtual_sets (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  location TEXT DEFAULT '',
  time_of_day TEXT DEFAULT '',
  weather TEXT DEFAULT '',
  lighting TEXT DEFAULT '',
  layout_state TEXT DEFAULT '{}',
  props_state TEXT DEFAULT '[]',
  damage_state TEXT DEFAULT '[]',
  reference_images TEXT DEFAULT '[]',
  visual_style_preset TEXT DEFAULT '',
  continuity_lock_enabled INTEGER NOT NULL DEFAULT 1,
  continuity_lock_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS virtual_sets_project_id_idx ON virtual_sets(project_id);
ALTER TABLE scenes ADD COLUMN virtual_set_id TEXT;
