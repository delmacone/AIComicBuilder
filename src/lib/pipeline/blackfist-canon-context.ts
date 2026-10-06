import type { CanonVisualLock } from "@/lib/pipeline/blackfist-continuity-check";

export function buildCanonPromptBlock(
  characters: Array<{
    name: string;
    canonLockEnabled?: number | null;
    canonVisualLock?: string | null;
  }>
): string {
  const blocks: string[] = [];

  for (const character of characters) {
    if (character.canonLockEnabled !== 1) continue;
    let lock: CanonVisualLock;
    try {
      lock = JSON.parse(character.canonVisualLock || "{}") as CanonVisualLock;
    } catch {
      continue;
    }

    const rules = [
      `CHARACTER: ${character.name}`,
      lock.skinTone && `Skin tone: ${lock.skinTone}`,
      lock.hair && `Hair: ${lock.hair}`,
      lock.bodyBuild && `Body/build: ${lock.bodyBuild}`,
      lock.costume && `Costume: ${lock.costume}`,
      lock.emblem && `Emblem/logo: ${lock.emblem}`,
      lock.costumeColors?.length && `Fixed costume colours: ${lock.costumeColors.join(", ")}`,
      lock.accessories?.length && `Required accessories: ${lock.accessories.join(", ")}`,
      lock.powerEffects && `Power visual rules: ${lock.powerEffects}`,
      lock.notes && `Additional canon: ${lock.notes}`,
    ].filter(Boolean);

    blocks.push(rules.join("\n"));
  }

  if (!blocks.length) return "";
  return `\n\nBLACKFIST CANON VISUAL LOCK — MANDATORY, DO NOT REDESIGN:\n${blocks.join("\n\n")}\nPreserve these identity details exactly across every frame and shot.`;
}
