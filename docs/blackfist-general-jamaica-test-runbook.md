# BlackFist Motion Studio — General Jamaica Acceptance Runbook

Target: General Jamaica — The Storm (20–22 minutes; 1200–1320 seconds).

## Safe execution rules
- Run on a disposable database snapshot or dedicated non-production test project owned by the authenticated test user.
- Never modify live episodes, grant approval, publish, render paid assets, or spend AI credits as part of these checks.
- Keep AI providers mocked for negative and API contract tests. Record test environment, branch SHA, timestamp, project ID, and episode ID.
- Use `docs/blackfist-episode-readiness-acceptance.md` as the authoritative scenario list.

## Baseline checks
1. Install dependencies with the repository's lockfile and supported Node/pnpm versions.
2. Run `pnpm lint` and `pnpm build` on the isolated branch; capture exit codes and logs.
3. Confirm the Showrunner UI loads and its readiness GET endpoint does not mutate records.
4. Snapshot row counts and media assets before and after all read-only checks.

## Readiness contract
- Call `GET /api/projects/{projectId}/showrunner/episodes/{episodeId}/director/readiness` as the owner.
- Confirm 404 for unauthenticated access, other owners, and an episode from another project.
- For each missing prerequisite (approved screenplay, scenes/shots, continuity approval, locked actor voice, recorded dialogue, approved final AV sequence, video assembly, soundtrack, synchronized duration, runtime, unpublished review master), verify that the expected stage is blocked and that nextAction names a concrete remedy.
- Check progress counts, checklist order, milestone blockers and UI navigation.
- For complete fixture data, assert 9/9 only if all requirements are satisfied; this is a fixture test, not a real episode certification.

## Media acceptance (separate from readiness)
- Decode and play the actual review master.
- Measure audio/video sync and duration, not just saved metadata.
- Verify that the soundtrack and video refer to the exact approved revisions.
- Verify credits, rights confirmations, continuity, and human editorial sign-off.

## Reporting
Use PASS / FAIL / NOT TESTED for each scenario, with evidence links and a blocker owner. Do not claim that General Jamaica has passed until real deployed episode records and playable assets are verified.

## Replit handoff gate
Move to Replit runtime verification only after the isolated build passes and the regression suite is recorded. Configure environment secrets in Replit's secret manager, not in GitHub. Preserve source assets and existing production data.
