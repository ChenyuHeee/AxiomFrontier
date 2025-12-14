import "dotenv/config";
import { z } from "zod";

type Config = z.infer<typeof configSchema>;

const configSchema = z.object({
  port: z.number().int().min(1).max(65535).default(8787),
  deepseekApiKey: z.string().min(1),
  deepseekBaseUrl: z.string().url().default("https://api.deepseek.com"),
  deepseekModel: z.string().default("deepseek-chat"),
  // Unsafe dev/design agents that can hotpatch code via LLM
  enableAutoTeams: z.boolean().default(false),
  // Ambient LLM world ticks (events/NPC autonomy). Disable to save tokens and improve stability.
  enableAmbientLLM: z.boolean().default(false),
  enableRuler: z.boolean().default(false),
});

export function loadConfig(): Config {
  const parsed = configSchema.safeParse({
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL,
    deepseekModel: process.env.DEEPSEEK_MODEL,
    enableAutoTeams: process.env.ENABLE_AUTO_TEAMS ? process.env.ENABLE_AUTO_TEAMS === "true" : undefined,
    enableAmbientLLM: process.env.ENABLE_AMBIENT_LLM ? process.env.ENABLE_AMBIENT_LLM === "true" : undefined,
    enableRuler: process.env.ENABLE_RULER ? process.env.ENABLE_RULER === "true" : undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Config validation failed: ${message}`);
  }

  return parsed.data;
}
