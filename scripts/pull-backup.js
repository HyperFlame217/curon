/**
 * pull-backup.js — Local backup script
 *
 * Downloads DB + media from Supabase to local backup folder.
 * Run manually via: node scripts/pull-backup.js
 *
 * WARNING: This script CAN delete files from Supabase!
 * Use --confirm to actually delete, otherwise runs in dry-run mode.
 *
 * Usage:
 *   node scripts/pull-backup.js           # Dry-run (preview only)
 *   node scripts/pull-backup.js --dry-run # Same, explicit dry-run
 *   node scripts/pull-backup.js --confirm # Actually deletes old files
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const initSqlJs = require('sql.js');

const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'curon-media';
const DB_BUCKET = process.env.SUPABASE_DB_BUCKET || 'curon-db';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const MEDIA_RETENTION_DAYS = 14;
const DRY_RUN = !process.argv.includes('--confirm');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

function log(...args) { if (VERBOSE || !DRY_RUN) console.log(...args); }
function warn(...args) { console.warn(...args); }

if (DRY_RUN) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  DRY-RUN MODE — No files will be deleted');
  console.log('  Run with --confirm to actually delete old files');
  console.log('═══════════════════════════════════════════════════════════');
}

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function getDateStamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function downloadDB() {
  console.log('[backup] Downloading DB from Supabase...');
  try {
    const { data, error } = await supabase.storage
      .from(DB_BUCKET)
      .download('backups/curon.db');

    if (error) throw error;

    const buffer = await data.arrayBuffer();
    const filename = `curon-${getDateStamp()}.db`;
    const filepath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(buffer));

    const sizeKB = Math.round(buffer.byteLength / 1024);
    console.log(`[backup] Downloaded DB → ${filename} (${sizeKB} KB)`);
    return true;
  } catch (err) {
    console.warn('[backup] DB download failed:', err.message);
    return false;
  }
}

async function downloadAndCleanMedia() {
  log('[backup] Checking media files in Supabase...');

  // Load local DB snapshot for accurate timestamps and star checks
  let mediaLookup = new Map();   // filename → { id, created_at }
  let starredIds = new Set();    // set of media_ids that are starred

  const dbPath = path.join(__dirname, '..', 'server', 'curon.db');
  const dbSnapshot = path.join(BACKUP_DIR, '.db-snapshot');
  try {
    fs.copyFileSync(dbPath, dbSnapshot);
    const fileData = fs.readFileSync(dbSnapshot);
    const SQL = await initSqlJs();
    const rawDb = new SQL.Database(fileData);

    const mediaRows = rawDb.prepare('SELECT id, filename, created_at FROM media');
    while (mediaRows.step()) {
      const r = mediaRows.getAsObject();
      mediaLookup.set(r.filename, { id: r.id, created_at: r.created_at });
    }
    mediaRows.free();

    const starRows = rawDb.prepare('SELECT media_id FROM media_stars');
    while (starRows.step()) {
      starredIds.add(starRows.getAsObject().media_id);
    }
    starRows.free();
    rawDb.close();
  } catch (_) {
    warn('[backup] Cannot read local DB — using Supabase timestamps, skipping star check');
  }

  const now = Date.now();
  const cutoffMs = MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(now - cutoffMs);

  let downloaded = 0;
  let deleted = 0;
  let skipped = 0;
  let toDelete = [];

  const prefixes = ['media/', 'thumbnails/'];

  for (const prefix of prefixes) {
    try {
      // Paginated listing — handles >1000 files
      let files = [];
      let offset = 0;
      while (true) {
        const { data: batch, error } = await supabase.storage
          .from(MEDIA_BUCKET)
          .list(prefix, { limit: 1000, offset });
        if (error) { warn(`[backup] List ${prefix} failed:`, error.message); break; }
        if (!batch || batch.length === 0) break;
        files = files.concat(batch);
        offset += batch.length;
        if (batch.length < 1000) break;
      }

      if (files.length === 0) continue;

      const folderPrefix = prefix.replace('/', '-').replace('/', '');
      const mediaDir = path.join(BACKUP_DIR, `${folderPrefix}-${getDateStamp()}`);

      for (const file of files) {
        const key = `${prefix}${file.name}`;

        // Determine age and star status — use DB timestamps for media/thumbnails
        let fileAgeDate;
        let isStarred = false;

        if (prefix === 'media/') {
          const lookup = mediaLookup.get(file.name);
          if (lookup) {
            fileAgeDate = new Date(lookup.created_at * 1000);
            isStarred = starredIds.has(lookup.id);
          }
        } else if (prefix === 'thumbnails/') {
          // Thumbnail name: <base>.jpg — match against media filename base
          for (const [, info] of mediaLookup) {
            const base = path.basename(info.filename, path.extname(info.filename));
            if (file.name.startsWith(base + '.jpg')) {
              fileAgeDate = new Date(info.created_at * 1000);
              isStarred = starredIds.has(info.id);
              break;
            }
          }
        }

        // Fallback: use Supabase timestamp if DB info not available
        if (!fileAgeDate) {
          fileAgeDate = new Date(file.updated_at);
        }

        // Skip starred media items
        if (isStarred) {
          skipped++;
          if (VERBOSE) log(`[backup] Skipping (starred): ${key}`);
          continue;
        }

        // Skip files newer than retention period
        if (fileAgeDate > cutoffDate) {
          skipped++;
          if (VERBOSE) log(`[backup] Skipping (recent): ${key}`);
          continue;
        }

        try {
          const { data, error: dlError } = await supabase.storage
            .from(MEDIA_BUCKET)
            .download(key);

          if (dlError) {
            log(`[backup] Download ${key} failed:`, dlError.message);
            skipped++;
            continue;
          }

          if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
          }

          const buffer = await data.arrayBuffer();
          const filepath = path.join(mediaDir, file.name);
          fs.writeFileSync(filepath, Buffer.from(buffer));
          downloaded++;

          toDelete.push(key);
          log(`[backup] Downloaded ${key}`);
        } catch (err) {
          warn(`[backup] Error processing ${key}:`, err.message);
          skipped++;
        }
      }
    } catch (err) {
      warn(`[backup] Prefix ${prefix} error:`, err.message);
    }
  }

  // Cleanup temp snapshot
  try { fs.unlinkSync(dbSnapshot); } catch (_) {}

  // In dry-run mode, just report what would be deleted
  if (DRY_RUN) {
    log(`[backup] Would delete ${toDelete.length} old media files from Supabase`);
    log('[backup] Run with --confirm to actually delete them');
  } else {
    // Actually delete the files
    if (toDelete.length > 0) {
      log(`[backup] Deleting ${toDelete.length} old files from Supabase...`);
      const { error: delError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .remove(toDelete);

      if (delError) {
        warn(`[backup] Delete failed:`, delError.message);
        deleted = 0;
      } else {
        deleted = toDelete.length;
        log(`[backup] Deleted ${deleted} old media files from Supabase`);

        // Purge corresponding DB records so gallery never shows broken entries
        const SQL2 = await initSqlJs();
        const db2 = new SQL.Database(fs.readFileSync(dbPath));
        for (const key of toDelete) {
          if (key.startsWith('media/')) {
            const fname = key.slice('media/'.length);
            const rec = mediaLookup.get(fname);
            if (rec) {
              db2.prepare('DELETE FROM media_stars WHERE media_id = ?').run(rec.id);
              db2.prepare('DELETE FROM media WHERE id = ?').run(rec.id);
              if (VERBOSE) log(`[backup] Purged DB record ${rec.id} (${fname})`);
            }
          }
        }
        fs.writeFileSync(dbPath, Buffer.from(db2.export()));
        db2.close();
        log(`[backup] Purged ${deleted} stale records from local DB`);
      }
    }
  }

  log(`[backup] Downloaded ${downloaded} media files`);
  log(`[backup] Skipped ${skipped} recent/starred files`);
  log(`[backup] Marked for deletion: ${toDelete.length} old files`);

  return { downloaded, deleted, skipped, toDelete: toDelete.length };
}

async function main() {
  console.log('═'.repeat(50));
  console.log('[backup] Starting backup from Supabase');
  console.log(`[backup] Date: ${getDateStamp()}`);
  console.log(`[backup] Media retention: ${MEDIA_RETENTION_DAYS} days`);
  console.log(`[backup] Mode: ${DRY_RUN ? 'DRY-RUN (preview)' : 'CONFIRMED (will delete)'}`);
  console.log('═'.repeat(50));

  const dbOk = await downloadDB();
  if (!dbOk) {
    warn('[backup] Warning: DB backup may not exist on Supabase yet');
  }

  const mediaResult = await downloadAndCleanMedia();

  console.log('═'.repeat(50));
  console.log('[backup] Done.');
  console.log(`[backup] DB: ${dbOk ? 'Saved to backups/' : 'Not found'}`);
  console.log(`[backup] Media: ${mediaResult.downloaded} downloaded, ${mediaResult.toDelete} marked for deletion`);
  console.log('═'.repeat(50));

  if (DRY_RUN && mediaResult.toDelete > 0) {
    console.log('');
    console.log('  → Run with --confirm to delete old files from Supabase');
  }
}

main().catch(err => {
  console.error('[backup] Fatal error:', err);
  process.exit(1);
});