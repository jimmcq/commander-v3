/**
 * Check actual faction storage contents.
 */
import { ApiClient } from "../src/core/api-client";
import { SessionStore } from "../src/data/session-store";
import { createDatabase } from "../src/data/db";

const TENANT_ID = "46662032-87fa-42c7-9b94-0083086bbd46";
const DATABASE_URL = "postgresql://humbrol2:3e1779ab4980bd4c7133eb457f8d3a0b@10.0.0.54:5432/commander";

async function main() {
	const filter = process.argv[2] ?? "";
	const conn = createDatabase(DATABASE_URL);
	const sessionStore = new SessionStore(conn.db, TENANT_ID);
	const stubLogger: any = { recordCall: () => {}, logFactionCreditTx: () => {}, logLedger: () => Promise.resolve() };
	const api = new ApiClient({ username: "Vex Castellan", sessionStore, logger: stubLogger });
	await api.restoreSession();
	await api.login();

	const storage: any = await api.viewFactionStorageFull();
	const items = storage.items ?? [];
	console.log(`Faction storage: ${items.length} item types, credits: ${storage.credits ?? 0}cr`);
	const filtered = filter ? items.filter((i: any) => (i.item_id ?? i.itemId).includes(filter)) : items;
	for (const i of filtered.sort((a: any, b: any) => (b.quantity ?? 0) - (a.quantity ?? 0))) {
		console.log(`  ${(i.item_id ?? i.itemId).padEnd(30)} ${(i.quantity ?? 0).toString().padStart(8)}`);
	}
	process.exit(0);
}

main().catch(err => { console.error("ERROR:", err.message ?? err); process.exit(1); });
