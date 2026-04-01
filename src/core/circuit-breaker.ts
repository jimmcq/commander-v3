/**
 * Circuit Breaker — stops calling failing API commands after repeated failures.
 *
 * States: CLOSED (normal) → OPEN (tripped, rejecting calls) → HALF_OPEN (testing)
 *
 * Per-command breakers: if mine() fails 5 times in 2 minutes, stop calling mine()
 * for 60 seconds, then try once (half-open). If that succeeds, close. If not, re-open.
 *
 * Inspired by geleynse/gantry's circuit-breaker.
 */

export type BreakerState = "closed" | "open" | "half_open";

interface BreakerEntry {
  state: BreakerState;
  failures: number;
  lastFailure: number;
  openedAt: number;
  halfOpenAttempted: boolean;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_FAILURE_WINDOW_MS = 2 * 60_000;  // Count failures within 2 min
const DEFAULT_OPEN_DURATION_MS = 60_000;        // Stay open for 60s
const DEFAULT_HALF_OPEN_TIMEOUT_MS = 30_000;    // Half-open test window

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  failureWindowMs?: number;
  openDurationMs?: number;
}

export class CircuitBreaker {
  private breakers = new Map<string, BreakerEntry>();
  private failureThreshold: number;
  private failureWindowMs: number;
  private openDurationMs: number;

  constructor(config?: CircuitBreakerConfig) {
    this.failureThreshold = config?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.failureWindowMs = config?.failureWindowMs ?? DEFAULT_FAILURE_WINDOW_MS;
    this.openDurationMs = config?.openDurationMs ?? DEFAULT_OPEN_DURATION_MS;
  }

  /**
   * Check if a command is allowed (breaker closed or half-open test).
   * Returns true if the call should proceed, false if breaker is open.
   */
  canCall(command: string): boolean {
    const entry = this.breakers.get(command);
    if (!entry) return true;

    const now = Date.now();

    if (entry.state === "closed") return true;

    if (entry.state === "open") {
      // Check if open duration has elapsed → transition to half-open
      if (now - entry.openedAt >= this.openDurationMs) {
        entry.state = "half_open";
        entry.halfOpenAttempted = false;
        return true; // Allow one test call
      }
      return false; // Still open, reject
    }

    if (entry.state === "half_open") {
      // Allow one test call in half-open state
      if (!entry.halfOpenAttempted) {
        entry.halfOpenAttempted = true;
        return true;
      }
      return false; // Already attempted, wait for result
    }

    return true;
  }

  /** Record a successful call — resets the breaker to closed */
  recordSuccess(command: string): void {
    const entry = this.breakers.get(command);
    if (!entry) return;

    if (entry.state === "half_open") {
      // Half-open test succeeded — close the breaker
      entry.state = "closed";
      entry.failures = 0;
      entry.halfOpenAttempted = false;
    } else if (entry.state === "closed") {
      // Decay failures on success
      if (entry.failures > 0) entry.failures--;
    }
  }

  /** Record a failed call — may trip the breaker open */
  recordFailure(command: string, error?: string): void {
    const now = Date.now();
    let entry = this.breakers.get(command);

    if (!entry) {
      entry = { state: "closed", failures: 0, lastFailure: 0, openedAt: 0, halfOpenAttempted: false };
      this.breakers.set(command, entry);
    }

    // Half-open test failed — re-open
    if (entry.state === "half_open") {
      entry.state = "open";
      entry.openedAt = now;
      entry.halfOpenAttempted = false;
      return;
    }

    // Reset failure count if outside the window
    if (now - entry.lastFailure > this.failureWindowMs) {
      entry.failures = 0;
    }

    entry.failures++;
    entry.lastFailure = now;

    // Trip open if threshold reached
    if (entry.failures >= this.failureThreshold) {
      entry.state = "open";
      entry.openedAt = now;
      console.log(`[CircuitBreaker] ${command} tripped OPEN after ${entry.failures} failures${error ? ` (last: ${error})` : ""}`);
    }
  }

  /** Get current state for a command */
  getState(command: string): BreakerState {
    const entry = this.breakers.get(command);
    if (!entry) return "closed";

    // Check for auto-transition from open → half_open
    if (entry.state === "open" && Date.now() - entry.openedAt >= this.openDurationMs) {
      entry.state = "half_open";
      entry.halfOpenAttempted = false;
    }

    return entry.state;
  }

  /** Get all open/half-open breakers (for dashboard/logging) */
  getTrippedBreakers(): Array<{ command: string; state: BreakerState; failures: number; openedAt: number }> {
    const result: Array<{ command: string; state: BreakerState; failures: number; openedAt: number }> = [];
    for (const [command, entry] of this.breakers) {
      if (entry.state !== "closed") {
        result.push({ command, state: entry.state, failures: entry.failures, openedAt: entry.openedAt });
      }
    }
    return result;
  }

  /** Force-reset a breaker (for manual intervention) */
  reset(command: string): void {
    this.breakers.delete(command);
  }

  /** Reset all breakers */
  resetAll(): void {
    this.breakers.clear();
  }
}
