/**
 * Gateway accounts database — stores users, tenants, and provisioning state.
 * Separate from commander databases (each tenant has their own).
 */

import Database from "bun:sqlite";

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: "owner" | "operator" | "viewer";
  tier: "free" | "byok" | "pro";
  createdAt: string;
}

export interface Tenant {
  id: string;
  userId: string;
  port: number;
  dbPath: string;
  configPath: string;
  logDir: string;
  pid: number | null;
  status: "running" | "stopped" | "provisioning" | "error";
  maxBots: number;
  createdAt: string;
  lastStartedAt: string | null;
}

export function createGatewayDb(path = "gateway.db") {
  const db = new Database(path);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    tier TEXT NOT NULL DEFAULT 'free',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    port INTEGER UNIQUE NOT NULL,
    db_path TEXT NOT NULL,
    config_path TEXT NOT NULL,
    log_dir TEXT NOT NULL,
    pid INTEGER,
    status TEXT NOT NULL DEFAULT 'provisioning',
    max_bots INTEGER NOT NULL DEFAULT 5,
    created_at TEXT DEFAULT (datetime('now')),
    last_started_at TEXT
  )`);

  return db;
}

export function getUser(db: Database, username: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    tier: row.tier,
    createdAt: row.created_at,
  };
}

export function getUserById(db: Database, id: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    tier: row.tier,
    createdAt: row.created_at,
  };
}

export function createUser(db: Database, user: Omit<User, "createdAt">): void {
  db.prepare(`INSERT INTO users (id, username, email, password_hash, role, tier) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(user.id, user.username, user.email, user.passwordHash, user.role, user.tier);
}

export function getTenant(db: Database, userId: string): Tenant | null {
  const row = db.prepare("SELECT * FROM tenants WHERE user_id = ?").get(userId) as any;
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    port: row.port,
    dbPath: row.db_path,
    configPath: row.config_path,
    logDir: row.log_dir,
    pid: row.pid,
    status: row.status,
    maxBots: row.max_bots,
    createdAt: row.created_at,
    lastStartedAt: row.last_started_at,
  };
}

export function createTenant(db: Database, tenant: Omit<Tenant, "createdAt" | "lastStartedAt">): void {
  db.prepare(`INSERT INTO tenants (id, user_id, port, db_path, config_path, log_dir, pid, status, max_bots)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(tenant.id, tenant.userId, tenant.port, tenant.dbPath, tenant.configPath, tenant.logDir, tenant.pid, tenant.status, tenant.maxBots);
}

export function updateTenantStatus(db: Database, id: string, status: Tenant["status"], pid?: number | null): void {
  if (pid !== undefined) {
    db.prepare("UPDATE tenants SET status = ?, pid = ?, last_started_at = datetime('now') WHERE id = ?").run(status, pid, id);
  } else {
    db.prepare("UPDATE tenants SET status = ? WHERE id = ?").run(status, id);
  }
}

export function getAllTenants(db: Database): Tenant[] {
  return (db.prepare("SELECT * FROM tenants").all() as any[]).map(row => ({
    id: row.id,
    userId: row.user_id,
    port: row.port,
    dbPath: row.db_path,
    configPath: row.config_path,
    logDir: row.log_dir,
    pid: row.pid,
    status: row.status,
    maxBots: row.max_bots,
    createdAt: row.created_at,
    lastStartedAt: row.last_started_at,
  }));
}

export function getNextPort(db: Database, basePort = 4000): number {
  const row = db.prepare("SELECT MAX(port) as max_port FROM tenants").get() as any;
  return (row?.max_port ?? basePort - 1) + 1;
}
