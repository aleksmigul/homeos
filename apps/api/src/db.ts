import fs from "node:fs";
import crypto from "node:crypto";
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

    CREATE TABLE IF NOT EXISTS travel_emails (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL UNIQUE,
      sender TEXT NOT NULL,
      recipients_json TEXT NOT NULL,
      subject TEXT NOT NULL,
      text_body TEXT,
      html_body TEXT,
      received_at TEXT NOT NULL,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_travel_emails_received
      ON travel_emails(received_at DESC);

    CREATE TABLE IF NOT EXISTS capture_streams (
      id TEXT PRIMARY KEY,
      owner_email TEXT NOT NULL,
      name TEXT NOT NULL COLLATE NOCASE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_items (
      id TEXT PRIMARY KEY,
      stream_id TEXT NOT NULL REFERENCES capture_streams(id) ON DELETE RESTRICT,
      title TEXT NOT NULL DEFAULT '',
      text_content TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_attachments (
      id TEXT PRIMARY KEY,
      owner_email TEXT NOT NULL,
      item_id TEXT REFERENCES saved_items(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_saved_items_stream_created
      ON saved_items(stream_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_saved_attachments_item
      ON saved_attachments(item_id);

    CREATE TABLE IF NOT EXISTS shopping_lists (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Shopping list',
      status TEXT NOT NULL CHECK(status IN ('current', 'archived')),
      created_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS shopping_items (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      is_checked INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL,
      added_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      checked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS shopping_edit_locks (
      list_id TEXT PRIMARY KEY REFERENCES shopping_lists(id) ON DELETE CASCADE,
      owner_email TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_one_current
      ON shopping_lists(status) WHERE status = 'current';
    CREATE INDEX IF NOT EXISTS idx_shopping_items_order
      ON shopping_items(list_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_shopping_archived
      ON shopping_lists(archived_at DESC);

    CREATE TABLE IF NOT EXISTS todo_lists (
      id TEXT PRIMARY KEY,
      owner_email TEXT NOT NULL,
      title TEXT NOT NULL,
      is_shared INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      owner_email TEXT NOT NULL,
      list_id TEXT NOT NULL REFERENCES todo_lists(id) ON DELETE CASCADE,
      text_content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_todos_owner_created
      ON todos(owner_email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_todos_owner_completed
      ON todos(owner_email, completed_at DESC);
  `);

  migrateCaptureOwnership();
  migrateTodoLists();
  migrateTodoSharing();
  getDb().run("CREATE UNIQUE INDEX IF NOT EXISTS idx_capture_streams_owner_name ON capture_streams(owner_email, name COLLATE NOCASE)");
  getDb().run("CREATE INDEX IF NOT EXISTS idx_todo_lists_owner_updated ON todo_lists(owner_email, updated_at DESC)");
  getDb().run("CREATE UNIQUE INDEX IF NOT EXISTS idx_todo_lists_one_shared ON todo_lists(is_shared) WHERE is_shared = 1");
  getDb().run("CREATE INDEX IF NOT EXISTS idx_todos_list_created ON todos(list_id, created_at DESC)");
}

function migrateTodoSharing() {
  const columns = all<{ name: string }>("PRAGMA table_info(todo_lists)");
  if (!columns.some((column) => column.name === "is_shared")) getDb().run("ALTER TABLE todo_lists ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0");
}

function migrateTodoLists() {
  const columns = all<{ name: string }>("PRAGMA table_info(todos)");
  if (columns.some((column) => column.name === "list_id")) return;
  const owners = all<{ owner_email: string }>("SELECT DISTINCT owner_email FROM todos");
  getDb().run("ALTER TABLE todos ADD COLUMN list_id TEXT");
  for (const { owner_email: owner } of owners) {
    const id = crypto.randomUUID();
    const timestamps = get<{ created_at: string; updated_at: string }>("SELECT MIN(created_at) AS created_at, MAX(COALESCE(completed_at, created_at)) AS updated_at FROM todos WHERE owner_email = $owner", { $owner: owner })!;
    run("INSERT INTO todo_lists (id, owner_email, title, created_at, updated_at) VALUES ($id, $owner, 'Personal', $createdAt, $updatedAt)", { $id: id, $owner: owner, $createdAt: timestamps.created_at, $updatedAt: timestamps.updated_at });
    run("UPDATE todos SET list_id = $id WHERE owner_email = $owner", { $id: id, $owner: owner });
  }
}

function migrateCaptureOwnership() {
  const columns = all<{ name: string }>("PRAGMA table_info(capture_streams)");
  if (columns.some((column) => column.name === "owner_email")) return;
  const owner = config.allowedEmails[0] ?? "legacy@homeos.local";
  const database = getDb();
  database.run("PRAGMA foreign_keys = OFF");
  database.run(`
    DROP TABLE IF EXISTS saved_attachments;
    ALTER TABLE saved_items RENAME TO saved_items_legacy;
    ALTER TABLE capture_streams RENAME TO capture_streams_legacy;
    DROP INDEX IF EXISTS idx_saved_items_stream_created;
    CREATE TABLE capture_streams (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, name TEXT NOT NULL COLLATE NOCASE, created_at TEXT NOT NULL);
    CREATE TABLE saved_items (id TEXT PRIMARY KEY, stream_id TEXT NOT NULL REFERENCES capture_streams(id) ON DELETE RESTRICT, title TEXT NOT NULL DEFAULT '', text_content TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL);
  `);
  run("INSERT INTO capture_streams SELECT id, $owner, name, created_at FROM capture_streams_legacy", { $owner: owner });
  database.run(`
    INSERT INTO saved_items SELECT * FROM saved_items_legacy;
    DROP TABLE saved_items_legacy;
    DROP TABLE capture_streams_legacy;
    CREATE UNIQUE INDEX idx_capture_streams_owner_name ON capture_streams(owner_email, name COLLATE NOCASE);
    CREATE INDEX idx_saved_items_stream_created ON saved_items(stream_id, created_at DESC);
    CREATE TABLE saved_attachments (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, item_id TEXT REFERENCES saved_items(id) ON DELETE CASCADE, original_name TEXT NOT NULL, stored_name TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX idx_saved_attachments_item ON saved_attachments(item_id);
  `);
  database.run("PRAGMA foreign_keys = ON");
}
