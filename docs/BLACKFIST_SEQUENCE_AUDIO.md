# BlackFist Sequence Audio Pipeline

A BlackFist multi-shot sequence owns one audio plan synchronized to its ordered visual shots.

## Layers
1. Dialogue — reuse approved dialogue audio when available; missing speech remains generation-required.
2. Ambience — continuous location beds can span several camera cuts.
3. SFX — action-motivated shot cues such as impacts, debris, powers and movement.
4. Music — sequence-level dramatic cues with dialogue ducking instructions.
5. Audio bridges — carry sound across visual cuts so multi-shot sequences feel continuous.

## Production rule
Planning and rendering are deliberately separate. Lioncore may plan cues, but it must not claim an audio asset exists until a provider has returned an actual asset. Existing dialogue audio is reusable. Missing dialogue, SFX and music remain `needs_generation` until a configured provider renders them.

## Provider architecture
The cue sheet is provider-independent. A future renderer can route dialogue to ElevenLabs or another TTS provider, SFX to an SFX generator/library, and music to a licensed/generative music provider without changing the BlackFist sequence plan.

## Continuity
Ambience and music may span multiple shots. SFX belongs to story action and must not be duplicated merely because the camera cuts. Dialogue text is immutable during audio planning.
