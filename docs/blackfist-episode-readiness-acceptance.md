# BlackFist Showrunner — Episode Readiness Acceptance Test

Target: **General Jamaica — The Storm**, intended runtime **20–22 minutes**.

## Preconditions

- Use an authenticated account that owns the test project.
- Test on a non-production episode or an isolated database snapshot.
- Do not approve screenplay, spend AI credits, assemble media, publish, or change production records merely to complete this checklist.
- Open the Showrunner, select the episode, and click **Check Full Episode Readiness**.
- Record the episode ID and timestamp. The API is `GET /api/projects/{projectId}/showrunner/episodes/{episodeId}/director/readiness`.

## Read-only acceptance scenarios

| Scenario | Expected behaviour |
| --- | --- |
| Unauthenticated request or wrong project owner | 404; no episode information disclosed |
| Episode ID belongs to a different project | 404; no episode information disclosed |
| No approved screenplay | Screenplay blocked; animation/audio/assembly milestones blocked |
| No scenes or shots | Storyboard blocked; assembly blocked |
| Incomplete, stale, or continuity-unapproved shot | Animation blocked |
| Dialogue actor not assigned to the episode | Voice recordings blocked with an actionable dialogue ID |
| Assigned actor missing a locked ElevenLabs voice | Voice recordings blocked |
| Dialogue missing audio or text | Voice recordings blocked |
| Scene missing an approved final AV sequence | Episode video blocked; assembly milestone blocked |
| Scene has two approved final AV sequences | Episode video blocked; explicit one-per-scene requirement |
| AV sequence lacks `avQc.humanApproved === true` | Not counted as approved |
| Sequence belongs to no episode scene | Episode video blocked |
| No saved episode video assembly | Video blocked |
| No saved episode soundtrack | Soundtrack blocked |
| Saved video and soundtrack durations differ by more than 0.25 seconds | Alignment blocked |
| Planned storyboard runtime outside 1200–1320 seconds | Runtime blocked |
| No saved unpublished review master | Review master blocked |
| All nine stages pass | No outstanding checklist items; progress reads 9/9 |

## UI checks

1. Confirm the progress bar matches the number of passed stages.
2. Confirm **Recommended next production action** names the first blocker.
3. Confirm **Continue to next step** and each **Go to section** control scrolls to an existing editor section.
4. Confirm **Refresh Readiness** re-reads saved server data after an approved change.
5. Confirm **Completed Stages** can be expanded and collapsed.
6. Confirm all four milestone cards show readiness and blockers.
7. Confirm the readiness check itself does not create assets, spend credits, or publish content.

## Limitations to verify before declaring production ready

- Readiness is an editorial indicator, not proof of playable media quality.
- The current voice check verifies actor assignment, voice lock, audio URL and text; it does not validate audio playback or measured dialogue duration.
- The latest saved video and soundtrack are compared by duration; this does not prove frame-accurate synchronization or that a review master was built from those exact versions.
- The screenplay and sequence approvals must be tested with real episode data after deployment.
- The production readiness endpoint does not replace the independent checks performed by assembly and mux endpoints.

**Acceptance outcome:** Record each scenario as PASS, FAIL, or NOT TESTED. Do not claim the live General Jamaica episode passed until the deployed system has been checked against actual episode records.
