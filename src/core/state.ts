import type { City, CityPolicy, Npc, PlayerState, Room, WorldEvent, WorldSpec } from "../types.js";

export interface WorldState {
  players: Map<string, PlayerState>;
  rooms: Map<string, Room>;
  cities: Map<string, City>;
  npcs: Map<string, Npc>;
  events: WorldEvent[];
}

export class InMemoryState implements WorldState {
  players = new Map<string, PlayerState>();
  rooms = new Map<string, Room>();
  cities = new Map<string, City>();
  npcs = new Map<string, Npc>();
  events: WorldEvent[] = [];

  constructor(seed?: { rooms: Room[]; cities: City[]; players?: PlayerState[] }) {
    if (seed?.rooms) {
      seed.rooms.forEach((r) => this.rooms.set(r.id, r));
    }
    if (seed?.cities) {
      seed.cities.forEach((c) => this.cities.set(c.id, c));
    }
    seed?.players?.forEach((p) => this.players.set(p.id, p));
  }

  ensurePlayer(playerId: string): PlayerState {
    const existing = this.players.get(playerId);
    if (existing) return existing;
    const created: PlayerState = {
      id: playerId,
      location: "square",
      inventory: [],
      credits: 100,
      health: 100,
      hunger: 100,
      status: "ok",
    };
    this.players.set(playerId, created);
    return created;
  }

  getCityForRoom(roomId: string): City | undefined {
    const room = this.rooms.get(roomId);
    if (!room?.cityId) return undefined;
    return this.cities.get(room.cityId);
  }

  applyWorld(spec: WorldSpec) {
    this.rooms.clear();
    this.cities.clear();
    this.players.clear();
    this.npcs.clear();
    this.events = [];
    spec.rooms.forEach((r) => this.rooms.set(r.id, r));
    spec.cities.forEach((c) => this.cities.set(c.id, c));
    spec.players?.forEach((p) => this.players.set(p.id, p));
  }

  mergeWorld(spec: WorldSpec) {
    spec.rooms.forEach((r) => this.rooms.set(r.id, r));
    spec.cities.forEach((c) => this.cities.set(c.id, c));
    spec.players?.forEach((p) => this.players.set(p.id, p));
  }

  upsertNpc(npc: Npc) {
    this.npcs.set(npc.id, npc);
  }

  pushEvent(evt: WorldEvent) {
    this.events.unshift(evt);
    if (this.events.length > 50) this.events.pop();
  }
}

export function loadDefaultWorld(): InMemoryState {
  const defaultPolicy: CityPolicy = {
    name: "New Bastion",
    safetyLevel: 0.6,
    guards: { density: "med", responseTime: "fast", lethality: "nonlethal" },
    pvp: { on: true, dropRule: "partial", penalty: "bounty" },
    tax: { trade: 0.05, withdraw: 0.02, gateFee: 0.0, storageFee: 0.01, insuranceRate: 0.0 },
    withdrawPoints: [
      { id: "bank_gate", fee: 0.02, cooldownSec: 600, safeRadius: 10, hiValueLimit: 5000, hours: "24/7" },
    ],
    access: { mode: "open" },
  };

  const rooms: Room[] = [
    { id: "square", name: "中央广场", neighbors: ["north_gate", "market"], cityId: "bastion", zone: "city" },
    { id: "north_gate", name: "北门哨所", neighbors: ["square", "wild_north"], cityId: "bastion", zone: "city" },
    { id: "market", name: "交易所", neighbors: ["square"], cityId: "bastion", zone: "city" },
    { id: "wild_north", name: "北郊荒野", neighbors: ["north_gate", "ruins"], zone: "wild" },
    { id: "ruins", name: "残垣废墟", neighbors: ["wild_north"], zone: "wild" },
  ];

  const cities: City[] = [
    { id: "bastion", name: "新堡", policy: defaultPolicy },
  ];

  return new InMemoryState({ rooms, cities });
}
