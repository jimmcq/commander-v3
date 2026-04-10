/**
 * Bot role labels — single source for UI display.
 * Mirrors src/commander/roles.ts BotRole type.
 */
export const ROLE_LABELS: Record<string, string> = {
	ore_miner: "Miner-Ore",
	crystal_miner: "Miner-Crystal",
	gas_harvester: "Harvester-Gas",
	ice_harvester: "Harvester-Ice",
	explorer: "Explorer",
	trader: "Trader",
	crafter: "Crafter",
	quartermaster: "Quartermaster",
	hunter: "Hunter",
	mission_runner: "Mission Runner",
	ship_dealer: "Ship Dealer",
	shipwright: "Shipwright",
	default: "Generalist",
};

export function roleLabel(role: string | null | undefined): string {
	if (!role) return "--";
	return ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}
