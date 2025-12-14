import type { PlayerState, Room, WorldState } from "../types.js";

export interface EchoItem {
    id: string;
    name: string;
    temporalProperty: string;
    memoryInfusion: string[];
    durability: number;
    power: number;
}

export interface EchoHarvest {
    zone: string;
    requiredTool?: string;
    cooldownSec: number;
    successRate: number;
    echoTypes: string[];
}

export class TemporalCraftingSystem {
    private static readonly HARVEST_RULES: Map<string, EchoHarvest> = new Map([
        [
            "ruins",
            {
                zone: "wild",
                requiredTool: "chrono-scanner",
                cooldownSec: 3600,
                successRate: 0.7,
                echoTypes: ["memory-fragment", "time-shard", "ghost-imprint"]
            }
        ],
        [
            "ancient-temple",
            {
                zone: "wild",
                requiredTool: "resonance-amplifier",
                cooldownSec: 7200,
                successRate: 0.5,
                echoTypes: ["divine-echo", "ritual-residue", "prophetic-whisper"]
            }
        ]
    ]);

    private static readonly CRAFTING_RECIPES: Map<string, EchoItem> = new Map([
        [
            "memory-infused-helmet",
            {
                id: "memory-infused-helmet",
                name: "记忆灌注头盔",
                temporalProperty: "precognition",
                memoryInfusion: ["memory-fragment", "ghost-imprint"],
                durability: 85,
                power: 25
            }
        ],
        [
            "time-warp-boots",
            {
                id: "time-warp-boots",
                name: "时间扭曲靴",
                temporalProperty: "phase-shift",
                memoryInfusion: ["time-shard", "ritual-residue"],
                durability: 70,
                power: 40
            }
        ]
    ]);

    static canHarvest(player: PlayerState, room: Room): boolean {
        const rule = this.HARVEST_RULES.get(room.id);
        if (!rule) return false;
        
        // Check if player has required tool
        if (rule.requiredTool && !player.inventory.includes(rule.requiredTool)) {
            return false;
        }
        
        // Check zone compatibility
        return room.zone === rule.zone;
    }

    static attemptHarvest(player: PlayerState, room: Room): {
        success: boolean;
        echoType?: string;
        message: string;
    } {
        const rule = this.HARVEST_RULES.get(room.id);
        if (!rule) {
            return { success: false, message: "此地无法收集时间回响。" };
        }

        if (!this.canHarvest(player, room)) {
            return { success: false, message: "缺乏必要工具或区域不匹配。" };
        }

        const success = Math.random() < rule.successRate;
        if (success) {
            const echoType = rule.echoTypes[Math.floor(Math.random() * rule.echoTypes.length)];
            player.inventory.push(echoType);
            return {
                success: true,
                echoType,
                message: `成功收集到 ${echoType}！时间回响在物品栏中闪烁。`
            };
        }

        return {
            success: false,
            message: "时间回响过于微弱，未能成功捕捉。"
        };
    }

    static canCraftItem(itemId: string, player: PlayerState): boolean {
        const recipe = this.CRAFTING_RECIPES.get(itemId);
        if (!recipe) return false;

        // Check if player has all required memory infusions
        return recipe.memoryInfusion.every(material => 
            player.inventory.includes(material)
        );
    }

    static craftItem(itemId: string, player: PlayerState): {
        success: boolean;
        item?: EchoItem;
        message: string;
    } {
        const recipe = this.CRAFTING_RECIPES.get(itemId);
        if (!recipe) {
            return { success: false, message: "未知的时空物品配方。" };
        }

        if (!this.canCraftItem(itemId, player)) {
            return { success: false, message: "缺乏必要的记忆灌注材料。" };
        }

        // Consume materials
        recipe.memoryInfusion.forEach(material => {
            const index = player.inventory.indexOf(material);
            if (index > -1) player.inventory.splice(index, 1);
        });

        // Add crafted item
        player.inventory.push(itemId);
        
        return {
            success: true,
            item: recipe,
            message: `成功制作 ${recipe.name}！物品散发出 ${recipe.temporalProperty} 的时空属性。`
        };
    }

    static getAvailableRecipes(player: PlayerState): EchoItem[] {
        return Array.from(this.CRAFTING_RECIPES.values()).filter(recipe => 
            this.canCraftItem(recipe.id, player)
        );
    }

    static getHarvestableRooms(world: WorldState): Room[] {
        return Array.from(world.rooms.values()).filter(room => 
            this.HARVEST_RULES.has(room.id)
        );
    }
}
