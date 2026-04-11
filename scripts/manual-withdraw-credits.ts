/**
 * Withdraw credits from faction treasury to bot wallet.
 * Bot must be docked at faction storage station.
 *
 * Usage: bun run scripts/manual-withdraw-credits.ts <username> <amount>
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
	console.log(`[1] ${username}: ${status.player?.credits?.toLocaleString()}cr, docked=${docked ?? "(no)"}`);

	if (!docked) {
		console.error("[!] Not docked.");
		process.exit(1);
	}

	const result = await api.factionWithdrawCredits(amount);
	console.log(`[2] Withdraw result:`, JSON.stringify(result, null, 2));
	process.exit(0);
}

main().catch(err => { console.error("ERROR:", err.message ?? err); process.exit(1); });
