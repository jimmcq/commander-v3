/**
 * Authentication — JWT tokens + bcrypt password hashing.
 * Uses Bun's native password utilities and jose for JWT.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "spacemolt-gateway-dev-secret-change-in-production"
);
const JWT_ISSUER = "spacemolt-gateway";
const JWT_EXPIRY = "24h";

export interface TokenPayload extends JWTPayload {
  sub: string;      // user ID
  username: string;
  role: string;
  tier: string;
}

/** Hash a password using bcrypt */
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 12 });
}

/** Verify a password against a bcrypt hash */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

/** Create a signed JWT token */
export async function createToken(payload: {
  userId: string;
  username: string;
  role: string;
  tier: string;
}): Promise<string> {
  return new SignJWT({
    sub: payload.userId,
    username: payload.username,
    role: payload.role,
    tier: payload.tier,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(JWT_SECRET);
}

/** Verify and decode a JWT token */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { issuer: JWT_ISSUER });
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

/** Extract bearer token from Authorization header */
export function extractToken(header: string | null | undefined): string | null {
  if (!header) return null;
  if (header.startsWith("Bearer ")) return header.slice(7);
  return header;
}
