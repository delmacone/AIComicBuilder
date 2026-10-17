import assert from "node:assert/strict";
import test from "node:test";
import { buildReadinessSummary, type ReadinessStage } from "../src/lib/blackfist/readiness-summary.ts";

const names = [
  ["screenplay", "Approved screenplay"],
  ["storyboard", "Scenes and storyboard"],
  ["animation", "Animation and continuity"],
  ["voices", "Voice recordings"],
  ["soundtrack", "Episode soundtrack"],
  ["video", "Episode video"],
  ["alignment", "Final audio/video timing"],
  ["runtime", "20–22 minute runtime"],
  ["reviewMaster", "Unpublished review MP4"],
] as const;

function fixture(blocks: Record<string, string[]> = {}): ReadinessStage[] {
  return names.map(([key, title]) => ({ key, title, issues: blocks[key] ?? [] }));
}

test("all nine editorial stages passing yields no blockers", () => {
  const result = buildReadinessSummary(fixture());
  assert.equal(result.totalStages, 9);
  assert.equal(result.completedStages, 9);
  assert.equal(result.readyForReview, true);
  assert.equal(result.nextAction, null);
  assert.deepEqual(result.checklist, []);
  assert.ok(result.milestones.every(m => m.ready));
});

test("first blocker is ordered by production stage, not object insertion", () => {
  const result = buildReadinessSummary(fixture({
    video: ["Assemble video"],
    screenplay: ["Approve screenplay"],
    voices: ["Lock actor voice"],
  }));
  assert.equal(result.completedStages, 6);
  assert.equal(result.readyForReview, false);
  assert.deepEqual(result.checklist.map(item => item.stage), ["screenplay", "voices", "video"]);
  assert.equal(result.nextAction?.action, "Approve screenplay");
  assert.equal(result.nextAction?.stage, "screenplay");
  assert.equal(result.nextAction?.priority, 1);
});

test("multiple issues remain individually actionable", () => {
  const result = buildReadinessSummary(fixture({ voices: ["Assign actor", "Render audio"] }));
  assert.equal(result.completedStages, 8);
  assert.deepEqual(result.checklist.map(item => item.id), ["voices-0", "voices-1"]);
  assert.equal(result.milestones.find(m => m.key === "audio")?.ready, false);
});

test("a missing screenplay blocks downstream milestones", () => {
  const result = buildReadinessSummary(fixture({ screenplay: ["Approve screenplay"] }));
  assert.equal(result.milestones.find(m => m.key === "animation")?.ready, false);
  assert.equal(result.milestones.find(m => m.key === "audio")?.ready, false);
  assert.equal(result.milestones.find(m => m.key === "assembly")?.ready, false);
});

test("alignment blocker prevents editorial milestone", () => {
  const result = buildReadinessSummary(fixture({ alignment: ["AV mismatch"] }));
  assert.equal(result.milestones.find(m => m.key === "editorial")?.ready, false);
  assert.equal(result.readyForReview, false);
});

test("zero stages cannot be declared review-ready", () => {
  const result = buildReadinessSummary([]);
  assert.equal(result.readyForReview, false);
  assert.equal(result.totalStages, 0);
});

test("readiness evaluation does not mutate stage fixtures", () => {
  const stages = fixture({ animation: ["Approve shot"] });
  const snapshot = JSON.stringify(stages);
  buildReadinessSummary(stages);
  assert.equal(JSON.stringify(stages), snapshot);
});

test("missing required stage cannot be review-ready", () => {
  const result = buildReadinessSummary(fixture().filter(stage => stage.key !== "voices"));
  assert.equal(result.completedStages, 8);
  assert.equal(result.readyForReview, false);
});

test("duplicate stage cannot be review-ready", () => {
  const stages = fixture();
  const result = buildReadinessSummary([...stages, stages[0]]);
  assert.equal(result.readyForReview, false);
});

test("unknown stage cannot replace a required stage", () => {
  const stages = fixture().filter(stage => stage.key !== "voices");
  stages.push({ key: "unknown", title: "Unknown", issues: [] });
  assert.equal(buildReadinessSummary(stages).readyForReview, false);
});

test("missing required stage produces an actionable configuration blocker", () => {
  const result = buildReadinessSummary(fixture().filter(stage => stage.key !== "voices"));
  assert.equal(result.nextAction?.stage, "structure");
  assert.match(result.nextAction?.action ?? "", /Missing required production stage: voices/);
});

test("duplicate stage produces an actionable configuration blocker", () => {
  const stages = fixture();
  const result = buildReadinessSummary([...stages, stages[0]]);
  assert.equal(result.nextAction?.stage, "structure");
  assert.match(result.nextAction?.action ?? "", /Duplicate production stage: screenplay/);
});

test("unknown stage produces an actionable configuration blocker", () => {
  const stages = fixture();
  stages[3] = {key: "alien", title: "Unknown", issues: []};
  const result = buildReadinessSummary(stages);
  assert.ok(result.checklist.some(item => /Unknown production stage: alien/.test(item.action)));
});
