import type { ActionResult, City, CityPolicy, PlanAction, PlayerState, Room } from "../types.js";
import type { InMemoryState } from "./state.js";

export interface ActionContext {
  world: InMemoryState;
  player: PlayerState;
  room: Room;
  city?: City;
  policy?: CityPolicy;
}

export type ActionHandler = (ctx: ActionContext, plan: PlanAction) => ActionResult;

export class ActionRegistry {
  private handlers = new Map<string, ActionHandler>();

  register(action: string, handler: ActionHandler) {
    this.handlers.set(action, handler);
  }

  get(action: string): ActionHandler | undefined {
    return this.handlers.get(action);
  }
}

export function registerDefaultActions(registry: ActionRegistry) {
  registry.register("move", moveHandler);
  registry.register("observe", observeHandler);
  registry.register("withdraw", withdrawHandler);
  registry.register("attack", attackHandler);
  registry.register("trade", tradeHandler);
}

const moveHandler: ActionHandler = (ctx, plan) => {
  const dest = plan.target ?? "";
  const room = ctx.room;
  if (!room.neighbors.includes(dest)) {
    return {
      summary: "你尝试移动，但前方被阻挡。",
      sensory: {
        touch: "脚步停在原地",
        visual: "守卫的目光扫过",
        smell: "街道扬起一点尘土",
        audio: "盔甲轻响，空气短促一滞",
      },
      state: ctx.player,
      meta: { denied: true },
    };
  }
  ctx.player.location = dest;
  const arrival = ctx.world.rooms.get(dest);
  return {
    summary: `你移动到 ${arrival?.name ?? dest}`,
    sensory: {
      audio: "风声穿过街巷",
      visual: arrival?.zone === "wild" ? "远处有野兽低吼" : "商贩的嘈杂声",
      smell: arrival?.zone === "wild" ? "草腥与土腥混杂" : "街边食物的香味",
      touch: "鞋底碾过石板的摩擦感",
    },
    state: ctx.player,
    meta: { zone: arrival?.zone, city: arrival?.cityId },
  };
};

const observeHandler: ActionHandler = (ctx, _plan) => {
  const neighbors = ctx.room.neighbors.join(", ");
  const cityName = ctx.city?.name ?? (ctx.room.zone === "wild" ? "荒野" : "未知城" );
  return {
    summary: `你环顾四周，处于 ${ctx.room.name}（${cityName}）`,
    sensory: {
      visual: `可前往：${neighbors || "无路可走"}`,
      smell: ctx.room.zone === "wild" ? "空气中有湿土与野兽气味" : "街边有淡淡的油炸味",
      audio: ctx.room.zone === "wild" ? "远处虫鸣或野兽闷吼" : "守卫偶尔巡视的脚步声",
      touch: ctx.room.zone === "wild" ? "掌心能感到微凉的风" : "石板路面略微粗糙",
    },
    state: ctx.player,
    meta: { neighbors: ctx.room.neighbors, city: ctx.room.cityId },
  };
};

const withdrawHandler: ActionHandler = (ctx, plan) => {
  const amount = plan.amount ?? 0;
  if (amount <= 0) {
    return {
      summary: "提现金额无效。",
      sensory: { visual: "柜台人员摇头", audio: "账本翻动的沙沙声", touch: "指尖滑过冰冷的柜台" },
      state: ctx.player,
    };
  }
  if (amount > ctx.player.credits) {
    return {
      summary: "余额不足，提现失败。",
      sensory: { visual: "柜台人员摇头", audio: "账本翻动的沙沙声", smell: "墨水味", touch: "掌心出汗" },
      state: ctx.player,
    };
  }
  const policy = ctx.policy;
  const feeRate = policy?.tax.withdraw ?? 0;
  const fee = Math.ceil(amount * feeRate);
  const finalAmount = amount - fee;
  ctx.player.credits -= amount;
  return {
    summary: `你提现 ${amount}，手续费 ${fee}，到手 ${finalAmount}`,
    sensory: { audio: "机器吐出收据", visual: "守卫注视着你", touch: "收据纸张的温热" },
    state: ctx.player,
    meta: { feeRate, fee },
  };
};

const attackHandler: ActionHandler = (ctx, _plan) => {
  const zone = ctx.room.zone;
  if (zone === "city" && ctx.policy?.pvp.on === false) {
    return {
      summary: "城内禁止战斗，守卫警告你停手。",
      sensory: { visual: "守卫握住武器", audio: "周围人群退避", touch: "指骨微微紧绷" },
      state: ctx.player,
      meta: { denied: true },
    };
  }
  ctx.player.health = Math.max(0, ctx.player.health - 10);
  ctx.player.status = ctx.player.health > 0 ? "ok" : "down";
  return {
    summary: ctx.player.status === "ok" ? "你发动攻击，对抗还在继续。" : "你被击倒，倒在地上。",
    sensory: { audio: "金属碰撞的刺耳声", smell: "空气中有血腥味", touch: "手臂被震得发麻", visual: "火星四溅" },
    state: ctx.player,
    meta: { zone },
  };
};

const tradeHandler: ActionHandler = (_ctx, _plan) => {
  return {
    summary: "交易功能待由城主/统治者规则实现。",
    sensory: { audio: "市场的喧嚣", visual: "摊贩观望你的意图", smell: "烤肉香气飘散", touch: "手中钱袋的重量" },
    state: _ctx.player,
    meta: { todo: true },
  };
};
