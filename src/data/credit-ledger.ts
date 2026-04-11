/**
 * Credit ledger — records every credit-affecting event with before/after balances.
 *
 * Use recordMovement() after any API call that changes credits.
 * Use detectDiscrepancies() to compare snapshots vs movements and flag mismatches.
 */

import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { DB } from "./db";
import { creditMovements, creditDiscrepancies, botCreditSnapshots } from "./schema";

export interface CreditMovement {
	tenantId: string;
	timestamp: number;
	account: string; // bot username or "faction_treasury"
	type: string; // see schema for valid types
	delta: number; // +inflow / -outflow
	balanceBefore?: number;
	balanceAfter?: number;
	source?: string;
	details?: string;
}

export async function recordMovement(db: DB, m: CreditMovement): Promise<void> {
	try {
		await (db as any).insert(creditMovements).values({
			tenantId: m.tenantId,
			timestamp: m.timestamp,
			account: m.account,
			type: m.type,
			delta: m.delta,
			balanceBefore: m.balanceBefore,
			balanceAfter: m.balanceAfter,
			source: m.source,
			details: m.details,
		});
	} catch (err) {
		console.warn("[credit-ledger] recordMovement failed:", err instanceof Error ? err.message : err);
	}
}

export async function recentMovements(
	db: DB,
	tenantId: string,
	account: string,
	since: number,
	until: number,
): Promise<Array<{ delta: number; type: string; timestamp: number; source: string | null; details: string | null }>> {
	const rows: any[] = await (db as any)
		.select({
			delta: creditMovements.delta,
			type: creditMovements.type,
			timestamp: creditMovements.timestamp,
			source: creditMovements.source,
			details: creditMovements.details,
		})
		.from(creditMovements)
		.where(
			and(
				eq(creditMovements.tenantId, tenantId),
				eq(creditMovements.account, account),
				gte(creditMovements.timestamp, since),
				lte(creditMovements.timestamp, until),
			),
		);
	return rows;
}

export async function logDiscrepancy(
	db: DB,
	tenantId: string,
	account: string,
	windowStart: number,
	windowEnd: number,
	expectedDelta: number,
	actualDelta: number,
	notes?: string,
): Promise<void> {
	const unaccounted = actualDelta - expectedDelta;
	try {
		await (db as any).insert(creditDiscrepancies).values({
			tenantId,
			detectedAt: Date.now(),
			account,
			windowStart,
			windowEnd,
			expectedDelta,
			actualDelta,
			unaccounted,
			reviewed: 0,
			notes,
		});
	} catch (err) {
		console.warn("[credit-ledger] logDiscrepancy failed:", err instanceof Error ? err.message : err);
	}
}

/**
 * For each bot, compare consecutive snapshots and reconcile the delta against
 * movements logged in that window. Flag any unaccounted change > minThreshold.
 */
export async function detectDiscrepancies(
	db: DB,
	tenantId: string,
	since: number,
	minThreshold = 1000, // ignore noise below 1K credits
): Promise<number> {
	// Pull snapshots for all bots in the window
	const snapshots: Array<{ username: string; credits: number; timestamp: number }> = await (db as any)
		.select({
			username: botCreditSnapshots.username,
			credits: botCreditSnapshots.credits,
			timestamp: botCreditSnapshots.timestamp,
		})
		.from(botCreditSnapshots)
		.where(
			and(
				eq(botCreditSnapshots.tenantId, tenantId),
				gte(botCreditSnapshots.timestamp, since),
			),
		)
		.orderBy(botCreditSnapshots.username, botCreditSnapshots.timestamp);

	// Group by bot and look at consecutive pairs
	const byBot = new Map<string, Array<{ credits: number; timestamp: number }>>();
	for (const s of snapshots) {
		if (!byBot.has(s.username)) byBot.set(s.username, []);
		byBot.get(s.username)!.push(s);
	}

	let flagged = 0;
	for (const [username, snaps] of byBot) {
		for (let i = 1; i < snaps.length; i++) {
			const prev = snaps[i - 1];
			const curr = snaps[i];
			const actualDelta = curr.credits - prev.credits;
			if (Math.abs(actualDelta) < minThreshold) continue;

			// Sum movements in this window
			const movements = await recentMovements(db, tenantId, username, prev.timestamp, curr.timestamp);
			const expectedDelta = movements.reduce((s, m) => s + m.delta, 0);

			const unaccounted = actualDelta - expectedDelta;
			if (Math.abs(unaccounted) >= minThreshold) {
				await logDiscrepancy(
					db, tenantId, username,
					prev.timestamp, curr.timestamp,
					expectedDelta, actualDelta,
					`actual ${actualDelta}cr vs logged ${expectedDelta}cr (${movements.length} movements)`,
				);
				flagged++;
			}
		}
	}
	return flagged;
}
