/**
 * Fleet management barrel export.
 */

export { ensureFactionMembership, promoteFactionMembers } from "./faction-manager";
export { discoverFactionStorage, propagateFleetHome } from "./home-discovery";
export type { DiscoveryResult } from "./home-discovery";
export {
  saveBotSettings, loadBotSettings,
  saveFleetSettings, loadFleetSettings,
  saveGoals, loadGoals,
} from "./persistence";
export type { BotSettingsData, FleetSettingsData } from "./persistence";
