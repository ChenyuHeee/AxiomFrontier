import type { LlmMessage, LlmPlanResponse } from "../types.js";

export interface DeepseekOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class DeepseekClient {
  constructor(private readonly opts: DeepseekOptions) {}

  async plan(messages: LlmMessage[]): Promise<LlmPlanResponse> {
    return this.completeJson<LlmPlanResponse>(messages);
  }

  async completeJson<T>(messages: LlmMessage[]): Promise<T> {
    const response = await fetch(`${this.opts.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({
        model: this.opts.model,
        messages,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Deepseek request failed: ${response.status} ${text}`);
    }

    const json = await response.json();
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Deepseek returned empty content");
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return parsed as T;
    } catch (e) {
      throw new Error(`Deepseek response parse error: ${(e as Error).message}`);
    }
  }
}
