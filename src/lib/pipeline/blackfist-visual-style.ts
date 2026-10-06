export type VisualStylePreset = "blackfist_comic_shader" | "cinematic_3d" | "ultra_realistic" | "graphic_novel" | "kids_animation";

const prompts: Record<VisualStylePreset, string> = {
  blackfist_comic_shader: "BLACKFIST COMIC SHADER: premium cinematic superhero comic rendering, clean ink definition, sculpted anatomy, dramatic cel-shaded shadows, rich dimensional lighting, detailed costumes and environments, polished animated-comic finish, natural and accurate Black skin tones.",
  cinematic_3d: "CINEMATIC 3D: high-end 3D superhero animation, physically plausible materials, detailed skin and fabric, cinematic lighting, dimensional environments and feature-animation polish.",
  ultra_realistic: "ULTRA-REALISTIC: cinematic live-action realism, natural skin texture, realistic hair and fabric, physically plausible lighting, lens depth and detailed environments.",
  graphic_novel: "GRAPHIC NOVEL: premium illustrated graphic-novel rendering, expressive ink work, deliberate line weight, dramatic shadow shapes, textured colour and cinematic composition.",
  kids_animation: "KIDS ANIMATION: polished family-friendly superhero animation, simplified readable forms, expressive faces, clean shapes, bright controlled colour and soft dimensional lighting.",
};

export function buildVisualStylePrompt(project: { visualStylePreset?: string | null; visualStyleLockEnabled?: number | null }): string {
  if (project.visualStyleLockEnabled !== 1) return "";
  const key = (project.visualStylePreset || "blackfist_comic_shader") as VisualStylePreset;
  const style = prompts[key] || prompts.blackfist_comic_shader;
  return `BLACKFIST VISUAL STYLE LOCK — MANDATORY. ${style} Preserve this exact rendering language across every shot. Do not drift into a different art style, shader, realism level, or rendering treatment.`;
}
