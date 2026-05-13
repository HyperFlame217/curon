/**
 * db.js — SQLite via sql.js (pure JS, no native compilation)
 *
 * Key design: sql.js operates entirely in memory. We load from disk on
 * startup and write back to disk after every mutation. The wrapper
 * exposes a synchronous-style API matching better-sqlite3.
 *
 * Supabase integration: DB is backed up to Supabase Storage after each
 * mutation. On cold start (no local DB), restores from Supabase.
 */
const initSqlJs = require('sql.js');
const path      = require('path');
const fs        = require('fs');
const supabaseStorage = require('./supabase-storage');

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
    content             TEXT,
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
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    uploader_id      INTEGER NOT NULL,
    filename         TEXT    NOT NULL,
    mime_type        TEXT    NOT NULL,
    size_bytes       INTEGER NOT NULL,
    storage_provider TEXT    NOT NULL DEFAULT 'local',
    created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS media_stars (
    media_id   INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (media_id, user_id)
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

  CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at);
  CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON reactions(message_id);
  CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
  CREATE INDEX IF NOT EXISTS idx_schedule_blocks_user_id ON schedule_blocks(user_id);

  -- FTS4 Search Index
  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts4(content);

  -- Triggers to keep FTS in sync
  CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages WHEN new.content IS NOT NULL BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
    DELETE FROM messages_fts WHERE rowid = old.id;
  END;
  CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages WHEN new.content IS NOT NULL BEGIN
    DELETE FROM messages_fts WHERE rowid = old.id;
    INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
  END;


`;

// ── Save in-memory DB to disk ────────────────────────────────
// ── Persistence Throttling ───────────────────────────────────
let _persistTimeout = null;
let _isDirty = false;
let _lastSnapshotDate = '';
let _supabaseSyncDirty = false;
let _rawDbInstance = null;

function persist(rawDb, force = false) {
  _isDirty = true;
  _supabaseSyncDirty = true;
  _rawDbInstance = rawDb;

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

// ── Supabase Throttling ──────────────────────────────────────
async function syncToSupabase(force = false) {
  if (!force && (!_supabaseSyncDirty || !_rawDbInstance)) return;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return;
  
  const start = Date.now();
  try {
    const data = _rawDbInstance.export();
    const buffer = Buffer.from(data);
    _supabaseSyncDirty = false;

    await supabaseStorage.upload(supabaseStorage.DB_BUCKET, 'backups/curon.db', buffer, 'application/octet-stream');
    console.log(`[db] Synced to Supabase (${Date.now() - start}ms)`);

    // Daily snapshot — date-stamped, uploaded at most once per day
    const today = new Date().toISOString().slice(0, 10);
    if (today !== _lastSnapshotDate) {
      _lastSnapshotDate = today;
      await supabaseStorage.upload(supabaseStorage.DB_BUCKET, `backups/curon-${today}.db`, buffer, 'application/octet-stream');
      console.log(`[db] Daily snapshot: curon-${today}.db`);

      // Cleanup old snapshots (>30 days)
      try {
        const files = await supabaseStorage.list(supabaseStorage.DB_BUCKET, 'backups');
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        const toDelete = files
          .filter(f => f.name.startsWith('curon-') && f.name.endsWith('.db') && f.name < `curon-${cutoffStr}.db`)
          .map(f => `backups/${f.name}`);

        if (toDelete.length > 0) {
          await supabaseStorage.remove(supabaseStorage.DB_BUCKET, toDelete);
          console.log(`[db] Cleaned up ${toDelete.length} old snapshots`);
        }
      } catch (err) {
        console.warn('[db] Snapshot cleanup failed:', err.message);
      }
    }
  } catch (e) {
    console.warn('[db] Supabase sync failed:', e.message);
    _supabaseSyncDirty = true; // Retry next time
  }
}

// Sync to Supabase every 5 minutes (300000ms)
setInterval(() => {
  syncToSupabase().catch(() => {});
}, 5 * 60 * 1000);

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
  async syncToSupabase(force = false) {
    await syncToSupabase(force);
  }
  flushLocal() {
    persist(this._db, true);
  }
}

// ── Init ─────────────────────────────────────────────────────
let _dbPromise = null;

async function getDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = initSqlJs().then(async SQL => {
    let fileData = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;

    // If no local DB, try to restore from Supabase
    if (!fileData && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      try {
        console.log('[db] No local DB — attempting restore from Supabase...');
        const buffer = await supabaseStorage.download(supabaseStorage.DB_BUCKET, 'backups/curon.db');
        fileData = buffer;
        console.log('[db] Restored DB from Supabase backup');
      } catch (err) {
        console.warn('[db] Could not restore from Supabase:', err.message);
      }
    }

    const rawDb    = fileData ? new SQL.Database(fileData) : new SQL.Database();

    rawDb.run(SCHEMA);

    // Migration: add storage_provider column if missing (for existing DBs)
    try {
      const stmt = rawDb.prepare("PRAGMA table_info(media)");
      const cols = [];
      while (stmt.step()) {
        cols.push(stmt.getAsObject().name);
      }
      stmt.free();
      if (!cols.includes('storage_provider')) {
        rawDb.run("ALTER TABLE media ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'supabase'");
        console.log('[db] Added storage_provider column to media table');
      }
    } catch (e) {
      console.warn('[db] Migration check failed:', e.message);
    }

    // Dynamic Migration Runner (P1-J) — tracks applied migrations to run each only once
    rawDb.run(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`);

    const migrationDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationDir)) {
      const files = fs.readdirSync(migrationDir).sort();
      for (const file of files) {
        if (!file.endsWith('.sql')) continue;

        // Skip if already tracked
        const chk = rawDb.prepare('SELECT 1 FROM schema_migrations WHERE filename = ?');
        chk.bind([file]);
        const tracked = chk.step();
        chk.free();
        if (tracked) continue;

        const p   = path.join(migrationDir, file);
        const sql = fs.readFileSync(p, 'utf8');

        try {
          rawDb.run(sql);
          console.log(`[db] Migration applied: ${file}`);
        } catch (e) {
          // "Duplicate column" / "already exists" = schema already correct, mark applied
          const isIdempotentError = e.message.includes('duplicate column') || e.message.includes('already exists');
          if (isIdempotentError) {
            console.log(`[db] Migration ${file} already reflected in schema — marking applied.`);
          } else {
            console.error(`[db] Migration ${file} failed:`, e.message);
            continue; // Don't record genuinely failed migrations
          }
        }

        // Record as applied (whether it ran fresh or was already present)
        try {
          const rec = rawDb.prepare('INSERT OR IGNORE INTO schema_migrations (filename, applied_at) VALUES (?, ?)');
          rec.bind([file, Math.floor(Date.now() / 1000)]);
          rec.step();
          rec.free();
        } catch (_) {}
      }
    }


    // Note: force persist removed — breaks --watch loop. Persist happens on mutations via wrapper.

    console.log('[db] Ready: ' + DB_PATH);
    return new Db(rawDb);
  });
  return _dbPromise;
}

module.exports = getDb();
