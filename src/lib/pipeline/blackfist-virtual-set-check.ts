import type { TextOptions } from "@/lib/ai/types";
import type { ContinuityStatus } from "@/lib/pipeline/blackfist-continuity-check";

export interface VirtualSetContinuityResult {
  status: ContinuityStatus;
  score: number;
  geographyScore: number;
  stateScore: number;
  issues: string[];
}

const MIN_OVERALL = 85;
const MIN_GEOGRAPHY = 90;
const MIN_STATE = 85;

export async function checkVirtualSetContinuity(
  provider: { generateText: (prompt: string, options?: TextOptions) => Promise<string> },
  generatedFrameUrl: string,
  approvedReferenceUrls: string[],
  setState: Record<string, unknown>,
): Promise<VirtualSetContinuityResult> {
  if (!approvedReferenceUrls.length) return { status: "review_required", score: 0, geographyScore: 0, stateScore: 0, issues: ["Virtual Set has no approved visual reference"] };
  try {
    const prompt = `You are the BlackFist Motion Studio Virtual Set continuity supervisor.
Image 1 is the newly generated production frame. Remaining images are APPROVED references for the same digital backlot.
Judge location continuity, not artistic taste.

LOCKED VIRTUAL SET STATE:
${JSON.stringify(setState, null, 2)}

Check recognizable architecture and geography, landmark placement, road/room layout, fixed structures, lighting/time/weather when specified, persistent props, and accumulated damage.
Camera angle may change. Do not penalize perspective changes or objects naturally hidden by framing.
Return JSON only:
{"score":0,"geographyScore":0,"stateScore":0,"issues":[]}

Fail if overall < ${MIN_OVERALL}, geography < ${MIN_GEOGRAPHY}, or persistent state < ${MIN_STATE}.`;

    const raw = await provider.generateText(prompt, { images: [generatedFrameUrl, ...approvedReferenceUrls] });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { status: "review_required", score: 0, geographyScore: 0, stateScore: 0, issues: ["Virtual Set checker returned no valid JSON"] };
    const parsed = JSON.parse(match[0]);
    const score = Number(parsed.score) || 0, geographyScore = Number(parsed.geographyScore) || 0, stateScore = Number(parsed.stateScore) || 0;
    const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String) : [];
    const passed = score >= MIN_OVERALL && geographyScore >= MIN_GEOGRAPHY && stateScore >= MIN_STATE;
    return { status: passed ? "passed" : "failed", score, geographyScore, stateScore, issues };
  } catch (error) {
    return { status: "review_required", score: 0, geographyScore: 0, stateScore: 0, issues: [`Virtual Set checker error: ${error instanceof Error ? error.message : "unknown error"}`] };
  }
}
