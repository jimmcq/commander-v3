/**
 * Faction Manager — handles faction membership enrollment and periodic promotion.
 * Extracted from v2 index.ts (L1297-1464).
 */

import type { BotManager } from "../bot/bot-manager";

const RATE_LIMIT_DELAY = 11_000; // 11s between API calls

/**
 * Ensure all fleet bots are in the same faction with officer rank.
 * Finds the "officer" (first bot already in a faction) and enrolls the rest.
 */
export async function ensureFactionMembership(botManager: BotManager): Promise<void> {
  const bots = botManager.getAllBots().filter(
    b => b.status === "ready" || b.status === "running"
  );

  if (bots.length < 2) {
    console.log("[Faction] Need at least 2 bots for faction enrollment");
    return;
  }

  // Find the officer (first bot already in a faction)
  const officer = bots.find(b => b.player?.factionId);
  if (!officer?.player?.factionId) {
    console.log("[Faction] No bot is in a faction yet — skipping enrollment");
    return;
  }

  const officerApi = officer.api;
  if (!officerApi) {
    console.log("[Faction] Officer has no API client — skipping enrollment");
    return;
  }

  const targetFaction = officer.player.factionId;
  const nonMembers = bots.filter(b => b.player?.factionId !== targetFaction);

  if (nonMembers.length === 0) {
    console.log("[Faction] All bots already in faction");
    return;
  }

  // Check for bots in different factions
  const wrongFaction = nonMembers.filter(b => b.player?.factionId && b.player.factionId !== targetFaction);
  if (wrongFaction.length > 0) {
    console.log(`[Faction] WARNING: ${wrongFaction.length} bots in different factions — manual intervention needed`);
  }

  const toEnroll = nonMembers.filter(b => !b.player?.factionId);
  console.log(`[Faction] Enrolling ${toEnroll.length} bots into faction ${targetFaction}`);

  for (const bot of toEnroll) {
    const botApi = bot.api;
    if (!botApi) continue;

    try {
      await officerApi.factionInvite(bot.username);
      console.log(`[Faction] Officer invited ${bot.username}`);
      await sleep(RATE_LIMIT_DELAY);

      const invites = await botApi.factionGetInvites();
      const invite = invites?.find((i: any) => i.factionId === targetFaction);
      if (invite) {
        await botApi.joinFaction(targetFaction);
        console.log(`[Faction] ${bot.username} joined faction`);
        await sleep(RATE_LIMIT_DELAY);
      } else {
        console.log(`[Faction] No invite found for ${bot.username}`);
      }
    } catch (err) {
      console.log(`[Faction] Failed to enroll ${bot.username}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

/**
 * Periodically promote faction members to officer rank.
 * Should be called every ~60 seconds.
 */
export async function promoteFactionMembers(
  botManager: BotManager,
  promotedBots: Set<string>,
): Promise<void> {
  const factionHome = botManager.fleetConfig.factionStorageStation || botManager.fleetConfig.homeBase;
  if (!factionHome) return;

  // Find a leader bot docked at faction home
  const leaderBot = botManager.getAllBots().find(
    b => b.player?.factionRank === "leader" && b.player?.dockedAtBase === factionHome
  );
  if (!leaderBot) return;

  const leaderApi = leaderBot.api;
  if (!leaderApi) return;

  // Find members needing promotion
  const members = botManager.getAllBots().filter(b => {
    if (!b.player?.factionId) return false;
    if (b.player.factionRank === "officer" || b.player.factionRank === "leader") return false;
    if (promotedBots.has(b.username)) return false;
    return true;
  });

  for (const bot of members) {
    try {
      await leaderApi.factionPromote(bot.username, "officer");
      console.log(`[Faction] Promoted ${bot.username} to officer`);
    } catch (err) {
      console.log(`[Faction] Failed to promote ${bot.username}: ${err instanceof Error ? err.message : err}`);
    }
    promotedBots.add(bot.username);
    await sleep(RATE_LIMIT_DELAY);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
