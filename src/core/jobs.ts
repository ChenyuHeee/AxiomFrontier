import type { ActionResult, PlayerState, Room, WorldState, Zone } from "../types.js";

export type JobType = "legal" | "illegal" | "combat";

export interface JobDefinition {
  id: string;
  title: string;
  type: JobType;
  zone?: Zone;
  onlyInRooms?: string[];
  minHeat?: number;
  maxHeat?: number;
  cooldownSec: number;
  creditReward: number;
  healthDelta?: number;
  hungerDelta?: number;
  heatDelta: number;
  summary: string;
}

export interface JobView {
  id: string;
  title: string;
  type: JobType;
  cooldownSec: number;
  creditReward: number;
  heatDelta: number;
  summary: string;
  available: boolean;
  reason?: string;
}

const JOBS: JobDefinition[] = [
  {
    id: "courier-market",
    title: "跑腿送货",
    type: "legal",
    zone: "city",
    onlyInRooms: ["market", "square"],
    cooldownSec: 60,
    creditReward: 18,
    hungerDelta: -3,
    heatDelta: -2,
    summary: "替商人把一份包裹送到附近据点，路上注意别弄丢。",
  },
  {
    id: "street-hustle",
    title: "街头小活",
    type: "legal",
    zone: "city",
    onlyInRooms: ["square"],
    cooldownSec: 90,
    creditReward: 25,
    hungerDelta: -4,
    heatDelta: 0,
    summary: "在广场帮人修东西/搬运，挣点小费。",
  },
  {
    id: "pickpocket",
    title: "扒窃",
    type: "illegal",
    zone: "city",
    onlyInRooms: ["market", "square"],
    cooldownSec: 120,
    creditReward: 55,
    healthDelta: -5,
    hungerDelta: -2,
    heatDelta: 22,
    summary: "在拥挤的人群里下手，赚得快，但被抓会很麻烦。",
  },
  {
    id: "gate-bribe-run",
    title: "走私通关",
    type: "illegal",
    onlyInRooms: ["north_gate"],
    cooldownSec: 180,
    creditReward: 90,
    healthDelta: -8,
    hungerDelta: -3,
    heatDelta: 35,
    summary: "在守卫眼皮底下放行一批货，回报高，风险也高。",
  },
  {
    id: "scavenge-wild",
    title: "荒野拾荒",
    type: "combat",
    zone: "wild",
    cooldownSec: 120,
    creditReward: 70,
    healthDelta: -12,
    hungerDelta: -8,
    heatDelta: 5,
    summary: "离开城墙去捡点值钱的东西，遇上麻烦别硬扛。",
  },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getHeat(player: PlayerState) {
  return clamp(Number(player.heat ?? 0) || 0, 0, 100);
}

export function computeWantedLevel(heat: number) {
  const h = clamp(heat, 0, 100);
  if (h >= 85) return 5;
  if (h >= 70) return 4;
  if (h >= 55) return 3;
  if (h >= 35) return 2;
  if (h >= 15) return 1;
  return 0;
}

function canRunJob(def: JobDefinition, player: PlayerState, room: Room): { ok: boolean; reason?: string } {
  const now = Date.now();
  const lastRun = (player.jobCooldowns?.[def.id] as number | undefined) ?? 0;
  const remainingMs = lastRun + def.cooldownSec * 1000 - now;
  if (remainingMs > 0) return { ok: false, reason: `冷却中：${Math.ceil(remainingMs / 1000)}s` };

  const heat = getHeat(player);
  if (typeof def.minHeat === "number" && heat < def.minHeat) return { ok: false, reason: "热度不足" };
  if (typeof def.maxHeat === "number" && heat > def.maxHeat) return { ok: false, reason: "热度过高" };

  if (def.zone && room.zone !== def.zone) return { ok: false, reason: "地点不对" };
  if (def.onlyInRooms && !def.onlyInRooms.includes(room.id)) return { ok: false, reason: "地点不对" };

  // Illegal jobs disabled when heat already very high
  if (def.type === "illegal" && heat >= 95) return { ok: false, reason: "风头太紧" };

  return { ok: true };
}

export function listJobs(world: WorldState, player: PlayerState): JobView[] {
  const room = world.rooms.get(player.location);
  if (!room) return [];
  return JOBS.map((j) => {
    const gate = canRunJob(j, player, room);
    return {
      id: j.id,
      title: j.title,
      type: j.type,
      cooldownSec: j.cooldownSec,
      creditReward: j.creditReward,
      heatDelta: j.heatDelta,
      summary: j.summary,
      available: gate.ok,
      reason: gate.reason,
    };
  });
}

export function runJob(world: WorldState, player: PlayerState, jobId: string): ActionResult {
  const room = world.rooms.get(player.location);
  if (!room) throw new Error("Invalid player location");
  const def = JOBS.find((j) => j.id === jobId);
  if (!def) throw new Error("Unknown job");

  const gate = canRunJob(def, player, room);
  if (!gate.ok) {
    return {
      summary: `无法执行任务：${gate.reason ?? "不可用"}`,
      sensory: { visual: "任务板提示不可用", audio: "提示音", smell: "纸墨", touch: "冰冷" },
      state: player,
      meta: { jobId, blocked: true, reason: gate.reason },
    };
  }

  const beforeHeat = getHeat(player);
  const afterHeat = clamp(beforeHeat + def.heatDelta, 0, 100);
  player.heat = afterHeat;
  player.credits = Math.max(0, player.credits + def.creditReward);
  player.health = clamp(player.health + (def.healthDelta ?? 0), 0, 100);
  player.hunger = clamp(player.hunger + (def.hungerDelta ?? 0), 0, 100);
  player.status = player.health === 0 ? "down" : "ok";
  player.jobCooldowns = { ...(player.jobCooldowns ?? {}), [def.id]: Date.now() };

  const wanted = computeWantedLevel(afterHeat);

  const summary = `${def.title}：${def.summary}（+${def.creditReward} 信用点${def.heatDelta ? `，热度 ${def.heatDelta > 0 ? "+" : ""}${def.heatDelta}` : ""}）`;
  return {
    summary,
    sensory: {
      visual: def.type === "illegal" ? "你尽量不引人注目" : "你按流程把事情办妥",
      audio: def.type === "combat" ? "远处有动静" : "人群嘈杂",
      smell: room.zone === "wild" ? "尘土与铁锈" : "城市气息",
      touch: def.type === "combat" ? "手心出汗" : "手指发麻",
    },
    state: player,
    meta: { jobId: def.id, jobType: def.type, heat: afterHeat, wanted },
  };
}

export function decayHeatForAllPlayers(world: WorldState, amount = 4) {
  world.players.forEach((p) => {
    const heat = getHeat(p);
    const next = clamp(heat - amount, 0, 100);
    p.heat = next;
  });
}
