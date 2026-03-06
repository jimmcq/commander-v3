import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDatabase, type DB } from "../../src/data/db";
import {
  saveBotSettings, loadBotSettings,
  saveFleetSettings, loadFleetSettings,
  saveGoals, loadGoals,
} from "../../src/fleet/persistence";
import type { Goal } from "../../src/config/schema";
import { unlinkSync } from "fs";

describe("Fleet Persistence", () => {
  let db: DB;
  let dbPath: string;

  beforeEach(() => {
    dbPath = `test_persistence_${Date.now()}_${Math.random().toString(36).slice(2)}.db`;
    ({ db } = createDatabase(dbPath));
  });

  afterEach(() => {
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + "-wal"); } catch {}
    try { unlinkSync(dbPath + "-shm"); } catch {}
  });

  // ── Bot Settings ──

  test("save and load bot settings", () => {
    saveBotSettings(db, "TestBot", {
      fuelEmergencyThreshold: 25,
      autoRepair: true,
      maxCargoFillPct: 85,
      storageMode: "faction_deposit",
      factionStorage: true,
    });

    const loaded = loadBotSettings(db, "TestBot");
    expect(loaded).not.toBeNull();
    expect(loaded!.fuelEmergencyThreshold).toBe(25);
    expect(loaded!.autoRepair).toBe(true);
    expect(loaded!.maxCargoFillPct).toBe(85);
    expect(loaded!.storageMode).toBe("faction_deposit");
    expect(loaded!.factionStorage).toBe(true);
  });

  test("load returns null for unknown bot", () => {
    const loaded = loadBotSettings(db, "UnknownBot");
    expect(loaded).toBeNull();
  });

  test("save overwrites existing settings", () => {
    saveBotSettings(db, "TestBot", {
      fuelEmergencyThreshold: 20,
      autoRepair: true,
      maxCargoFillPct: 90,
      storageMode: "sell",
      factionStorage: false,
    });

    saveBotSettings(db, "TestBot", {
      fuelEmergencyThreshold: 30,
      autoRepair: false,
      maxCargoFillPct: 80,
      storageMode: "deposit",
      factionStorage: true,
    });

    const loaded = loadBotSettings(db, "TestBot");
    expect(loaded!.fuelEmergencyThreshold).toBe(30);
    expect(loaded!.autoRepair).toBe(false);
    expect(loaded!.storageMode).toBe("deposit");
  });

  test("boolean conversion (0/1 to true/false)", () => {
    saveBotSettings(db, "TestBot", {
      fuelEmergencyThreshold: 20,
      autoRepair: false,
      maxCargoFillPct: 90,
      storageMode: "sell",
      factionStorage: false,
    });

    const loaded = loadBotSettings(db, "TestBot");
    expect(loaded!.autoRepair).toBe(false);
    expect(loaded!.factionStorage).toBe(false);
  });

  // ── Fleet Settings ──

  test("save and load fleet settings", () => {
    saveFleetSettings(db, {
      factionTaxPercent: 10,
      minBotCredits: 5000,
    });

    const loaded = loadFleetSettings(db);
    expect(loaded).not.toBeNull();
    expect(loaded!.factionTaxPercent).toBe(10);
    expect(loaded!.minBotCredits).toBe(5000);
  });

  test("load returns null when no settings saved", () => {
    const loaded = loadFleetSettings(db);
    expect(loaded).toBeNull();
  });

  test("fleet settings overwrite", () => {
    saveFleetSettings(db, { factionTaxPercent: 5, minBotCredits: 1000 });
    saveFleetSettings(db, { factionTaxPercent: 15, minBotCredits: 3000 });

    const loaded = loadFleetSettings(db);
    expect(loaded!.factionTaxPercent).toBe(15);
    expect(loaded!.minBotCredits).toBe(3000);
  });

  // ── Goals ──

  test("save and load goals", () => {
    const goalList: Goal[] = [
      { type: "maximize_income", priority: 5, params: {} },
      { type: "explore_region", priority: 3, params: { region: "alpha" } },
    ];

    saveGoals(db, goalList);
    const loaded = loadGoals(db);

    expect(loaded.length).toBe(2);
    // Should be sorted by priority desc
    expect(loaded[0].type).toBe("maximize_income");
    expect(loaded[0].priority).toBe(5);
    expect(loaded[1].type).toBe("explore_region");
    expect(loaded[1].params).toEqual({ region: "alpha" });
  });

  test("save goals replaces existing", () => {
    saveGoals(db, [{ type: "maximize_income", priority: 5, params: {} }]);
    saveGoals(db, [{ type: "prepare_for_war", priority: 10, params: {} }]);

    const loaded = loadGoals(db);
    expect(loaded.length).toBe(1);
    expect(loaded[0].type).toBe("prepare_for_war");
  });

  test("save empty goals clears all", () => {
    saveGoals(db, [{ type: "maximize_income", priority: 5, params: {} }]);
    saveGoals(db, []);

    const loaded = loadGoals(db);
    expect(loaded.length).toBe(0);
  });

  test("goals with constraints", () => {
    const goalList: Goal[] = [{
      type: "maximize_income",
      priority: 5,
      params: {},
      constraints: { maxRiskLevel: 2, regionLock: ["sol", "alpha"] },
    }];

    saveGoals(db, goalList);
    const loaded = loadGoals(db);

    expect(loaded[0].constraints).toBeDefined();
    expect(loaded[0].constraints!.maxRiskLevel).toBe(2);
    expect(loaded[0].constraints!.regionLock).toEqual(["sol", "alpha"]);
  });
});
