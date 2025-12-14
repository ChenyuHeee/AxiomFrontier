import type { PlayerState, Room, WorldState, Zone } from "../types.js";

export interface RealityWarpEvent {
    id: string;
    zone: Zone;
    name: string;
    description: string;
    durationSec: number;
    trigger: {
        type: "time" | "action" | "random";
        condition?: string;
        cooldownSec: number;
    };
    effects: {
        layoutShift?: boolean;
        gravityModifier?: number; // 0.5 = half gravity, 2.0 = double gravity
        navigationPenalty?: number; // 0-100%
        combatModifiers?: {
            damageMultiplier?: number;
            accuracyPenalty?: number;
            specialAbilities?: string[];
        };
        sensoryCues?: {
            visual: string;
            audio: string;
            smell: string;
            touch: string;
        };
    };
}

export class ZoneMorphologySystem {
    private activeWarps = new Map<string, { event: RealityWarpEvent; expiresAt: number }>();
    private lastTriggerTimes = new Map<string, number>();

    constructor(private world: WorldState) {}

    // Define warp events for different zones
    private readonly warpEvents: RealityWarpEvent[] = [
        {
            id: "ruins-echo-labyrinth",
            zone: "wild",
            name: "回响迷宫",
            description: "废墟区域暂时扭曲为不断变化的迷宫，墙壁移动，重力异常",
            durationSec: 300, // 5 minutes
            trigger: {
                type: "time",
                condition: "hour % 4 === 0", // Every 4 in-game hours
                cooldownSec: 7200 // 2 hours
            },
            effects: {
                layoutShift: true,
                gravityModifier: 0.7,
                navigationPenalty: 40,
                combatModifiers: {
                    damageMultiplier: 1.3,
                    accuracyPenalty: 20,
                    specialAbilities: ["echo-damage", "temporal-displacement"]
                },
                sensoryCues: {
                    visual: "墙壁像液体般流动，重力方向随机变化",
                    audio: "远处传来古老的回声和墙壁摩擦声",
                    smell: "臭氧和古老灰尘的混合气味",
                    touch: "空气粘稠，重力方向不断变化"
                }
            }
        },
        {
            id: "city-temporal-storm",
            zone: "city",
            name: "时间风暴",
            description: "城市区域经历短暂的时间扭曲，NPC行为异常，建筑暂时变化",
            durationSec: 180, // 3 minutes
            trigger: {
                type: "action",
                condition: "player.usesTemporalItem",
                cooldownSec: 3600 // 1 hour
            },
            effects: {
                layoutShift: false,
                gravityModifier: 1.0,
                navigationPenalty: 10,
                combatModifiers: {
                    damageMultiplier: 0.8,
                    accuracyPenalty: 30,
                    specialAbilities: ["time-freeze", "past-echo"]
                },
                sensoryCues: {
                    visual: "建筑轮廓闪烁，NPC动作卡顿重复",
                    audio: "时钟滴答声加速，对话回声重叠",
                    smell: "金属和臭氧的刺鼻气味",
                    touch: "时间流速不稳定的颤动感"
                }
            }
        }
    ];

    checkTriggers(player: PlayerState, currentTime: number): RealityWarpEvent[] {
        const triggered: RealityWarpEvent[] = [];
        const room = this.world.rooms.get(player.location);
        if (!room) return triggered;

        for (const event of this.warpEvents) {
            if (event.zone !== room.zone) continue;
            
            const lastTrigger = this.lastTriggerTimes.get(event.id) || 0;
            const canTrigger = currentTime - lastTrigger >= event.trigger.cooldownSec;
            
            if (!canTrigger) continue;

            let shouldTrigger = false;
            switch (event.trigger.type) {
                case "time":
                    // Simple time-based trigger (in-game hours)
                    const gameHour = Math.floor(currentTime / 3600) % 24;
                    shouldTrigger = eval(event.trigger.condition?.replace("hour", gameHour.toString()) || "false");
                    break;
                case "action":
                    // Action-based trigger (simplified - would need integration with action system)
                    shouldTrigger = Math.random() < 0.1; // 10% chance per check for demo
                    break;
                case "random":
                    shouldTrigger = Math.random() < 0.05; // 5% chance per check
                    break;
            }

            if (shouldTrigger) {
                triggered.push(event);
                this.lastTriggerTimes.set(event.id, currentTime);
                this.activeWarps.set(room.id, { event, expiresAt: currentTime + event.durationSec });
            }
        }

        return triggered;
    }

    getActiveWarp(roomId: string): RealityWarpEvent | null {
        const warp = this.activeWarps.get(roomId);
        if (!warp) return null;
        
        // Clean up expired warps
        if (Date.now() / 1000 > warp.expiresAt) {
            this.activeWarps.delete(roomId);
            return null;
        }
        
        return warp.event;
    }

    applyWarpEffects(player: PlayerState, baseResult: any): any {
        const room = this.world.rooms.get(player.location);
        if (!room) return baseResult;
        
        const warp = this.getActiveWarp(room.id);
        if (!warp) return baseResult;

        const modifiedResult = { ...baseResult };
        
        // Apply navigation penalty
        if (warp.effects.navigationPenalty && modifiedResult.movementCost) {
            modifiedResult.movementCost *= (1 + warp.effects.navigationPenalty / 100);
        }
        
        // Apply combat modifiers
        if (warp.effects.combatModifiers) {
            if (warp.effects.combatModifiers.damageMultiplier && modifiedResult.damage) {
                modifiedResult.damage *= warp.effects.combatModifiers.damageMultiplier;
            }
            if (warp.effects.combatModifiers.accuracyPenalty && modifiedResult.accuracy) {
                modifiedResult.accuracy = Math.max(0, modifiedResult.accuracy - warp.effects.combatModifiers.accuracyPenalty);
            }
        }
        
        // Add sensory cues
        if (warp.effects.sensoryCues && modifiedResult.sensory) {
            modifiedResult.sensory = {
                ...modifiedResult.sensory,
                visual: warp.effects.sensoryCues.visual + " " + (modifiedResult.sensory.visual || ""),
                audio: warp.effects.sensoryCues.audio + " " + (modifiedResult.sensory.audio || ""),
                smell: warp.effects.sensoryCues.smell + " " + (modifiedResult.sensory.smell || ""),
                touch: warp.effects.sensoryCues.touch + " " + (modifiedResult.sensory.touch || "")
            };
        }
        
        return modifiedResult;
    }

    getZoneWarpStatus(zone: Zone): {
        active: boolean;
        event?: RealityWarpEvent;
        timeRemaining?: number;
    } {
        const roomsInZone = Array.from(this.world.rooms.values())
            .filter(r => r.zone === zone);
        
        for (const room of roomsInZone) {
            const warp = this.getActiveWarp(room.id);
            if (warp) {
                const activeWarp = this.activeWarps.get(room.id);
                return {
                    active: true,
                    event: warp,
                    timeRemaining: activeWarp ? Math.max(0, activeWarp.expiresAt - Date.now() / 1000) : 0
                };
            }
        }
        
        return { active: false };
    }
}
