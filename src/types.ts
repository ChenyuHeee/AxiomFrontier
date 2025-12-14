export type Risk = "low" | "med" | "high";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface PlanAction {
  action: string;
  target?: string;
  amount?: number;
  path?: string[];
  risk: Risk;
  notes?: string;
}

export interface LlmPlanResponse {
  plan: PlanAction;
  justification?: string;
}

export interface PlayerState {
  id: string;
  location: string;
  inventory: string[];
  credits: number;
  health: number;
  hunger: number;
  status: "ok" | "down";
  heat?: number;
  jobCooldowns?: Record<string, number>;
  discoveredRooms?: string[];
  knownRooms?: string[];
  arOverlay?: {
    enabled: boolean;
    mode: "standard" | "echo";
    temporalCraftingProgress: number;
  };
  hudSettings?: {
    showEchoLevels: boolean;
    showRealityWarpTimers: boolean;
    showFactionInfluence: boolean;
    alerts: {
      guardShifts: boolean;
      marketFluctuations: boolean;
      customEvents: string[];
    };
  };
  favors: number;
  favorCap: number;
  favorSources: string[];
  reputation: Record<string, number>;
  bounties: Record<string, number>;
  factionReputation: Record<string, number>;
  npcMemory: Record<string, NpcMemory>;
}

export interface NpcMemory {
  lastInteraction: number;
  dialogueState: Record<string, any>;
  conversationHistory: string[];
  questProgress?: Record<string, any>;
  playerReputation?: number;
  dialogueNode?: string;
  flags?: Record<string, boolean>;
  choices?: Record<string, any>;
}

export interface FavorTransaction {
  id: string;
  playerId: string;
  amount: number;
  source: string;
  detail: string;
  timestamp: number;
  narrativeWeight: number;
}

export interface FavorSpendOption {
  id: string;
  cost: number;
  effect: "bribe-guard" | "unlock-hidden-zone" | "trigger-surreal-event" | "reduce-cooldown" | "gain-temporary-buff";
  target?: string;
  cooldownSec?: number;
  narrativeRequirement?: string;
  zoneRestriction?: Zone[];
}

export interface SensoryCue {
  visual?: string;
  audio?: string;
  smell?: string;
  touch?: string;
}

export interface ActionResult {
  summary: string;
  sensory: SensoryCue;
  state: PlayerState;
  meta?: Record<string, unknown>;
  favorDelta?: number;
  reputationDelta?: Record<string, number>;
  bountyDelta?: Record<string, number>;
  factionReputationDelta?: Record<string, number>;
  npcMemoryDelta?: Record<string, Partial<NpcMemory>>;
}

export interface GeneratedRoom {
  id: string;
  name: string;
  neighbors: string[];
  cityId?: string;
  zone: Zone;
  arData?: {
    factionInfluence?: string[];
    resourceNodes?: string[];
    anomalies?: string[];
    echoReveals?: {
      npcIds?: string[];
      eventIds?: string[];
      requiredTemporalProgress: number;
    };
  };
  favorUnlockCost?: number;
}

export interface GeneratedCity {
  id: string;
  name: string;
  policy: CityPolicy;
}

export interface WorldSpec {
  rooms: GeneratedRoom[];
  cities: GeneratedCity[];
  players?: PlayerState[];
}

export interface RulerDecision {
  cityId: string;
  policyPatch?: Partial<CityPolicy>;
  broadcast?: string;
}

export interface Npc {
  id: string;
  name: string;
  role: string;
  location?: string;
  style?: string;
  visibleInEcho?: boolean;
  favorBribeCost?: number;
  favorQuestGiver?: boolean;
  reputationAffiliation?: string;
  factionAffiliation?: string;
  dialogueTree?: NpcDialogueTree;
  memory?: NpcMemory;
  persistentDialogue?: boolean;
}

export interface NpcDialogueTree {
  nodes: Record<string, DialogueNode>;
  startNode: string;
}

export interface DialogueNode {
  id: string;
  text: string;
  options: DialogueOption[];
  conditions?: DialogueCondition[];
  effects?: DialogueEffect[];
}

export interface DialogueOption {
  text: string;
  nextNode: string;
  requirements?: DialogueCondition[];
  memoryFlag?: string;
  choiceKey?: string;
}

export interface DialogueCondition {
  type: "reputation" | "questProgress" | "item" | "favor" | "memoryFlag" | "dialogueFlag" | "previousChoice";
  target: string;
  value: any;
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "exists" | "notExists";
}

export interface DialogueEffect {
  type: "reputationChange" | "questUpdate" | "itemChange" | "favorChange" | "memoryUpdate" | "dialogueFlagSet" | "choiceRecord";
  target: string;
  value: any;
}

export interface NpcTalkResult {
  reply: string;
  hint?: string;
  task?: string;
  favorReward?: number;
  reputationReward?: Record<string, number>;
  factionReputationReward?: Record<string, number>;
  dialogueState?: Record<string, any>;
  nextDialogueNode?: string;
  action?: PlanAction;
  actionResult?: ActionResult;
  npcMemoryDelta?: Partial<NpcMemory>;
  playerMemoryDelta?: Partial<NpcMemory>;
  dialogueFlags?: Record<string, boolean>;
  recordedChoices?: Record<string, any>;
}

export interface WorldEvent {
  id: string;
  title: string;
  detail: string;
  cityId?: string;
  npcId?: string;
  ts: number;
  visibleInEcho?: boolean;
  favorTriggerCost?: number;
  reputationImpact?: Record<string, number>;
  factionImpact?: Record<string, number>;
}

export interface GlossaryEntry {
  source: string;
  target: string;
}

export interface BugReport {
  id: string;
  title: string;
  detail: string;
  playerId?: string;
  ts: number;
}

export type Zone = "city" | "wild";

export interface Room {
  id: string;
  name: string;
  neighbors: string[];
  cityId?: string;
  zone: Zone;
  arData?: {
    factionInfluence?: string[];
    resourceNodes?: string[];
    anomalies?: string[];
    echoReveals?: {
      npcIds?: string[];
      eventIds?: string[];
      requiredTemporalProgress: number;
    };
  };
  favorUnlockCost?: number;
}

export interface CityPolicy {
  name: string;
  safetyLevel: number;
  guards: { density: "low" | "med" | "high"; responseTime: "slow" | "med" | "fast"; lethality: "nonlethal" | "lethal" };
  pvp: { on: boolean; dropRule: "none" | "partial" | "full"; penalty: "none" | "fine" | "bounty" };
  tax: { trade: number; withdraw: number; gateFee: number; storageFee: number; insuranceRate: number };
  withdrawPoints: Array<{ id: string; fee: number; cooldownSec: number; safeRadius: number; hiValueLimit: number; hours: string }>;
  access: { mode: "open" | "permit" | "invite" };
  favorEconomy?: {
    baseEarnRate: number;
    bribeEffectiveness: number;
    hiddenZoneDiscount: number;
  };
  reputationThresholds?: {
    guardHostility: number;
    taxDiscount: number;
    accessGrant: number;
  };
  factionPolicies?: {
    cityGuard: { pvpPenaltyModifier: number; taxModifier: number };
    traderGuild: { tradeTaxModifier: number; accessModifier: number };
    outlawSyndicate: { bountyModifier: number; safetyModifier: number };
  };
}

export interface City {
  id: string;
  name: string;
  policy: CityPolicy;
}

export interface WorldState {
  players: Map<string, PlayerState>;
  rooms: Map<string, Room>;
  cities: Map<string, City>;
  npcs: Map<string, Npc>;
  getCityForRoom(roomId: string): City | undefined;
}

// New faction system interfaces
export interface Faction {
  id: string;
  name: string;
  description: string;
  alignment: "lawful" | "neutral" | "chaotic";
  baseReputation: number;
  reputationThresholds: {
    hostile: number;
    unfriendly: number;
    neutral: number;
    friendly: number;
    allied: number;
  };
  services: {
    access: string[];
    discounts: Record<string, number>;
    quests: string[];
  };
}

export interface FactionReputation {
  factionId: string;
  reputation: number;
  lastUpdated: number;
  milestones: string[];
}

export interface ReputationEffect {
  factionId: string;
  delta: number;
  reason: string;
  source: "quest" | "combat" | "trade" | "event" | "dialogue";
}

export interface FactionServiceAccess {
  factionId: string;
  serviceId: string;
  requiredReputation: number;
  description: string;
}

// Dialogue persistence and branching enhancements
export interface DialogueBranchingEngine {
  getCurrentNode(npcId: string, playerId: string): string | undefined;
  setCurrentNode(npcId: string, playerId: string, nodeId: string): void;
  evaluateConditions(conditions: DialogueCondition[], context: DialogueContext): boolean;
  applyEffects(effects: DialogueEffect[], context: DialogueContext): void;
  recordChoice(npcId: string, playerId: string, choiceKey: string, value: any): void;
  getRecordedChoice(npcId: string, playerId: string, choiceKey: string): any | undefined;
}

export interface DialogueContext {
  player: PlayerState;
  npc: Npc;
  playerMemory: NpcMemory;
  npcMemory: NpcMemory;
  world: WorldState;
}

export interface DialoguePersistenceManager {
  saveDialogueState(npcId: string, playerId: string, state: DialogueState): void;
  loadDialogueState(npcId: string, playerId: string): DialogueState | undefined;
  clearDialogueState(npcId: string, playerId: string): void;
}

export interface DialogueState {
  currentNode: string;
  flags: Record<string, boolean>;
  choices: Record<string, any>;
  lastUpdated: number;
}

// Enhanced NPC memory structure
export interface EnhancedNpcMemory extends NpcMemory {
  dialogueStates: Record<string, DialogueState>;
  playerSpecificMemory: Record<string, {
    lastInteraction: number;
    conversationHistory: string[];
    dialogueState: Record<string, any>;
    questProgress?: Record<string, any>;
    playerReputation?: number;
    flags?: Record<string, boolean>;
    choices?: Record<string, any>;
  }>;
}

// Enhanced NPC interface with branching support
export interface EnhancedNpc extends Npc {
  enhancedMemory?: EnhancedNpcMemory;
  dialogueEngine?: DialogueBranchingEngine;
  persistenceManager?: DialoguePersistenceManager;
}

// Enhanced talk result with branching support
export interface EnhancedNpcTalkResult extends NpcTalkResult {
  nextDialogueNode?: string;
  dialogueFlags?: Record<string, boolean>;
  recordedChoices?: Record<string, any>;
  branchConditions?: DialogueCondition[];
  branchEffects?: DialogueEffect[];
}