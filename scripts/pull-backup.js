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

  const now = Date.now();
  const cutoffMs = MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(now - cutoffMs);

  let downloaded = 0;
  let deleted = 0;
  let skipped = 0;
  let toDelete = [];

  const prefixes = ['media/', 'thumbnails/', 'emojis/'];

  for (const prefix of prefixes) {
    try {
      const { data: files, error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .list(prefix, { limit: 1000 });

      if (error) {
        warn(`[backup] List ${prefix} failed:`, error.message);
        continue;
      }

      if (!files || files.length === 0) continue;

      const folderPrefix = prefix.replace('/', '-').replace('/', '');
      const mediaDir = path.join(BACKUP_DIR, `${folderPrefix}-${getDateStamp()}`);

      for (const file of files) {
        const key = `${prefix}${file.name}`;
        const fileUpdatedAt = new Date(file.updated_at);

        // Skip files newer than retention period
        if (fileUpdatedAt > cutoffDate) {
          skipped++;
          if (VERBOSE) log(`[backup] Skipping (recent): ${key} (${file.updated_at})`);
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

          // Track for deletion after confirmed
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
      }
    }
  }

  log(`[backup] Downloaded ${downloaded} media files`);
  log(`[backup] Skipped ${skipped} recent files`);
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