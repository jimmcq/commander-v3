/**
 * SpaceMolt Gateway — Multi-tenant fleet management platform.
 *
 * Handles authentication, tenant provisioning, and proxying
 * requests to per-user commander instances.
 *
 * Run: bun run gateway/src/index.ts
 * Env: JWT_SECRET, ENCRYPTION_KEY, GATEWAY_PORT (default 3000)
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createGatewayDb, createUser, getUser, getUserById, createTenant, getTenant, getNextPort, type User } from "./db";
import { hashPassword, verifyPassword, createToken, verifyToken, extractToken, type TokenPayload } from "./auth";
import { encrypt, decrypt } from "./crypto";
import { provisionTenant, startTenant, stopTenant, restartTenant, startAllTenants, stopAllTenants, getHealth, updateTenantConfig } from "./process-manager";

const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT ?? "3000", 10);
const TIER_LIMITS = { free: 5, byok: 20, pro: 50 };

// ── Database ──
const db = createGatewayDb("gateway.db");

// ── Hono App ──
const app = new Hono();
app.use("/*", cors());

// ── Helper: Auth Middleware ──
async function requireAuth(c: any): Promise<TokenPayload | null> {
  const token = extractToken(c.req.header("Authorization")) ?? c.req.query("token");
  if (!token) { c.status(401); return null; }
  const payload = await verifyToken(token);
  if (!payload) { c.status(401); return null; }
  return payload;
}

// ══════════════════════════════════════════
// Public Routes
// ══════════════════════════════════════════

app.get("/", (c) => c.json({
  name: "SpaceMolt Gateway",
  version: "1.0.0",
  endpoints: ["/api/register", "/api/login", "/api/status"],
}));

/** Register a new user */
app.post("/api/register", async (c) => {
  const body = await c.req.json();
  const { username, email, password } = body;

  if (!username || !email || !password) {
    return c.json({ error: "username, email, and password are required" }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }
  if (username.length < 3 || username.length > 30) {
    return c.json({ error: "Username must be 3-30 characters" }, 400);
  }

  // Check if user exists
  const existing = getUser(db, username);
  if (existing) {
    return c.json({ error: "Username already taken" }, 409);
  }

  // Create user
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  createUser(db, {
    id: userId,
    username,
    email,
    passwordHash,
    role: "owner",
    tier: "free",
  });

  // Provision tenant
  const port = getNextPort(db);
  const maxBots = TIER_LIMITS.free;
  const { tenantId, configPath, dbPath, logDir } = provisionTenant(userId, port, maxBots);

  createTenant(db, {
    id: tenantId,
    userId,
    port,
    dbPath,
    configPath,
    logDir,
    pid: null,
    status: "provisioning",
    maxBots,
  });

  // Start the commander instance
  const tenant = getTenant(db, userId);
  if (tenant) {
    startTenant(tenant, db);
  }

  // Generate token
  const token = await createToken({ userId, username, role: "owner", tier: "free" });

  console.log(`[Gateway] New user: ${username} (tenant port ${port})`);
  return c.json({
    message: "Account created",
    token,
    user: { id: userId, username, email, role: "owner", tier: "free" },
    tenant: { port, status: "running" },
  }, 201);
});

/** Login */
app.post("/api/login", async (c) => {
  const body = await c.req.json();
  const { username, password } = body;

  if (!username || !password) {
    return c.json({ error: "username and password are required" }, 400);
  }

  const user = getUser(db, username);
  if (!user) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await createToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    tier: user.tier,
  });

  const tenant = getTenant(db, user.id);

  return c.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, tier: user.tier },
    tenant: tenant ? { port: tenant.port, status: tenant.status } : null,
  });
});

// ══════════════════════════════════════════
// Authenticated Routes
// ══════════════════════════════════════════

/** Get current user status + tenant info */
app.get("/api/me", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const user = getUserById(db, auth.sub!);
  if (!user) return c.json({ error: "User not found" }, 404);

  const tenant = getTenant(db, user.id);
  return c.json({
    user: { id: user.id, username: user.username, role: user.role, tier: user.tier },
    tenant: tenant ? {
      id: tenant.id,
      port: tenant.port,
      status: tenant.status,
      maxBots: tenant.maxBots,
      pid: tenant.pid,
    } : null,
  });
});

/** Start user's commander instance */
app.post("/api/tenant/start", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const tenant = getTenant(db, auth.sub!);
  if (!tenant) return c.json({ error: "No tenant provisioned" }, 404);

  const ok = startTenant(tenant, db);
  return c.json({ status: ok ? "started" : "failed" });
});

/** Stop user's commander instance */
app.post("/api/tenant/stop", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const tenant = getTenant(db, auth.sub!);
  if (!tenant) return c.json({ error: "No tenant provisioned" }, 404);

  stopTenant(tenant.id, db);
  return c.json({ status: "stopped" });
});

/** Restart user's commander instance */
app.post("/api/tenant/restart", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const tenant = getTenant(db, auth.sub!);
  if (!tenant) return c.json({ error: "No tenant provisioned" }, 404);

  const ok = restartTenant(tenant, db);
  return c.json({ status: ok ? "restarted" : "failed" });
});

/** Update LLM API key */
app.post("/api/tenant/api-key", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const tenant = getTenant(db, auth.sub!);
  if (!tenant) return c.json({ error: "No tenant provisioned" }, 404);

  const body = await c.req.json();
  const { provider, apiKey, model } = body;

  if (!provider) return c.json({ error: "provider is required" }, 400);

  // Encrypt the API key
  const encryptedKey = apiKey ? await encrypt(apiKey) : "";

  // Update tenant config
  const tierOrder = provider === "none" ? '["scoring"]' : `["${provider}", "scoring"]`;
  updateTenantConfig(tenant.configPath, {
    "provider": provider,
    "api_key": encryptedKey,
    ...(model ? { [`${provider}_model`]: model } : {}),
  });

  // Restart to pick up new config
  restartTenant(tenant, db);

  return c.json({ message: "API key updated, commander restarting" });
});

/** Get user's commander connection info (for dashboard proxy) */
app.get("/api/tenant/connect", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  const tenant = getTenant(db, auth.sub!);
  if (!tenant) return c.json({ error: "No tenant provisioned" }, 404);

  return c.json({
    // Dashboard connects directly to commander's WebSocket
    wsUrl: `ws://localhost:${tenant.port}/ws`,
    httpUrl: `http://localhost:${tenant.port}`,
    status: tenant.status,
  });
});

// ══════════════════════════════════════════
// Admin Routes
// ══════════════════════════════════════════

app.get("/api/admin/health", async (c) => {
  const auth = await requireAuth(c);
  if (!auth) return c.json({ error: "Unauthorized" }, 401);

  // Only first registered user is admin (simple)
  const user = getUserById(db, auth.sub!);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const health = getHealth();
  return c.json({ tenants: health, total: health.length });
});

// ══════════════════════════════════════════
// Start Gateway
// ══════════════════════════════════════════

// Auto-start all previously running tenants
startAllTenants(db);

const server = Bun.serve({
  port: GATEWAY_PORT,
  fetch: app.fetch,
});

console.log(`[Gateway] SpaceMolt Gateway running on port ${GATEWAY_PORT}`);
console.log(`[Gateway] Register: POST http://localhost:${GATEWAY_PORT}/api/register`);
console.log(`[Gateway] Login:    POST http://localhost:${GATEWAY_PORT}/api/login`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Gateway] Shutting down...");
  stopAllTenants(db);
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopAllTenants(db);
  process.exit(0);
});
