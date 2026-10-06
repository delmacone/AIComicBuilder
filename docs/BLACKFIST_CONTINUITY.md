# BlackFist Motion Studio — Continuity Architecture

## Goal
Extend the working AIComicBuilder pipeline without replacing it. BlackFist production must preserve approved hero identity and visual state across shots, scenes, and long-form episodes.

## Existing continuity features retained
- Character reference images attached to frame generation.
- Character reference image history.
- Shot-level reference images and asset version history.
- Costume overrides.
- Character height and body type.
- Episode/project colour palette.
- Previous shot last-frame lookup.
- Current shot first-frame anchor for last-frame generation.
- Existing video quality checker.

## BlackFist Canon Visual Lock
Each canon character will gain an approved visual lock containing:
- canonical reference image
- face/identity lock
- skin-tone description
- hair description
- body build and height
- default hero/civilian costume IDs
- emblem/logo description
- fixed costume colours
- required accessories
- power-effect description
- lock status and version

Approved canon references must not be silently replaced by later generations.

## Shot continuity state
Before generating a shot, construct a continuity state from:
1. Canon Visual Lock for every character in the shot.
2. Active costume for each character.
3. Previous shot's approved final frame.
4. Current scene lighting and colour palette.
5. Persistent props, damage/injuries, weather, and location state where available.

The first frame inherits this state. The last frame inherits the approved first frame plus the same canon locks.

## Continuity Gate
Generated assets must pass a BlackFist continuity check before being marked approved.

Check:
- face/identity
- skin tone
- hairstyle
- body proportions/height
- costume design and colours
- emblem/logo
- required accessories
- power effects when active
- scene/location state
- gross image defects

Proposed thresholds:
- Canon identity: >= 90
- Costume/emblem: >= 90
- Overall continuity: >= 85
- Severe canon mismatch: automatic fail

A failed checker must not default to PASS. Checker errors return REVIEW_REQUIRED.

## Regeneration policy
On failure:
1. retain the failed asset in version history;
2. mark it continuity_failed;
3. regenerate using canon references + previous approved frame;
4. cap automatic retries;
5. send unresolved failures to manual review.

## Long-form principle
Never create a 22-minute episode as one uncontrolled generation. Build it as approved shots chained by continuity state. Only approved shots enter final episode assembly.

## First proof
General Jamaica is the first BlackFist continuity proof:
- create/approve canonical master reference;
- lock hero appearance and costume;
- generate a short multi-shot sequence;
- verify identity/costume continuity shot-to-shot;
- only then move to longer sequences.
