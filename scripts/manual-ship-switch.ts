/**
 * Manual ship switch for bots that already own better ships.
 * Logs in, lists ships, switches to the best one for the role.
 *
 * Usage: bun run scripts/manual-ship-switch.ts <username> <password> <target_class>
 */

const BASE_URL = "https://game.spacemolt.com/api/v1";

async function getSession(): Promise<string> {
	const res = await fetch(`${BASE_URL}/session`, { method: "POST" });
	const data: any = await res.json();
	return data.session_id;
}

async function login(sessionId: string, username: string, password: string): Promise<void> {
	const res = await fetch(`${BASE_URL}/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Session-ID": sessionId },
		body: JSON.stringify({ username, password }),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Login failed: ${res.status} ${text}`);
	}
}

async function call(sessionId: string, command: string, params: any = {}): Promise<any> {
	const res = await fetch(`${BASE_URL}/${command}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Session-ID": sessionId },
		body: JSON.stringify(params),
	});
	const data: any = await res.json();
	if (!res.ok) {
		throw new Error(`${command} failed: ${res.status} ${JSON.stringify(data)}`);
	}
	return data;
}

async function main() {
	const [username, password, targetClass] = process.argv.slice(2);
	if (!username || !password || !targetClass) {
		console.error("Usage: bun run manual-ship-switch.ts <username> <password> <target_class>");
		process.exit(1);
	}

	console.log(`[1] Getting session...`);
	const sessionId = await getSession();
	console.log(`[1] Session: ${sessionId.slice(0, 16)}...`);

	console.log(`[2] Logging in as ${username}...`);
	await login(sessionId, username, password);

	console.log(`[3] Listing ships...`);
	const shipsResp = await call(sessionId, "list_ships");
	const ships = shipsResp.ships ?? shipsResp.owned_ships ?? [];
	console.log(`[3] Owns ${ships.length} ships:`);
	for (const s of ships) {
		console.log(`    - ${s.ship_id ?? s.id} | ${s.class_id ?? s.classId} | ${s.name ?? "(no name)"} | docked at ${s.docked_at ?? s.dockedAt ?? "?"}`);
	}

	const targetShip = ships.find((s: any) => (s.class_id ?? s.classId) === targetClass);
	if (!targetShip) {
		console.error(`[!] No ship of class ${targetClass} owned. Available classes: ${ships.map((s: any) => s.class_id ?? s.classId).join(", ")}`);
		process.exit(1);
	}

	const shipId = targetShip.ship_id ?? targetShip.id;
	console.log(`[4] Switching to ship ${shipId} (${targetClass})...`);
	const result = await call(sessionId, "switch_ship", { ship_id: shipId });
	console.log(`[4] Switch result:`, JSON.stringify(result, null, 2));

	console.log(`[DONE] ${username} now flying ${targetClass}`);
}

main().catch(err => {
	console.error("ERROR:", err.message);
	process.exit(1);
});
