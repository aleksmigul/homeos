import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database, type SqlValue } from "sql.js";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

let db: Database | null = null;

export async function initializeDatabase() {
  const SQL = await initSqlJs();
  const existing = fs.existsSync(config.databasePath) ? fs.readFileSync(config.databasePath) : undefined;

  db = existing ? new SQL.Database(existing) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON");
  migrate();
  persistDatabase();
}

export function getDb() {
  if (!db) {
    throw new Error("Database has not been initialized");
  }

  return db;
}

export function persistDatabase() {
  fs.writeFileSync(config.databasePath, Buffer.from(getDb().export()));
}

type SqlParams = Record<string, SqlValue>;

export function all<T>(sql: string, params: SqlParams = {}) {
  const stmt = getDb().prepare(sql);
  const rows: T[] = [];

  try {
    stmt.bind(params);
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
  } finally {
    stmt.free();
  }

  return rows;
}

export function get<T>(sql: string, params: SqlParams = {}) {
  return all<T>(sql, params)[0];
}

export function run(sql: string, params: SqlParams = {}) {
  const stmt = getDb().prepare(sql);

  try {
    stmt.run(params);
  } finally {
    stmt.free();
  }
}

export function writeTransaction(callback: () => void) {
  const database = getDb();
  database.run("BEGIN");

  try {
    callback();
    database.run("COMMIT");
    persistDatabase();
  } catch (error) {
    database.run("ROLLBACK");
    throw error;
  }
}

function migrate() {
  getDb().run(`
    CREATE TABLE IF NOT EXISTS travel_plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS travel_rows (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES travel_plans(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT '',
      hotel TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_travel_rows_plan_order
      ON travel_rows(plan_id, sort_order);

    CREATE TABLE IF NOT EXISTS checklists (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id TEXT PRIMARY KEY,
      checklist_id TEXT NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checklist_runs (
      id TEXT PRIMARY KEY,
      checklist_id TEXT NOT NULL REFERENCES checklists(id) ON DELETE RESTRICT,
      checklist_title TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS checklist_run_items (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES checklist_runs(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      is_checked INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL,
      checked_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_checklist_items_order
      ON checklist_items(checklist_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_checklist_runs_started
      ON checklist_runs(checklist_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_checklist_run_items_order
      ON checklist_run_items(run_id, sort_order);
  `);
}
