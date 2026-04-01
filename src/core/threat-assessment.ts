/**
 * Threat Assessment — ship classification and danger rating for combat.
 *
 * Classifies ships by hull/shield/weapons to help hunters pick appropriate fights.
 * Rates system danger from nearby hostile activity.
 * Inspired by geleynse/gantry's threat-assessment.
 */

export type ShipThreatLevel = "harmless" | "low" | "medium" | "high" | "extreme";
export type ShipClassification = "unknown" | "shuttle" | "scout" | "frigate" | "cruiser" | "capital";

export interface ShipData {
  name?: string;
  class?: string;
  classId?: string;
  hull?: number;
  maxHull?: number;
  shields?: number;
  maxShields?: number;
  armor?: number;
  weapons?: Array<{ type?: string; damage?: number; name?: string }>;
  faction?: string;
  hostile?: boolean;
  playerId?: string;
  speed?: number;
}

export interface ThreatAssessment {
  level: ShipThreatLevel;
  shipClass: ShipClassification;
  weaponCount: number;
  weaponTypes: string[];
  effectiveHp: number;
  summary: string;
  canEngage: boolean; // Whether our ship should engage this target
}

/**
 * Classify a ship by hull capacity.
 */
export function classifyShip(ship: ShipData): ShipClassification {
  const hull = ship.maxHull ?? ship.hull ?? 0;

  if (hull > 0) {
    if (hull < 60) return "shuttle";
    if (hull < 150) return "scout";
    if (hull < 500) return "frigate";
    if (hull < 1500) return "cruiser";
    return "capital";
  }

  const classStr = (ship.class ?? ship.classId ?? "").toLowerCase();
  if (!classStr) return "unknown";
  if (classStr.includes("shuttle") || classStr.includes("transport") || classStr.includes("courier")) return "shuttle";
  if (classStr.includes("scout") || classStr.includes("recon") || classStr.includes("interceptor")) return "scout";
  if (classStr.includes("fighter") || classStr.includes("frigate") || classStr.includes("patrol")) return "frigate";
  if (classStr.includes("cruiser") || classStr.includes("destroyer") || classStr.includes("heavy")) return "cruiser";
  if (classStr.includes("capital") || classStr.includes("dreadnought") || classStr.includes("carrier") || classStr.includes("battlecruiser")) return "capital";
  return "unknown";
}

/**
 * Assess threat level of a target ship.
 */
export function assessThreat(target: ShipData): ThreatAssessment {
  const shipClass = classifyShip(target);
  const hull = target.maxHull ?? target.hull ?? 0;
  const shields = target.maxShields ?? target.shields ?? 0;
  const armor = target.armor ?? 0;
  const effectiveHp = hull + shields + armor * 2;

  const weaponCount = target.weapons?.length ?? 0;
  const weaponTypes = target.weapons?.map(w => w.type ?? w.name ?? "unknown") ?? [];

  let level: ShipThreatLevel;
  if (effectiveHp < 100 && weaponCount === 0) {
    level = "harmless";
  } else if (effectiveHp < 200 || (weaponCount <= 1 && effectiveHp < 400)) {
    level = "low";
  } else if (effectiveHp < 600 || (weaponCount <= 2 && effectiveHp < 800)) {
    level = "medium";
  } else if (effectiveHp < 1200) {
    level = "high";
  } else {
    level = "extreme";
  }

  const summaryParts = [
    `${shipClass} class`,
    `${effectiveHp} eHP`,
    weaponCount > 0 ? `${weaponCount} weapon(s)` : "unarmed",
  ];

  return {
    level,
    shipClass,
    weaponCount,
    weaponTypes,
    effectiveHp,
    summary: summaryParts.join(", "),
    canEngage: true, // Caller should compare against own stats
  };
}

/**
 * Determine if our ship can safely engage a target.
 * Returns engagement recommendation with reasoning.
 */
export function shouldEngage(
  ourShip: { hull: number; shield: number; armor: number; weapons: number },
  target: ThreatAssessment,
): { engage: boolean; reason: string; confidence: number } {
  const ourEhp = ourShip.hull + ourShip.shield + ourShip.armor * 2;
  const ratio = ourEhp / Math.max(target.effectiveHp, 1);

  // No weapons = can't fight
  if (ourShip.weapons === 0) {
    return { engage: false, reason: "no weapons equipped", confidence: 1 };
  }

  // Harmless targets always engage
  if (target.level === "harmless") {
    return { engage: true, reason: "harmless target", confidence: 0.95 };
  }

  // Extreme threat — avoid unless we massively outgun them
  if (target.level === "extreme") {
    if (ratio > 2) return { engage: true, reason: "extreme target but we have 2x eHP advantage", confidence: 0.4 };
    return { engage: false, reason: "extreme threat — would likely lose", confidence: 0.9 };
  }

  // High threat — need significant advantage
  if (target.level === "high") {
    if (ratio > 1.5) return { engage: true, reason: "high threat but 1.5x eHP advantage", confidence: 0.55 };
    return { engage: false, reason: "high threat — insufficient advantage", confidence: 0.7 };
  }

  // Medium threat — engage if we're equal or better
  if (target.level === "medium") {
    if (ratio > 0.8) return { engage: true, reason: "medium threat, acceptable risk", confidence: 0.7 };
    return { engage: false, reason: "medium threat but we're outmatched", confidence: 0.6 };
  }

  // Low threat — almost always engage
  if (ratio > 0.5) return { engage: true, reason: "low threat target", confidence: 0.85 };
  return { engage: false, reason: "low threat but our ship is very weak", confidence: 0.5 };
}
