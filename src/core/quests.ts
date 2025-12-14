import type { PlayerState, Room, WorldState, Npc, WorldEvent, Zone } from "../types.js";

export interface TemporalEchoQuest {
    id: string;
    title: string;
    description: string;
    npcId: string;
    zone: Zone;
    requiredEchoLevel: number;
    steps: QuestStep[];
    rewards: QuestReward;
    unlocks: string[];
    visibleInEcho?: boolean;
}

export interface QuestStep {
    id: string;
    type: "talk" | "explore" | "collect" | "trigger" | "policy" | "unlock";
    target: string;
    description: string;
    echoReveal?: {
        npcIds?: string[];
        eventIds?: string[];
        requiredProgress: number;
    };
}

export interface QuestReward {
    credits: number;
    items: string[];
    reputation: { factionId: string; amount: number }[];
    echoProgress: number;
    unlocks: string[];
}

export interface PlayerQuestProgress {
    playerId: string;
    activeQuests: string[];
    completedQuests: string[];
    stepProgress: Map<string, number>;
    echoTriggers: Map<string, number>;
}

export class QuestEngine {
    private quests = new Map<string, TemporalEchoQuest>();
    private playerProgress = new Map<string, PlayerQuestProgress>();

    constructor() {
        this.initializeDefaultQuests();
    }

    private initializeDefaultQuests() {
        // Ulric's Past Quest
        this.quests.set("ulric-past", {
            id: "ulric-past",
            title: "Ulric's Forgotten Legacy",
            description: "Help Ulric uncover his past in the ruins by interacting with temporal echoes.",
            npcId: "ulric",
            zone: "wild",
            requiredEchoLevel: 1,
            steps: [
                {
                    id: "talk-ulric",
                    type: "talk",
                    target: "ulric",
                    description: "Speak with Ulric in the ruins to learn about his past."
                },
                {
                    id: "explore-ruins",
                    type: "explore",
                    target: "ruins",
                    description: "Explore the ruins to find temporal echoes of Ulric's memories.",
                    echoReveal: {
                        npcIds: ["ulric"],
                        requiredProgress: 2
                    }
                },
                {
                    id: "trigger-echo",
                    type: "trigger",
                    target: "echo-ulric-memory",
                    description: "Trigger the temporal echo to reveal hidden events."
                },
                {
                    id: "policy-change",
                    type: "policy",
                    target: "bastion",
                    description: "Influence city policies based on uncovered past events."
                },
                {
                    id: "unlock-area",
                    type: "unlock",
                    target: "hidden-crypt",
                    description: "Unlock a hidden area in the ruins using echo insights."
                }
            ],
            rewards: {
                credits: 500,
                items: ["echo-amulet"],
                reputation: [{ factionId: "historians", amount: 50 }],
                echoProgress: 3,
                unlocks: ["hidden-crypt", "echo-crafting-recipes"]
            },
            unlocks: ["elara-secrets", "ruin-exploration"]
        });

        // Elara's Secrets Quest
        this.quests.set("elara-secrets", {
            id: "elara-secrets",
            title: "Elara's Hidden Truths",
            description: "Assist Elara in uncovering secret events that alter city dynamics.",
            npcId: "elara",
            zone: "city",
            requiredEchoLevel: 2,
            steps: [
                {
                    id: "talk-elara",
                    type: "talk",
                    target: "elara",
                    description: "Converse with Elara about mysterious city policies."
                },
                {
                    id: "collect-evidence",
                    type: "collect",
                    target: "policy-documents",
                    description: "Gather evidence from temporal echoes in city zones."
                },
                {
                    id: "trigger-policy",
                    type: "trigger",
                    target: "policy-revelation",
                    description: "Trigger an echo that reveals hidden policy changes."
                }
            ],
            rewards: {
                credits: 300,
                items: ["memory-fragment"],
                reputation: [{ factionId: "city-council", amount: 30 }],
                echoProgress: 2,
                unlocks: ["policy-influence"]
            },
            unlocks: ["advanced-echo-quests"]
        });
    }

    startQuest(playerId: string, questId: string): boolean {
        const quest = this.quests.get(questId);
        if (!quest) return false;

        const player = this.getPlayerProgress(playerId);
        if (player.activeQuests.includes(questId) || player.completedQuests.includes(questId)) {
            return false;
        }

        player.activeQuests.push(questId);
        player.stepProgress.set(questId, 0);
        return true;
    }

    advanceQuest(playerId: string, questId: string, stepIndex: number): boolean {
        const quest = this.quests.get(questId);
        if (!quest) return false;

        const player = this.getPlayerProgress(playerId);
        if (!player.activeQuests.includes(questId)) return false;

        if (stepIndex >= quest.steps.length) {
            this.completeQuest(playerId, questId);
            return true;
        }

        player.stepProgress.set(questId, stepIndex);
        return true;
    }

    completeQuest(playerId: string, questId: string): boolean {
        const quest = this.quests.get(questId);
        if (!quest) return false;

        const player = this.getPlayerProgress(playerId);
        const index = player.activeQuests.indexOf(questId);
        if (index === -1) return false;

        player.activeQuests.splice(index, 1);
        player.completedQuests.push(questId);
        player.stepProgress.delete(questId);

        // Apply rewards
        this.applyRewards(playerId, quest.rewards);
        return true;
    }

    private applyRewards(playerId: string, rewards: QuestReward) {
        // Implementation would integrate with player state, economy, and faction systems
        // This is a placeholder for the reward application logic
        console.log(`Applying rewards to player ${playerId}:`, rewards);
    }

    getAvailableQuests(playerId: string, npcId: string, zone: Zone, echoLevel: number): TemporalEchoQuest[] {
        return Array.from(this.quests.values()).filter(quest => 
            quest.npcId === npcId && 
            quest.zone === zone && 
            quest.requiredEchoLevel <= echoLevel &&
            !this.getPlayerProgress(playerId).completedQuests.includes(quest.id) &&
            !this.getPlayerProgress(playerId).activeQuests.includes(quest.id)
        );
    }

    triggerEcho(playerId: string, questId: string, echoType: string): boolean {
        const player = this.getPlayerProgress(playerId);
        const currentCount = player.echoTriggers.get(echoType) || 0;
        player.echoTriggers.set(echoType, currentCount + 1);
        return true;
    }

    getPlayerProgress(playerId: string): PlayerQuestProgress {
        if (!this.playerProgress.has(playerId)) {
            this.playerProgress.set(playerId, {
                playerId,
                activeQuests: [],
                completedQuests: [],
                stepProgress: new Map(),
                echoTriggers: new Map()
            });
        }
        return this.playerProgress.get(playerId)!;
    }

    getQuest(questId: string): TemporalEchoQuest | undefined {
        return this.quests.get(questId);
    }

    addQuest(quest: TemporalEchoQuest) {
        this.quests.set(quest.id, quest);
    }
}

export const questEngine = new QuestEngine();