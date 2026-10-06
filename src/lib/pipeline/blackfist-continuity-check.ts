import type { TextOptions } from "@/lib/ai/types";

export type ContinuityStatus = "passed" | "failed" | "review_required";

export interface CanonVisualLock {
  characterName: string;
  skinTone?: string;
  hair?: string;
  bodyBuild?: string;
  costume?: string;
  emblem?: string;
  costumeColors?: string[];
  accessories?: string[];
  powerEffects?: string;
  notes?: string;
}

export interface ContinuityResult {
  status: ContinuityStatus;
  score: number;
  identityScore: number;
  costumeScore: number;
  issues: string[];
}

const MIN_OVERALL = 85;
const MIN_IDENTITY = 90;
const MIN_COSTUME = 90;

function buildPrompt(lock: CanonVisualLock) {
  return `You are the BlackFist Motion Studio canon continuity inspector.
Image 1 is a newly generated production frame. Image 2 is the APPROVED canon reference.
Judge continuity, not artistic taste.

CANON VISUAL LOCK:
${JSON.stringify(lock, null, 2)}

Check:
1. face and identity
2. skin tone
3. hairstyle
4. body build and proportions
5. costume design and fixed colours
6. emblem/logo placement and design
7. required accessories
8. power appearance when relevant
9. severe image defects that alter the character

Return JSON only:
{"score":0,"identityScore":0,"costumeScore":0,"issues":[]}

Scoring rules:
- identityScore below ${MIN_IDENTITY} is a failure.
- costumeScore below ${MIN_COSTUME} is a failure.
- overall score below ${MIN_OVERALL} is a failure.
- A materially different person, skin tone, hero costume, or emblem is a severe canon mismatch.`;
}

/**
 * BlackFist canon continuity gate.
 *
 * Important: infrastructure/model errors NEVER become an automatic pass.
 * They return review_required so a bad shot cannot silently enter an episode.
 */
export async function checkCanonContinuity(
  provider: { generateText: (prompt: string, options?: TextOptions) => Promise<string> },
  generatedFrameUrl: string,
  approvedReferenceUrl: string,
  lock: CanonVisualLock
): Promise<ContinuityResult> {
  try {
    const raw = await provider.generateText(buildPrompt(lock), {
      images: [generatedFrameUrl, approvedReferenceUrl],
    });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return { status: "review_required", score: 0, identityScore: 0, costumeScore: 0, issues: ["Continuity checker returned no valid JSON"] };
    }

    const parsed = JSON.parse(match[0]);
    const score = Number(parsed.score) || 0;
    const identityScore = Number(parsed.identityScore) || 0;
    const costumeScore = Number(parsed.costumeScore) || 0;
    const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String) : [];

    const passed = score >= MIN_OVERALL && identityScore >= MIN_IDENTITY && costumeScore >= MIN_COSTUME;
    return { status: passed ? "passed" : "failed", score, identityScore, costumeScore, issues };
  } catch (error) {
    return {
      status: "review_required",
      score: 0,
      identityScore: 0,
      costumeScore: 0,
      issues: [`Continuity checker error: ${error instanceof Error ? error.message : "unknown error"}`],
    };
  }
}
