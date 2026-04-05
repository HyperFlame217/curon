/**
 * db.js — SQLite via sql.js (pure JS, no native compilation)
 *
 * Key design: sql.js operates entirely in memory. We load from disk on
 * startup and write back to disk after every mutation. The wrapper
 * exposes a synchronous-style API matching better-sqlite3.
 */
const initSqlJs = require('sql.js');
const path      = require('path');
const fs        = require('fs');

const DB_PATH = path.join(__dirname, 'curon.db');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    username              TEXT    NOT NULL UNIQUE,
    password_hash         TEXT    NOT NULL,
    public_key            TEXT,
    encrypted_private_key TEXT,
    avatar_img            TEXT,
    house_x               INTEGER DEFAULT -1,
    house_y               INTEGER DEFAULT -1,
    created_at            INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS messages (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id           INTEGER NOT NULL,
    encrypted_content_a TEXT    NOT NULL,
    encrypted_content_b TEXT    NOT NULL,
    encrypted_key_a     TEXT    NOT NULL,
    encrypted_key_b     TEXT    NOT NULL,
    iv                  TEXT    NOT NULL,
    media_id            INTEGER,
    reply_to_id         INTEGER,
    deleted_by_a        INTEGER NOT NULL DEFAULT 0,
    deleted_by_b        INTEGER NOT NULL DEFAULT 0,
    read_at             INTEGER,
    created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS reactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    emoji      TEXT    NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE(message_id, user_id, emoji)
  );
  CREATE TABLE IF NOT EXISTS media (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    uploader_id INTEGER NOT NULL,
    filename    TEXT    NOT NULL,
    mime_type   TEXT    NOT NULL,
    size_bytes  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS custom_emojis (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    filename    TEXT    NOT NULL,
    uploader_id INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS houses (
    id          TEXT PRIMARY KEY,
    room_id     TEXT NOT NULL,
    item_id     TEXT NOT NULL,
    x           INTEGER NOT NULL,
    y           INTEGER NOT NULL,
    dir         INTEGER NOT NULL DEFAULT 0,
    parent_id   TEXT,
    slot_index  INTEGER,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS house_rooms (
    id           TEXT PRIMARY KEY,
    wall_sprite  TEXT,
    floor_sprite TEXT,
    updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS cats (
    id          TEXT PRIMARY KEY,
    name        TEXT,
    type        TEXT,
    happiness   INTEGER DEFAULT 100,
    x           INTEGER DEFAULT 0,
    y           INTEGER DEFAULT 0,
    state       TEXT DEFAULT 'idle',
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS milestones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    date        INTEGER NOT NULL,
    created_by  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS user_coins (
    user_id     INTEGER PRIMARY KEY,
    balance     INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS events (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    title             TEXT NOT NULL,
    notes             TEXT,
    color             TEXT NOT NULL DEFAULT '#80b9b1',
    start_time        INTEGER NOT NULL,
    end_time          INTEGER NOT NULL,
    created_by        INTEGER NOT NULL REFERENCES users(id),
    recurrence        TEXT NOT NULL DEFAULT 'none',
    recurrence_end    INTEGER
  );
  CREATE TABLE IF NOT EXISTS schedule_blocks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    label        TEXT NOT NULL,
    color        TEXT NOT NULL DEFAULT '#94c784',
    start_minute INTEGER NOT NULL,
    end_minute   INTEGER NOT NULL,
    day_type     TEXT NOT NULL DEFAULT 'weekday'
  );
  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id  INTEGER NOT NULL REFERENCES users(id),
    content    TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS spotify_tokens (
    user_id       INTEGER PRIMARY KEY REFERENCES users(id),
    access_token  TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at    INTEGER NOT NULL
  );


`;

// ── Save in-memory DB to disk ────────────────────────────────
// ── Persistence Throttling ───────────────────────────────────
let _persistTimeout = null;
let _isDirty = false;

function persist(rawDb, force = false) {
  _isDirty = true;
  if (force) {
    if (_persistTimeout) clearTimeout(_persistTimeout);
    _writeToDisk(rawDb);
    return;
  }
  if (!_persistTimeout) {
    _persistTimeout = setTimeout(() => {
      _writeToDisk(rawDb);
      _persistTimeout = null;
    }, 500);
  }
}

function _writeToDisk(rawDb) {
  if (!_isDirty) return;
  const start = Date.now();
  try {
    const data = rawDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    _isDirty = false;
    const dur = Date.now() - start;
    if (dur > 30) console.log(`[db] Persisted to disk (${dur}ms)`);
  } catch (e) {
    console.error('[db] Disk write failed:', e.message);
  }
}

// ── Statement wrapper ────────────────────────────────────────
class Statement {
  constructor(rawDb, sql) {
    this._db  = rawDb;
    this._sql = sql;
  }

  get(...params) {
    const stmt = this._db.prepare(this._sql);
    stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  }

  all(...params) {
    const stmt = this._db.prepare(this._sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  run(...params) {
    const stmt = this._db.prepare(this._sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
    const changes = this._db.getRowsModified();
    const ridStmt = this._db.prepare('SELECT last_insert_rowid() as r');
    ridStmt.step();
    const lastInsertRowid = ridStmt.getAsObject().r;
    ridStmt.free();
    persist(this._db);
    return { lastInsertRowid, changes };
  }
}

class Db {
  constructor(rawDb) {
    this._db = rawDb;
  }
  prepare(sql) {
    return new Statement(this._db, sql);
  }
  exec(sql) {
    this._db.run(sql);
    persist(this._db);
  }
}

// ── Init ─────────────────────────────────────────────────────
let _dbPromise = null;

function getDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = initSqlJs().then(async SQL => {
    const fileData = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
    const rawDb    = fileData ? new SQL.Database(fileData) : new SQL.Database();

    rawDb.run(SCHEMA);

    // Dynamic Migration Runner (P1-J)
    try {
      const migrationDir = path.join(__dirname, 'migrations');
      if (fs.existsSync(migrationDir)) {
        const files = fs.readdirSync(migrationDir).sort();
        for (const file of files) {
          if (file.endsWith('.sql')) {
            const p = path.join(migrationDir, file);
            const sql = fs.readFileSync(p, 'utf8');
            rawDb.run(sql);
            console.log(`[db] Migration applied: ${file}`);
          }
        }
      }
    } catch(e) { console.warn("[db] Migration failed:", e.message); }

    // Persist once after schema setup (Force sync during boot)
    persist(rawDb, true);

    console.log('[db] Ready: ' + DB_PATH);
    return new Db(rawDb);
  });
  return _dbPromise;
}

module.exports = getDb();
