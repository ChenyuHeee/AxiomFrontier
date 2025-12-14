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
    timeRange: [number, number]; // in-game hours 0-23
    location: string;
    activity: string;
}

export interface SpawnCondition {
    type: "time" | "playerPresence" | "event" | "roomCapacity";
    value: any;
}

export interface DespawnCondition {
    type: "time" | "playerAbsence" | "event" | "roomEmpty";
    value: any;
}

export class NpcLifecycleManager {
    private schedules: Map<string, NpcSchedule> = new Map();
    private gameTime: number = 0; // in-game hours, updated externally

    constructor() {}

    setGameTime(hours: number) {
        this.gameTime = hours % 24;
    }

    registerNpcSchedule(npc: Npc, routine: DailyRoutine[], spawnConditions: SpawnCondition[], despawnConditions: DespawnCondition[]) {
        this.schedules.set(npc.id, {
            npcId: npc.id,
            routine,
            spawnConditions,
            despawnConditions,
            lastSeen: Date.now(),
            spawnCooldown: 0
        });
    }

    updateSchedules(world: { rooms: Map<string, Room>, npcs: Map<string, Npc>, players: Map<string, PlayerState>, events: WorldEvent[] }) {
        for (const [npcId, schedule] of this.schedules) {
            const npc = world.npcs.get(npcId);
            const currentLocation = npc?.location;
            const room = currentLocation ? world.rooms.get(currentLocation) ?? null : null;
            const playersInRoom = room ? Array.from(world.players.values()).filter(p => p.location === currentLocation).length : 0;
            const recentEvents = world.events.filter(e => e.ts > Date.now() - 3600000); // events in last hour

            // Check despawn conditions
            let shouldDespawn = false;
            for (const condition of schedule.despawnConditions) {
                    if (this.evaluateDespawnCondition(condition, { gameTime: this.gameTime, playersInRoom, recentEvents, room })) {
                    shouldDespawn = true;
                    break;
                }
            }
            if (shouldDespawn && npc) {
                world.npcs.delete(npcId);
                schedule.lastSeen = Date.now();
                schedule.spawnCooldown = 300000; // 5-minute cooldown
                continue;
            }

            // Check spawn conditions if NPC is not present
            if (!npc && schedule.spawnCooldown <= 0) {
                let shouldSpawn = false;
                for (const condition of schedule.spawnConditions) {
                    if (this.evaluateSpawnCondition(condition, { gameTime: this.gameTime, playersInRoom, recentEvents, room })) {
                        shouldSpawn = true;
                        break;
                    }
                }
                if (shouldSpawn) {
                    const targetLocation = this.getTargetLocation(schedule);
                    if (targetLocation && world.rooms.has(targetLocation)) {
                        const newNpc: Npc = {
                            id: npcId,
                            name: "Generated NPC",
                            role: "citizen",
                            location: targetLocation,
                            style: "neutral"
                        };
                        world.npcs.set(npcId, newNpc);
                        schedule.lastSeen = Date.now();
                    }
                }
            }

            // Update routine location
            if (npc) {
                const targetLocation = this.getTargetLocation(schedule);
                if (targetLocation && targetLocation !== npc.location && world.rooms.has(targetLocation)) {
                    npc.location = targetLocation;
                }
            }

            // Decrease cooldown
            if (schedule.spawnCooldown > 0) {
                schedule.spawnCooldown -= 60000; // decrease by 1 minute per update
            }
        }
    }

    private evaluateSpawnCondition(condition: SpawnCondition, context: { gameTime: number, playersInRoom: number, recentEvents: WorldEvent[], room: Room | null }): boolean {
        switch (condition.type) {
            case "time":
                const [start, end] = condition.value as [number, number];
                return context.gameTime >= start && context.gameTime <= end;
            case "playerPresence":
                return context.playersInRoom >= (condition.value as number);
            case "event":
                return context.recentEvents.some(e => e.title.includes(condition.value as string));
            case "roomCapacity":
                return !!context.room && context.playersInRoom < (condition.value as number);
            default:
                return false;
        }
    }

    private evaluateDespawnCondition(condition: DespawnCondition, context: { gameTime: number, playersInRoom: number, recentEvents: WorldEvent[], room: Room | null }): boolean {
        switch (condition.type) {
            case "time":
                const [start, end] = condition.value as [number, number];
                return context.gameTime < start || context.gameTime > end;
            case "playerAbsence":
                return context.playersInRoom === 0;
            case "event":
                return context.recentEvents.some(e => e.title.includes(condition.value as string));
            case "roomEmpty":
                return !!context.room && context.playersInRoom === 0;
            default:
                return false;
        }
    }

    private getTargetLocation(schedule: NpcSchedule): string | null {
        for (const routine of schedule.routine) {
            if (this.gameTime >= routine.timeRange[0] && this.gameTime <= routine.timeRange[1]) {
                return routine.location;
            }
        }
        return null;
    }

    getSchedule(npcId: string): NpcSchedule | undefined {
        return this.schedules.get(npcId);
    }

    clearSchedule(npcId: string) {
        this.schedules.delete(npcId);
    }
}

export function initializeDefaultSchedules(manager: NpcLifecycleManager) {
    // Example: Market merchant spawns during daytime with players present
    manager.registerNpcSchedule(
        { id: "market-merchant", name: "Merchant", role: "merchant" } as Npc,
        [
            { timeRange: [6, 18], location: "market", activity: "selling" }
        ],
        [
            { type: "time", value: [6, 18] },
            { type: "playerPresence", value: 1 }
        ],
        [
            { type: "time", value: [18, 6] },
            { type: "playerAbsence", value: 0 }
        ]
    );
}
