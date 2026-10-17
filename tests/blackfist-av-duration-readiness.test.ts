import assert from "node:assert/strict";
import test from "node:test";
import { checkAvDurationAlignment } from "../src/lib/blackfist/av-duration-readiness.ts";

test("equal positive durations pass", () => assert.deepEqual(checkAvDurationAlignment(1200, 1200), []));
test("drift exactly 0.25 seconds passes", () => assert.deepEqual(checkAvDurationAlignment(100, 100.25), []));
test("drift beyond tolerance blocks", () => assert.match(checkAvDurationAlignment(100, 100.3)[0], /mismatch/));
for (const invalid of [undefined, null, NaN, Infinity, -Infinity, 0, -1, "1200"]) {
  test("invalid video duration blocks: " + String(invalid), () => {
    assert.match(checkAvDurationAlignment(invalid, 1200)[0], /valid positive/);
  });
  test("invalid soundtrack duration blocks: " + String(invalid), () => {
    assert.match(checkAvDurationAlignment(1200, invalid)[0], /valid positive/);
  });
}
