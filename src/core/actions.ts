import type { ActionResult, CityPolicy, PlanAction, PlayerState, Room, WorldState } from "../types.js";

export interface ActionContext {
  world: WorldState;
  player: PlayerState;
  room: Room;
  city?: { policy: CityPolicy };
  policy?: CityPolicy;
}

export type ActionHandler = (ctx: ActionContext, plan: PlanAction) => ActionResult;

export class ActionRegistry {
  private handlers = new Map<string, ActionHandler>();

  register(action: string, handler: ActionHandler) {
    this.handlers.set(action, handler);
  }

  has(action: string): boolean {
    return this.handlers.has(action);
  }

  get(action: string): ActionHandler | undefined {
    return this.handlers.get(action);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function calculateDeathPenalty(
  player: PlayerState,
  cityPolicy?: CityPolicy,
  isPvP: boolean = false
): {
  creditLoss: number;
  itemLoss: string[];
  respawnLocation: string;
  reputationPenalty: Record<string, number>;
  cooldownSec: number;
} {
  const baseCreditLoss = isPvP ? 0.2 : 0.1;
  const creditLoss = Math.floor(player.credits * baseCreditLoss);
  
  let itemLoss: string[] = [];
  if (player.inventory.length > 0) {
    const dropRule = cityPolicy?.pvp.dropRule || "partial";
    if (dropRule === "full" && isPvP) {
      itemLoss = [...player.inventory];
    } else if (dropRule === "partial") {
      const lossCount = Math.floor(player.inventory.length * 0.3);
      itemLoss = player.inventory.slice(0, lossCount);
    }
  }
  
  const respawnLocation = player.discoveredRooms?.includes("square") ? "square" : "wild_north";
  
  const reputationPenalty: Record<string, number> = {};
  if (isPvP && cityPolicy?.pvp.penalty === "bounty") {
    reputationPenalty["city-guard"] = -10;
  }
  
  const cooldownSec = isPvP ? 30 : 15;
  
  return { creditLoss, itemLoss, respawnLocation, reputationPenalty, cooldownSec };
}

export function registerDefaultActions(registry: ActionRegistry) {
  registry.register("move", (ctx, plan) => {
    const target = plan.target;
    if (!target) {
      return {
        summary: "你需要指定移动目标。",
        sensory: { visual: "你站在原地，不知去向何方。", audio: "", smell: "", touch: "" },
        state: ctx.player,
      };
    }
    const room = ctx.world.rooms.get(target);
    if (!room || !ctx.room.neighbors.includes(target)) {
      return {
        summary: `无法移动到 ${target}。`, 
        sensory: { visual: "路径被阻挡或不存在。", audio: "", smell: "", touch: "" },
        state: ctx.player,
      };
    }
    ctx.player.location = target;
    if (!ctx.player.discoveredRooms?.includes(target)) {
      ctx.player.discoveredRooms = [...(ctx.player.discoveredRooms || []), target];
    }
    const city = ctx.world.getCityForRoom(target);
    return {
      summary: `你移动到了 ${room.name}。`,
      sensory: { visual: room.name, audio: "脚步声", smell: "", touch: "" },
      state: ctx.player,
      meta: { cityPolicy: city?.policy },
    };
  });

  registry.register("attack", (ctx, plan) => {
    const target = plan.target;
    const isPvP = target?.startsWith("player:");
    const npc = target ? ctx.world.npcs.get(target) : undefined;
    
    if (!target || (!isPvP && !npc)) {
      return {
        summary: "攻击需要指定目标（玩家或NPC）。",
        sensory: { visual: "你挥了个空。", audio: "", smell: "", touch: "" },
        state: ctx.player,
      };
    }
    
    const cityPolicy = ctx.city?.policy;
    const pvpAllowed = cityPolicy?.pvp.on ?? true;
    const zone = ctx.room.zone;
    
    if (isPvP && !pvpAllowed && zone === "city") {
      return {
        summary: "城市区域禁止玩家对战。",
        sensory: { visual: "守卫警惕地盯着你。", audio: "警告声", smell: "", touch: "" },
        state: ctx.player,
      };
    }
    
    const damage = Math.floor(Math.random() * 30) + 10;
    const targetHealth = isPvP ? 50 : (npc ? 40 : 0);
    const outcome = damage >= targetHealth ? "kill" : "hit";
    
    if (outcome === "kill") {
      if (isPvP) {
        const victimId = target.replace("player:", "");
        const victim = ctx.world.players.get(victimId);
        if (victim) {
          const penalty = calculateDeathPenalty(victim, cityPolicy, true);
          victim.credits = Math.max(0, victim.credits - penalty.creditLoss);
          victim.inventory = victim.inventory.filter(item => !penalty.itemLoss.includes(item));
          victim.location = penalty.respawnLocation;
          victim.health = 100;
          victim.status = "ok";
          
          Object.entries(penalty.reputationPenalty).forEach(([faction, delta]) => {
            victim.reputation[faction] = (victim.reputation[faction] || 0) + delta;
          });
          
          ctx.player.reputation["outlaw-syndicate"] = (ctx.player.reputation["outlaw-syndicate"] || 0) + 5;
          
          return {
            summary: `你击杀了玩家 ${victimId}，对方在 ${penalty.respawnLocation} 重生。`, 
            sensory: { visual: "目标倒下，物品散落。", audio: "战斗结束的寂静", smell: "血腥味", touch: "" },
            state: ctx.player,
            meta: { cooldown: penalty.cooldownSec, pvpKill: true },
            reputationDelta: { "outlaw-syndicate": 5 },
            bountyDelta: { [victimId]: 50 },
          };
        }
      } else if (npc) {
        ctx.world.npcs.delete(npc.id);
        const lootChance = Math.random();
        const loot = lootChance > 0.7 ? ["npc_token"] : [];
        ctx.player.inventory.push(...loot);
        
        return {
          summary: `你击杀了 ${npc.name}。`,
          sensory: { visual: "NPC消失，留下残影。", audio: "", smell: "", touch: "" },
          state: ctx.player,
          meta: { loot },
        };
      }
    }
    
    return {
      summary: `你对 ${target} 造成 ${damage} 点伤害。`,
      sensory: { visual: "攻击命中！", audio: "打击声", smell: "", touch: "" },
      state: ctx.player,
    };
  });

  registry.register("observe", (ctx) => {
    const room = ctx.room;
    const npcs = Array.from(ctx.world.npcs.values()).filter(n => n.location === room.id);
    const players = Array.from(ctx.world.players.values()).filter(p => p.location === room.id && p.id !== ctx.player.id);
    const city = ctx.world.getCityForRoom(room.id);
    
    return {
      summary: `你观察 ${room.name}。`,
      sensory: { 
        visual: `区域：${room.zone}，NPC：${npcs.map(n => n.name).join(", ") || "无"}，玩家：${players.map(p => p.id).join(", ") || "无"}`,
        audio: "环境音", 
        smell: "", 
        touch: "" 
      },
      state: ctx.player,
      meta: { cityPolicy: city?.policy, npcCount: npcs.length, playerCount: players.length },
    };
  });

  registry.register("withdraw", (ctx, plan) => {
    const amount = plan.amount ?? 0;
    if (amount <= 0 || amount > ctx.player.credits) {
      return {
        summary: "无效的提取金额。",
        sensory: { visual: "余额不足或金额无效。", audio: "", smell: "", touch: "" },
        state: ctx.player,
      };
    }
    const city = ctx.world.getCityForRoom(ctx.player.location);
    const taxRate = city?.policy.tax.withdraw ?? 0.02;
    const tax = Math.floor(amount * taxRate);
    const net = amount - tax;
    ctx.player.credits -= amount;
    
    return {
      summary: `提取 ${amount} 信用点，税费 ${tax}，净得 ${net}。`,
      sensory: { visual: "信用点转入你的账户。", audio: "交易完成音效", smell: "", touch: "" },
      state: ctx.player,
      meta: { taxRate, tax },
    };
  });

  registry.register("trade", (ctx, plan) => {
    const target = plan.target;
    const amount = plan.amount ?? 0;
    if (!target || amount <= 0) {
      return {
        summary: "交易需要目标和金额。",
        sensory: { visual: "交易失败。", audio: "", smell: "", touch: "" },
        state: ctx.player,
      };
    }
    const city = ctx.world.getCityForRoom(ctx.player.location);
    const taxRate = city?.policy.tax.trade ?? 0.05;
    const tax = Math.floor(amount * taxRate);
    const cost = amount + tax;
    if (cost > ctx.player.credits) {
      return {
        summary: "信用点不足完成交易。",
        sensory: { visual: "余额不足。", audio: "", smell: "", touch: "" },
        state: ctx.player,
      };
    }
    ctx.player.credits -= cost;
    ctx.player.inventory.push(target);
    
    return {
      summary: `购买 ${target}，花费 ${cost}（含税 ${tax}）。`,
      sensory: { visual: "物品到手。", audio: "交易完成", smell: "", touch: "" },
      state: ctx.player,
      meta: { taxRate, tax },
    };
  });

  registry.register("die", (ctx) => {
    const cityPolicy = ctx.city?.policy;
    const isPvP = false;
    const penalty = calculateDeathPenalty(ctx.player, cityPolicy, isPvP);
    
    ctx.player.credits = Math.max(0, ctx.player.credits - penalty.creditLoss);
    ctx.player.inventory = ctx.player.inventory.filter(item => !penalty.itemLoss.includes(item));
    ctx.player.location = penalty.respawnLocation;
    ctx.player.health = 100;
    ctx.player.status = "ok";
    
    Object.entries(penalty.reputationPenalty).forEach(([faction, delta]) => {
      ctx.player.reputation[faction] = (ctx.player.reputation[faction] || 0) + delta;
    });
    
    return {
      summary: `你死亡并在 ${penalty.respawnLocation} 重生，损失 ${penalty.creditLoss} 信用点和 ${penalty.itemLoss.length} 件物品。`,
      sensory: { visual: "意识模糊后重生。", audio: "重生音效", smell: "", touch: "" },
      state: ctx.player,
      meta: { cooldown: penalty.cooldownSec, deathPenalty: true },
      reputationDelta: penalty.reputationPenalty,
    };
  });

  registry.register("respawn", (ctx) => {
    if (ctx.player.health > 0 && ctx.player.status === "ok") {
      return {
        summary: "你尚未死亡，无法重生。",
        sensory: { visual: "你仍然活着。", audio: "", smell: "", touch: "" },
        state: ctx.player,
      };
    }
    
    const discovered = ctx.player.discoveredRooms || [];
    const respawnLocation = discovered.includes("square") ? "square" : 
                           discovered.includes("market") ? "market" : 
                           "wild_north";
    
    ctx.player.location = respawnLocation;
    ctx.player.health = 100;
    ctx.player.status = "ok";
    
    const creditLoss = Math.floor(ctx.player.credits * 0.05);
    ctx.player.credits = Math.max(0, ctx.player.credits - creditLoss);
    
    return {
      summary: `你在 ${respawnLocation} 重生，损失 ${creditLoss} 信用点。`,
      sensory: { visual: "重生完成。", audio: "", smell: "", touch: "" },
      state: ctx.player,
      meta: { forcedRespawn: true },
    };
  });
}
