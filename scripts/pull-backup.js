/**
 * pull-backup.js — Local backup script
 *
 * Downloads DB + media from Supabase, deletes old media to save space.
 * Run manually or via Task Scheduler / cron every 7 days.
 *
 * Usage: node scripts/pull-backup.js
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
  console.log('[backup] Checking media files in Supabase...');

  const now = Date.now();
  const cutoffMs = MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  let downloaded = 0;
  let deleted = 0;
  let skipped = 0;

  const prefixes = ['media/', 'thumbnails/', 'emojis/'];

  for (const prefix of prefixes) {
    try {
      const { data: files, error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .list(prefix, { limit: 1000 });

      if (error) {
        console.warn(`[backup] List ${prefix} failed:`, error.message);
        continue;
      }

      if (!files || files.length === 0) continue;

      const folderPrefix = prefix.replace('/', '-').replace('/', '');
      const mediaDir = path.join(BACKUP_DIR, `${folderPrefix}-${getDateStamp()}`);

      for (const file of files) {
        const key = `${prefix}${file.name}`;

        try {
          const { data, error: dlError } = await supabase.storage
            .from(MEDIA_BUCKET)
            .download(key);

          if (dlError) {
            console.warn(`[backup] Download ${key} failed:`, dlError.message);
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

          const { error: delError } = await supabase.storage
            .from(MEDIA_BUCKET)
            .remove([key]);

          if (delError) {
            console.warn(`[backup] Delete ${key} failed:`, delError.message);
          } else {
            deleted++;
          }
        } catch (err) {
          console.warn(`[backup] Error processing ${key}:`, err.message);
          skipped++;
        }
      }
    } catch (err) {
      console.warn(`[backup] Prefix ${prefix} error:`, err.message);
    }
  }

  console.log(`[backup] Downloaded ${downloaded} media files`);
  console.log(`[backup] Deleted ${deleted} old media files from Supabase`);
  console.log(`[backup] Skipped ${skipped} files`);

  return { downloaded, deleted, skipped };
}

async function main() {
  console.log('═'.repeat(50));
  console.log('[backup] Starting backup from Supabase');
  console.log(`[backup] Date: ${getDateStamp()}`);
  console.log(`[backup] Media retention: ${MEDIA_RETENTION_DAYS} days`);
  console.log('═'.repeat(50));

  const dbOk = await downloadDB();
  if (!dbOk) {
    console.warn('[backup] Warning: DB backup may not exist on Supabase yet');
  }

  const mediaResult = await downloadAndCleanMedia();

  console.log('═'.repeat(50));
  console.log('[backup] Done.');
  console.log(`[backup] DB: ${dbOk ? 'Saved to backups/' : 'Not found'}`);
  console.log(`[backup] Media: ${mediaResult.downloaded} downloaded, ${mediaResult.deleted} deleted from Supabase`);
  console.log('═'.repeat(50));
}

main().catch(err => {
  console.error('[backup] Fatal error:', err);
  process.exit(1);
});