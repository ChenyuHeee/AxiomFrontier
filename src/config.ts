import "dotenv/config";
import { z } from "zod";

type Config = z.infer<typeof configSchema>;

const configSchema = z.object({
  port: z.number().int().min(1).max(65535).default(8787),
  deepseekApiKey: z.string().min(1),
  deepseekBaseUrl: z.string().url().default("https://api.deepseek.com"),
  deepseekModel: z.string().default("deepseek-chat"),
});

export function loadConfig(): Config {
  const parsed = configSchema.safeParse({
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL,
    deepseekModel: process.env.DEEPSEEK_MODEL,
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Config validation failed: ${message}`);
  }

  return parsed.data;
}
