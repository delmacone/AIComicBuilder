import { db } from "@/lib/db";
import { shots, characters, projects, episodes, characterCostumes } from "@/lib/db/schema";
import { resolveImageProvider, resolveAIProvider } from "@/lib/ai/provider-factory";
import type { ModelConfigPayload } from "@/lib/ai/provider-factory";
import {
  buildFirstFramePrompt,
  buildLastFramePrompt,
} from "@/lib/ai/prompts/frame-generate";
import { resolveSlotContents } from "@/lib/ai/prompts/resolver";
import { eq, and, lt, desc } from "drizzle-orm";
import type { Task } from "@/lib/task-queue";
import { getActiveAsset, insertAssetVersion, patchAsset } from "@/lib/shot-asset-utils";
import { checkCanonContinuity, type CanonVisualLock } from "@/lib/pipeline/blackfist-continuity-check";
import { buildCanonPromptBlock } from "@/lib/pipeline/blackfist-canon-context";

export async function handleFrameGenerate(task: Task) {
  const payload = task.payload as {
    shotId: string;
    projectId: string;
    userId?: string;
    modelConfig?: ModelConfigPayload;
  };

  const [shot] = await db
    .select()
    .from(shots)
    .where(eq(shots.id, payload.shotId));

  if (!shot) throw new Error("Shot not found");

  const projectCharacters = await db
    .select()
    .from(characters)
    .where(eq(characters.projectId, payload.projectId));

  // Parse costume overrides from shot
  const rawCostumeOverrides = shot.costumeOverrides as string | null | undefined;
  const costumeOverrides: Record<string, string> = rawCostumeOverrides && rawCostumeOverrides.trim()
    ? JSON.parse(rawCostumeOverrides)
    : {};

  // Build character descriptions, applying costume overrides when present
  const characterDescParts: string[] = [];
  for (const c of projectCharacters) {
    let description = c.description;
    const costumeId = costumeOverrides[c.id];
    if (costumeId) {
      const [costume] = await db
        .select()
        .from(characterCostumes)
        .where(eq(characterCostumes.id, costumeId));
      if (costume?.description) {
        description = `${c.description}. Current outfit: ${costume.description}`;
      }
    }
    let desc = `${c.name}: ${description}`;
    if (c.performanceStyle) {
      desc += ` [Performance: ${c.performanceStyle}]`;
    }
    characterDescParts.push(desc);
  }
  const characterDescriptions = characterDescParts.join("\n");

  const [previousShot] = await db
    .select()
    .from(shots)
    .where(
      and(
        eq(shots.projectId, payload.projectId),
        lt(shots.sequence, shot.sequence)
      )
    )
    .orderBy(desc(shots.sequence))
    .limit(1);

  const ai = resolveImageProvider(payload.modelConfig);
  // Continuity inspection is a multimodal text/vision task. Keep it separate
  // from the image generator because some image providers cannot inspect images.
  const continuityAI = resolveAIProvider(payload.modelConfig);

  const userId = payload.userId ?? "";
  const projectId = payload.projectId;
  const frameFirstSlots = await resolveSlotContents("frame_generate_first", { userId, projectId });
  const frameLastSlots = await resolveSlotContents("frame_generate_last", { userId, projectId });

  // Fetch color palette from project (or episode)
  let colorPalette = "";
  if (shot.episodeId) {
    const [episode] = await db.select().from(episodes).where(eq(episodes.id, shot.episodeId));
    if (episode?.colorPalette) colorPalette = episode.colorPalette;
  }
  if (!colorPalette) {
    const [project] = await db.select().from(projects).where(eq(projects.id, payload.projectId));
    if (project?.colorPalette) colorPalette = project.colorPalette;
  }

  // Build composition suffix
  let compositionSuffix = "";
  if (shot.compositionGuide) {
    compositionSuffix += `, ${shot.compositionGuide.replace(/_/g, " ")} composition`;
  }
  if (shot.focalPoint) {
    compositionSuffix += `, focus on ${shot.focalPoint}`;
  }
  if (shot.depthOfField === "shallow") {
    compositionSuffix += `, shallow depth of field, bokeh background`;
  } else if (shot.depthOfField === "deep") {
    compositionSuffix += `, deep focus, everything sharp`;
  }
  if (colorPalette) {
    compositionSuffix += `\n\nGLOBAL COLOR PALETTE (mandatory): ${colorPalette}. All frames must adhere to this color scheme.`;
  }

  // Build character height context for multi-character shots
  const shotPrompt = shot.prompt || "";
  const charsInPrompt = projectCharacters.filter(c => shotPrompt.includes(c.name));
  if (charsInPrompt.length > 1) {
    const heightInfo = charsInPrompt
      .filter(c => c.heightCm && c.heightCm > 0)
      .sort((a, b) => (b.heightCm || 170) - (a.heightCm || 170))
      .map(c => `${c.name}: ${c.heightCm}cm (${c.bodyType || "average"})`)
      .join(", ");
    if (heightInfo) {
      compositionSuffix += `. Character heights: ${heightInfo}. Maintain correct relative proportions`;
    }
  }

  await db
    .update(shots)
    .set({ status: "generating" })
    .where(eq(shots.id, payload.shotId));

  // Read first/last frame ASSET PROMPTS from the unified shot_assets table.
  // These were generated independently by `shot_keyframe_assets_generate`.
  // Fall back to legacy startFrameDesc/endFrameDesc if no asset rows exist (back-compat).
  const firstFrameAsset = await getActiveAsset(payload.shotId, "first_frame", 0);
  const lastFrameAsset = await getActiveAsset(payload.shotId, "last_frame", 0);

  const startFrameDescText = firstFrameAsset?.prompt || shot.prompt || "";
  const endFrameDescText = lastFrameAsset?.prompt || shot.prompt || "";

  // Pick character refs to attach as visual anchors. Prefer characters listed
  // on the asset row; fall back to first 3 chars with reference images.
  const charsWithRefs = projectCharacters.filter((c) => !!c.referenceImage);
  const storedCharNames: string[] =
    firstFrameAsset?.characters && firstFrameAsset.characters.length > 0
      ? firstFrameAsset.characters
      : [];

  // Prefer explicit asset character assignments. If absent, infer characters
  // from this shot's own text instead of attaching arbitrary project characters.
  // This prevents a locked hero who is not in the shot from being checked or
  // accidentally conditioned into the generated image.
  const shotCharacterText = [
    shot.prompt,
    shot.videoScript,
    shot.motionScript,
    startFrameDescText,
    endFrameDescText,
  ].filter(Boolean).join("\n").toLowerCase();
  const inferredChars = charsWithRefs.filter((c) =>
    shotCharacterText.includes(c.name.toLowerCase())
  );
  const relevantChars =
    storedCharNames.length > 0
      ? charsWithRefs.filter((c) => storedCharNames.includes(c.name))
      : inferredChars;
  const charRefImages = relevantChars.map((c) => c.referenceImage as string);
  const canonPromptBlock = buildCanonPromptBlock(relevantChars);

  console.log(`[FrameGenerate] Shot ${shot.sequence}: using ${relevantChars.length} chars: ${relevantChars.map(c => c.name).join(", ") || "fallback"}`);

  // Mark assets as generating
  if (firstFrameAsset) await patchAsset(firstFrameAsset.id, { status: "generating" });
  if (lastFrameAsset) await patchAsset(lastFrameAsset.id, { status: "generating" });

  // For visual continuity, inherit only from a previous frame that is safe.
  // A failed/review-required canon shot must never contaminate the next shot.
  const previousShotHasLockedCanon = previousShot
    ? projectCharacters.some((c) => {
        if (c.canonLockEnabled !== 1) return false;
        const text = [previousShot.prompt, previousShot.videoScript, previousShot.motionScript]
          .filter(Boolean).join("\n").toLowerCase();
        return text.includes(c.name.toLowerCase());
      })
    : false;
  const previousShotApproved = previousShot
    ? (!previousShotHasLockedCanon || previousShot.continuityStatus === "passed")
    : false;
  const prevLastFrameUrl = previousShot && previousShotApproved
    ? (await getActiveAsset(previousShot.id, "last_frame", 0))?.fileUrl ?? undefined
    : undefined;

  const lockedRelevantChars = relevantChars.filter(
    (c) => c.canonLockEnabled === 1 && !!c.referenceImage
  );
  const MAX_CONTINUITY_ATTEMPTS = 3;
  let firstFramePath = "";
  let lastFramePath = "";
  let continuityPassed = lockedRelevantChars.length === 0;

  for (let attempt = 1; attempt <= MAX_CONTINUITY_ATTEMPTS; attempt++) {
    let firstFramePrompt = buildFirstFramePrompt({
      sceneDescription: shot.prompt || "",
      startFrameDesc: startFrameDescText,
      characterDescriptions,
      previousLastFrame: prevLastFrameUrl ?? undefined,
      slotContents: frameFirstSlots,
    });
    if (compositionSuffix) firstFramePrompt += compositionSuffix;
    if (canonPromptBlock) firstFramePrompt += canonPromptBlock;
    if (attempt > 1) {
      firstFramePrompt += "\n\nBLACKFIST CONTINUITY RETRY: Preserve the approved character identity, skin tone, body proportions, costume colours, emblem and accessories exactly. Do not redesign the character.";
    }

    // On retries include the previous approved shot as an additional visual anchor.
    const retryRefs = attempt > 1 && prevLastFrameUrl
      ? [...charRefImages, prevLastFrameUrl]
      : charRefImages;
    firstFramePath = await ai.generateImage(firstFramePrompt, {
      quality: "hd",
      referenceImages: retryRefs,
    });

    let lastFramePrompt = buildLastFramePrompt({
      sceneDescription: shot.prompt || "",
      endFrameDesc: endFrameDescText,
      characterDescriptions,
      firstFramePath,
      slotContents: frameLastSlots,
    });
    if (compositionSuffix) lastFramePrompt += compositionSuffix;
    if (canonPromptBlock) lastFramePrompt += canonPromptBlock;
    lastFramePath = await ai.generateImage(lastFramePrompt, {
      quality: "hd",
      referenceImages: [firstFramePath, ...charRefImages],
    });

    if (lockedRelevantChars.length === 0) break;

    const continuityResults = [];
    for (const c of lockedRelevantChars) {
      let lock: CanonVisualLock;
      try {
        lock = JSON.parse(c.canonVisualLock || "{}") as CanonVisualLock;
      } catch {
        await db.update(shots).set({
          continuityStatus: "review_required",
          continuityScore: 0,
          continuityIssues: JSON.stringify([`${c.name}: invalid Canon Visual Lock JSON`]),
          continuityRetryCount: attempt - 1,
        }).where(eq(shots.id, payload.shotId));
        throw new Error(`BlackFist continuity review required for ${c.name}: invalid canon lock`);
      }
      lock.characterName ||= c.name;
      const result = await checkCanonContinuity(continuityAI, lastFramePath, c.referenceImage as string, lock);
      continuityResults.push({ character: c.name, ...result });
    }

    const reviewRequired = continuityResults.some((r) => r.status === "review_required");
    const failed = continuityResults.some((r) => r.status === "failed");
    const score = Math.min(...continuityResults.map((r) => r.score));
    const issues = continuityResults.flatMap((r) =>
      r.issues.map((issue) => `${r.character}: ${issue}`)
    );
    const continuityStatus = reviewRequired ? "review_required" : failed ? "failed" : "passed";

    await db.update(shots).set({
      continuityStatus,
      continuityScore: score,
      continuityIssues: JSON.stringify(issues),
      continuityRetryCount: attempt - 1,
    }).where(eq(shots.id, payload.shotId));

    if (continuityStatus === "passed") {
      continuityPassed = true;
      break;
    }

    // Checker/infrastructure uncertainty should go to a human rather than
    // spending credits blindly or accidentally approving a bad canon frame.
    if (continuityStatus === "review_required") {
      throw new Error(`BlackFist continuity review required for shot ${shot.sequence}`);
    }
  }

  if (!continuityPassed) {
    await db.update(shots).set({
      continuityStatus: "review_required",
      continuityRetryCount: MAX_CONTINUITY_ATTEMPTS - 1,
    }).where(eq(shots.id, payload.shotId));
    throw new Error(`BlackFist continuity gate exhausted retries for shot ${shot.sequence}; manual review required`);
  }

  // Patch asset rows with the resulting file URLs (or insert if they didn't
  // exist yet — happens for shots whose keyframe asset prompts haven't been
  // generated by the LLM step).
  if (firstFrameAsset) {
    await patchAsset(firstFrameAsset.id, {
      fileUrl: firstFramePath,
      status: "completed",
    });
  } else {
    await insertAssetVersion({
      shotId: payload.shotId,
      type: "first_frame",
      sequenceInType: 0,
      prompt: startFrameDescText,
      fileUrl: firstFramePath,
      status: "completed",
      characters: relevantChars.map((c) => c.name),
    });
  }
  if (lastFrameAsset) {
    await patchAsset(lastFrameAsset.id, {
      fileUrl: lastFramePath,
      status: "completed",
    });
  } else {
    await insertAssetVersion({
      shotId: payload.shotId,
      type: "last_frame",
      sequenceInType: 0,
      prompt: endFrameDescText,
      fileUrl: lastFramePath,
      status: "completed",
      characters: relevantChars.map((c) => c.name),
    });
  }

  await db
    .update(shots)
    .set({ status: "completed" })
    .where(eq(shots.id, payload.shotId));

  return { firstFrame: firstFramePath, lastFrame: lastFramePath };
}
