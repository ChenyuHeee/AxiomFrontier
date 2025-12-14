import type { PlayerState, Room, WorldState } from "../types.js";

export interface MemoryFragment {
  id: string;
  name: string;
  zone: string;
  value: number;
  rarity: "common" | "uncommon" | "rare" | "legendary";
  temporalEchoLink?: string;
}

export interface FragmentMarketService {
  id: string;
  name: string;
  cost: number;
  description: string;
  effect: (player: PlayerState) => void;
}

export interface FragmentMarketItem {
  id: string;
  name: string;
  cost: number;
  description: string;
  type: "consumable" | "equipment" | "artifact";
}

export class EchoEconomySystem {
  private fragments: Map<string, MemoryFragment> = new Map();
  private services: FragmentMarketService[] = [];
  private items: FragmentMarketItem[] = [];

  constructor() {
    this.initializeFragments();
    this.initializeMarket();
  }

  private initializeFragments() {
    const fragmentData: MemoryFragment[] = [
      { id: "frag-common-ruin", name: "Common Ruin Fragment", zone: "ruins", value: 10, rarity: "common", temporalEchoLink: "echo-crafting" },
      { id: "frag-uncommon-wild", name: "Uncommon Wild Fragment", zone: "wild", value: 25, rarity: "uncommon", temporalEchoLink: "echo-crafting" },
      { id: "frag-rare-anomaly", name: "Rare Anomaly Fragment", zone: "wild", value: 50, rarity: "rare", temporalEchoLink: "echo-crafting" },
      { id: "frag-legendary-echo", name: "Legendary Echo Fragment", zone: "ruins", value: 100, rarity: "legendary", temporalEchoLink: "echo-crafting" },
    ];
    fragmentData.forEach(frag => this.fragments.set(frag.id, frag));
  }

  private initializeMarket() {
    this.services = [
      { id: "service-temporal-vision", name: "Temporal Vision", cost: 30, description: "Reveal hidden temporal echoes in a zone for 1 hour.", effect: (player) => { player.arOverlay = { enabled: true, mode: "echo", temporalCraftingProgress: (player.arOverlay?.temporalCraftingProgress || 0) + 10 }; } },
      { id: "service-echo-repair", name: "Echo Repair", cost: 50, description: "Restore durability of temporal items by 25%.", effect: (player) => { player.inventory = player.inventory.map(item => item.includes("temporal") ? item + "-repaired" : item); } },
      { id: "service-memory-infusion", name: "Memory Infusion", cost: 75, description: "Infuse an item with memory fragments to boost its power.", effect: (player) => { player.inventory.push("memory-infused-gear"); } },
    ];

    this.items = [
      { id: "item-echo-lens", name: "Echo Lens", cost: 20, description: "A lens that enhances perception of temporal echoes.", type: "equipment" },
      { id: "item-memory-potion", name: "Memory Potion", cost: 15, description: "Consumable that temporarily increases fragment harvest yield.", type: "consumable" },
      { id: "item-temporal-artifact", name: "Temporal Artifact", cost: 100, description: "Rare artifact that unlocks unique crafting recipes.", type: "artifact" },
    ];
  }

  harvestFragment(player: PlayerState, room: Room): MemoryFragment | null {
    const zone = room.zone;
    const availableFragments = Array.from(this.fragments.values()).filter(frag => frag.zone === zone);
    if (availableFragments.length === 0) return null;
    const fragment = availableFragments[Math.floor(Math.random() * availableFragments.length)];
    player.inventory.push(fragment.id);
    return fragment;
  }

  tradeFragmentForService(player: PlayerState, serviceId: string): boolean {
    const service = this.services.find(s => s.id === serviceId);
    if (!service) return false;
    const fragmentCount = player.inventory.filter((item: string) => this.fragments.has(item)).length;
    if (fragmentCount < service.cost / 10) return false; // Assuming 10 value per fragment
    player.inventory = player.inventory.filter((item: string) => !this.fragments.has(item)).slice(0, -Math.ceil(service.cost / 10));
    service.effect(player);
    return true;
  }

  tradeFragmentForItem(player: PlayerState, itemId: string): boolean {
    const item = this.items.find(i => i.id === itemId);
    if (!item) return false;
    const fragmentCount = player.inventory.filter((item: string) => this.fragments.has(item)).length;
    if (fragmentCount < item.cost / 10) return false;
    player.inventory = player.inventory.filter((item: string) => !this.fragments.has(item)).slice(0, -Math.ceil(item.cost / 10));
    player.inventory.push(item.id);
    return true;
  }

  getMarketInfo() {
    return {
      fragments: Array.from(this.fragments.values()),
      services: this.services,
      items: this.items,
    };
  }
}
