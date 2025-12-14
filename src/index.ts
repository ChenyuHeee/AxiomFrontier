import express from "express";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { DeepseekClient } from "./llm/deepseek.js";
import { GameEngine } from "./core/engine.js";
import { computeWantedLevel, decayHeatForAllPlayers, listJobs, runJob } from "./core/jobs.js";
import type { BugReport, LlmMessage, Npc, NpcMemory, NpcTalkResult, PlanAction, RulerDecision, WorldEvent, WorldSpec } from "./types.js";
import fs from "node:fs";

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

setupActionHotReload(engine);

const systemPrompt = `You are the player's personal LLM agent in a text-only MMO. Output JSON ONLY with fields {"plan": {"action": string, "target"?: string, "amount"?: number, "path"?: string[], "risk": "low"|"med"|"high", "notes"?: string}, "justification"?: string}.
Allowed actions: move, observe, withdraw, attack, trade, improv. Use "improv" when the intent falls outside known actions or needs narrative resolution. Prefer low/med risk unless the player explicitly seeks danger. Keep responses concise.`;
const improvPrompt = `You are the game simulator for a text MMO. When the requested action has no predefined rule, produce a plausible outcome.
Output JSON ONLY {"summary": string, "sensory"?: {"visual"?: string, "audio"?: string, "smell"?: string, "touch"?: string}, "statePatch"?: {"healthDelta"?: number, "creditsDelta"?: number, "hungerDelta"?: number}, "event"?: {"title": string, "detail": string, "cityId"?: string}}.
Constraints: keep deltas small (-30..30), never kill the player outright unless justified, keep credits >=0, health/hunger within 0-100 after patch. Keep it concise, grounded in the provided context.`;
const devPrompt = `You are the out-of-game dev deity. Output JSON ONLY {"path": string, "content": string, "note"?: string}. The path must be a relative project file path. The content is the full replacement content. Keep it minimal and valid.`;
const devTeamPrompt = `You are a team lead for multiple coder agents. Given context, output JSON ONLY {"intents": Array<{"agent": string, "intent": string}>}. Split work into 2-4 small intents. Keep each intent short.`;
const devPatchPrompt = `You are a coder agent. Given an intent, output JSON ONLY {"path": string, "content": string, "note"?: string}. Path is relative project file, content is full replacement. Be concise.`;
const ruleDevPrompt = `You are the rules engineer for this MMO. Given a design gap, output JSON ONLY {"path": string, "content": string, "note"?: string}. Path must be a project file that implements/adjusts game rules. Content is full replacement. Prefer minimal, valid changes.`;
const qaTeamPrompt = `You are a QA lead for code patches. Given a patch, output JSON ONLY {"verdict": "approve"|"reject", "reason"?: string}. Reject if patch is invalid JSON, empty, or obviously malicious/broken. Keep terse.`;
const designTeamPrompt = `You are a design crew for this MMO. Output JSON ONLY {"decisions": Array<{"title": string, "gap": string}>}. Each gap describes a missing rule/loop to implement. 2-3 items max.`;
const designFocusPrompt = `You are a senior design lead with an unbounded imagination. You decide ALL aspects of the MMO: economy, death/respawn, reputation/factions, quest chains, world/map rules, combat, crafting, UI/UX, narrative, meta-rules, even surreal twists. Every cycle, output JSON ONLY {"decisions": Array<{"title": string, "gap": string}>} with 4-6 bold items describing missing or desired rules/loops. Ideas can be unconventional or wild, but make them coherent and implementable.`;
const translatePrompt = `You are the in-game translator. Given an English event and a glossary of terms, output JSON ONLY {"title": string, "detail": string, "glossary"?: Array<{"source": string, "target": string}>}. Translate to concise Simplified Chinese. Preserve named entities per glossary and add glossary entries for any new proper nouns or terms.`;
const worldGenPrompt = `You are the world generator for a text MMO. Output JSON ONLY with fields {\"rooms\": Room[], \"cities\": City[]}. Room = {id,name,neighbors[],cityId?:string,zone:\"city\"|\"wild\"}. City={id,name,policy}. Policy fields mirror server schema (safetyLevel, guards{density,responseTime,lethality}, pvp{on,dropRule,penalty}, tax{trade,withdraw,gateFee,storageFee,insuranceRate}, withdrawPoints[{id,fee,cooldownSec,safeRadius,hiValueLimit,hours}], access{mode}). Keep IDs short (kebab-case), include at least one city and 4-6 rooms with sensible neighbors.`;
const rulerPrompt = `You are the global ruler. Given world and tensions, output JSON ONLY {\"decision\": {\"cityId\": string, \"policyPatch\"?: object, \"broadcast\"?: string}}. Keep patches minimal and compatible with schema.`;
const npcGenPrompt = `You generate NPCs for a text MMO. Output JSON ONLY {\"npc\": {id,name,role,location?:string,style?:string}}. IDs short (kebab-case), style describes speaking tone.`;
const npcTalkPrompt = `You are an NPC in a text MMO. Given context (your persona, world snapshot, your memory, player's memory) and player input, reply concisely in character. Output JSON ONLY {\"reply\": string, \"hint\"?: string, \"task\"?: string, \"action\"?: PlanAction, \"npcMemoryDelta\"?: any, \"playerMemoryDelta\"?: any}. If the player intent is actionable (move/observe/withdraw/attack/trade/explore/meditate/etc.), set \"action\" with a safe plan; otherwise omit. Keep JSON valid and short.`;
const eventPrompt = `You are the global broadcaster. Given tensions and snapshot, output JSON ONLY {\"event\": {id,title,detail,cityId?:string,ts:number}} with id short (kebab-case).`; 
const npcAutonomyPrompt = `You are an autonomous NPC in a text MMO. Given your persona and world snapshot, output JSON ONLY {"update": {"moveTo"?: string, "event"?: {"id"?: string, "title": string, "detail": string, "cityId"?: string, "ts"?: number}}}. Keep responses concise, safe, and schema-faithful. Only include moveTo if it exists in rooms; otherwise omit.`;
const coderSummonPrompt = `You are a coder agent inside the game fiction but allowed to change server code. Output JSON ONLY {"intent": string} describing the change you want (feature/bugfix). Keep it short.`;

class MemoryStore {
  private store = new Map<string, string[]>();
  constructor(private limit = 12) {}
  get(key: string) {
    return this.store.get(key) ?? [];
  }
  push(key: string, entry: string) {
    const list = this.get(key).concat(entry);
    if (list.length > this.limit) list.splice(0, list.length - this.limit);
    this.store.set(key, list);
  }

  snapshot(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    this.store.forEach((v, k) => {
      out[k] = [...v];
    });
    return out;
  }

  restore(data: Record<string, string[]>) {
    if (!data) return;
    this.store.clear();
    Object.entries(data).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        const trimmed = v.slice(-this.limit);
        this.store.set(k, trimmed);
      }
    });
  }
}

const memory = new MemoryStore();

function truncate(text: string, max = 400) {
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function loadCodeContext(paths: string[], limit = Number.POSITIVE_INFINITY) {
  return paths
    .map((p) => {
      try {
        const abs = path.join(__dirname, "..", p);
        const content = fs.readFileSync(abs, "utf8");
        return { path: p, content: truncate(content, limit) };
      } catch (err) {
        console.warn("context read failed", p, err);
        return null;
      }
    })
    .filter(Boolean) as Array<{ path: string; content: string }>;
}

function buildPatchContext() {
  return loadCodeContext([
    "src/index.ts",
    "src/core/state.ts",
    "src/core/engine.ts",
    "src/types.ts",
    "package.json",
    "tsconfig.json",
  ]);
}

const dataDir = path.join(__dirname, "..", "data");
const stateFile = path.join(dataDir, "world-state.json");
const memoryFile = path.join(dataDir, "llm-memory.json");

function ensureDataDir() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    console.warn("create data dir failed", err);
  }
}

function saveStateToDisk() {
  try {
    ensureDataDir();
    const snapshot = engine.world.toPersistedState();
    fs.writeFileSync(stateFile, JSON.stringify(snapshot, null, 2), "utf8");
  } catch (err) {
    console.error("save state failed", err);
  }
}

function loadStateFromDisk() {
  try {
    if (!fs.existsSync(stateFile)) return;
    const raw = fs.readFileSync(stateFile, "utf8");
    const data = JSON.parse(raw);
    engine.world.loadPersistedState(data);
  } catch (err) {
    console.error("load state failed", err);
  }
}

function saveMemoryToDisk() {
  try {
    ensureDataDir();
    const snapshot = memory.snapshot();
    fs.writeFileSync(memoryFile, JSON.stringify(snapshot, null, 2), "utf8");
  } catch (err) {
    console.error("save memory failed", err);
  }
}

function loadMemoryFromDisk() {
  try {
    if (!fs.existsSync(memoryFile)) return;
    const raw = fs.readFileSync(memoryFile, "utf8");
    const data = JSON.parse(raw);
    memory.restore(data);
  } catch (err) {
    console.error("load memory failed", err);
  }
}

function saveAll() {
  saveStateToDisk();
  saveMemoryToDisk();
}

loadStateFromDisk();
loadMemoryFromDisk();
const persistenceIntervalMs = 60_000;

function setupActionHotReload(engine: GameEngine) {
  const preferTs = !__dirname.endsWith("dist") && __dirname.includes("/src");
  const candidates = (
    preferTs
      ? [path.join(__dirname, "./core/actions.ts"), path.join(__dirname, "./core/actions.js"), path.join(__dirname, "../src/core/actions.ts")]
      : [path.join(__dirname, "./core/actions.js"), path.join(__dirname, "../src/core/actions.ts"), path.join(__dirname, "./core/actions.ts")]
  ).filter((p) => fs.existsSync(p));

  const modulePath = candidates[0];
  if (!modulePath) {
    console.warn("action hot reload disabled: actions module not found");
    return;
  }

  const load = async () => {
    try {
      const mod = await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);
      const register = mod?.registerDefaultActions;
      if (typeof register === "function") {
        engine.reloadActions(register);
        console.log("actions hot reloaded from", modulePath);
      } else {
        console.warn("actions hot reload skipped: registerDefaultActions not found");
      }
    } catch (err) {
      console.error("actions hot reload failed", err);
    }
  };

  let timer: NodeJS.Timeout | undefined;
  fs.watch(modulePath, { persistent: false }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(load, 100);
  });

  // Initial sync to pick up latest code without restart
  load();
}

function withMemory(key: string, messages: LlmMessage[]): LlmMessage[] {
  const mem = memory.get(key);
  if (!mem.length) return messages;
  return messages.concat({ role: "user", content: JSON.stringify({ memory: mem }) });
}

function remember(key: string, payload: { prompt: unknown; response: unknown }) {
  const entry = JSON.stringify({
    prompt: truncate(typeof payload.prompt === "string" ? payload.prompt : JSON.stringify(payload.prompt)),
    response: truncate(typeof payload.response === "string" ? payload.response : JSON.stringify(payload.response)),
  });
  memory.push(key, entry);
}

const chineseRegex = /[\u3400-\u9FFF]/;

function isChinese(text: string) {
  return chineseRegex.test(text);
}

async function translateEvent(evt: WorldEvent): Promise<WorldEvent> {
  if (!evt?.title || !evt?.detail) return evt;
  if (isChinese(evt.title) && isChinese(evt.detail)) return evt;

  const glossary = engine.world.getGlossaryEntries();
  const memKey = "translate";
  const messages: LlmMessage[] = [
    { role: "system", content: translatePrompt },
    { role: "user", content: JSON.stringify({ event: { title: evt.title, detail: evt.detail }, glossary }) },
  ];

  try {
    const res = await llm.completeJson<{
      title: string;
      detail: string;
      glossary?: Array<{ source: string; target: string }>;
    }>(withMemory(memKey, messages));
    remember(memKey, { prompt: { event: { title: evt.title, detail: evt.detail }, glossary }, response: res });

    const translated: WorldEvent = {
      ...evt,
      title: res?.title?.trim() || evt.title,
      detail: res?.detail?.trim() || evt.detail,
    };

    if (Array.isArray(res?.glossary) && res.glossary.length) {
      engine.world.addGlossary(res.glossary);
    } else if (res?.title && res.title !== evt.title) {
      engine.world.addGlossary([{ source: evt.title, target: res.title }]);
    }

    return translated;
  } catch (err) {
    console.error("translate event error", err);
    return evt;
  }
}

async function rulerTick() {
  const snapshot = { cities: Array.from(engine.world.cities.values()) };
  const memKey = "ruler";
  const base: LlmMessage[] = [
    { role: "system", content: rulerPrompt },
    { role: "user", content: JSON.stringify({ tensions: "periodic tick", snapshot }) },
  ];
  const messages = withMemory(memKey, base);
  const decision = await llm.completeJson<{ decision: any }>(messages);
  remember(memKey, { prompt: { tensions: "periodic tick", snapshot }, response: decision });
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
      const translated = await translateEvent(evt);
      engine.world.pushEvent(translated);
    }
  }
}

async function eventTick() {
  const snapshot = { cities: Array.from(engine.world.cities.values()) };
  const memKey = "event";
  const evtMsg: LlmMessage[] = [
    { role: "system", content: eventPrompt },
    { role: "user", content: JSON.stringify({ tensions: "periodic tick", snapshot }) },
  ];
  const out = await llm.completeJson<{ event: WorldEvent }>(withMemory(memKey, evtMsg));
  remember(memKey, { prompt: { tensions: "periodic tick", snapshot }, response: out });
  if (out?.event?.id) {
    const translated = await translateEvent(out.event);
    engine.world.pushEvent(translated);
  }
}

// Ensure the world keeps getting fresh NPCs when counts are low
async function npcGenerationTick() {
  const npcs = Array.from(engine.world.npcs.values());
  const rooms = Array.from(engine.world.rooms.values());
  const cities = Array.from(engine.world.cities.values());
  const desired = Math.max(3, Math.ceil(rooms.length / 3));
  const missing = desired - npcs.length;
  if (missing <= 0) return;

  await Promise.all(
    Array.from({ length: Math.min(2, missing) }).map(async () => {
      const memKey = "npc-gen";
      const messages: LlmMessage[] = [
        { role: "system", content: npcGenPrompt },
        {
          role: "user",
          content: JSON.stringify({
            prompt: `Generate an NPC placed into an existing room; avoid duplicate ids; keep names short. Use these rooms: ${rooms
              .map((r) => `${r.id}:${r.name}`)
              .join(", ")}. Cities: ${cities.map((c) => `${c.id}:${c.name}`).join(", ")}.` ,
          }),
        },
      ];

      try {
        const out = await llm.completeJson<{ npc: Npc }>(withMemory(memKey, messages));
        remember(memKey, { prompt: { rooms: rooms.length, cities: cities.length }, response: out });
        if (out?.npc?.id) {
          const npc: Npc = {
            ...out.npc,
            location: out.npc.location && engine.world.rooms.has(out.npc.location) ? out.npc.location : rooms[0]?.id,
          };
          if (npc.location) {
            engine.world.upsertNpc(npc);
          }
        }
      } catch (err) {
        console.error("npc generation error", err);
      }
    })
  );
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
        const memKey = `npc-${npc.id}`;
        const base: LlmMessage[] = [
          { role: "system", content: npcAutonomyPrompt },
          { role: "user", content: JSON.stringify({ npc, snapshot }) },
        ];
        const out = await llm.completeJson<{ update?: { moveTo?: string; event?: WorldEvent } }>(withMemory(memKey, base));
        remember(memKey, { prompt: { npc, snapshot }, response: out });
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
          const translated = await translateEvent(normalized);
          engine.world.pushEvent(translated);
        }
      } catch (err) {
        console.error("npc tick error", npc.id, err);
      }
    })
  );
}

async function qaCheckPatch(patch: { path: string; content: string; note?: string }) {
  const memKey = "qa";
  const base: LlmMessage[] = [
    { role: "system", content: qaTeamPrompt },
    { role: "user", content: JSON.stringify({ patch }) },
  ];
  const res = await llm.completeJson<{ verdict: "approve" | "reject"; reason?: string }>(withMemory(memKey, base));
  remember(memKey, { prompt: { patch }, response: res });
  return res?.verdict === "approve";
}

async function applyPatchWithQa(patch: { path: string; content: string; note?: string }, label: string) {
  if (!patch?.path || typeof patch.content !== "string") return;
  const approved = await qaCheckPatch(patch);
  if (!approved) {
    console.warn("patch rejected", label, patch.path);
    return;
  }
  const abs = path.join(__dirname, "..", patch.path);
  fs.writeFileSync(abs, patch.content, "utf8");
  console.log("patch applied", label, patch.path, patch.note ?? "");
}

// Unsafe: automated dev team tick that generates and applies patches
async function devTeamTick() {
  const snapshot = {
    cities: Array.from(engine.world.cities.values()),
    rooms: Array.from(engine.world.rooms.values()),
    npcs: Array.from(engine.world.npcs.values()),
    bugReports: engine.world.bugReports,
  };
  const leadMem = "dev-lead";
  const leadMsg: LlmMessage[] = [
    { role: "system", content: devTeamPrompt },
    { role: "user", content: JSON.stringify({ snapshot }) },
  ];
  const plan = await llm.completeJson<{ intents: Array<{ agent: string; intent: string }> }>(withMemory(leadMem, leadMsg));
  remember(leadMem, { prompt: { snapshot }, response: plan });
  const intents = plan?.intents ?? [];
  await Promise.all(
    intents.map(async (i) => {
      try {
        const memKey = `dev-${i.agent}`;
        const patchMsg: LlmMessage[] = [
          { role: "system", content: devPatchPrompt },
          { role: "user", content: JSON.stringify({ intent: i.intent, agent: i.agent, context: buildPatchContext() }) },
        ];
        const out = await llm.completeJson<{ path: string; content: string; note?: string }>(withMemory(memKey, patchMsg));
        remember(memKey, { prompt: { intent: i.intent, agent: i.agent }, response: out });
        await applyPatchWithQa(out, `dev-${i.agent}`);
      } catch (err) {
        console.error("dev team patch error", i.agent, err);
      }
    })
  );
}

// Unsafe: design team proposes gaps -> dev agents implement -> QA then apply
async function designTeamTick() {
  const snapshot = {
    cities: Array.from(engine.world.cities.values()),
    rooms: Array.from(engine.world.rooms.values()),
    npcs: Array.from(engine.world.npcs.values()),
    bugReports: engine.world.bugReports,
  };
  const designLead = "design-lead";
  const designMsg: LlmMessage[] = [
    { role: "system", content: designFocusPrompt },
    { role: "user", content: JSON.stringify({ snapshot }) },
  ];
  const plan = await llm.completeJson<{ decisions: Array<{ title: string; gap: string }> }>(withMemory(designLead, designMsg));
  remember(designLead, { prompt: { snapshot }, response: plan });
  const decisions = plan?.decisions ?? [];
  await Promise.all(
    decisions.map(async (d, idx) => {
      try {
        const memKey = `design-dev-${idx}`;
        const patchMsg: LlmMessage[] = [
          { role: "system", content: devPatchPrompt },
          { role: "user", content: JSON.stringify({ intent: d.gap, agent: d.title, context: buildPatchContext() }) },
        ];
        const patch = await llm.completeJson<{ path: string; content: string; note?: string }>(withMemory(memKey, patchMsg));
        remember(memKey, { prompt: { intent: d.gap, agent: d.title }, response: patch });
        await applyPatchWithQa(patch, `design-dev-${idx}`);
      } catch (err) {
        console.error("design team patch error", d?.title, err);
      }
    })
  );
}

async function orchestrateTick() {
  try {
    // Skip LLM churn when没有玩家活跃/创建
    if (engine.world.players.size === 0) return;
    const tasks: Array<Promise<unknown>> = [];
    if (config.enableAmbientLLM) tasks.push(eventTick(), npcGenerationTick(), npcTick());
    if (config.enableRuler) tasks.unshift(rulerTick());
    if (config.enableAutoTeams) tasks.push(devTeamTick(), designTeamTick());
    // Non-LLM world maintenance
    decayHeatForAllPlayers(engine.world, 4);
    await Promise.all(tasks);
  } catch (err) {
    console.error("orchestrator tick error", err);
  }
}

function buildPlayerStatus(playerId: string) {
  const player = engine.ensurePlayer(playerId);
  const room = engine.world.rooms.get(player.location);
  const city = room ? engine.world.getCityForRoom(room.id) : undefined;
  const heat = Math.max(0, Math.min(100, Number(player.heat ?? 0) || 0));
  const wantedLevel = computeWantedLevel(heat);

  const npcsInRoom = room
    ? Array.from(engine.world.npcs.values())
        .filter((n) => n.location === room.id)
        .map((n) => ({ id: n.id, name: n.name, role: n.role }))
    : [];
  const playersInRoom = room
    ? Array.from(engine.world.players.values())
        .filter((p) => p.location === room.id)
        .map((p) => ({ id: p.id }))
    : [];

  return {
    player: {
      id: player.id,
      credits: player.credits,
      health: player.health,
      hunger: player.hunger ?? 0,
      heat,
      wantedLevel,
      status: player.status,
      location: player.location,
    },
    room: room
      ? {
          id: room.id,
          name: room.name,
          zone: room.zone,
          neighbors: room.neighbors,
          cityId: room.cityId,
        }
      : null,
    city: city ? { id: city.id, name: city.name } : null,
    counts: {
      npcsHere: npcsInRoom.length,
      playersHere: playersInRoom.length,
    },
    npcsHere: npcsInRoom,
    playersHere: playersInRoom,
  };
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// UNSAFE: hotpatch endpoint that writes arbitrary file content from LLM
app.post("/api/dev/hotpatch", async (req, res) => {
  const { intent } = req.body ?? {};
  if (!intent) {
    res.status(400).json({ error: "intent is required" });
    return;
  }
  try {
    const messages: LlmMessage[] = [
      { role: "system", content: devPrompt },
      { role: "user", content: JSON.stringify({ intent, context: buildPatchContext() }) },
    ];
    const out = await llm.completeJson<{ path: string; content: string; note?: string }>(messages);
    if (!out?.path || typeof out.content !== "string") {
      res.status(400).json({ error: "invalid patch" });
      return;
    }
    const abs = path.join(__dirname, "..", out.path);
    fs.writeFileSync(abs, out.content, "utf8");
    res.json({ applied: true, note: out.note, path: out.path });
  } catch (err) {
    console.error("hotpatch error", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Bug reporting endpoint -> goes to design/dev via snapshots
app.post("/api/bug-report", (req, res) => {
  const { title, detail, playerId } = req.body ?? {};
  if (typeof title !== "string" || !title.trim() || typeof detail !== "string" || !detail.trim()) {
    res.status(400).json({ error: "title and detail are required" });
    return;
  }
  const report: BugReport = {
    id: `bug-${Date.now()}`,
    title: title.trim().slice(0, 140),
    detail: detail.trim().slice(0, 2000),
    playerId: typeof playerId === "string" ? playerId : undefined,
    ts: Date.now(),
  };
  engine.world.pushBugReport(report);
  try {
    // Run lightweight auto-mitigation for known categories (e.g., missing NPCs)
    engine.world.processBugReports();
  } catch (err) {
    console.error("bug auto-mitigation failed", err);
  }
  res.json({ accepted: true, id: report.id });
});

// UNSAFE: rule-focused hotpatch based on a described gap
app.post("/api/dev/rule-patch", async (req, res) => {
  const { gap } = req.body ?? {};
  if (!gap) {
    res.status(400).json({ error: "gap is required" });
    return;
  }
  try {
    const messages: LlmMessage[] = [
      { role: "system", content: ruleDevPrompt },
      { role: "user", content: JSON.stringify({ gap, context: buildPatchContext() }) },
    ];
    const out = await llm.completeJson<{ path: string; content: string; note?: string }>(messages);
    if (!out?.path || typeof out.content !== "string") {
      res.status(400).json({ error: "invalid patch" });
      return;
    }
    const abs = path.join(__dirname, "..", out.path);
    fs.writeFileSync(abs, out.content, "utf8");
    res.json({ applied: true, note: out.note, path: out.path });
  } catch (err) {
    console.error("rule hotpatch error", err);
    res.status(500).json({ error: (err as Error).message });
  }
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
    const memKey = `player-${playerId}`;
    const plan = await llm.plan(withMemory(memKey, messages));
    remember(memKey, { prompt: { world: { location: player.location, room, city: city?.policy }, player, input }, response: plan });
    const handled = engine.hasAction(plan.plan.action);
    const result = handled
      ? engine.applyAction(playerId, plan.plan)
      : await improviseOutcome({ player, room, city, input, plan: plan.plan });
    // Kick orchestrator asynchronously so the player response is not blocked by LLM churn
    orchestrateTick().catch((err) => {
      console.error("orchestrate after act failed", err);
    });
    const sensory = result.sensory ?? {};
    const normalizedSensory = {
      visual: sensory.visual ?? "",
      audio: sensory.audio ?? "",
      smell: sensory.smell ?? "",
      touch: sensory.touch ?? "",
    };
    res.json({ plan, result: { ...result, sensory: normalizedSensory }, ui: buildPlayerStatus(playerId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Deterministic action apply (bypass LLM) for better UX and fewer tokens
app.post("/api/session/:playerId/apply", (req, res) => {
  const playerId = req.params.playerId;
  const plan = (req.body?.plan ?? req.body) as Partial<PlanAction>;
  if (!plan || typeof plan.action !== "string" || !plan.action.trim()) {
    res.status(400).json({ error: "plan.action is required" });
    return;
  }
  try {
    const action = plan.action.trim();
    if (!engine.hasAction(action)) {
      res.status(400).json({ error: `unknown action: ${action}` });
      return;
    }
    const normalized: PlanAction = {
      action,
      target: typeof plan.target === "string" ? plan.target : undefined,
      amount: typeof plan.amount === "number" ? plan.amount : undefined,
      path: Array.isArray(plan.path) ? (plan.path as string[]) : undefined,
      risk: (plan.risk as any) ?? "low",
      notes: typeof plan.notes === "string" ? plan.notes : undefined,
    };
    const result = engine.applyAction(playerId, normalized);
    orchestrateTick().catch((err) => {
      console.error("orchestrate after apply failed", err);
    });
    res.json({ plan: normalized, result, ui: buildPlayerStatus(playerId) });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Player status snapshot for UI refresh
app.get("/api/session/:playerId/status", (req, res) => {
  const playerId = req.params.playerId;
  res.json(buildPlayerStatus(playerId));
});

// Location jobs (non-LLM loop to improve playability and save tokens)
app.get("/api/session/:playerId/jobs", (req, res) => {
  const playerId = req.params.playerId;
  const player = engine.ensurePlayer(playerId);
  const jobs = listJobs(engine.world, player);
  const heat = Math.max(0, Math.min(100, Number(player.heat ?? 0) || 0));
  res.json({ location: player.location, heat, wantedLevel: computeWantedLevel(heat), jobs });
});

app.post("/api/session/:playerId/job", (req, res) => {
  const playerId = req.params.playerId;
  const jobId = typeof req.body?.jobId === "string" ? req.body.jobId : "";
  if (!jobId) {
    res.status(400).json({ error: "jobId is required" });
    return;
  }
  try {
    const player = engine.ensurePlayer(playerId);
    const result = runJob(engine.world, player, jobId);
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Player map (visited / known rooms)
app.get("/api/session/:playerId/map", (req, res) => {
  const playerId = req.params.playerId;
  const player = engine.ensurePlayer(playerId);
  const discovered = new Set(player.discoveredRooms ?? []);
  const known = new Set(player.knownRooms ?? []);
  const visible = new Set<string>([...discovered, ...known]);
  const rooms = Array.from(engine.world.rooms.values())
    .filter((r) => visible.has(r.id))
    .map((r) => ({
      ...r,
      status: discovered.has(r.id) ? "visited" : "known",
      neighbors: r.neighbors.filter((n) => visible.has(n)),
    }));
  res.json({ rooms });
});

async function improviseOutcome(params: { player: any; room: any; city: any; input: string; plan: any }) {
  const { player, room, city, input, plan } = params;
  const snapshot = {
    player: { ...player },
    room,
    city,
  };
  const memKey = `improv-${player.id}`;
  const base: LlmMessage[] = [
    { role: "system", content: improvPrompt },
    { role: "user", content: JSON.stringify({ input, plan, snapshot }) },
  ];
  const out = await llm.completeJson<{ summary: string; sensory?: any; statePatch?: any; event?: any }>(withMemory(memKey, base));
  remember(memKey, { prompt: { input, plan, snapshot }, response: out });
  const statePatch = out?.statePatch ?? {};

  // Apply clamped deltas
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  if (typeof statePatch.healthDelta === "number") {
    player.health = clamp(player.health + statePatch.healthDelta, 0, 100);
    player.status = player.health === 0 ? "down" : "ok";
  }
  if (typeof statePatch.creditsDelta === "number") {
    player.credits = Math.max(0, player.credits + statePatch.creditsDelta);
  }
  if (typeof statePatch.hungerDelta === "number") {
    player.hunger = clamp((player.hunger ?? 0) + statePatch.hungerDelta, 0, 100);
  }

  if (out?.event?.title && out.event.detail) {
    const improvEvent: WorldEvent = {
      id: `improv-${Date.now()}`,
      title: out.event.title,
      detail: out.event.detail,
      cityId: out.event.cityId,
      ts: Date.now(),
    };
    const translated = await translateEvent(improvEvent);
    engine.world.pushEvent(translated);
  }

  return {
    summary: out?.summary || "你进行了一次自由行动。",
    sensory: out?.sensory || {},
    state: player,
    meta: { improv: true },
  };
}

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

// Ruler asks for code change intent (unsafe, high risk)
app.post("/api/ruler/dev-intent", async (req, res) => {
  const tensions = req.body?.tensions ?? "";
  const snapshot = {
    cities: Array.from(engine.world.cities.values()),
    npcs: Array.from(engine.world.npcs.values()),
  };
  const messages: LlmMessage[] = [
    { role: "system", content: coderSummonPrompt },
    { role: "user", content: JSON.stringify({ tensions, snapshot }) },
  ];
  try {
    const out = await llm.completeJson<{ intent: string }>(messages);
    res.json({ intent: out?.intent });
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

// NPC list (optionally filtered to player's current room unless scope=all)
app.get("/api/npc", (req, res) => {
  const scope = typeof req.query?.scope === "string" ? req.query.scope : undefined;
  const playerId = typeof req.query?.playerId === "string" && req.query.playerId.trim() ? req.query.playerId.trim() : undefined;
  let npcs = Array.from(engine.world.npcs.values());
  if (scope !== "all" && playerId) {
    const player = engine.world.players.get(playerId);
    if (player) {
      npcs = npcs.filter((n) => !n.location || n.location === player.location);
    }
  }
  res.json({ npcs });
});

// Players list (minimal for UI map visualization)
app.get("/api/players", (_req, res) => {
  res.json({ players: Array.from(engine.world.players.values()).map((p) => ({ id: p.id, location: p.location })) });
});

// NPC talk
app.post("/api/npc/:npcId/talk", async (req, res) => {
  const npcId = req.params.npcId;
  const input = req.body?.input;
  const playerId = typeof req.body?.playerId === "string" && req.body.playerId.trim() ? req.body.playerId.trim() : "demo";
  const npc = engine.world.npcs.get(npcId);
  if (!npc) {
    res.status(404).json({ error: "NPC not found" });
    return;
  }
  if (typeof input !== "string" || !input.trim()) {
    res.status(400).json({ error: "input is required" });
    return;
  }

  const player = engine.ensurePlayer(playerId);
  const room = engine.world.rooms.get(player.location);
  const city = room ? engine.world.getCityForRoom(room.id) : undefined;
  if (npc.location && npc.location !== player.location) {
    res.status(400).json({ error: "你不在该 NPC 所在的位置，无法对话" });
    return;
  }
    const normalizeNpcMem = (mem?: NpcMemory): NpcMemory => ({
      lastInteraction: mem?.lastInteraction ?? 0,
      conversationHistory: mem?.conversationHistory ?? [],
      dialogueState: mem?.dialogueState ?? {},
      questProgress: mem?.questProgress,
      playerReputation: mem?.playerReputation,
    });
    const playerMemory = normalizeNpcMem(player.npcMemory?.[npcId]);
    const npcMemory = normalizeNpcMem(npc.memory);

  const snapshot = {
    npc,
    player: { id: player.id, location: player.location, reputation: player.reputation, factionReputation: player.factionReputation },
    room,
    city,
    world: {
      cities: Array.from(engine.world.cities.values()),
    },
    memories: { npcMemory, playerMemory },
  };
  const messages: LlmMessage[] = [
    { role: "system", content: npcTalkPrompt },
    { role: "user", content: JSON.stringify({ input, snapshot }) },
  ];
  try {
    const reply = await llm.completeJson<NpcTalkResult>(messages);

    // Persist memory deltas
    const now = Date.now();
    const convEntry = { input, reply: reply?.reply ?? "" };
    const playerDelta = { ...(reply?.playerMemoryDelta as any) };
    const npcDelta = { ...(reply?.npcMemoryDelta as any) };
    const mergedPlayerMem: NpcMemory = {
      ...playerMemory,
      ...playerDelta,
      lastInteraction: now,
      conversationHistory: [...(playerMemory.conversationHistory ?? []), JSON.stringify(convEntry)].slice(-10),
      dialogueState: { ...(playerMemory.dialogueState ?? {}), ...(playerDelta.dialogueState ?? {}) },
    };
    const mergedNpcMem: NpcMemory = {
      ...npcMemory,
      ...npcDelta,
      lastInteraction: now,
      conversationHistory: [...(npcMemory.conversationHistory ?? []), JSON.stringify(convEntry)].slice(-10),
      dialogueState: { ...(npcMemory.dialogueState ?? {}), ...(npcDelta.dialogueState ?? {}) },
    };
    player.npcMemory = { ...(player.npcMemory ?? {}), [npcId]: mergedPlayerMem };
    npc.memory = mergedNpcMem;

    // Optional: trigger an action if provided
    let actionResult: any = undefined;
    if (reply?.action && reply.action.action && engine.hasAction(reply.action.action)) {
      const plan = { ...reply.action, risk: reply.action.risk ?? "low" } as PlanAction;
      actionResult = engine.applyAction(playerId, plan);
      reply.actionResult = actionResult;
    }

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
  // Slow down orchestrator to reduce LLM load
  const intervalMs = 5 * 60_000; // 5 minutes
  setInterval(orchestrateTick, intervalMs);
  setInterval(saveAll, persistenceIntervalMs);
});

const shutdown = () => {
  try {
    saveAll();
  } catch (err) {
    console.error("shutdown save failed", err);
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
