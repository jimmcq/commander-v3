import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createDatabase, type DB } from "../../src/data/db";
import { discoverFactionStorage, propagateFleetHome } from "../../src/fleet/home-discovery";
import { Galaxy } from "../../src/core/galaxy";
import { unlinkSync } from "fs";

function setupGalaxy(): Galaxy {
  const galaxy = new Galaxy();
  galaxy.load([
    {
      id: "sol",
      name: "Sol",
      x: 0, y: 0,
      empire: "solarian",
      policeLevel: 3,
      connections: ["alpha"],
      pois: [
        { id: "sol_earth", name: "Earth", type: "planet", hasBase: true, baseId: "base_earth", baseName: "Earth Station", resources: [] },
        { id: "sol_belt", name: "Belt", type: "asteroid_belt", hasBase: false, baseId: null, baseName: null, resources: [] },
      ],
    },
    {
      id: "alpha",
      name: "Alpha",
      x: 10, y: 5,
      empire: "solarian",
      policeLevel: 2,
      connections: ["sol"],
      pois: [
        { id: "alpha_station", name: "Alpha Station", type: "station", hasBase: true, baseId: "base_alpha", baseName: "Alpha", resources: [] },
      ],
    },
  ]);
  return galaxy;
}

/** Minimal mock BotManager for discovery tests */
function mockBotManager(overrides: Partial<{
  homeBase: string;
  homeSystem: string;
  factionStorageStation: string;
  bots: any[];
}> = {}) {
  const fleetConfig = {
    homeSystem: overrides.homeSystem ?? "",
    homeBase: overrides.homeBase ?? "",
    defaultStorageMode: "sell" as const,
    factionStorageStation: overrides.factionStorageStation ?? "",
    factionTaxPercent: 0,
    minBotCredits: 0,
  };

  return {
    fleetConfig,
    getAllBots: () => overrides.bots ?? [],
  } as any;
}

describe("Home Discovery", () => {
  let db: DB;
  let dbPath: string;

  beforeEach(() => {
    dbPath = `test_hd_${Date.now()}_${Math.random().toString(36).slice(2)}.db`;
    ({ db } = createDatabase(dbPath));
  });

  afterEach(() => {
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + "-wal"); } catch {}
    try { unlinkSync(dbPath + "-shm"); } catch {}
  });

  test("method 3: finds station from galaxy data", async () => {
    const galaxy = setupGalaxy();
    const bm = mockBotManager();

    const result = await discoverFactionStorage(bm, galaxy, db);
    expect(result).not.toBeNull();
    expect(result!.stationId).toBe("base_earth");
    expect(result!.systemId).toBe("sol");
    expect(result!.method).toBe("cached_system");
  });

  test("method 5: uses configured homeBase", async () => {
    const galaxy = new Galaxy(); // empty galaxy
    const bm = mockBotManager({ homeBase: "base_config" });

    const result = await discoverFactionStorage(bm, galaxy, db);
    expect(result).not.toBeNull();
    expect(result!.stationId).toBe("base_config");
    expect(result!.method).toBe("config");
  });

  test("method 6: player home fallback", async () => {
    const galaxy = new Galaxy();
    const bm = mockBotManager({
      bots: [{
        status: "ready",
        username: "bot1",
        player: { homeBase: "player_home_base", currentSystem: "sol", factionId: null, dockedAtBase: null },
        api: {},
      }],
    });

    const result = await discoverFactionStorage(bm, galaxy, db);
    expect(result).not.toBeNull();
    expect(result!.stationId).toBe("player_home_base");
    expect(result!.method).toBe("player_home");
  });

  test("method 7: docked bot fallback", async () => {
    const galaxy = new Galaxy();
    const bm = mockBotManager({
      bots: [{
        status: "ready",
        username: "bot1",
        player: { homeBase: null, currentSystem: "sol", factionId: null, dockedAtBase: "docked_base" },
        api: {},
      }],
    });

    const result = await discoverFactionStorage(bm, galaxy, db);
    expect(result).not.toBeNull();
    expect(result!.stationId).toBe("docked_base");
    expect(result!.method).toBe("docked_bot");
  });

  test("caches result for subsequent calls", async () => {
    const galaxy = setupGalaxy();
    const bm = mockBotManager();

    // First call discovers
    const result1 = await discoverFactionStorage(bm, galaxy, db);
    expect(result1!.method).toBe("cached_system");

    // Second call should hit cache (method 1)
    const result2 = await discoverFactionStorage(bm, galaxy, db);
    expect(result2!.stationId).toBe("base_earth");
    expect(result2!.method).toBe("cache");
  });

  test("returns null when no methods succeed", async () => {
    const galaxy = new Galaxy();
    const bm = mockBotManager();

    const result = await discoverFactionStorage(bm, galaxy, db);
    expect(result).toBeNull();
  });
});

describe("propagateFleetHome", () => {
  test("sets fleet config and bot configs", () => {
    const bot1 = {
      fleetConfig: { homeBase: "", homeSystem: "", factionStorageStation: "" },
    };
    const bot2 = {
      fleetConfig: { homeBase: "", homeSystem: "", factionStorageStation: "" },
    };
    const bm = {
      fleetConfig: { homeBase: "", homeSystem: "", factionStorageStation: "" },
      getAllBots: () => [bot1, bot2],
    } as any;

    propagateFleetHome(bm, "station_1", "sys_1");

    expect(bm.fleetConfig.factionStorageStation).toBe("station_1");
    expect(bm.fleetConfig.homeBase).toBe("station_1");
    expect(bm.fleetConfig.homeSystem).toBe("sys_1");
    expect(bot1.fleetConfig.factionStorageStation).toBe("station_1");
    expect(bot2.fleetConfig.homeBase).toBe("station_1");
  });

  test("does not overwrite existing homeBase", () => {
    const bm = {
      fleetConfig: { homeBase: "existing_base", homeSystem: "", factionStorageStation: "" },
      getAllBots: () => [],
    } as any;

    propagateFleetHome(bm, "new_station", "sys_1");

    expect(bm.fleetConfig.homeBase).toBe("existing_base");
    expect(bm.fleetConfig.factionStorageStation).toBe("new_station");
  });
});
