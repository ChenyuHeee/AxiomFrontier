export type Risk = "low" | "med" | "high";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface PlanAction {
  action: string;
  target?: string;
  amount?: number;
  path?: string[];
  risk: Risk;
  notes?: string;
}

export interface LlmPlanResponse {
  plan: PlanAction;
  justification?: string;
}

export interface PlayerState {
  id: string;
  location: string;
  inventory: string[];
  credits: number;
  health: number;
  hunger: number;
  status: "ok" | "down";
}

export interface SensoryCue {
  visual?: string;
  audio?: string;
  smell?: string;
  touch?: string;
}

export interface ActionResult {
  summary: string;
  sensory: SensoryCue;
  state: PlayerState;
  meta?: Record<string, unknown>;
}

// LLM-driven world / ruler
export interface GeneratedRoom {
  id: string;
  name: string;
  neighbors: string[];
  cityId?: string;
  zone: Zone;
}

export interface GeneratedCity {
  id: string;
  name: string;
  policy: CityPolicy;
}

export interface WorldSpec {
  rooms: GeneratedRoom[];
  cities: GeneratedCity[];
  players?: PlayerState[];
}

export interface RulerDecision {
  cityId: string;
  policyPatch?: Partial<CityPolicy>;
  broadcast?: string;
}

export interface Npc {
  id: string;
  name: string;
  role: string;
  location?: string;
  style?: string;
}

export interface NpcTalkResult {
  reply: string;
  hint?: string;
  task?: string;
}

export interface WorldEvent {
  id: string;
  title: string;
  detail: string;
  cityId?: string;
  npcId?: string;
  ts: number;
}

export type Zone = "city" | "wild";

export interface Room {
  id: string;
  name: string;
  neighbors: string[];
  cityId?: string;
  zone: Zone;
}

export interface CityPolicy {
  name: string;
  safetyLevel: number; // 0-1
  guards: { density: "low" | "med" | "high"; responseTime: "slow" | "med" | "fast"; lethality: "nonlethal" | "lethal" };
  pvp: { on: boolean; dropRule: "none" | "partial" | "full"; penalty: "none" | "fine" | "bounty" };
  tax: { trade: number; withdraw: number; gateFee: number; storageFee: number; insuranceRate: number };
  withdrawPoints: Array<{ id: string; fee: number; cooldownSec: number; safeRadius: number; hiValueLimit: number; hours: string }>;
  access: { mode: "open" | "permit" | "invite" };
}

export interface City {
  id: string;
  name: string;
  policy: CityPolicy;
}
