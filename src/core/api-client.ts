/**
 * Typed HTTP API client for SpaceMolt.
 * Handles session management, retry logic, and response normalization.
 *
 * NOTE: This is a stub for Phase 1 (data layer compilation).
 * Full implementation ported from v2 in Phase 3.
 */

import type {
  PlayerState, ShipState, StarSystem, PoiDetail,
  MarketPrice, MarketOrder, MiningYield, TravelResult,
  TradeResult, CraftResult, CatalogItem, ShipClass,
  Skill, Recipe, NearbyPlayer, GameNotification,
  BattleStatus, Mission, SessionInfo, LoginResult,
  RegisterResult, CargoItem, EstimatePurchaseResult,
} from "../types/game";

export interface MarketInsight {
  category: string;
  item: string;
  item_id: string;
  message: string;
  priority: number;
}

export interface AnalyzeMarketResult {
  insights: MarketInsight[];
  skill_level: number;
  station: string;
  message: string;
}

const BASE_URL = "https://game.spacemolt.com/api/v1";
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

interface ApiResponse<T = unknown> {
  result: T;
  notifications: GameNotification[];
  session: SessionInfo;
  error: { code: string; message: string; wait_seconds?: number } | null;
}

export interface ApiClientOptions {
  username: string;
  onNotifications?: (notifications: GameNotification[]) => void;
  onSessionExpired?: () => void;
}

/**
 * Full ApiClient — stub with all method signatures for compilation.
 * Real implementation will be ported from v2 (48KB).
 * All methods throw until wired — this ensures type safety during development.
 */
export class ApiClient {
  private sessionId: string | null = null;
  private readonly username: string;
  private mutationCount = 0;
  private queryCount = 0;
  private lastMutationAt = 0;

  constructor(opts: ApiClientOptions) {
    this.username = opts.username;
  }

  get stats() {
    return { mutations: this.mutationCount, queries: this.queryCount };
  }

  private stub(): never { throw new Error("ApiClient stub — full implementation pending"); }

  // ── Session ──
  async login(password: string): Promise<LoginResult> { return this.stub(); }
  async logout(): Promise<void> { return this.stub(); }
  async getStatus(): Promise<{ player: PlayerState; ship: ShipState }> { return this.stub(); }
  async getVersion(): Promise<{ version: string }> { return this.stub(); }

  // ── Galaxy ──
  async getMap(): Promise<StarSystem[]> { return this.stub(); }
  async getSystem(systemId?: string): Promise<StarSystem> { return this.stub(); }
  async getPoi(poiId: string): Promise<PoiDetail> { return this.stub(); }
  async findRoute(from: string, to: string): Promise<{ route: string[]; jumps: number; fuelCost: number }> { return this.stub(); }
  async searchSystems(query: string): Promise<StarSystem[]> { return this.stub(); }

  // ── Navigation ──
  async travel(targetPoi: string): Promise<TravelResult> { return this.stub(); }
  async jump(targetSystem: string): Promise<TravelResult> { return this.stub(); }

  // ── Station ──
  async dock(): Promise<void> { return this.stub(); }
  async undock(): Promise<void> { return this.stub(); }
  async refuel(amount?: number): Promise<{ fuelAdded: number; cost: number }> { return this.stub(); }
  async repair(): Promise<{ hullRestored: number; cost: number }> { return this.stub(); }

  // ── Mining ──
  async mine(): Promise<MiningYield> { return this.stub(); }
  async scan(): Promise<{ pois: PoiDetail[] }> { return this.stub(); }

  // ── Market ──
  async viewMarket(): Promise<{ items: MarketPrice[] }> { return this.stub(); }
  async buy(itemId: string, quantity: number): Promise<TradeResult> { return this.stub(); }
  async sell(itemId: string, quantity: number): Promise<TradeResult> { return this.stub(); }
  async estimatePurchase(itemId: string, quantity: number): Promise<EstimatePurchaseResult> { return this.stub(); }
  async analyzeMarket(): Promise<AnalyzeMarketResult> { return this.stub(); }
  async viewOrders(): Promise<{ orders: MarketOrder[] }> { return this.stub(); }
  async createBuyOrder(itemId: string, quantity: number, priceEach: number): Promise<MarketOrder> { return this.stub(); }
  async createSellOrder(itemId: string, quantity: number, priceEach: number): Promise<MarketOrder> { return this.stub(); }
  async cancelOrder(orderId: string): Promise<void> { return this.stub(); }

  // ── Cargo / Storage ──
  async getCargo(): Promise<CargoItem[]> { return this.stub(); }
  async jettison(itemId: string, quantity: number): Promise<void> { return this.stub(); }
  async viewStorage(): Promise<{ items: CargoItem[] }> { return this.stub(); }
  async depositItems(itemId: string, quantity: number): Promise<void> { return this.stub(); }
  async withdrawItems(itemId: string, quantity: number): Promise<void> { return this.stub(); }

  // ── Faction Storage ──
  async viewFactionStorage(): Promise<{ items: CargoItem[]; credits: number }> { return this.stub(); }
  async viewFactionStorageFull(): Promise<{ items: CargoItem[]; credits: number; itemNames: Record<string, string> }> { return this.stub(); }
  async factionDepositItems(itemId: string, quantity: number): Promise<void> { return this.stub(); }
  async factionWithdrawItems(itemId: string, quantity: number): Promise<void> { return this.stub(); }
  async factionDepositCredits(amount: number): Promise<void> { return this.stub(); }
  async factionWithdrawCredits(amount: number): Promise<void> { return this.stub(); }

  // ── Crafting ──
  async craft(recipeId: string, count?: number): Promise<CraftResult> { return this.stub(); }

  // ── Combat ──
  async attack(targetId: string): Promise<void> { return this.stub(); }
  async battle(action: string): Promise<BattleStatus> { return this.stub(); }
  async getBattleStatus(): Promise<BattleStatus | null> { return this.stub(); }
  async getNearby(): Promise<NearbyPlayer[]> { return this.stub(); }
  async lootWreck(wreckId: string): Promise<CargoItem[]> { return this.stub(); }
  async getWrecks(): Promise<Array<{ id: string; [k: string]: unknown }>> { return this.stub(); }
  async salvageWreck(wreckId: string): Promise<void> { return this.stub(); }
  async scrapWreck(wreckId: string): Promise<void> { return this.stub(); }
  async towWreck(wreckId: string): Promise<void> { return this.stub(); }
  async sellWreck(wreckId: string): Promise<void> { return this.stub(); }
  async releaseTow(): Promise<void> { return this.stub(); }

  // ── Modules ──
  async installMod(moduleId: string): Promise<void> { return this.stub(); }
  async uninstallMod(moduleId: string): Promise<void> { return this.stub(); }

  // ── Ship ──
  async getShip(): Promise<ShipState> { return this.stub(); }
  async listShips(): Promise<Array<{ id: string; classId: string; name: string | null; ship_id?: string; class_id?: string; ship_class?: string }>> { return this.stub(); }
  async switchShip(shipId: string): Promise<void> { return this.stub(); }
  async buyShip(classId: string): Promise<{ shipId: string }> { return this.stub(); }
  async sellShip(shipId: string): Promise<{ credits: number }> { return this.stub(); }
  async shipyardShowroom(): Promise<Array<Record<string, unknown>>> { return this.stub(); }
  async browseShips(): Promise<Array<Record<string, unknown>>> { return this.stub(); }
  async buyListedShip(listingId: string): Promise<void> { return this.stub(); }

  // ── Ship Commissions ──
  async commissionQuote(classId: string): Promise<{ cost: number; time: number }> { return this.stub(); }
  async commissionShip(classId: string): Promise<void> { return this.stub(); }
  async commissionStatus(): Promise<Array<{ id: string; status: string; shipClass: string; ship_class: string; remainingTicks: number }>> { return this.stub(); }
  async cancelCommission(commissionId: string): Promise<void> { return this.stub(); }
  async claimCommission(): Promise<void> { return this.stub(); }

  // ── Missions ──
  async getMissions(): Promise<Mission[]> { return this.stub(); }
  async getActiveMissions(): Promise<Mission[]> { return this.stub(); }
  async acceptMission(missionId: string): Promise<void> { return this.stub(); }
  async completeMission(missionId: string): Promise<void> { return this.stub(); }
  async abandonMission(missionId: string): Promise<void> { return this.stub(); }
  async declineMission(missionId: string): Promise<void> { return this.stub(); }

  // ── Skills ──
  async getSkills(): Promise<Record<string, { level: number; xp: number; xpNext: number }>> { return this.stub(); }

  // ── Catalog ──
  async catalog(type: string, opts?: { page?: number; pageSize?: number; category?: string }): Promise<Record<string, unknown>[]> { return this.stub(); }

  // ── Fuel ──
  async useItem(itemId: string): Promise<void> { return this.stub(); }
  async reload(): Promise<void> { return this.stub(); }

  // ── Social ──
  async getNotifications(): Promise<GameNotification[]> { return this.stub(); }
  async chat(message: string): Promise<void> { return this.stub(); }
  async setStatus(message: string): Promise<void> { return this.stub(); }
  async setAnonymous(anonymous: boolean): Promise<void> { return this.stub(); }
  async cloak(): Promise<void> { return this.stub(); }
  async sendGift(targetId: string, itemId: string, quantity: number): Promise<void> { return this.stub(); }

  // ── Faction ──
  async factionInfo(): Promise<Record<string, unknown>> { return this.stub(); }
  async factionInvite(username: string): Promise<void> { return this.stub(); }
  async factionPromote(username: string, role: string): Promise<void> { return this.stub(); }
  async factionKick(username: string): Promise<void> { return this.stub(); }
  async joinFaction(factionId: string): Promise<void> { return this.stub(); }
  async leaveFaction(): Promise<void> { return this.stub(); }
  async factionListFacilities(): Promise<Array<Record<string, unknown>>> { return this.stub(); }
  async surveySystem(): Promise<Record<string, unknown>> { return this.stub(); }

  // ── Home ──
  async setHomeBase(): Promise<void> { return this.stub(); }
  async getBase(): Promise<Record<string, unknown>> { return this.stub(); }

  // ── Insurance ──
  async getInsuranceQuote(): Promise<{ cost: number }> { return this.stub(); }
  async buyInsurance(): Promise<void> { return this.stub(); }
  async claimInsurance(): Promise<void> { return this.stub(); }

  // ── Self Destruct ──
  async selfDestruct(): Promise<void> { return this.stub(); }
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly waitSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Normalizers (used by GameCache) ──

function str(v: unknown): string {
  return String(v ?? "");
}

function num(v: unknown): number {
  return Number(v ?? 0) || 0;
}

export function normalizeRecipe(raw: Record<string, unknown>): Recipe {
  const rawIngs = (raw.ingredients ?? raw.materials ?? raw.inputs) as Array<Record<string, unknown>> | undefined;
  const ingredients = (rawIngs ?? []).map((i) => ({
    itemId: str(i.item_id ?? i.itemId),
    quantity: num(i.quantity ?? i.amount) || 1,
  }));

  const requiredSkills: Record<string, number> = {};
  const rawSkills = raw.required_skills ?? raw.requiredSkills ?? raw.skills;
  if (rawSkills && typeof rawSkills === "object" && !Array.isArray(rawSkills)) {
    for (const [k, v] of Object.entries(rawSkills as Record<string, unknown>)) {
      requiredSkills[k] = num(v);
    }
  }

  const xpRewards: Record<string, number> = {};
  const rawXp = raw.xp_rewards ?? raw.xpRewards ?? raw.xp;
  if (rawXp && typeof rawXp === "object" && !Array.isArray(rawXp)) {
    for (const [k, v] of Object.entries(rawXp as Record<string, unknown>)) {
      xpRewards[k] = num(v);
    }
  }

  const rawOutputs = raw.outputs as Array<Record<string, unknown>> | undefined;
  const outputItem = rawOutputs?.[0]?.item_id ?? raw.output_item ?? raw.outputItem ?? raw.output ?? "";
  const outputQuantity = rawOutputs?.[0]?.quantity ?? raw.output_quantity ?? raw.outputQuantity ?? 1;

  return {
    id: str(raw.id ?? raw.recipe_id),
    name: str(raw.name),
    description: str(raw.description),
    outputItem: str(outputItem),
    outputQuantity: num(outputQuantity) || 1,
    ingredients,
    requiredSkills,
    xpRewards,
  };
}

export function normalizeCatalogItem(raw: Record<string, unknown>): CatalogItem {
  return {
    id: str(raw.id ?? raw.item_id),
    name: str(raw.name),
    category: str(raw.category ?? raw.type),
    description: str(raw.description),
    basePrice: num(raw.base_price ?? raw.basePrice ?? raw.price),
    stackSize: num(raw.stack_size ?? raw.stackSize ?? 100) || 100,
  };
}

export function normalizeShipClass(raw: Record<string, unknown>): ShipClass {
  return {
    id: str(raw.id),
    name: str(raw.name),
    category: str(raw.category),
    description: str(raw.description),
    basePrice: num(raw.price ?? raw.base_price ?? raw.basePrice),
    hull: num(raw.base_hull ?? raw.hull),
    shield: num(raw.base_shield ?? raw.shield),
    armor: num(raw.base_armor ?? raw.armor),
    speed: num(raw.base_speed ?? raw.speed),
    fuel: num(raw.base_fuel ?? raw.fuel),
    cargoCapacity: num(raw.cargo_capacity ?? raw.cargoCapacity),
    cpuCapacity: num(raw.cpu_capacity ?? raw.cpuCapacity),
    powerCapacity: num(raw.power_capacity ?? raw.powerCapacity),
  };
}
