import type { Npc, WorldEvent, PlayerState, Room, City } from "../types.js";

export interface MarketItem {
    id: string;
    name: string;
    basePrice: number;
    currentPrice: number;
    supply: number; // Available quantity
    demand: number; // 0-1 scale
    volatility: number; // 0-1 scale for price fluctuations
    category: "resource" | "crafted" | "consumable" | "luxury";
    restockRate: number; // Items per tick
    maxStock: number;
}

export interface TraderInventory {
    traderId: string;
    location: string;
    items: Map<string, MarketItem>;
    buyMultiplier: number; // 0.5-1.5
    sellMultiplier: number; // 0.5-1.5
    restockCooldown: number;
    lastUpdate: number;
}

export interface EconomicEvent {
    id: string;
    type: "supply-shock" | "demand-spike" | "market-crash" | "trade-boom";
    affectedItems: string[];
    multiplier: number; // Price/supply multiplier
    duration: number; // Ticks
    remaining: number;
}

export class EconomySimulator {
    private items: Map<string, MarketItem> = new Map();
    private traderInventories: Map<string, TraderInventory> = new Map();
    private activeEvents: EconomicEvent[] = [];
    private priceHistory: Map<string, number[]> = new Map();
    private readonly MAX_HISTORY = 50;

    constructor() {
        this.initializeDefaultItems();
    }

    private initializeDefaultItems() {
        const defaultItems: MarketItem[] = [
            { id: "iron-ore", name: "铁矿石", basePrice: 10, currentPrice: 10, supply: 100, demand: 0.5, volatility: 0.2, category: "resource", restockRate: 5, maxStock: 200 },
            { id: "wood", name: "木材", basePrice: 5, currentPrice: 5, supply: 150, demand: 0.6, volatility: 0.15, category: "resource", restockRate: 8, maxStock: 300 },
            { id: "health-potion", name: "生命药水", basePrice: 25, currentPrice: 25, supply: 30, demand: 0.7, volatility: 0.3, category: "consumable", restockRate: 2, maxStock: 50 },
            { id: "steel-sword", name: "钢剑", basePrice: 100, currentPrice: 100, supply: 10, demand: 0.4, volatility: 0.25, category: "crafted", restockRate: 1, maxStock: 20 },
            { id: "silk", name: "丝绸", basePrice: 50, currentPrice: 50, supply: 40, demand: 0.3, volatility: 0.4, category: "luxury", restockRate: 1, maxStock: 60 }
        ];
        
        defaultItems.forEach(item => {
            this.items.set(item.id, item);
            this.priceHistory.set(item.id, [item.currentPrice]);
        });
    }

    registerTrader(traderId: string, location: string, items: string[]) {
        const inventory: TraderInventory = {
            traderId,
            location,
            items: new Map(),
            buyMultiplier: 0.7 + Math.random() * 0.6, // 0.7-1.3
            sellMultiplier: 0.8 + Math.random() * 0.7, // 0.8-1.5
            restockCooldown: 0,
            lastUpdate: Date.now()
        };

        items.forEach(itemId => {
            const baseItem = this.items.get(itemId);
            if (baseItem) {
                const traderItem: MarketItem = {
                    ...baseItem,
                    currentPrice: Math.round(baseItem.currentPrice * inventory.sellMultiplier),
                    supply: Math.floor(baseItem.supply * 0.3) // Start with limited stock
                };
                inventory.items.set(itemId, traderItem);
            }
        });

        this.traderInventories.set(traderId, inventory);
    }

    getItemPrice(itemId: string, traderId?: string): number {
        if (traderId) {
            const trader = this.traderInventories.get(traderId);
            const item = trader?.items.get(itemId);
            return item?.currentPrice ?? this.items.get(itemId)?.currentPrice ?? 0;
        }
        return this.items.get(itemId)?.currentPrice ?? 0;
    }

    getTraderInventory(traderId: string): MarketItem[] {
        const trader = this.traderInventories.get(traderId);
        return trader ? Array.from(trader.items.values()) : [];
    }

    canBuy(itemId: string, traderId: string, quantity: number): boolean {
        const trader = this.traderInventories.get(traderId);
        const item = trader?.items.get(itemId);
        return item ? item.supply >= quantity : false;
    }

    buyItem(itemId: string, traderId: string, quantity: number, player: PlayerState): { success: boolean; cost: number; remainingSupply: number } {
        const trader = this.traderInventories.get(traderId);
        if (!trader) return { success: false, cost: 0, remainingSupply: 0 };

        const item = trader.items.get(itemId);
        if (!item || item.supply < quantity) return { success: false, cost: 0, remainingSupply: item?.supply ?? 0 };

        const cost = item.currentPrice * quantity;
        if (player.credits < cost) return { success: false, cost, remainingSupply: item.supply };

        // Update supply and demand
        item.supply -= quantity;
        item.demand = Math.min(1, item.demand + (quantity * 0.01));
        
        // Update player
        player.credits -= cost;
        
        // Record transaction for price adjustment
        this.recordTransaction(itemId, quantity, "buy");
        
        return { success: true, cost, remainingSupply: item.supply };
    }

    sellItem(itemId: string, traderId: string, quantity: number, player: PlayerState): { success: boolean; revenue: number; newSupply: number } {
        const trader = this.traderInventories.get(traderId);
        if (!trader) return { success: false, revenue: 0, newSupply: 0 };

        const item = trader.items.get(itemId);
        if (!item) return { success: false, revenue: 0, newSupply: 0 };

        const revenue = Math.round(item.currentPrice * trader.buyMultiplier * quantity);
        
        // Update supply and demand
        item.supply = Math.min(item.maxStock, item.supply + quantity);
        item.demand = Math.max(0, item.demand - (quantity * 0.005));
        
        // Update player
        player.credits += revenue;
        
        // Record transaction for price adjustment
        this.recordTransaction(itemId, quantity, "sell");
        
        return { success: true, revenue, newSupply: item.supply };
    }

    private recordTransaction(itemId: string, quantity: number, type: "buy" | "sell") {
        const item = this.items.get(itemId);
        if (!item) return;

        // Adjust global demand based on transaction
        if (type === "buy") {
            item.demand = Math.min(1, item.demand + (quantity * 0.005));
        } else {
            item.demand = Math.max(0, item.demand - (quantity * 0.002));
        }
    }

    tick() {
        // Update all items
        this.items.forEach(item => {
            this.updateItemPrice(item);
            this.restockItem(item);
            this.recordPriceHistory(item.id, item.currentPrice);
        });

        // Update trader inventories
        this.traderInventories.forEach(trader => {
            if (trader.restockCooldown <= 0) {
                this.restockTrader(trader);
                trader.restockCooldown = 5; // Restock every 5 ticks
            } else {
                trader.restockCooldown--;
            }
            trader.lastUpdate = Date.now();
        });

        // Process economic events
        this.processEvents();
    }

    private updateItemPrice(item: MarketItem) {
        // Base price adjustment based on supply/demand
        const supplyRatio = item.supply / item.maxStock;
        const demandFactor = item.demand;
        
        // Price formula: currentPrice = basePrice * (1 + volatility * (demandFactor - supplyRatio))
        const priceChange = item.volatility * (demandFactor - supplyRatio);
        const newPrice = item.basePrice * (1 + priceChange);
        
        // Apply event multipliers
        const eventMultiplier = this.getEventMultiplier(item.id);
        
        item.currentPrice = Math.max(1, Math.round(newPrice * eventMultiplier));
    }

    private restockItem(item: MarketItem) {
        if (item.supply < item.maxStock) {
            item.supply = Math.min(item.maxStock, item.supply + item.restockRate);
        }
    }

    private restockTrader(trader: TraderInventory) {
        trader.items.forEach(traderItem => {
            const globalItem = this.items.get(traderItem.id);
            if (globalItem) {
                // Sync prices with global market
                traderItem.currentPrice = Math.round(globalItem.currentPrice * trader.sellMultiplier);
                
                // Restock based on demand
                const restockAmount = Math.floor(globalItem.restockRate * 0.5);
                traderItem.supply = Math.min(traderItem.maxStock, traderItem.supply + restockAmount);
            }
        });
    }

    private recordPriceHistory(itemId: string, price: number) {
        const history = this.priceHistory.get(itemId) || [];
        history.push(price);
        if (history.length > this.MAX_HISTORY) {
            history.shift();
        }
        this.priceHistory.set(itemId, history);
    }

    getPriceHistory(itemId: string): number[] {
        return this.priceHistory.get(itemId) || [];
    }

    triggerEconomicEvent(type: EconomicEvent["type"], affectedItems: string[], multiplier: number, duration: number) {
        const event: EconomicEvent = {
            id: `event-${Date.now()}`,
            type,
            affectedItems,
            multiplier,
            duration,
            remaining: duration
        };
        this.activeEvents.push(event);
        return event;
    }

    private processEvents() {
        for (let i = this.activeEvents.length - 1; i >= 0; i--) {
            const event = this.activeEvents[i];
            event.remaining--;
            
            if (event.remaining <= 0) {
                this.activeEvents.splice(i, 1);
            }
        }
    }

    private getEventMultiplier(itemId: string): number {
        let multiplier = 1;
        this.activeEvents.forEach(event => {
            if (event.affectedItems.includes(itemId)) {
                multiplier *= event.multiplier;
            }
        });
        return multiplier;
    }

    getMarketSnapshot(): Array<{ id: string; name: string; price: number; supply: number; demand: number; volatility: number }> {
        return Array.from(this.items.values()).map(item => ({
            id: item.id,
            name: item.name,
            price: item.currentPrice,
            supply: item.supply,
            demand: item.demand,
            volatility: item.volatility
        }));
    }

    // Hook for world events to affect economy
    onWorldEvent(event: WorldEvent) {
        const title = event.title.toLowerCase();
        const detail = event.detail.toLowerCase();

        // Example: Mining strike reduces ore supply
        if (title.includes("mining") || detail.includes("ore")) {
            this.triggerEconomicEvent("supply-shock", ["iron-ore"], 1.5, 10);
        }
        
        // Example: War increases weapon demand
        if (title.includes("war") || detail.includes("conflict")) {
            this.triggerEconomicEvent("demand-spike", ["steel-sword", "health-potion"], 1.3, 8);
        }
        
        // Example: Trade boom affects all items
        if (title.includes("trade") && detail.includes("boom")) {
            const allItems = Array.from(this.items.keys());
            this.triggerEconomicEvent("trade-boom", allItems, 0.9, 15); // Lower prices
        }
    }
}

export const economy = new EconomySimulator();
