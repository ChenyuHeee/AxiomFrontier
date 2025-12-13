import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { DeepseekClient } from "./llm/deepseek.js";
import { GameEngine } from "./core/engine.js";
import type { LlmMessage, Npc, NpcTalkResult, RulerDecision, WorldEvent, WorldSpec } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadConfig();
const llm = new DeepseekClient({
  apiKey: config.deepseekApiKey,
  baseUrl: config.deepseekBaseUrl,
  model: config.deepseekModel,
});

const engine = new GameEngine();
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const systemPrompt = `You are the player's personal LLM agent in a text-only MMO. Output JSON ONLY with fields {\"plan\": {\"action\": string, \"target\"?: string, \"amount\"?: number, \"path\"?: string[], \"risk\": \"low\"|\"med\"|\"high\", \"notes\"?: string}, \"justification\"?: string}. Allowed actions: move, observe, withdraw, attack, trade (stub). Prefer low/med risk unless player explicitly seeks danger. Keep responses concise.`;
const worldGenPrompt = `You are the world generator for a text MMO. Output JSON ONLY with fields {\"rooms\": Room[], \"cities\": City[]}. Room = {id,name,neighbors[],cityId?:string,zone:\"city\"|\"wild\"}. City={id,name,policy}. Policy fields mirror server schema (safetyLevel, guards{density,responseTime,lethality}, pvp{on,dropRule,penalty}, tax{trade,withdraw,gateFee,storageFee,insuranceRate}, withdrawPoints[{id,fee,cooldownSec,safeRadius,hiValueLimit,hours}], access{mode}). Keep IDs short (kebab-case), include at least one city and 4-6 rooms with sensible neighbors.`;
const rulerPrompt = `You are the global ruler. Given world and tensions, output JSON ONLY {\"decision\": {\"cityId\": string, \"policyPatch\"?: object, \"broadcast\"?: string}}. Keep patches minimal and compatible with schema.`;
const npcGenPrompt = `You generate NPCs for a text MMO. Output JSON ONLY {\"npc\": {id,name,role,location?:string,style?:string}}. IDs short (kebab-case), style describes speaking tone.`;
const npcTalkPrompt = `You are an NPC in a text MMO. Given context and player input, reply concisely in character. Output JSON ONLY {\"reply\": string, \"hint\"?: string, \"task\"?: string}. Avoid breaking schema.`;
const eventPrompt = `You are the global broadcaster. Given tensions and snapshot, output JSON ONLY {\"event\": {id,title,detail,cityId?:string,ts:number}} with id short (kebab-case).`; 
const npcAutonomyPrompt = `You are an autonomous NPC in a text MMO. Given your persona and world snapshot, output JSON ONLY {"update": {"moveTo"?: string, "event"?: {"id"?: string, "title": string, "detail": string, "cityId"?: string, "ts"?: number}}}. Keep responses concise, safe, and schema-faithful. Only include moveTo if it exists in rooms; otherwise omit.`;

async function rulerTick() {
  const snapshot = { cities: Array.from(engine.world.cities.values()) };
  const messages: LlmMessage[] = [
    { role: "system", content: rulerPrompt },
    { role: "user", content: JSON.stringify({ tensions: "periodic tick", snapshot }) },
  ];
  const decision = await llm.completeJson<{ decision: any }>(messages);
  const d = decision?.decision;
  if (d?.cityId) {
    const city = engine.world.cities.get(d.cityId);
    if (city && d.policyPatch) {
      city.policy = { ...city.policy, ...d.policyPatch } as any;
    }
    if (d?.broadcast) {
      const evt: WorldEvent = {
        id: `broadcast-${Date.now()}`,
        title: "统治者广播",
        detail: d.broadcast,
        cityId: d.cityId,
        ts: Date.now(),
      };
      engine.world.pushEvent(evt);
    }
  }
}

async function eventTick() {
  const snapshot = { cities: Array.from(engine.world.cities.values()) };
  const evtMsg: LlmMessage[] = [
    { role: "system", content: eventPrompt },
    { role: "user", content: JSON.stringify({ tensions: "periodic tick", snapshot }) },
  ];
  const out = await llm.completeJson<{ event: WorldEvent }>(evtMsg);
  if (out?.event?.id) {
    engine.world.pushEvent(out.event);
  }
}

async function npcTick() {
  const npcs = Array.from(engine.world.npcs.values());
  if (npcs.length === 0) return;
  const snapshot = {
    cities: Array.from(engine.world.cities.values()),
    rooms: Array.from(engine.world.rooms.values()),
  };
  await Promise.all(
    npcs.map(async (npc) => {
      try {
        const messages: LlmMessage[] = [
          { role: "system", content: npcAutonomyPrompt },
          { role: "user", content: JSON.stringify({ npc, snapshot }) },
        ];
        const out = await llm.completeJson<{ update?: { moveTo?: string; event?: WorldEvent } }>(messages);
        const update = out?.update;
        if (update?.moveTo && engine.world.rooms.has(update.moveTo)) {
          npc.location = update.moveTo;
        }
        const evt = update?.event;
        if (evt?.title && evt.detail) {
          const normalized: WorldEvent = {
            id: evt.id || `${npc.id}-${Date.now()}`,
            title: evt.title,
            detail: evt.detail,
            cityId: evt.cityId,
            npcId: npc.id,
            ts: evt.ts || Date.now(),
          };
          engine.world.pushEvent(normalized);
        }
      } catch (err) {
        console.error("npc tick error", npc.id, err);
      }
    })
  );
}

async function orchestrateTick() {
  try {
    await Promise.all([rulerTick(), eventTick(), npcTick()]);
  } catch (err) {
    console.error("orchestrator tick error", err);
  }
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.post("/api/session/:playerId/act", async (req, res) => {
  const playerId = req.params.playerId;
  const { input } = req.body ?? {};
  if (typeof input !== "string" || !input.trim()) {
    res.status(400).json({ error: "input is required" });
    return;
  }

  const player = engine.ensurePlayer(playerId);
  const room = engine.world.rooms.get(player.location);
  const city = room ? engine.world.getCityForRoom(room.id) : undefined;

  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: JSON.stringify({
        world: {
          location: player.location,
          room,
          city: city?.policy,
        },
        player: { credits: player.credits, inventory: player.inventory, health: player.health },
        input,
      }),
    },
  ];

  try {
    const plan = await llm.plan(messages);
    const result = engine.applyAction(playerId, plan.plan);
    const sensory = result.sensory ?? {};
    const normalizedSensory = {
      visual: sensory.visual ?? "",
      audio: sensory.audio ?? "",
      smell: sensory.smell ?? "",
      touch: sensory.touch ?? "",
    };
    res.json({ plan, result: { ...result, sensory: normalizedSensory } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// LLM-driven world generation
app.post("/api/admin/generate-world", async (req, res) => {
  const { prompt } = req.body ?? {};
  const messages: LlmMessage[] = [
    { role: "system", content: worldGenPrompt },
    { role: "user", content: prompt || "Generate a starter city with a market, gate, and a wild outskirts." },
  ];
  try {
    const spec = await llm.completeJson<WorldSpec>(messages);
    if (!spec?.rooms?.length || !spec?.cities?.length) {
      res.status(400).json({ error: "LLM returned empty world" });
      return;
    }
    engine.world.applyWorld(spec);
    res.json({ applied: true, summary: { rooms: spec.rooms.length, cities: spec.cities.length } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/admin/generate-world/incremental", async (req, res) => {
  const { prompt } = req.body ?? {};
  const messages: LlmMessage[] = [
    { role: "system", content: worldGenPrompt },
    { role: "user", content: prompt || "Append a few new wild areas and one small village connected to existing nodes; keep ids unique." },
  ];
  try {
    const spec = await llm.completeJson<WorldSpec>(messages);
    if (!spec?.rooms?.length || !spec?.cities?.length) {
      res.status(400).json({ error: "LLM returned empty world" });
      return;
    }
    engine.world.mergeWorld(spec);
    res.json({ applied: true, summary: { rooms: spec.rooms.length, cities: spec.cities.length } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// LLM ruler decision: patch city policy
app.post("/api/ruler/decide", async (req, res) => {
  const tensions = req.body?.tensions ?? "";
  const snapshot = {
    cities: Array.from(engine.world.cities.values()),
  };
  const messages: LlmMessage[] = [
    { role: "system", content: rulerPrompt },
    { role: "user", content: JSON.stringify({ tensions, snapshot }) },
  ];
  try {
    const decision = await llm.completeJson<{ decision: RulerDecision }>(messages);
    const d = decision?.decision;
    if (!d?.cityId) {
      res.status(400).json({ error: "No cityId in decision" });
      return;
    }
    const city = engine.world.cities.get(d.cityId);
    if (!city) {
      res.status(404).json({ error: "City not found" });
      return;
    }
    if (d.policyPatch) {
      city.policy = { ...city.policy, ...d.policyPatch } as any;
    }
    res.json({ applied: true, decision: d });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// NPC generation
app.post("/api/admin/generate-npc", async (req, res) => {
  const { prompt } = req.body ?? {};
  const messages: LlmMessage[] = [
    { role: "system", content: npcGenPrompt },
    { role: "user", content: prompt || "Generate a merchant NPC in the market." },
  ];
  try {
    const out = await llm.completeJson<{ npc: Npc }>(messages);
    if (!out?.npc?.id) {
      res.status(400).json({ error: "No npc id" });
      return;
    }
    engine.world.upsertNpc(out.npc);
    res.json({ applied: true, npc: out.npc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// NPC list
app.get("/api/npc", (_req, res) => {
  res.json({ npcs: Array.from(engine.world.npcs.values()) });
});

// NPC talk
app.post("/api/npc/:npcId/talk", async (req, res) => {
  const npcId = req.params.npcId;
  const input = req.body?.input;
  const npc = engine.world.npcs.get(npcId);
  if (!npc) {
    res.status(404).json({ error: "NPC not found" });
    return;
  }
  if (typeof input !== "string" || !input.trim()) {
    res.status(400).json({ error: "input is required" });
    return;
  }
  const snapshot = {
    npc,
    world: {
      cities: Array.from(engine.world.cities.values()),
    },
  };
  const messages: LlmMessage[] = [
    { role: "system", content: npcTalkPrompt },
    { role: "user", content: JSON.stringify({ input, snapshot }) },
  ];
  try {
    const reply = await llm.completeJson<NpcTalkResult>(messages);
    res.json({ npc, reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Events feed
app.get("/api/events", (_req, res) => {
  res.json({ events: engine.world.events });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal" });
});

app.listen(config.port, () => {
  console.log(`Axiom Frontier server listening on :${config.port}`);
  // Simple orchestrator: periodic LLM-driven ruler/event ticks
  const intervalMs = 60_000;
  setInterval(orchestrateTick, intervalMs);
});
