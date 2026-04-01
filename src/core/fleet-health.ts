/**
 * Fleet Health Monitor — overseer-inspired fleet-wide health scoring and alerts.
 *
 * Evaluates fleet state every eval cycle and produces:
 *   - Per-bot health scores (0-100)
 *   - Fleet-wide health score
 *   - Critical alerts (stranded, broke, no fuel, stuck)
 *   - Strategic recommendations (rebalance roles, rotate systems, etc.)
 *
 * Inspired by geleynse/gantry's overseer-agent and fleet-health-monitor.
 */

export interface BotHealth {
  botId: string;
  score: number;        // 0-100 composite health
  fuelScore: number;    // 0-100
  hullScore: number;    // 0-100
  creditScore: number;  // 0-100
  activityScore: number; // 0-100 (are they productive?)
  alerts: string[];
}

export interface FleetHealth {
  overallScore: number;           // 0-100 fleet average
  activeBots: number;
  totalBots: number;
  criticalBots: BotHealth[];      // Bots scoring below 30
  alerts: string[];               // Fleet-wide alerts
  recommendations: string[];      // Strategic suggestions
}

export interface BotSnapshot {
  botId: string;
  status: string;
  routine: string | null;
  fuelPct: number;
  hullPct: number;
  credits: number;
  docked: boolean;
  systemId: string;
  role?: string;
  lastActivity?: number; // Timestamp of last yield/action
}

/**
 * Evaluate health for a single bot.
 */
export function evaluateBotHealth(bot: BotSnapshot, minCredits: number): BotHealth {
  const alerts: string[] = [];

  // Fuel score: 100 at full, 0 at empty, critical below 10%
  const fuelScore = Math.min(100, bot.fuelPct);
  if (bot.fuelPct < 5) alerts.push("CRITICAL: nearly out of fuel");
  else if (bot.fuelPct < 15) alerts.push("low fuel");

  // Hull score
  const hullScore = Math.min(100, bot.hullPct);
  if (bot.hullPct < 20) alerts.push("CRITICAL: hull near destruction");
  else if (bot.hullPct < 50) alerts.push("hull damaged");

  // Credit score: 100 if above min, scales down to 0
  const creditScore = minCredits > 0
    ? Math.min(100, (bot.credits / minCredits) * 100)
    : bot.credits > 1000 ? 100 : Math.min(100, bot.credits / 10);
  if (bot.credits < 100) alerts.push("broke — no credits");

  // Activity score: based on status and whether they're producing
  let activityScore = 100;
  if (bot.status === "error") {
    activityScore = 0;
    alerts.push("ERROR state");
  } else if (bot.status === "idle" || bot.status === "stopped") {
    activityScore = 20;
    if (!bot.routine) alerts.push("idle — no routine assigned");
  } else if (bot.routine === "return_home") {
    activityScore = 40; // Not producing but at least doing something
  }

  const score = Math.round(
    fuelScore * 0.25 + hullScore * 0.2 + creditScore * 0.15 + activityScore * 0.4
  );

  return { botId: bot.botId, score, fuelScore, hullScore, creditScore, activityScore, alerts };
}

/**
 * Evaluate fleet-wide health and generate strategic recommendations.
 */
export function evaluateFleetHealth(
  bots: BotSnapshot[],
  config: { minCredits: number; homeSystem: string },
): FleetHealth {
  const botHealths = bots.map(b => evaluateBotHealth(b, config.minCredits));
  const activeBots = bots.filter(b => b.status === "running" || b.status === "ready").length;

  const overallScore = botHealths.length > 0
    ? Math.round(botHealths.reduce((sum, h) => sum + h.score, 0) / botHealths.length)
    : 0;

  const criticalBots = botHealths.filter(h => h.score < 30);
  const alerts: string[] = [];
  const recommendations: string[] = [];

  // Fleet-wide alerts
  if (activeBots < bots.length * 0.5) {
    alerts.push(`Only ${activeBots}/${bots.length} bots active — fleet is degraded`);
  }
  if (criticalBots.length > 0) {
    alerts.push(`${criticalBots.length} bot(s) in critical state`);
  }

  // Role distribution analysis
  const routineCounts = new Map<string, number>();
  for (const bot of bots) {
    if (bot.routine) routineCounts.set(bot.routine, (routineCounts.get(bot.routine) ?? 0) + 1);
  }

  const miners = (routineCounts.get("miner") ?? 0) + (routineCounts.get("harvester") ?? 0);
  const crafters = routineCounts.get("crafter") ?? 0;
  const traders = routineCounts.get("trader") ?? 0;
  const scouts = (routineCounts.get("scout") ?? 0) + (routineCounts.get("explorer") ?? 0);
  const idle = bots.filter(b => !b.routine || b.routine === "return_home").length;

  if (miners === 0 && activeBots > 3) recommendations.push("No miners active — raw materials will run out");
  if (crafters > miners * 2) recommendations.push("Too many crafters relative to miners — crafters will starve for materials");
  if (traders === 0 && activeBots > 5) recommendations.push("No traders active — crafted goods accumulating unsold");
  if (scouts === 0 && activeBots > 8) recommendations.push("No scouts — market data going stale");
  if (idle > activeBots * 0.3) recommendations.push(`${idle} bots idle — may need more work orders or role rebalancing`);

  // System concentration check
  const systemCounts = new Map<string, number>();
  for (const bot of bots) {
    if (bot.systemId) systemCounts.set(bot.systemId, (systemCounts.get(bot.systemId) ?? 0) + 1);
  }
  const maxInOneSystem = Math.max(...systemCounts.values(), 0);
  if (maxInOneSystem > activeBots * 0.7 && activeBots > 5) {
    const crowdedSystem = [...systemCounts.entries()].find(([, c]) => c === maxInOneSystem)?.[0];
    recommendations.push(`${maxInOneSystem} bots concentrated in ${crowdedSystem} — consider spreading out`);
  }

  // Credit health
  const totalCredits = bots.reduce((sum, b) => sum + b.credits, 0);
  const avgCredits = bots.length > 0 ? totalCredits / bots.length : 0;
  if (avgCredits < 1000 && activeBots > 3) {
    recommendations.push("Fleet-wide credit shortage — prioritize trading/selling");
  }

  return {
    overallScore,
    activeBots,
    totalBots: bots.length,
    criticalBots,
    alerts,
    recommendations,
  };
}
