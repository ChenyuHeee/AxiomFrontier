import type { BugReport, City, CityPolicy, GlossaryEntry, Npc, PlayerState, Room, WorldEvent, WorldSpec } from "../types.js";

export interface PersistedState {
  players: PlayerState[];
  rooms: Room[];
  cities: City[];
  npcs: Npc[];
  events: WorldEvent[];
  glossary: GlossaryEntry[];
  bugReports: BugReport[];
}

export interface WorldState {
  players: Map<string, PlayerState>;
  rooms: Map<string, Room>;
  cities: Map<string, City>;
  npcs: Map<string, Npc>;
  events: WorldEvent[];
  glossary: Map<string, string>;
  bugReports: BugReport[];
}

export class InMemoryState implements WorldState {
  players = new Map<string, PlayerState>();
  rooms = new Map<string, Room>();
  cities = new Map<string, City>();
  npcs = new Map<string, Npc>();
  events: WorldEvent[] = [];
  glossary = new Map<string, string>();
  bugReports: BugReport[] = [];

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
      discoveredRooms: [],
      knownRooms: [],
      favors: 0,
      favorCap: 100,
      favorSources: [],
      reputation: {},
      bounties: {},
      factionReputation: {},
      npcMemory: {},
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
    this.glossary.clear();
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
    const existing = this.npcs.get(npc.id);
    if (existing) {
      const mergedNpc: Npc = {
        ...existing,
        ...npc,
        id: npc.id,
      };
      this.npcs.set(npc.id, mergedNpc);
    } else {
      this.npcs.set(npc.id, npc);
    }
  }

  pushEvent(evt: WorldEvent) {
    this.events.unshift(evt);
    if (this.events.length > 50) this.events.pop();
  }

  getGlossaryEntries(): GlossaryEntry[] {
    return Array.from(this.glossary.entries()).map(([source, target]) => ({ source, target }));
  }

  addGlossary(entries: GlossaryEntry[]) {
    entries.forEach(({ source, target }) => {
      const key = source?.trim();
      const val = target?.trim();
      if (!key || !val) return;
      this.glossary.set(key, val);
    });
  }

  toPersistedState(): PersistedState {
    return {
      players: Array.from(this.players.values()),
      rooms: Array.from(this.rooms.values()),
      cities: Array.from(this.cities.values()),
      npcs: Array.from(this.npcs.values()),
      events: [...this.events],
      glossary: this.getGlossaryEntries(),
      bugReports: [...this.bugReports],
    };
  }

  loadPersistedState(data: PersistedState) {
    if (!data) return;
    this.rooms.clear();
    this.cities.clear();
    this.players.clear();
    this.npcs.clear();
    this.glossary.clear();
    this.events = [];
    this.bugReports = [];
    data.rooms?.forEach((r) => this.rooms.set(r.id, r));
    data.cities?.forEach((c) => this.cities.set(c.id, c));
    data.players?.forEach((p) => this.players.set(p.id, p));
    data.npcs?.forEach((n) => this.npcs.set(n.id, n));
    data.glossary?.forEach(({ source, target }) => this.glossary.set(source, target));
    this.events = Array.isArray(data.events) ? [...data.events].slice(0, 50) : [];
    this.bugReports = Array.isArray(data.bugReports) ? [...data.bugReports].slice(-100) : [];
  }

  getRoomConnectionsAndZones(): { rooms: Room[], connections: { from: string, to: string }[], zones: { zone: string, rooms: string[] }[] } {
    const rooms = Array.from(this.rooms.values());
    const connections: { from: string, to: string }[] = [];
    const zoneMap = new Map<string, string[]>();

    rooms.forEach(room => {
      room.neighbors.forEach(neighborId => {
        connections.push({ from: room.id, to: neighborId });
      });
      const zone = room.zone;
      if (!zoneMap.has(zone)) {
        zoneMap.set(zone, []);
      }
      zoneMap.get(zone)!.push(room.id);
    });

    const zones = Array.from(zoneMap.entries()).map(([zone, roomIds]) => ({ zone, rooms: roomIds }));
    return { rooms, connections, zones };
  }

  syncFromSnapshot(snapshot: { rooms: Room[], connections: { from: string, to: string }[], zones: { zone: string, rooms: string[] }[] }): void {
    // Update rooms with new connections and zones
    const roomMap = new Map<string, Room>();
    snapshot.rooms.forEach(room => {
      const existing = this.rooms.get(room.id);
      if (existing) {
        // Preserve existing data like cityId, arData, etc., but update neighbors and zone
        existing.neighbors = room.neighbors;
        existing.zone = room.zone;
        roomMap.set(room.id, existing);
      } else {
        // Add new room with default cityId if not specified
        const newRoom: Room = {
          ...room,
          cityId: room.cityId || undefined,
        };
        roomMap.set(room.id, newRoom);
      }
    });

    // Validate connections against room IDs
    const validConnections = snapshot.connections.filter(conn => 
      roomMap.has(conn.from) && roomMap.has(conn.to)
    );
    // Update neighbors based on valid connections
    validConnections.forEach(conn => {
      const fromRoom = roomMap.get(conn.from);
      const toRoom = roomMap.get(conn.to);
      if (fromRoom && toRoom) {
        if (!fromRoom.neighbors.includes(conn.to)) {
          fromRoom.neighbors.push(conn.to);
        }
        if (!toRoom.neighbors.includes(conn.from)) {
          toRoom.neighbors.push(conn.from);
        }
      }
    });

    // Update zones from snapshot
    snapshot.zones.forEach(zoneData => {
      zoneData.rooms.forEach(roomId => {
        const room = roomMap.get(roomId);
        if (room) {
          room.zone = zoneData.zone as "city" | "wild";
        }
      });
    });

    // Replace rooms map with updated data
    this.rooms = roomMap;
  }

  analyzeCityPolicy(cityId: string): { policy: CityPolicy, safetyScore: number, recommendations: string[] } {
    const city = this.cities.get(cityId);
    if (!city) {
      throw new Error(`City with id ${cityId} not found`);
    }
    const policy = city.policy;
    let safetyScore = policy.safetyLevel * 100;
    
    const guardDensityScore = { low: 20, med: 50, high: 80 }[policy.guards.density];
    const responseTimeScore = { slow: 20, med: 50, fast: 80 }[policy.guards.responseTime];
    const lethalityScore = policy.guards.lethality === "nonlethal" ? 30 : 70;
    safetyScore += (guardDensityScore + responseTimeScore + lethalityScore) / 3;
    
    if (!policy.pvp.on) {
      safetyScore += 20;
    } else {
      if (policy.pvp.penalty === "bounty") safetyScore += 10;
      else if (policy.pvp.penalty === "fine") safetyScore += 5;
    }
    
    const taxPenalty = (policy.tax.trade + policy.tax.withdraw) * 50;
    safetyScore -= taxPenalty;
    
    safetyScore = Math.max(0, Math.min(100, Math.round(safetyScore)));
    
    const recommendations: string[] = [];
    if (safetyScore < 50) {
      recommendations.push("Consider increasing guard density or response time to improve safety.");
      recommendations.push("Evaluate reducing PvP penalties or disabling PvP in high-risk areas.");
    }
    if (policy.tax.trade > 0.1 || policy.tax.withdraw > 0.05) {
      recommendations.push("High tax rates may deter players; consider lowering taxes to boost activity.");
    }
    if (policy.access.mode !== "open") {
      recommendations.push("Restricted access modes (e.g., permit/invite) can enhance security but reduce player influx.");
    }
    
    return { policy, safetyScore, recommendations };
  }

  pushBugReport(report: BugReport) {
    this.bugReports.push(report);
    if (this.bugReports.length > 200) this.bugReports.shift();
  }

  // Enhanced method to handle bug reports about NPC visibility and dialogue issues
  processBugReports(): void {
    this.bugReports.forEach(report => {
      const titleLower = report.title.toLowerCase();
      const detailLower = report.detail.toLowerCase();
      
      // Handle NPC visibility issues (e.g., missing NPCs in market)
      if (titleLower.includes("missing npc") || detailLower.includes("market") || detailLower.includes("visible")) {
        const marketRoomId = "market";
        const marketRoom = this.rooms.get(marketRoomId);
        if (!marketRoom) return;
        
        const npcsInMarket = Array.from(this.npcs.values()).filter(npc => npc.location === marketRoomId);
        if (npcsInMarket.length === 0) {
          const defaultNpc: Npc = {
            id: "market-merchant",
            name: "集市商人",
            role: "merchant",
            location: marketRoomId,
            style: "friendly",
            visibleInEcho: false,
            favorBribeCost: 10,
            favorQuestGiver: true,
            reputationAffiliation: "merchant-guild"
          };
          this.upsertNpc(defaultNpc);
          console.log(`Generated NPC ${defaultNpc.id} in ${marketRoomId} due to bug report ${report.id}.`);
        }
      }
      
      // Handle dialogue issues (e.g., NPCs not responding or dialogue broken)
      if (titleLower.includes("dialogue") || detailLower.includes("talk") || detailLower.includes("conversation")) {
        // Ensure all NPCs have basic dialogue memory structure
        Array.from(this.npcs.values()).forEach(npc => {
          if (!npc.memory) {
            npc.memory = {
              lastInteraction: 0,
              dialogueState: {},
              conversationHistory: [],
              questProgress: {},
              playerReputation: 0
            };
            console.log(`Added memory structure to NPC ${npc.id} due to bug report ${report.id}.`);
          }
        });
      }
    });
    
    // Clear processed bug reports to avoid reprocessing
    this.bugReports = [];
  }

  // New method to update NPC details and locations from a snapshot
  updateNpcsFromSnapshot(snapshot: { npcs: Npc[] }): void {
    if (!snapshot?.npcs || !Array.isArray(snapshot.npcs)) return;
    snapshot.npcs.forEach(npc => {
      if (npc.id && npc.name && npc.role) {
        // Validate location exists in rooms
        if (npc.location && !this.rooms.has(npc.location)) {
          console.warn(`NPC ${npc.id} location ${npc.location} not found, setting to default.`);
          npc.location = "square"; // Default to central square
        }
        this.upsertNpc(npc);
      }
    });
    console.log(`Updated ${snapshot.npcs.length} NPCs from snapshot.`);
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