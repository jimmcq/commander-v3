/**
 * Nav Loop Detector — identifies bots stuck in navigation loops.
 *
 * Tracks travel destinations per bot in a ring buffer.
 * If the same destination appears 3+ times within 10 minutes, injects a warning.
 * Inspired by geleynse/gantry's nav-loop-detector.
 */

const NAV_LOOP_THRESHOLD = 3;
const NAV_LOOP_WINDOW_MS = 10 * 60_000;
const MAX_HISTORY = 20;

interface TravelEntry {
  destination: string;
  ts: number;
}

export class NavLoopDetector {
  private history = new Map<string, TravelEntry[]>();

  /**
   * Record a travel destination for a bot.
   * Returns warning message if loop detected, null otherwise.
   */
  record(botId: string, destination: string): { count: number; warning: string | null } {
    const now = Date.now();
    const cutoff = now - NAV_LOOP_WINDOW_MS;

    const entries = (this.history.get(botId) ?? []).filter(e => e.ts >= cutoff);
    entries.push({ destination, ts: now });
    if (entries.length > MAX_HISTORY) entries.splice(0, entries.length - MAX_HISTORY);
    this.history.set(botId, entries);

    const count = entries.filter(e => e.destination === destination).length;

    if (count >= NAV_LOOP_THRESHOLD) {
      return {
        count,
        warning: `Nav loop detected: traveled to ${destination} ${count} times in ${Math.round(NAV_LOOP_WINDOW_MS / 60_000)}min. Try a different destination or dock.`,
      };
    }

    return { count, warning: null };
  }

  /** Check if a bot is in a nav loop for a given destination (without recording) */
  isLooping(botId: string, destination: string): boolean {
    const now = Date.now();
    const cutoff = now - NAV_LOOP_WINDOW_MS;
    const entries = (this.history.get(botId) ?? []).filter(e => e.ts >= cutoff);
    return entries.filter(e => e.destination === destination).length >= NAV_LOOP_THRESHOLD;
  }

  /** Clear history for a bot (e.g. after successful dock or role change) */
  clear(botId: string): void {
    this.history.delete(botId);
  }

  /** Get loop stats for dashboard/debugging */
  getStats(): Array<{ botId: string; destination: string; count: number }> {
    const now = Date.now();
    const cutoff = now - NAV_LOOP_WINDOW_MS;
    const loops: Array<{ botId: string; destination: string; count: number }> = [];

    for (const [botId, entries] of this.history) {
      const recent = entries.filter(e => e.ts >= cutoff);
      const destCounts = new Map<string, number>();
      for (const e of recent) {
        destCounts.set(e.destination, (destCounts.get(e.destination) ?? 0) + 1);
      }
      for (const [dest, count] of destCounts) {
        if (count >= NAV_LOOP_THRESHOLD) {
          loops.push({ botId, destination: dest, count });
        }
      }
    }
    return loops;
  }
}
