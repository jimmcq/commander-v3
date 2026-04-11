/**
 * Navigate bot to sol and dock at confederacy_central_command.
 */
import { ApiClient } from "../src/core/api-client";
import { SessionStore } from "../src/data/session-store";
import { createDatabase } from "../src/data/db";

const TENANT_ID = "46662032-87fa-42c7-9b94-0083086bbd46";
const DATABASE_URL = "postgresql://humbrol2:3e1779ab4980bd4c7133eb457f8d3a0b@10.0.0.54:5432/commander";

async function main() {
	const [username] = process.argv.slice(2);
	if (!username) { console.error("Usage: <username>"); process.exit(1); }

	const conn = createDatabase(DATABASE_URL);
	const sessionStore = new SessionStore(conn.db, TENANT_ID);
	const stubLogger: any = { recordCall: () => {}, logFactionCreditTx: () => {}, logLedger: () => Promise.resolve() };
	const api = new ApiClient({ username, sessionStore, logger: stubLogger });
	await api.restoreSession();
	await api.login();

	let status: any = await api.getStatus();
	let sys = status.player?.current_system ?? status.player?.currentSystem;
	let docked = status.player?.docked_at_base ?? status.player?.dockedAtBase;
	console.log(`[1] ${username}: system=${sys}, docked=${docked ?? "(no)"}`);

	if (docked === "confederacy_central_command") {
		console.log("[DONE] Already at home");
		process.exit(0);
	}

	// Navigate to sol if not there
	if (sys !== "sol") {
		console.log(`[2] Navigating to sol from ${sys}...`);
		try {
			const navResult = await (api as any).mutation("navigate", { system_id: "sol" });
			console.log(`[2] Nav queued: ${JSON.stringify(navResult).slice(0, 200)}`);
		} catch (err: any) {
			console.log(`[!] Navigate failed: ${err.message}`);
		}

		// Wait and jump through
		for (let i = 0; i < 20; i++) {
			await new Promise(r => setTimeout(r, 3000));
			try {
				const jumpResult = await (api as any).mutation("jump");
				console.log(`  [jump ${i+1}] ${JSON.stringify(jumpResult).slice(0, 150)}`);
			} catch (err: any) {
				const msg = err.message ?? String(err);
				if (msg.includes("no_destination") || msg.includes("arrived") || msg.includes("already_at")) {
					console.log(`  [arrived] ${msg.slice(0, 80)}`);
					break;
				}
				if (msg.includes("rate_limited") || msg.includes("action_in_progress")) {
					console.log(`  [wait] ${msg.slice(0, 80)}`);
					continue;
				}
				console.log(`  [err] ${msg.slice(0, 80)}`);
				break;
			}
			status = await api.getStatus();
			sys = status.player?.current_system ?? status.player?.currentSystem;
			if (sys === "sol") break;
		}
	}

	console.log("[3] Docking at confederacy_central_command...");
	try {
		await (api as any).mutation("dock", { base_id: "confederacy_central_command" });
		console.log("[3] Docked");
	} catch (err: any) {
		console.log(`[!] Dock failed: ${err.message}`);
	}

	process.exit(0);
}

main().catch(err => { console.error("ERROR:", err.message ?? err); process.exit(1); });
