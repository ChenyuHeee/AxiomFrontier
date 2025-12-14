import type { ActionResult, PlanAction, WorldState, PlayerState, Room, CityPolicy, Npc, WorldEvent, Zone, FavorTransaction, FavorSpendOption } from "../types.js";

export class ActionRegistry {
  private map = new Map<string, ActionHandler>();

  register(action: string, handler: ActionHandler) {
    this.map.set(action, handler);
  }

  has(action: string): boolean {
    return this.map.has(action);
  }

  get(action: string): ActionHandler | undefined {
    return this.map.get(action);
  }
}

export type ActionHandler = (ctx: ActionContext, plan: PlanAction) => ActionResult;

export interface ActionContext {
  world: WorldState;
  player: PlayerState;
  room: Room;
  city?: CityPolicy;
}

function validateTrade(player: PlayerState, targetNpc: Npc | undefined, amount: number, item?: string): { valid: boolean; reason?: string } {
  if (!targetNpc) return { valid: false, reason: "目标 NPC 不存在" };
  if (targetNpc.role !== "merchant") return { valid: false, reason: "目标不是商人" };
  if (amount <= 0) return { valid: false, reason: "交易数量必须为正" };
  if (item && !player.inventory.includes(item)) return { valid: false, reason: `玩家没有物品：${item}` };
  if (!item && player.credits < amount) return { valid: false, reason: "玩家信用点不足" };
  return { valid: true };
}

function logTransaction(playerId: string, type: string, details: any): void {
  // In a real implementation, write to a log file or database
  console.log(`[TRANSACTION] ${new Date().toISOString()} - Player ${playerId}: ${type}`, details);
}

function applyCurrencyRules(player: PlayerState, amount: number, operation: 'add' | 'subtract'): { success: boolean; newCredits: number } {
  let newCredits = player.credits;
  if (operation === 'add') {
    newCredits += amount;
  } else if (operation === 'subtract') {
    if (newCredits < amount) return { success: false, newCredits };
    newCredits -= amount;
  }
  // Ensure credits never go negative
  newCredits = Math.max(0, newCredits);
  return { success: true, newCredits };
}

export function registerDefaultActions(registry: ActionRegistry) {
  registry.register("move", (ctx, plan) => {
    const target = plan.target;
    if (!target || !ctx.room.neighbors.includes(target)) {
      return {
        summary: `无法移动到 ${target || '未知地点'}。`, 
        sensory: { visual: "路径被阻挡", audio: "风声", smell: "尘土", touch: "阻力" },
        state: ctx.player,
      };
    }
    ctx.player.location = target;
    if (!ctx.player.discoveredRooms?.includes(target)) {
      ctx.player.discoveredRooms = [...(ctx.player.discoveredRooms || []), target];
    }
    const newRoom = ctx.world.rooms.get(target);
    return {
      summary: `你移动到了 ${newRoom?.name || target}。`,
      sensory: { visual: newRoom?.name || "新区域", audio: "脚步声", smell: "空气变化", touch: "地面质感" },
      state: ctx.player,
    };
  });

  registry.register("observe", (ctx, plan) => {
    const npcs = Array.from(ctx.world.npcs.values()).filter(n => n.location === ctx.room.id);
    const roomDesc = `${ctx.room.name}（${ctx.room.zone === 'city' ? '城市区' : '荒野区'}）`;
    const npcList = npcs.length > 0 ? npcs.map(n => n.name).join(", ") : "无";
    return {
      summary: `你观察四周：${roomDesc}，可见 NPC：${npcList}。`,
      sensory: { visual: roomDesc, audio: npcs.length > 0 ? "低语声" : "寂静", smell: "环境气味", touch: "空气流动" },
      state: ctx.player,
    };
  });

  registry.register("withdraw", (ctx, plan) => {
    const amount = plan.amount || 0;
    if (amount <= 0) {
      return {
        summary: "取款金额必须为正数。",
        sensory: { visual: "取款机闪烁", audio: "错误提示音", smell: "金属", touch: "冰冷" },
        state: ctx.player,
      };
    }
    const city = ctx.city;
    const fee = city?.tax.withdraw || 0.02;
    const totalCost = amount * (1 + fee);
    const currencyResult = applyCurrencyRules(ctx.player, totalCost, 'subtract');
    if (!currencyResult.success) {
      return {
        summary: `信用点不足，需要 ${totalCost.toFixed(2)}（含手续费 ${(amount * fee).toFixed(2)}）。`,
        sensory: { visual: "余额不足", audio: "拒绝声", smell: "电子", touch: "震动" },
        state: ctx.player,
      };
    }
    ctx.player.credits = currencyResult.newCredits;
    logTransaction(ctx.player.id, 'withdraw', { amount, fee, totalCost, location: ctx.room.id });
    return {
      summary: `你取出了 ${amount} 信用点，手续费 ${(amount * fee).toFixed(2)}。`,
      sensory: { visual: "信用点流入", audio: "叮当声", smell: "钱币", touch: "温暖" },
      state: ctx.player,
    };
  });

  registry.register("attack", (ctx, plan) => {
    const target = plan.target;
    const npc = Array.from(ctx.world.npcs.values()).find(n => n.id === target);
    if (!npc || npc.location !== ctx.room.id) {
      return {
        summary: `目标 ${target || '未知'} 不在场或不存在。`,
        sensory: { visual: "目标缺失", audio: "风声", smell: "危险", touch: "紧张" },
        state: ctx.player,
      };
    }
    const city = ctx.city;
    if (city && !city.pvp.on && npc.role === "guard") {
      ctx.player.health = Math.max(0, ctx.player.health - 30);
      logTransaction(ctx.player.id, 'attack_penalty', { target: npc.id, damage: 30, reason: '攻击守卫违反城市政策' });
      return {
        summary: `你攻击了守卫 ${npc.name}，但城市政策禁止 PvP，你受到 30 点伤害。`,
        sensory: { visual: "守卫反击", audio: "警报声", smell: "血腥", touch: "疼痛" },
        state: ctx.player,
      };
    }
    const damage = Math.floor(Math.random() * 20) + 10;
    ctx.player.health = Math.max(0, ctx.player.health - damage);
    logTransaction(ctx.player.id, 'attack', { target: npc.id, damage, location: ctx.room.id });
    return {
      summary: `你攻击了 ${npc.name}，受到 ${damage} 点伤害。`,
      sensory: { visual: "战斗火花", audio: "撞击声", smell: "焦糊", touch: "冲击" },
      state: ctx.player,
    };
  });

  registry.register("trade", (ctx, plan) => {
    const target = plan.target;
    const amount = plan.amount || 0;
    const item = plan.notes; // Using notes field for item name
    const npc = Array.from(ctx.world.npcs.values()).find(n => n.id === target);
    const validation = validateTrade(ctx.player, npc, amount, item);
    if (!validation.valid) {
      return {
        summary: `交易失败：${validation.reason}。`,
        sensory: { visual: "交易拒绝", audio: "摇头声", smell: "失望", touch: "僵硬" },
        state: ctx.player,
      };
    }
    let summary = "";
    if (item) {
      // Selling item to NPC
      const price = amount * 10; // Simplified pricing
      const currencyResult = applyCurrencyRules(ctx.player, price, 'add');
      ctx.player.credits = currencyResult.newCredits;
      ctx.player.inventory = ctx.player.inventory.filter(i => i !== item);
      summary = `你向 ${npc!.name} 出售了 ${item}，获得 ${price} 信用点。`;
      logTransaction(ctx.player.id, 'trade_sell', { npc: npc!.id, item, amount, price, location: ctx.room.id });
    } else {
      // Buying from NPC (credits for goods)
      const price = amount;
      const currencyResult = applyCurrencyRules(ctx.player, price, 'subtract');
      if (!currencyResult.success) {
        return {
          summary: `信用点不足，需要 ${price}。`,
          sensory: { visual: "余额不足", audio: "拒绝声", smell: "电子", touch: "震动" },
          state: ctx.player,
        };
      }
      ctx.player.credits = currencyResult.newCredits;
      ctx.player.inventory.push(`商品-${Date.now()}`); // Simplified item addition
      summary = `你从 ${npc!.name} 购买了商品，花费 ${price} 信用点。`;
      logTransaction(ctx.player.id, 'trade_buy', { npc: npc!.id, amount: price, location: ctx.room.id });
    }
    return {
      summary,
      sensory: { visual: "交易完成", audio: "钱币声", smell: "成功", touch: "平滑" },
      state: ctx.player,
    };
  });

  registry.register("improv", (ctx, plan) => {
    return {
      summary: "自由行动触发，等待游戏模拟器处理。",
      sensory: { visual: "模糊景象", audio: "低语", smell: "未知", touch: "波动" },
      state: ctx.player,
      meta: { improv: true },
    };
  });
}
