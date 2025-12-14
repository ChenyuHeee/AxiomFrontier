import type { Npc, Room, WorldEvent, PlayerState, City } from "../types.js";

export interface NpcSchedule {
    npcId: string;
    routine: DailyRoutine[];
    spawnConditions: SpawnCondition[];
    despawnConditions: DespawnCondition[];
    lastSeen: number;
    spawnCooldown: number;
}

export interface DailyRoutine {
    timeRange: [number, number]; // in-game hours (0-23)
    location?: string;
    activity: string;
}

export interface SpawnCondition {
    type: "time" | "playerPresence" | "event" | "roomCapacity";
    value: any;
    required: boolean;
}

export interface DespawnCondition {
    type: "time" | "playerAbsence" | "event" | "roomEmpty";
    value: any;
    required: boolean;
}

export class NpcLifecycleSystem {
    private schedules: Map<string, NpcSchedule> = new Map();
    private gameTime: number = 0; // in-game hours
    
    constructor(private world: { rooms: Map<string, Room>; npcs: Map<string, Npc>; players: Map<string, PlayerState>; events: WorldEvent[] }) {}
    
    updateGameTime(currentHour: number) {
        this.gameTime = currentHour % 24;
    }
    
    registerSchedule(schedule: NpcSchedule) {
        this.schedules.set(schedule.npcId, schedule);
    }
    
    evaluateSpawnConditions(npcId: string): boolean {
        const schedule = this.schedules.get(npcId);
        if (!schedule) return false;
        
        // Check spawn cooldown
        if (Date.now() - schedule.lastSeen < schedule.spawnCooldown) {
            return false;
        }
        
        // Evaluate all spawn conditions
        for (const condition of schedule.spawnConditions) {
            if (!this.evaluateCondition(condition)) {
                if (condition.required) return false;
            }
        }
        return true;
    }
    
    evaluateDespawnConditions(npcId: string): boolean {
        const schedule = this.schedules.get(npcId);
        if (!schedule) return false;
        
        // Evaluate all despawn conditions
        for (const condition of schedule.despawnConditions) {
            if (this.evaluateCondition(condition)) {
                if (condition.required) return true;
            }
        }
        return false;
    }
    
    private evaluateCondition(condition: SpawnCondition | DespawnCondition): boolean {
        switch (condition.type) {
            case "time":
                const [start, end] = condition.value as [number, number];
                return this.isTimeInRange(start, end);
                
            case "playerPresence":
                const roomId = condition.value as string;
                return this.hasPlayersInRoom(roomId);
                
            case "playerAbsence":
                const roomIdAbs = condition.value as string;
                return !this.hasPlayersInRoom(roomIdAbs);
                
            case "event":
                const eventType = condition.value as string;
                return this.hasActiveEvent(eventType);
                
            case "roomCapacity":
                const { roomId: capRoomId, maxNpcs } = condition.value as { roomId: string; maxNpcs: number };
                return this.getNpcCountInRoom(capRoomId) < maxNpcs;
                
            case "roomEmpty":
                const emptyRoomId = condition.value as string;
                return this.getNpcCountInRoom(emptyRoomId) === 0;
                
            default:
                return false;
        }
    }
    
    private isTimeInRange(start: number, end: number): boolean {
        if (start <= end) {
            return this.gameTime >= start && this.gameTime < end;
        } else {
            return this.gameTime >= start || this.gameTime < end;
        }
    }
    
    private hasPlayersInRoom(roomId: string): boolean {
        return Array.from(this.world.players.values()).some(player => player.location === roomId);
    }
    
    private hasActiveEvent(eventType: string): boolean {
        const recentEvents = this.world.events.filter(e => 
            Date.now() - e.ts < 3600000 && // events from last hour
            e.title.toLowerCase().includes(eventType.toLowerCase())
        );
        return recentEvents.length > 0;
    }
    
    private getNpcCountInRoom(roomId: string): number {
        return Array.from(this.world.npcs.values()).filter(npc => npc.location === roomId).length;
    }
    
    getCurrentRoutineLocation(npcId: string): string | null {
        const schedule = this.schedules.get(npcId);
        if (!schedule) return null;
        
        for (const routine of schedule.routine) {
            const loc = routine.location;
            if (!loc) continue;
            if (this.isTimeInRange(routine.timeRange[0], routine.timeRange[1])) {
                return loc;
            }
        }
        return null;
    }
    
    updateNpcLocations() {
        for (const [npcId, schedule] of this.schedules) {
            const npc = this.world.npcs.get(npcId);
            if (!npc) continue;
            
            // Check if NPC should spawn
            if (!npc.location && this.evaluateSpawnConditions(npcId)) {
                const targetLocation = this.getCurrentRoutineLocation(npcId);
                if (targetLocation && this.world.rooms.has(targetLocation)) {
                    npc.location = targetLocation;
                    schedule.lastSeen = Date.now();
                }
            }
            
            // Check if NPC should despawn
            if (npc.location && this.evaluateDespawnConditions(npcId)) {
                npc.location = undefined;
            }
            
            // Update location based on routine
            if (npc.location) {
                const targetLocation = this.getCurrentRoutineLocation(npcId);
                if (targetLocation && targetLocation !== npc.location && this.world.rooms.has(targetLocation)) {
                    npc.location = targetLocation;
                }
            }
        }
    }
    
    // Market-specific spawn logic to address bug reports
    ensureMarketNpcs() {
        const marketRoomId = "market";
        const marketRoom = this.world.rooms.get(marketRoomId);
        if (!marketRoom) return;
        
        // Check if market needs NPCs during business hours
        const isBusinessHours = this.gameTime >= 8 && this.gameTime < 18;
        const hasPlayers = this.hasPlayersInRoom(marketRoomId);
        
        if (isBusinessHours && hasPlayers && this.getNpcCountInRoom(marketRoomId) === 0) {
            // Spawn default market merchant
            const merchantNpc: Npc = {
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
            
            this.world.npcs.set(merchantNpc.id, merchantNpc);
            
            // Register schedule for this NPC
            this.registerSchedule({
                npcId: merchantNpc.id,
                routine: [
                    { timeRange: [8, 18], location: marketRoomId, activity: "selling goods" },
                    { timeRange: [18, 8], location: undefined, activity: "resting" }
                ],
                spawnConditions: [
                    { type: "time", value: [8, 18], required: true },
                    { type: "playerPresence", value: marketRoomId, required: false },
                    { type: "roomCapacity", value: { roomId: marketRoomId, maxNpcs: 5 }, required: false }
                ],
                despawnConditions: [
                    { type: "time", value: [18, 8], required: true },
                    { type: "playerAbsence", value: marketRoomId, required: false }
                ],
                lastSeen: Date.now(),
                spawnCooldown: 300000 // 5 minutes
            });
        }
    }
}

export function createDefaultSchedules(): NpcSchedule[] {
    return [
        {
            npcId: "market-merchant",
            routine: [
                { timeRange: [8, 12], location: "market", activity: "morning sales" },
                { timeRange: [12, 14], location: "market", activity: "lunch break" },
                { timeRange: [14, 18], location: "market", activity: "afternoon sales" },
                { timeRange: [18, 8], location: undefined, activity: "closed" }
            ],
            spawnConditions: [
                { type: "time", value: [8, 18], required: true },
                { type: "playerPresence", value: "market", required: false }
            ],
            despawnConditions: [
                { type: "time", value: [18, 8], required: true },
                { type: "playerAbsence", value: "market", required: false }
            ],
            lastSeen: 0,
            spawnCooldown: 300000
        },
        {
            npcId: "guard-north",
            routine: [
                { timeRange: [0, 8], location: "north_gate", activity: "night watch" },
                { timeRange: [8, 16], location: "square", activity: "day patrol" },
                { timeRange: [16, 24], location: "north_gate", activity: "evening watch" }
            ],
            spawnConditions: [
                { type: "time", value: [0, 24], required: true },
                { type: "roomCapacity", value: { roomId: "north_gate", maxNpcs: 2 }, required: false }
            ],
            despawnConditions: [
                { type: "roomEmpty", value: "north_gate", required: false }
            ],
            lastSeen: 0,
            spawnCooldown: 60000
        }
    ];
}
