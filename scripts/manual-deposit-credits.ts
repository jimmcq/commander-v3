/**
 * Deposit credits from bot wallet to faction treasury.
 * Bot must be docked at faction storage station.
 * Usage: bun run scripts/manual-deposit-credits.ts <username> <amount>
 */
import { ApiClient } from "../src/core/api-client";
import { SessionStore } from "../src/data/session-store";
import { createDatabase } from "../src/data/db";

const TENANT_ID = "46662032-87fa-42c7-9b94-0083086bbd46";
const DATABASE_URL = "postgresql://humbrol2:3e1779ab4980bd4c7133eb457f8d3a0b@10.0.0.54:5432/commander";

async function main() {
	const [username, amountStr] = process.argv.slice(2);
	if (!username || !amountStr) { console.error("Usage: <username> <amount>"); process.exit(1); }
	const amount = parseInt(amountStr);

	const conn = createDatabase(DATABASE_URL);
	const sessionStore = new SessionStore(conn.db, TENANT_ID);
	const stubLogger: any = { recordCall: () => {}, logFactionCreditTx: () => {}, logLedger: () => Promise.resolve() };
	const api = new ApiClient({ username, sessionStore, logger: stubLogger });
	await api.restoreSession();
	await api.login();

	const status: any = await api.getStatus();
	const docked = status.player?.docked_at_base ?? status.player?.dockedAtBase;
	console.log(`[1] ${username}: ${(status.player?.credits ?? 0).toLocaleString()}cr, docked=${docked ?? "(no)"}`);

	if (!docked) { console.error("[!] Not docked."); process.exit(1); }

	const result = await api.factionDepositCredits(amount);
	console.log(`[2] Deposit ${amount.toLocaleString()}cr result:`, JSON.stringify(result, null, 2));

	// Manual ledger entries (api uses stub logger here)
	const { recordMovement } = await import("../src/data/credit-ledger");
	const playerCredits = Number((result as any).player_credits ?? 0);
	const factionCredits = Number((result as any).faction_credits ?? 0);
	const ts = Date.now();
	await recordMovement(conn.db, {
		tenantId: TENANT_ID, timestamp: ts, account: username,
		type: "faction_deposit", delta: -amount,
		balanceBefore: playerCredits + amount, balanceAfter: playerCredits,
		source: "scripts/manual-deposit-credits.ts", details: "MANUAL deposit to treasury",
	});
	await recordMovement(conn.db, {
		tenantId: TENANT_ID, timestamp: ts, account: "faction_treasury",
		type: "deposit_in", delta: amount,
		balanceBefore: factionCredits - amount, balanceAfter: factionCredits,
		source: "scripts/manual-deposit-credits.ts", details: `MANUAL from ${username}`,
	});
	console.log(`[ledger] Recorded -${amount}cr for ${username}, +${amount}cr for treasury`);
	process.exit(0);
}

main().catch(err => { console.error("ERROR:", err.message ?? err); process.exit(1); });
