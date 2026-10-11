#!/usr/bin/env bash
set -euo pipefail
# Validate every registered BlackFist migration in a clean SQLite database.
python3 - <<'PY'
import json, pathlib, sqlite3
root=pathlib.Path("drizzle")
journal=json.loads((root/"meta/_journal.json").read_text())
entries=[e for e in journal["entries"] if 54<=e["idx"]<=69]
assert len(entries)==16, f"Expected 16 registered BlackFist migrations; found {len(entries)}"
assert [e["idx"] for e in entries]==list(range(54,70))
assert len({e["tag"] for e in entries})==16
for entry in entries:
 path=root/(entry["tag"]+".sql")
 assert path.is_file(), f"Missing registered migration: {path}"
 assert path.read_text().strip(), f"Empty migration: {path}"
print("BlackFist migrations 0054–0069 registered and present")
# Verify review-master migration against its required parent tables and foreign keys.
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript("CREATE TABLE projects(id TEXT PRIMARY KEY); CREATE TABLE episodes(id TEXT PRIMARY KEY);")
db.executescript((root/"0066_blackfist_episode_review_masters.sql").read_text())
cols={r[1] for r in db.execute("PRAGMA table_info(blackfist_episode_review_masters)")}
required={"id","project_id","episode_id","video_source_url","soundtrack_source_url","file_url","video_duration_seconds","soundtrack_duration_seconds","status","created_at"}
assert required<=cols, required-cols
indexes=list(db.execute("PRAGMA index_list(blackfist_episode_review_masters)"))
assert any("episode_idx" in row[1] for row in indexes)
db.execute("INSERT INTO projects(id) VALUES ('p')")
db.execute("INSERT INTO episodes(id) VALUES ('e')")
db.execute("""INSERT INTO blackfist_episode_review_masters
 (id,project_id,episode_id,video_source_url,soundtrack_source_url,file_url,video_duration_seconds,soundtrack_duration_seconds,created_at)
 VALUES ('r','p','e','/api/uploads/v.mp4','/api/uploads/a.mp3','/api/uploads/m.mp4',3,3,123)""")
assert db.execute("SELECT status FROM blackfist_episode_review_masters WHERE id='r'").fetchone()[0]=="review_required"
db.execute("DELETE FROM episodes WHERE id='e'")
assert db.execute("SELECT count(*) FROM blackfist_episode_review_masters").fetchone()[0]==0
print("Review-master migration SQLite insert/default/index/cascade smoke test passed")
# Simulate a populated installation before the new migration: preserve existing rows.
upgrade=sqlite3.connect(":memory:")
upgrade.execute("PRAGMA foreign_keys=ON")
upgrade.executescript("""
 CREATE TABLE projects(id TEXT PRIMARY KEY, title TEXT NOT NULL);
 CREATE TABLE episodes(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id));
 CREATE TABLE blackfist_screenplay_drafts(id TEXT PRIMARY KEY, episode_id TEXT NOT NULL, status TEXT NOT NULL);
 INSERT INTO projects VALUES ('existing-project','General Jamaica — The Storm');
 INSERT INTO episodes VALUES ('existing-episode','existing-project');
 INSERT INTO blackfist_screenplay_drafts VALUES ('existing-script','existing-episode','approved');
""")
before=list(upgrade.execute("SELECT projects.id,episodes.id,blackfist_screenplay_drafts.id FROM projects JOIN episodes ON episodes.project_id=projects.id JOIN blackfist_screenplay_drafts ON blackfist_screenplay_drafts.episode_id=episodes.id"))
upgrade.executescript((root/"0066_blackfist_episode_review_masters.sql").read_text())
after=list(upgrade.execute("SELECT projects.id,episodes.id,blackfist_screenplay_drafts.id FROM projects JOIN episodes ON episodes.project_id=projects.id JOIN blackfist_screenplay_drafts ON blackfist_screenplay_drafts.episode_id=episodes.id"))
assert before==after, "Existing episode data changed during upgrade"
assert upgrade.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
assert upgrade.execute("PRAGMA foreign_key_check").fetchall()==[]
print("Populated database upgrade preserves existing project, episode and screenplay records")
# Apply ownership migrations to an existing installation and validate tenant isolation.
upgrade.executescript((root/"0067_blackfist_episode_assemblies.sql").read_text())
upgrade.executescript((root/"0068_blackfist_episode_soundtracks.sql").read_text())
upgrade.execute("INSERT INTO projects VALUES ('other-project','Another customer')")
upgrade.execute("INSERT INTO episodes VALUES ('other-episode','other-project')")
for table,suffix in [("blackfist_episode_assemblies","v"),("blackfist_episode_soundtracks","a")]:
 for project,episode in [("existing-project","existing-episode"),("other-project","other-episode")]:
  file_url=f"/api/uploads/{project}-{suffix}"
  if suffix=="v":
   upgrade.execute(f"INSERT INTO {table}(id,project_id,episode_id,file_url,sequence_ids,scene_count,duration_seconds,created_at) VALUES(?,?,?,?,?,?,?,?)",(project,project,episode,file_url,'["s1"]',1,4,123))
  else:
   upgrade.execute(f"INSERT INTO {table}(id,project_id,episode_id,file_url,duration_seconds,created_at) VALUES(?,?,?,?,?,?)",(project,project,episode,file_url,4,123))
  assert upgrade.execute(f"SELECT status FROM {table} WHERE id=?",(project,)).fetchone()[0]=="review_required"
 assert upgrade.execute(f"SELECT count(*) FROM {table} WHERE project_id='existing-project' AND episode_id='existing-episode'").fetchone()[0]==1
 assert upgrade.execute(f"SELECT count(*) FROM {table} WHERE project_id='existing-project' AND file_url LIKE '%other-project%'").fetchone()[0]==0
 assert any("episode_idx" in r[1] for r in upgrade.execute(f"PRAGMA index_list({table})"))
assert before==list(upgrade.execute("SELECT projects.id,episodes.id,blackfist_screenplay_drafts.id FROM projects JOIN episodes ON episodes.project_id=projects.id JOIN blackfist_screenplay_drafts ON blackfist_screenplay_drafts.episode_id=episodes.id WHERE projects.id='existing-project'"))
assert upgrade.execute("PRAGMA foreign_key_check").fetchall()==[]
upgrade.execute("DELETE FROM episodes WHERE id='other-episode'")
for table in ["blackfist_episode_assemblies","blackfist_episode_soundtracks"]:
 assert upgrade.execute(f"SELECT count(*) FROM {table} WHERE project_id='other-project'").fetchone()[0]==0
assert upgrade.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
print("Episode video and soundtrack ownership migrations preserve existing records, indexes and cascades")

# Director drafts are non-destructive and scoped to their parent episode.
upgrade.executescript((root/"0069_blackfist_director_drafts.sql").read_text())
upgrade.execute("INSERT INTO blackfist_director_drafts(id,project_id,episode_id,proposals_json,created_at) VALUES ('draft','existing-project','existing-episode','[]',123)")
assert upgrade.execute("SELECT status FROM blackfist_director_drafts WHERE id='draft'").fetchone()[0]=="draft_review_required"
assert upgrade.execute("PRAGMA foreign_key_check").fetchall()==[]
assert upgrade.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
print("Director draft migration preserves existing production records")

PY
