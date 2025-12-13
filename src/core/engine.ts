import type { ActionResult, PlanAction } from "../types.js";
import { ActionRegistry, registerDefaultActions } from "./actions.js";
import { InMemoryState, loadDefaultWorld } from "./state.js";

export class GameEngine {
  readonly world: InMemoryState;
  private registry: ActionRegistry;

  constructor(world?: InMemoryState) {
    this.world = world ?? loadDefaultWorld();
    this.registry = new ActionRegistry();
    registerDefaultActions(this.registry);
  }

  ensurePlayer(playerId: string) {
    return this.world.ensurePlayer(playerId);
  }

  applyAction(playerId: string, plan: PlanAction): ActionResult {
    const player = this.world.ensurePlayer(playerId);
    const room = this.world.rooms.get(player.location);
    if (!room) throw new Error("Invalid player location");
    const city = this.world.getCityForRoom(room.id);
    const handler = this.registry.get(plan.action);
    if (!handler) {
      return {
        summary: "行动被记录，但尚未有对应规则。",
        sensory: { audio: "空气微微震动", visual: "系统提示等待城主规则", smell: "无明显气味", touch: "静止不动" },
        state: player,
      };
    }
    return handler({ world: this.world, player, room, city, policy: city?.policy }, plan);
  }
}
