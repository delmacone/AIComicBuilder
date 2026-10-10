#!/usr/bin/env bash
set -euo pipefail
# Validate every registered BlackFist migration in a clean SQLite database.
python3 - <<'PY'
import json, pathlib, sqlite3
root=pathlib.Path("drizzle")
journal=json.loads((root/"meta/_journal.json").read_text())
entries=[e for e in journal["entries"] if 54<=e["idx"]<=66]
assert len(entries)==13, f"Expected 13 registered BlackFist migrations; found {len(entries)}"
assert [e["idx"] for e in entries]==list(range(54,67))
assert len({e["tag"] for e in entries})==13
for entry in entries:
 path=root/(entry["tag"]+".sql")
 assert path.is_file(), f"Missing registered migration: {path}"
 assert path.read_text().strip(), f"Empty migration: {path}"
print("BlackFist migrations 0054–0066 registered and present")
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
PY
