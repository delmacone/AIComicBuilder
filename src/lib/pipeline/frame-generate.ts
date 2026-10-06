import { db } from "@/lib/db";
import { shots, characters, projects, episodes, characterCostumes, scenes, virtualSets } from "@/lib/db/schema";
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
import { buildVisualStylePrompt } from "@/lib/pipeline/blackfist-visual-style";

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

  const [projectRecord] = await db.select().from(projects).where(eq(projects.id, payload.projectId));
  const visualStylePrompt = projectRecord ? buildVisualStylePrompt(projectRecord) : "";

  // Fetch color palette from project (or episode)
  let colorPalette = "";
  if (shot.episodeId) {
    const [episode] = await db.select().from(episodes).where(eq(episodes.id, shot.episodeId));
    if (episode?.colorPalette) colorPalette = episode.colorPalette;
  }
  if (!colorPalette) {
    if (projectRecord?.colorPalette) colorPalette = projectRecord.colorPalette;
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

  // Persistent scene continuity: keep location/props/damage/weather/injuries
  // stable across all shots in the same scene when the state has been defined.
  if (shot.sceneId) {
    const [scene] = await db.select().from(scenes).where(eq(scenes.id, shot.sceneId));
    if (scene) {
      const sceneRules: string[] = [];
      if (scene.title) sceneRules.push(`Location/scene: ${scene.title}`);
      if (scene.description) sceneRules.push(`Scene description: ${scene.description}`);
      if (scene.lighting) sceneRules.push(`Lighting: ${scene.lighting}`);
      if (scene.colorPalette) sceneRules.push(`Scene colours: ${scene.colorPalette}`);
      if (scene.virtualSetId) {
        const [set] = await db.select().from(virtualSets).where(eq(virtualSets.id, scene.virtualSetId));
        if (set?.continuityLockEnabled) {
          sceneRules.push(`VIRTUAL SET LOCK: ${set.name}`);
          if (set.location) sceneRules.push(`Set location: ${set.location}`);
          if (set.description) sceneRules.push(`Set design: ${set.description}`);
          if (set.timeOfDay) sceneRules.push(`Time of day: ${set.timeOfDay}`);
          if (set.weather) sceneRules.push(`Weather: ${set.weather}`);
          if (set.lighting) sceneRules.push(`Set lighting: ${set.lighting}`);
          for (const [label, raw] of [["layout", set.layoutState], ["props", set.propsState], ["damage", set.damageState]] as const) {
            try {
              const state = JSON.parse(raw || "{}");
              const details = Object.entries(state).filter(([, value]) => value !== "" && value != null).map(([key, value]) => `${key}: ${String(value)}`);
              if (details.length) sceneRules.push(`Set ${label}: ${details.join("; ")}`);
            } catch {
              sceneRules.push(`Virtual Set ${label} metadata requires review.`);
            }
          }
          try {
            const refs = JSON.parse(set.referenceImages || "[]");
            if (Array.isArray(refs)) setRefImages.push(...refs.filter((ref): ref is string => typeof ref === "string"));
          } catch {
            sceneRules.push("Virtual Set reference image metadata requires review.");
          }
          sceneRules.push("Keep the same geography, architecture, landmarks, prop placement and existing damage across every camera angle. Do not redesign or reset the set between shots.");
        }
      }
      try {
        const state = JSON.parse(scene.continuityState || "{}");
        for (const [key, value] of Object.entries(state)) {
          if (value !== undefined && value !== null && value !== "") {
            sceneRules.push(`${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`);
          }
        }
      } catch {
        sceneRules.push("Scene continuity metadata requires review.");
      }
      if (sceneRules.length) {
        compositionSuffix += `\n\nBLACKFIST SCENE CONTINUITY — preserve across shots:\n${sceneRules.join("\n")}`;
      }
    }
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
  const setRefImages: string[] = [];
  let canonPromptBlock = buildCanonPromptBlock(relevantChars);
  if (visualStylePrompt) canonPromptBlock += `\n\n${visualStylePrompt}`;

  // Bind shot costume overrides into the canon prompt as an explicit visual rule.
  // The existing costume table remains the source of truth; BlackFist adds
  // enforcement rather than duplicating costume records.
  const costumeLockLines: string[] = [];
  for (const c of relevantChars) {
    const costumeId = costumeOverrides[c.id];
    if (!costumeId) continue;
    const [costume] = await db.select().from(characterCostumes)
      .where(and(eq(characterCostumes.id, costumeId), eq(characterCostumes.characterId, c.id)));
    if (costume) {
      costumeLockLines.push(
        `${c.name} ACTIVE COSTUME: ${costume.name}. ${costume.description || ""} Do not change this costume during the shot.`
      );
    }
  }
  if (costumeLockLines.length) {
    canonPromptBlock += `\n\nBLACKFIST ACTIVE COSTUME LOCK:\n${costumeLockLines.join("\n")}`;
  }

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

  const lockedWithoutReference = relevantChars.filter((c) => c.canonLockEnabled === 1 && !c.referenceImage);
  if (lockedWithoutReference.length > 0) {
    const names = lockedWithoutReference.map((c) => c.name);
    await db.update(shots).set({
      continuityStatus: "review_required",
      continuityScore: 0,
      continuityIssues: JSON.stringify(names.map((name) => name + ": approved canon reference image is missing")),
    }).where(eq(shots.id, payload.shotId));
    throw new Error("BlackFist continuity review required: missing approved canon reference");
  }
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
      ? [...charRefImages, ...setRefImages, prevLastFrameUrl]
      : [...charRefImages, ...setRefImages];
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
      referenceImages: [firstFramePath, ...charRefImages, ...setRefImages],
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
      // Inspect BOTH endpoints of the generated shot. A drifting first frame
      // must not be hidden by a good last frame (or vice versa).
      const firstResult = await checkCanonContinuity(continuityAI, firstFramePath, c.referenceImage as string, lock);
      const lastResult = await checkCanonContinuity(continuityAI, lastFramePath, c.referenceImage as string, lock);
      const rank = { passed: 0, failed: 1, review_required: 2 } as const;
      const worstStatus = rank[firstResult.status] >= rank[lastResult.status] ? firstResult.status : lastResult.status;
      continuityResults.push({
        character: c.name,
        status: worstStatus,
        score: Math.min(firstResult.score, lastResult.score),
        identityScore: Math.min(firstResult.identityScore, lastResult.identityScore),
        costumeScore: Math.min(firstResult.costumeScore, lastResult.costumeScore),
        issues: [
          ...firstResult.issues.map((issue) => `first frame: ${issue}`),
          ...lastResult.issues.map((issue) => `last frame: ${issue}`),
        ],
      });
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
