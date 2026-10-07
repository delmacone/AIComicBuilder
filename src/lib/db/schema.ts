import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  title: text("title").notNull(),
  idea: text("idea").default(""),
  script: text("script").default(""),
  outline: text("outline").default(""),
  status: text("status", {
    enum: ["draft", "processing", "completed"],
  })
    .notNull()
    .default("draft"),
  finalVideoUrl: text("final_video_url"),
  generationMode: text('generation_mode', { enum: ['keyframe', 'reference'] }).notNull().default('keyframe'),
  useProjectPrompts: integer("use_project_prompts").notNull().default(0),
  colorPalette: text("color_palette").default(""),
  visualStylePreset: text("visual_style_preset").notNull().default("blackfist_comic_shader"),
  visualStyleLock: text("visual_style_lock").default("{}"),
  visualStyleLockEnabled: integer("visual_style_lock_enabled").notNull().default(1),
  visualStyleLockVersion: integer("visual_style_lock_version").notNull().default(1),
  worldSetting: text("world_setting").default(""),
  targetDuration: integer("target_duration").default(0),
  bgmUrl: text("bgm_url").default(""),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const episodes = sqliteTable("episodes", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sequence: integer("sequence").notNull(),
  idea: text("idea").default(""),
  script: text("script").default(""),
  outline: text("outline").default(""),
  status: text("status", {
    enum: ["draft", "processing", "completed"],
  })
    .notNull()
    .default("draft"),
  generationMode: text("generation_mode", { enum: ["keyframe", "reference"] })
    .notNull()
    .default("keyframe"),
  description: text("description").default(""),
  keywords: text("keywords").default(""),
  scriptHash: text("script_hash").default(""),
  colorPalette: text("color_palette").default(""),
  targetDuration: integer("target_duration").default(0),
  bgmUrl: text("bgm_url").default(""),
  finalVideoUrl: text("final_video_url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").default(""),
  visualHint: text("visual_hint").default(""),
  referenceImage: text("reference_image"),
  referenceImageHistory: text("reference_image_history").default("[]"),
  scope: text("scope", { enum: ["main", "guest"] }).notNull().default("main"),
  performanceStyle: text("performance_style").default(""),
  elevenLabsVoiceId: text("elevenlabs_voice_id"),
  voiceLockEnabled: integer("voice_lock_enabled").notNull().default(0),
  voiceLockVersion: integer("voice_lock_version").notNull().default(1),
  heightCm: integer("height_cm").default(0),
  bodyType: text("body_type").default("average"),
  isStale: integer("is_stale").notNull().default(0),
  canonVisualLock: text("canon_visual_lock").default("{}"),
  canonLockEnabled: integer("canon_lock_enabled").notNull().default(0),
  canonLockVersion: integer("canon_lock_version").notNull().default(1),
  episodeId: text("episode_id").references(() => episodes.id, {
    onDelete: "cascade",
  }),
});

export const episodeCharacters = sqliteTable("episode_characters", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "cascade" }),
  characterId: text("character_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
});

export const storyboardVersions = sqliteTable("storyboard_versions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  versionNum: integer("version_num").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  episodeId: text("episode_id").references(() => episodes.id, {
    onDelete: "cascade",
  }),
});

export const virtualSets = sqliteTable("virtual_sets", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").default(""),
  location: text("location").default(""),
  timeOfDay: text("time_of_day").default(""),
  weather: text("weather").default(""),
  lighting: text("lighting").default(""),
  layoutState: text("layout_state").default("{}"),
  propsState: text("props_state").default("[]"),
  damageState: text("damage_state").default("[]"),
  referenceImages: text("reference_images").default("[]"),
  visualStylePreset: text("visual_style_preset").default(""),
  continuityLockEnabled: integer("continuity_lock_enabled").notNull().default(1),
  continuityLockVersion: integer("continuity_lock_version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const blackfistSequences = sqliteTable("blackfist_sequences", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  episodeId: text("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
  sceneId: text("scene_id"),
  name: text("name").notNull(),
  engine: text("engine").notNull().default("unassigned"),
  status: text("status").notNull().default("draft"),
  shotIds: text("shot_ids").notNull().default("[]"),
  plan: text("plan").notNull().default("{}"),
  continuitySnapshot: text("continuity_snapshot").notNull().default("{}"),
  audioPlan: text("audio_plan").notNull().default("{}"),
  audioStatus: text("audio_status").notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const blackfistSequenceAudioAssets = sqliteTable("blackfist_sequence_audio_assets", {
  id: text("id").primaryKey(),
  sequenceId: text("sequence_id").notNull().references(() => blackfistSequences.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  shotId: text("shot_id"),
  kind: text("kind").notNull(),
  prompt: text("prompt").notNull().default(""),
  provider: text("provider").notNull().default(""),
  model: text("model").notNull().default(""),
  status: text("status").notNull().default("pending"),
  fileUrl: text("file_url"),
  metadata: text("metadata").notNull().default("{}"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const scenes = sqliteTable("scenes", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  description: text("description").default(""),
  lighting: text("lighting").default(""),
  colorPalette: text("color_palette").default(""),
  // BlackFist persistent scene state: location, props, damage, weather,
  // injuries and other visual facts that must survive across shots.
  continuityState: text("continuity_state").default("{}"),
  continuityStateVersion: integer("continuity_state_version").notNull().default(1),
  virtualSetId: text("virtual_set_id"),
  sequence: integer("sequence").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Unified per-shot asset table.
 * One row = one generated artifact (image prompt+file, or video file) bound
 * to a specific shot via shot_id. The `type` column discriminates which
 * generation mode it belongs to:
 *   - 'first_frame' / 'last_frame'  → keyframe mode image assets
 *   - 'reference'                   → reference mode image assets
 *   - 'keyframe_video'              → keyframe mode video output
 *   - 'reference_video'             → reference mode video output
 *
 * Versioning: regenerating the same asset inserts a new row with
 * (asset_version + 1, is_active=1) and flips the previous active row to
 * is_active=0. Active row = "current"; older rows = history.
 *
 * Two modes coexist freely on the same shot — they live in different rows
 * with different `type` values and never collide.
 */
export const shotAssets = sqliteTable("shot_assets", {
  id: text("id").primaryKey(),
  shotId: text("shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: [
      "first_frame",
      "last_frame",
      "reference",
      "keyframe_video",
      "reference_video",
    ],
  }).notNull(),
  sequenceInType: integer("sequence_in_type").notNull().default(0),
  assetVersion: integer("asset_version").notNull().default(1),
  isActive: integer("is_active").notNull().default(1),
  prompt: text("prompt").notNull().default(""),
  fileUrl: text("file_url"),
  status: text("status", {
    enum: ["pending", "generating", "completed", "failed"],
  })
    .notNull()
    .default("pending"),
  characters: text("characters"), // JSON array
  modelProvider: text("model_provider"),
  modelId: text("model_id"),
  meta: text("meta"), // JSON
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const shots = sqliteTable("shots", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  prompt: text("prompt").default(""),
  motionScript: text("motion_script"),
  cameraDirection: text("camera_direction").default("static"),
  duration: integer("duration").notNull().default(10),
  videoScript: text("video_script"),
  videoPrompt: text("video_prompt"),
  transitionIn: text("transition_in").default("cut"),
  transitionOut: text("transition_out").default("cut"),
  episodeId: text("episode_id").references(() => episodes.id, {
    onDelete: "cascade",
  }),
  versionId: text("version_id").references(() => storyboardVersions.id, {
    onDelete: "cascade",
  }),
  sceneId: text("scene_id"),
  compositionGuide: text("composition_guide").default(""),
  focalPoint: text("focal_point").default(""),
  depthOfField: text("depth_of_field").default("medium"),
  soundDesign: text("sound_design").default(""),
  musicCue: text("music_cue").default(""),
  costumeOverrides: text("costume_overrides").default(""),
  continuityStatus: text("continuity_status", { enum: ["pending", "passed", "failed", "review_required"] }).notNull().default("pending"),
  continuityScore: integer("continuity_score").default(0),
  continuityIssues: text("continuity_issues").default("[]"),
  continuityRetryCount: integer("continuity_retry_count").notNull().default(0),
  isStale: integer("is_stale").notNull().default(0),
  status: text("status", {
    enum: ["pending", "generating", "completed", "failed"],
  })
    .notNull()
    .default("pending"),
});

export const dialogues = sqliteTable("dialogues", {
  id: text("id").primaryKey(),
  shotId: text("shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  characterId: text("character_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  audioUrl: text("audio_url"),
  sequence: integer("sequence").notNull().default(0),
  startRatio: text("start_ratio").default("0"),
  endRatio: text("end_ratio").default("1"),
});

export const importLogs = sqliteTable("import_logs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  step: integer("step").notNull(),
  status: text("status", { enum: ["running", "done", "error"] })
    .notNull()
    .default("running"),
  message: text("message").notNull().default(""),
  metadata: text("metadata", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const promptTemplates = sqliteTable("prompt_templates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  promptKey: text("prompt_key").notNull(),
  slotKey: text("slot_key"),
  scope: text("scope", { enum: ["global", "project"] }).notNull().default("global"),
  projectId: text("project_id"),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const promptVersions = sqliteTable("prompt_versions", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => promptTemplates.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const promptPresets = sqliteTable("prompt_presets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  userId: text("user_id"),
  promptKey: text("prompt_key").notNull(),
  slots: text("slots", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const characterRelations = sqliteTable("character_relations", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  characterAId: text("character_a_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  characterBId: text("character_b_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  relationType: text("relation_type").notNull().default("neutral"),
  description: text("description").default(""),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const characterCostumes = sqliteTable("character_costumes", {
  id: text("id").primaryKey(),
  characterId: text("character_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("default"),
  description: text("description").default(""),
  referenceImage: text("reference_image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const moodBoardImages = sqliteTable("mood_board_images", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  annotation: text("annotation").default(""),
  extractedStyle: text("extracted_style").default(""),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const shotActions = sqliteTable("shot_actions", {
  id: text("id").primaryKey(),
  shotId: text("shot_id")
    .notNull()
    .references(() => shots.id, { onDelete: "cascade" }),
  characterId: text("character_id"),
  bodyPart: text("body_part").default("full_body"),
  motion: text("motion").notNull().default(""),
  startTime: text("start_time").default("0"),
  endTime: text("end_time").default("0"),
  intensity: text("intensity").default("normal"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const promptAbTests = sqliteTable("prompt_ab_tests", {
  id: text("id").primaryKey(),
  promptKey: text("prompt_key").notNull(),
  variantA: text("variant_a").notNull(),
  variantB: text("variant_b").notNull(),
  shotId: text("shot_id"),
  resultAUrl: text("result_a_url"),
  resultBUrl: text("result_b_url"),
  preferred: text("preferred"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  type: text("type", {
    enum: [
      "script_outline",
      "script_parse",
      "character_extract",
      "character_image",
      "shot_split",
      "frame_generate",
      "video_generate",
      "video_assemble",
    ],
  }).notNull(),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed"],
  })
    .notNull()
    .default("pending"),
  payload: text("payload", { mode: "json" }),
  result: text("result", { mode: "json" }),
  error: text("error"),
  retries: integer("retries").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  episodeId: text("episode_id").references(() => episodes.id, {
    onDelete: "cascade",
  }),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  name: text("name").notNull(),
  category: text("category", {
    enum: ["script_outline", "script_generate", "script_parse", "character_extract", "shot_split", "keyframe_prompts", "video_prompts", "ref_image_prompts", "ref_video_prompts"],
  }).notNull(),
  platform: text("platform", {
    enum: ["bailian", "dify", "coze"],
  }).notNull().default("bailian"),
  appId: text("app_id").notNull(),
  apiKey: text("api_key").notNull(),
  description: text("description").default(""),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const agentBindings = sqliteTable("agent_bindings", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  category: text("category", {
    enum: ["script_outline", "script_generate", "script_parse", "character_extract", "shot_split", "keyframe_prompts", "video_prompts", "ref_image_prompts", "ref_video_prompts"],
  }).notNull(),
  agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
});
