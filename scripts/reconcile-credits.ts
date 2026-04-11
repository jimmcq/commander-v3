/**
 * Credit reconciliation — detect discrepancies between recorded movements
 * and actual balance changes. Run periodically (or on demand).
 *
 * Usage: bun run scripts/reconcile-credits.ts [hours_back] [min_threshold]
 */

import { createDatabase } from "../src/data/db";
import { detectDiscrepancies } from "../src/data/credit-ledger";
import { creditDiscrepancies } from "../src/data/schema";
import { and, eq, gte, sql } from "drizzle-orm";

const TENANT_ID = "46662032-87fa-42c7-9b94-0083086bbd46";
const DATABASE_URL = "postgresql://humbrol2:3e1779ab4980bd4c7133eb457f8d3a0b@10.0.0.54:5432/commander";

async function main() {
	const hoursBack = parseInt(process.argv[2] ?? "24");
	const minThreshold = parseInt(process.argv[3] ?? "1000");

	const conn = createDatabase(DATABASE_URL);
	const since = Date.now() - hoursBack * 3600 * 1000;

	console.log(`Reconciling last ${hoursBack}h, threshold ${minThreshold}cr...`);
	const newFlags = await detectDiscrepancies(conn.db, TENANT_ID, since, minThreshold);
	console.log(`Detected ${newFlags} new discrepancies\n`);

	// Show open discrepancies
	const open: any[] = await (conn.db as any)
		.select()
		.from(creditDiscrepancies)
		.where(
			and(
				eq(creditDiscrepancies.tenantId, TENANT_ID),
				eq(creditDiscrepancies.reviewed, 0),
				gte(creditDiscrepancies.detectedAt, since),
			),
		)
		.orderBy(sql`${creditDiscrepancies.detectedAt} DESC`);

	console.log(`Open discrepancies (${open.length}):`);
	console.log(`${"When".padEnd(20)} ${"Account".padEnd(18)} ${"Expected".padStart(12)} ${"Actual".padStart(12)} ${"Unaccounted".padStart(13)}  Notes`);
	console.log("-".repeat(120));

	let totalUnaccounted = 0;
	for (const d of open) {
		const when = new Date(Number(d.detectedAt)).toISOString().slice(11, 19);
		console.log(
			`${when.padEnd(20)} ${(d.account ?? "").padEnd(18)} ${(d.expectedDelta ?? 0).toLocaleString().padStart(12)} ${(d.actualDelta ?? 0).toLocaleString().padStart(12)} ${(d.unaccounted ?? 0).toLocaleString().padStart(13)}  ${d.notes ?? ""}`
		);
		totalUnaccounted += Number(d.unaccounted ?? 0);
	}

	console.log(`\nTotal unaccounted credits: ${totalUnaccounted.toLocaleString()}cr`);
	process.exit(0);
}

main().catch(err => { console.error("ERROR:", err.message ?? err); process.exit(1); });
