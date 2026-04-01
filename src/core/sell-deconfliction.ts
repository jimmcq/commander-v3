/**
 * Sell Deconfliction — fleet-wide sell tracking to prevent price depression.
 *
 * When a bot sells an item at a station, it records the sale. Other bots
 * checking the same station+item within a time window get warned about
 * recent sells (prices may have dropped from supply increase).
 *
 * Also tracks total fleet sell volume per item per station to detect
 * when we're flooding a market.
 *
 * Inspired by geleynse/gantry's sell-log deconfliction.
 */

interface SellRecord {
  botId: string;
  itemId: string;
  stationId: string;
  quantity: number;
  priceEach: number;
  ts: number;
}

const SELL_WINDOW_MS = 30 * 60_000; // 30 min — how long sells are relevant
const FLOOD_THRESHOLD = 3;          // 3+ fleet sells of same item at same station = flooding
const MAX_RECORDS = 500;            // Memory bound

export class SellDeconfliction {
  private records: SellRecord[] = [];

  /** Record a sell event from a bot */
  recordSell(botId: string, stationId: string, itemId: string, quantity: number, priceEach: number): void {
    this.records.push({ botId, itemId, stationId, quantity, priceEach, ts: Date.now() });
    // Trim old records
    if (this.records.length > MAX_RECORDS) {
      const cutoff = Date.now() - SELL_WINDOW_MS;
      this.records = this.records.filter(r => r.ts >= cutoff);
    }
  }

  /**
   * Check if selling an item at a station would conflict with recent fleet sells.
   * Returns warning info if recent sells detected, null if clear.
   */
  checkConflict(
    botId: string,
    stationId: string,
    itemId: string,
  ): { recentSells: number; totalQty: number; lastPrice: number; warning: string } | null {
    const cutoff = Date.now() - SELL_WINDOW_MS;
    const recent = this.records.filter(
      r => r.stationId === stationId && r.itemId === itemId && r.ts >= cutoff && r.botId !== botId
    );

    if (recent.length === 0) return null;

    const totalQty = recent.reduce((sum, r) => sum + r.quantity, 0);
    const lastSell = recent[recent.length - 1];
    const timeSinceLastSell = Date.now() - lastSell.ts;

    const warning = recent.length >= FLOOD_THRESHOLD
      ? `FLOOD WARNING: ${recent.length} fleet sells of ${itemId} at this station in ${Math.round(SELL_WINDOW_MS / 60_000)}min (${totalQty} units total). Prices likely depressed.`
      : `${recent.length} fleet sell(s) of ${itemId} here in last ${Math.round(timeSinceLastSell / 60_000)}min (${totalQty} units). Price may be lower.`;

    return {
      recentSells: recent.length,
      totalQty,
      lastPrice: lastSell.priceEach,
      warning,
    };
  }

  /**
   * Check if a station+item is being flooded by the fleet.
   * Returns true if 3+ bots have sold the same item at the same station recently.
   */
  isFlooded(stationId: string, itemId: string): boolean {
    const cutoff = Date.now() - SELL_WINDOW_MS;
    const uniqueBots = new Set(
      this.records
        .filter(r => r.stationId === stationId && r.itemId === itemId && r.ts >= cutoff)
        .map(r => r.botId)
    );
    return uniqueBots.size >= FLOOD_THRESHOLD;
  }

  /**
   * Get best alternative stations for selling an item (stations with fewer recent fleet sells).
   * Cross-references with the provided station list.
   */
  suggestAlternativeStation(
    itemId: string,
    avoidStationId: string,
    knownStations: string[],
  ): string | null {
    const cutoff = Date.now() - SELL_WINDOW_MS;

    // Score each station by recent sell pressure (lower = better)
    const stationScores = knownStations
      .filter(s => s !== avoidStationId)
      .map(stationId => {
        const recentSells = this.records.filter(
          r => r.stationId === stationId && r.itemId === itemId && r.ts >= cutoff
        ).length;
        return { stationId, recentSells };
      })
      .sort((a, b) => a.recentSells - b.recentSells);

    return stationScores[0]?.stationId ?? null;
  }

  /** Get fleet sell stats for dashboard */
  getStats(): { totalSells: number; uniqueItems: number; flooded: Array<{ stationId: string; itemId: string; count: number }> } {
    const cutoff = Date.now() - SELL_WINDOW_MS;
    const recent = this.records.filter(r => r.ts >= cutoff);

    const flooded: Array<{ stationId: string; itemId: string; count: number }> = [];
    const combos = new Map<string, number>();
    for (const r of recent) {
      const key = `${r.stationId}:${r.itemId}`;
      combos.set(key, (combos.get(key) ?? 0) + 1);
    }
    for (const [key, count] of combos) {
      if (count >= FLOOD_THRESHOLD) {
        const [stationId, itemId] = key.split(":");
        flooded.push({ stationId, itemId, count });
      }
    }

    return {
      totalSells: recent.length,
      uniqueItems: new Set(recent.map(r => r.itemId)).size,
      flooded,
    };
  }
}
