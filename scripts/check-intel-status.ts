/**
 * Check faction intel + trade intel status from the API.
 */
import { ApiClient } from "../src/core/api-client";
import { SessionStore } from "../src/data/session-store";
import { createDatabase } from "../src/data/db";

const TENANT_ID = "46662032-87fa-42c7-9b94-0083086bbd46";
const DATABASE_URL = "postgresql://humbrol2:3e1779ab4980bd4c7133eb457f8d3a0b@10.0.0.54:5432/commander";

async function main() {
	const conn = createDatabase(DATABASE_URL);
	const sessionStore = new SessionStore(conn.db, TENANT_ID);
	const stubLogger: any = { recordCall: () => {}, logFactionCreditTx: () => {}, logLedger: () => Promise.resolve() };
	const api = new ApiClient({ username: "Vex Castellan", sessionStore, logger: stubLogger });
	await api.restoreSession();
	await api.login();
	console.log("[1] Logged in");

	console.log("\n=== faction_intel_status ===");
	try {
		const intel: any = await api.factionIntelStatus();
		console.log(JSON.stringify(intel, null, 2));
	} catch (err: any) { console.log("ERROR:", err.message); }

	console.log("\n=== faction_trade_intel_status ===");
	try {
		const tradeIntel: any = await api.factionTradeIntelStatus();
		console.log(JSON.stringify(tradeIntel, null, 2));
	} catch (err: any) { console.log("ERROR:", err.message); }

	console.log("\n=== faction facilities ===");
	try {
		const facs: any = await api.factionListFacilities();
		console.log(JSON.stringify(facs, null, 2));
	} catch (err: any) { console.log("ERROR:", err.message); }

	process.exit(0);
}

main().catch(err => { console.error("ERROR:", err.message ?? err); process.exit(1); });
