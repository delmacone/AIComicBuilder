-- BlackFist Motion Studio: persistent scene continuity state
ALTER TABLE scenes ADD COLUMN continuity_state TEXT DEFAULT '{}';
ALTER TABLE scenes ADD COLUMN continuity_state_version INTEGER NOT NULL DEFAULT 1;
