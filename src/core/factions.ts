import type { City, CityPolicy, Npc, PlayerState, Room, Zone } from "../types.js";

export interface Faction {
    id: string;
    name: string;
    description: string;
    primaryCityId: string;
    influence: number; // 0-100
    aggression: number; // 0-100
    goals: string[];
}

export interface PlayerReputation {
    playerId: string;
    factionId: string;
    reputation: number; // -100 to 100
    lastInteraction: number;
}

export interface ZoneControl {
    zoneId: string;
    controllingFactionId: string | null;
    contested: boolean;
    influence: Map<string, number>; // factionId -> influence (0-100)
}

export interface CityPolicyInfluence {
    factionId: string;
    policyWeight: number; // 0-1 multiplier on policy decisions
    priorityAreas: (keyof CityPolicy)[];
}

export class FactionSystem {
    private factions = new Map<string, Faction>();
    private playerReputations = new Map<string, PlayerReputation[]>();
    private zoneControls = new Map<string, ZoneControl>();
    private cityPolicyInfluences = new Map<string, CityPolicyInfluence[]>();
    private conflictEvents: Array<{factionA: string, factionB: string, intensity: number, timestamp: number}> = [];

    constructor() {
        this.initializeDefaultFactions();
    }

    private initializeDefaultFactions() {
        const defaultFactions: Faction[] = [
            {
                id: "merchant-guild",
                name: "商人行会",
                description: "控制贸易路线和市场的商业联盟",
                primaryCityId: "bastion",
                influence: 70,
                aggression: 20,
                goals: ["降低贸易税", "增加安全区域", "扩大市场控制"]
            },
            {
                id: "shadow-cabal",
                name: "暗影密会",
                description: "地下犯罪和情报网络",
                primaryCityId: "bastion",
                influence: 40,
                aggression: 80,
                goals: ["削弱守卫力量", "增加PVP区域", "控制黑市"]
            },
            {
                id: "guard-corps",
                name: "守卫军团",
                description: "城市治安和防御力量",
                primaryCityId: "bastion",
                influence: 60,
                aggression: 30,
                goals: ["提高安全等级", "增加守卫密度", "减少犯罪活动"]
            }
        ];

        defaultFactions.forEach(faction => this.factions.set(faction.id, faction));
    }

    getFaction(factionId: string): Faction | undefined {
        return this.factions.get(factionId);
    }

    getAllFactions(): Faction[] {
        return Array.from(this.factions.values());
    }

    getPlayerReputation(playerId: string, factionId: string): number {
        const reps = this.playerReputations.get(playerId) || [];
        const rep = reps.find(r => r.factionId === factionId);
        return rep?.reputation || 0;
    }

    updatePlayerReputation(playerId: string, factionId: string, delta: number, actionType: string) {
        let reps = this.playerReputations.get(playerId) || [];
        let rep = reps.find(r => r.factionId === factionId);
        
        if (!rep) {
            rep = {
                playerId,
                factionId,
                reputation: 0,
                lastInteraction: Date.now()
            };
            reps.push(rep);
        }
        
        // Adjust delta based on action type
        const adjustedDelta = this.calculateReputationDelta(delta, actionType, factionId);
        rep.reputation = Math.max(-100, Math.min(100, rep.reputation + adjustedDelta));
        rep.lastInteraction = Date.now();
        
        this.playerReputations.set(playerId, reps);
        
        // Trigger faction reactions
        this.triggerFactionReaction(factionId, playerId, adjustedDelta, actionType);
        
        // Update zone influence based on player actions
        this.updateZoneInfluenceFromPlayerAction(playerId, factionId, adjustedDelta);
    }

    private calculateReputationDelta(baseDelta: number, actionType: string, factionId: string): number {
        const faction = this.factions.get(factionId);
        if (!faction) return baseDelta;
        
        let multiplier = 1.0;
        
        // Action type modifiers
        switch (actionType) {
            case "trade": multiplier = 0.5; break;
            case "attack": multiplier = 2.0; break;
            case "quest": multiplier = 1.5; break;
            case "theft": multiplier = -1.5; break;
            case "bribe": multiplier = 0.8; break;
        }
        
        // Faction aggression modifier
        multiplier *= (1 + (faction.aggression / 100));
        
        return Math.round(baseDelta * multiplier);
    }

    getZoneControl(zoneId: string): ZoneControl {
        if (!this.zoneControls.has(zoneId)) {
            this.zoneControls.set(zoneId, {
                zoneId,
                controllingFactionId: null,
                contested: false,
                influence: new Map()
            });
        }
        return this.zoneControls.get(zoneId)!;
    }

    updateZoneInfluence(zoneId: string, factionId: string, delta: number) {
        const zoneControl = this.getZoneControl(zoneId);
        const current = zoneControl.influence.get(factionId) || 0;
        const newInfluence = Math.max(0, Math.min(100, current + delta));
        
        zoneControl.influence.set(factionId, newInfluence);
        
        // Check for control changes
        this.updateZoneControlStatus(zoneId);
        
        // Check for conflicts
        this.checkZoneConflicts(zoneId);
    }

    private updateZoneControlStatus(zoneId: string) {
        const zoneControl = this.getZoneControl(zoneId);
        const influences = Array.from(zoneControl.influence.entries());
        
        if (influences.length === 0) {
            zoneControl.controllingFactionId = null;
            zoneControl.contested = false;
            return;
        }
        
        // Find faction with highest influence
        influences.sort((a, b) => b[1] - a[1]);
        const [topFaction, topInfluence] = influences[0];
        
        // Check if contested (multiple factions close in influence)
        if (influences.length > 1) {
            const [secondFaction, secondInfluence] = influences[1];
            zoneControl.contested = Math.abs(topInfluence - secondInfluence) < 20;
        } else {
            zoneControl.contested = false;
        }
        
        // Only control if influence is significant
        if (topInfluence >= 60 && !zoneControl.contested) {
            zoneControl.controllingFactionId = topFaction;
        } else {
            zoneControl.controllingFactionId = null;
        }
    }

    private updateZoneInfluenceFromPlayerAction(playerId: string, factionId: string, reputationDelta: number) {
        // Player actions in zones affect faction influence there
        // This would integrate with player location from game engine
        // For now, placeholder implementation
        const playerRep = this.getPlayerReputation(playerId, factionId);
        if (Math.abs(reputationDelta) > 10) {
            // Significant reputation change affects nearby zones
            // In full implementation, this would use player's current location
        }
    }

    getCityPolicyInfluence(cityId: string): CityPolicyInfluence[] {
        return this.cityPolicyInfluences.get(cityId) || [];
    }

    updateCityPolicyInfluence(cityId: string, factionId: string, weightDelta: number) {
        let influences = this.cityPolicyInfluences.get(cityId) || [];
        let influence = influences.find(i => i.factionId === factionId);
        
        if (!influence) {
            influence = {
                factionId,
                policyWeight: 0.3, // Default starting weight
                priorityAreas: []
            };
            influences.push(influence);
        }
        
        influence.policyWeight = Math.max(0, Math.min(1, influence.policyWeight + weightDelta));
        this.cityPolicyInfluences.set(cityId, influences);
    }

    calculateCityPolicy(city: City, basePolicy: CityPolicy): CityPolicy {
        const influences = this.getCityPolicyInfluence(city.id);
        if (influences.length === 0) return basePolicy;
        
        const modifiedPolicy = { ...basePolicy };
        
        // Apply faction influences weighted by their policyWeight
        influences.forEach(influence => {
            const faction = this.factions.get(influence.factionId);
            if (!faction) return;
            
            const weight = influence.policyWeight;
            
            // Modify policy based on faction goals
            if (faction.goals.includes("降低贸易税")) {
                modifiedPolicy.tax.trade = Math.max(0, modifiedPolicy.tax.trade - (0.02 * weight));
            }
            if (faction.goals.includes("提高安全等级")) {
                modifiedPolicy.safetyLevel = Math.min(1, modifiedPolicy.safetyLevel + (0.1 * weight));
            }
            if (faction.goals.includes("增加守卫密度")) {
                if (modifiedPolicy.guards.density === "low") modifiedPolicy.guards.density = "med";
                else if (modifiedPolicy.guards.density === "med") modifiedPolicy.guards.density = "high";
            }
            if (faction.goals.includes("增加PVP区域")) {
                modifiedPolicy.pvp.on = true;
                modifiedPolicy.pvp.penalty = "fine";
            }
        });
        
        return modifiedPolicy;
    }

    getNPCAllegiance(npc: Npc): string | null {
        // NPCs can belong to factions based on their role and location
        // Simple implementation - in full version, NPCs would have factionId property
        if (npc.role.includes("商人") || npc.role.includes("merchant")) {
            return "merchant-guild";
        }
        if (npc.role.includes("守卫") || npc.role.includes("guard")) {
            return "guard-corps";
        }
        if (npc.role.includes("盗贼") || npc.role.includes("thief")) {
            return "shadow-cabal";
        }
        return null;
    }

    canPlayerAccess(playerId: string, location: Room, requiredReputation: number = 0): boolean {
        const zoneControl = this.getZoneControl(location.id);
        
        // Check zone control access
        if (zoneControl.controllingFactionId) {
            const rep = this.getPlayerReputation(playerId, zoneControl.controllingFactionId);
            if (rep < requiredReputation) {
                return false;
            }
        }
        
        // Check city faction access
        if (location.cityId) {
            const cityInfluences = this.getCityPolicyInfluence(location.cityId);
            for (const influence of cityInfluences) {
                if (influence.policyWeight > 0.7) {
                    const rep = this.getPlayerReputation(playerId, influence.factionId);
                    if (rep < -50) { // Hostile reputation blocks access
                        return false;
                    }
                }
            }
        }
        
        return true;
    }

    private triggerFactionReaction(factionId: string, playerId: string, delta: number, actionType: string) {
        const faction = this.factions.get(factionId);
        if (!faction) return;
        
        // Significant negative reputation changes can trigger hostile actions
        if (delta < -20) {
            // Could trigger: bounty placement, NPC hostility, restricted access
            this.recordConflict(factionId, "player", Math.abs(delta) / 10);
        }
        
        // Significant positive changes can trigger benefits
        if (delta > 20) {
            // Could trigger: discounts, quest offers, special access
        }
    }

    private checkZoneConflicts(zoneId: string) {
        const zoneControl = this.getZoneControl(zoneId);
        if (!zoneControl.contested) return;
        
        const influences = Array.from(zoneControl.influence.entries());
        if (influences.length < 2) return;
        
        influences.sort((a, b) => b[1] - a[1]);
        const [factionA, influenceA] = influences[0];
        const [factionB, influenceB] = influences[1];
        
        // Conflict intensity based on influence difference and faction aggression
        if (Math.abs(influenceA - influenceB) < 15) {
            const factionAObj = this.factions.get(factionA);
            const factionBObj = this.factions.get(factionB);
            
            if (factionAObj && factionBObj) {
                const intensity = (factionAObj.aggression + factionBObj.aggression) / 200;
                this.recordConflict(factionA, factionB, intensity);
                
                // Conflict affects zone influence
                this.updateZoneInfluence(zoneId, factionA, -5);
                this.updateZoneInfluence(zoneId, factionB, -5);
            }
        }
    }

    private recordConflict(factionA: string, factionB: string, intensity: number) {
        this.conflictEvents.push({
            factionA,
            factionB,
            intensity,
            timestamp: Date.now()
        });
        
        // Keep only recent conflicts
        if (this.conflictEvents.length > 50) {
            this.conflictEvents.shift();
        }
    }

    getRecentConflicts(): Array<{factionA: string, factionB: string, intensity: number, timestamp: number}> {
        return [...this.conflictEvents].reverse();
    }

    getEmergentEvents(): Array<{title: string, detail: string, factionId?: string}> {
        const events: Array<{title: string, detail: string, factionId?: string}> = [];
        
        // Check for significant reputation changes
        // Check for zone control changes
        // Check for faction conflicts
        
        const recentConflicts = this.getRecentConflicts();
        if (recentConflicts.length > 0) {
            const latest = recentConflicts[0];
            if (latest.intensity > 0.7) {
                const factionA = this.factions.get(latest.factionA);
                const factionB = this.factions.get(latest.factionB);
                if (factionA && factionB) {
                    events.push({
                        title: "派系冲突升级",
                        detail: `${factionA.name}与${factionB.name}之间的紧张局势升级，可能导致区域不稳定。`,
                        factionId: latest.factionA
                    });
                }
            }
        }
        
        // Check for zone control changes
        for (const [zoneId, zoneControl] of this.zoneControls) {
            if (zoneControl.controllingFactionId && zoneControl.influence.size > 0) {
                const influences = Array.from(zoneControl.influence.entries());
                influences.sort((a, b) => b[1] - a[1]);
                
                if (influences[0][1] > 80) {
                    const faction = this.factions.get(influences[0][0]);
                    if (faction) {
                        events.push({
                            title: "区域控制巩固",
                            detail: `${faction.name}巩固了对${zoneId}区域的控制。`,
                            factionId: faction.id
                        });
                    }
                }
            }
        }
        
        return events;
    }
}
