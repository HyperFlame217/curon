require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const supabaseStorage = require('./supabase-storage');

async function main() {
  await require('./db');

  // Auto-seed if database is fresh
  const bcrypt = require('bcryptjs');
  const db = require('./db');
  const database = await db;
  const SEED_PASSWORDS = {
    iron: process.env.SEED_PASSWORD_IRON,
    cubby: process.env.SEED_PASSWORD_CUBBY,
  };
  // Dev fallback defaults (never used in production)
  if (process.env.NODE_ENV !== 'production') {
    if (!SEED_PASSWORDS.iron) SEED_PASSWORDS.iron = '1';
    if (!SEED_PASSWORDS.cubby) SEED_PASSWORDS.cubby = '2';
  }

  const userCount = database.prepare('SELECT COUNT(*) as c FROM users').get();
  if (userCount.c === 0 && SEED_PASSWORDS.iron && SEED_PASSWORDS.cubby) {
    const seedUsers = [
      { username: 'iron', password: SEED_PASSWORDS.iron },
      { username: 'cubby', password: SEED_PASSWORDS.cubby },
    ];
    for (const u of seedUsers) {
      const hash = await bcrypt.hash(u.password, 12);
      database.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(u.username, hash);
      console.log(`  auto-seeded ${u.username}`);
    }
  }

  const app = express();
  const server = http.createServer(app);

  // ── Security Headers ─────────────────────────────────────
  app.use(helmet({ 
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
  }));

  // ── Trust Proxy (for rate limiting behind Render's proxy) ──
  app.set('trust proxy', 1);

  // ── CORS ──────────────────────────────────────────────────────
  const RENDER_URL = (process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  app.use((req, res, next) => {
    const allowedOrigins = [
      'http://localhost:3000',
      RENDER_URL,
    ].filter(Boolean);
    const origin = req.get('origin');
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // ── Keep-Alive Ping (for UptimeRobot) ───────────────────────
  app.get('/ping', (_req, res) => res.sendStatus(200));

  // ── Rate Limiting ─────────────────────────────────────────
  // Note: Auth login rate limiting removed for 2-user localhost app
  // (would need proper IP handling for production)
  const mediaLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Too many uploads, slow down' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply to sensitive endpoints (media uploads only for now)
  app.use('/media', mediaLimiter);
  app.use('/emojis', mediaLimiter);

  // ── Middleware ────────────────────────────────────────────
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(path.join(__dirname, '../client')));
  app.use('/config', express.static(path.join(__dirname, '../config')));

  // ── REST Routes (Consolidated Domains) ────────────────────
  app.use('/', require('./routes/auth'));   // /auth/login, /auth/keys, /auth/avatar
  app.use('/', require('./routes/chat'));   // /messages, /chat/clear, /notes
  app.use('/', require('./routes/search')); // /chat/search
  app.use('/', require('./routes/assets')); // /media, /emojis, /gifs
  app.use('/', require('./routes/house'));  // Stats & milestones
  app.use('/', require('./routes/events')); // /calendar, /schedule
  // app.use('/', require('./routes/wallet')); // DISABLED P22-A (Economy feature)

  // ── Fallback: SPA shell ───────────────────────────────────
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
  });

  // ── Global Error Handler ──────────────────────────────────
  app.use((err, _req, res, _next) => {
    console.error('[error]', err.message);
    res.status(500).json({ error: 'Internal error' });
  });

  // ── WebSocket ─────────────────────────────────────────────
  require('./ws/handler')(server);

  // ── Media Cleanup (auto-delete unstarred media >7 days) ──
  let _orphanSwept = false;

  async function cleanupOldMedia() {
    const database = await db;
    const cutoff = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

    const oldItems = database.prepare(`SELECT id, filename, mime_type, storage_provider FROM media
      WHERE created_at < ? AND id NOT IN (SELECT media_id FROM media_stars)`).all(cutoff);

    console.log(`[cleanup] Cutoff=${cutoff}, found ${oldItems.length} items to purge`);
    if (oldItems.length > 0) {
      const sample = oldItems.slice(0, 3).map(i => `#${i.id} created_at=${i.created_at} file=${i.filename}`).join(', ');
      console.log(`[cleanup] Samples: ${sample}`);
    }

    const total = database.prepare('SELECT COUNT(*) as c FROM media').get()?.c || 0;
    console.log(`[cleanup] Total media rows before purge: ${total}`);

    for (const item of oldItems) {
      try {
        await supabaseStorage.remove(supabaseStorage.MEDIA_BUCKET, `media/${item.filename}`);
        if (item.mime_type?.startsWith('image/')) {
          const base = item.filename.replace(path.extname(item.filename), '');
          await supabaseStorage.remove(supabaseStorage.MEDIA_BUCKET, `thumbnails/${base}.jpg`);
        }
      } catch (e) {
        console.warn('[cleanup] Supabase remove failed:', e.message);
      }

      if (item.storage_provider === 'local') {
        try {
          const MEDIA_DIR = path.join(__dirname, 'storage', 'media');
          const THUMB_DIR = path.join(__dirname, 'storage', 'thumbnails');
          const localPath = path.join(MEDIA_DIR, item.filename);
          if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
          if (item.mime_type?.startsWith('image/')) {
            const ext = path.extname(item.filename);
            const thumbPath = path.join(THUMB_DIR, `${item.filename.replace(ext, '')}.jpg`);
            if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
          }
        } catch (e) {
          console.warn('[cleanup] Local remove failed:', e.message);
        }
      }

      database.prepare('DELETE FROM media WHERE id = ?').run(item.id);
    }

    // One-time orphan sweep: Supabase files with no DB row
    if (!_orphanSwept && oldItems.length === 0) {
      _orphanSwept = true;
      try {
        const files = await supabaseStorage.list(supabaseStorage.MEDIA_BUCKET, 'media/');
        for (const f of files) {
          const row = database.prepare('SELECT id FROM media WHERE filename = ?').get(f.name);
          if (!row) {
            await supabaseStorage.remove(supabaseStorage.MEDIA_BUCKET, `media/${f.name}`);
            const base = f.name.replace(path.extname(f.name), '');
            await supabaseStorage.remove(supabaseStorage.MEDIA_BUCKET, `thumbnails/${base}.jpg`).catch(()=>{});
          }
        }
      } catch (e) {
        console.warn('[cleanup] Orphan sweep failed:', e.message);
      }
    }

    if (oldItems.length > 0) {
      const remaining = database.prepare('SELECT COUNT(*) as c FROM media').get()?.c || 0;
      console.log(`[cleanup] Deleted ${oldItems.length} unstarred media items >7 days old, ${remaining} rows remaining`);
    }
  }

  const CLEANUP_INTERVAL = process.env.MEDIA_CLEANUP_INTERVAL_MS
    ? parseInt(process.env.MEDIA_CLEANUP_INTERVAL_MS)
    : 6 * 60 * 60 * 1000;

  if (CLEANUP_INTERVAL > 0) {
    setTimeout(() => {
      cleanupOldMedia();
      setInterval(cleanupOldMedia, CLEANUP_INTERVAL);
    }, 60_000);
    console.log(`[cleanup] Scheduled every ${Math.round(CLEANUP_INTERVAL / 60000)}min (first run in 1min)`);
  }

  // ── Startup Orphan Sweep (one-time) ───────────────────────
  async function runStartupOrphanSweep() {
    const database = await db;
    let removed = 0;
    const MEDIA_DIR = path.join(__dirname, 'storage', 'media');
    const THUMB_DIR = path.join(__dirname, 'storage', 'thumbnails');

    for (const dir of [MEDIA_DIR, THUMB_DIR]) {
      let files;
      try { files = fs.readdirSync(dir); } catch { continue; }
      for (const f of files) {
        const isThumb = dir === THUMB_DIR;
        const mediaName = isThumb ? f.replace(/\.jpg$/i, '') : f;
        const row = isThumb
          ? database.prepare("SELECT id FROM media WHERE filename LIKE ? || '.%'").get(mediaName)
          : database.prepare('SELECT id FROM media WHERE filename = ?').get(f);
        if (!row) {
          try { fs.unlinkSync(path.join(dir, f)); removed++; } catch {}
        }
      }
    }

    try {
      const mediaFiles = await supabaseStorage.list(supabaseStorage.MEDIA_BUCKET, 'media/');
      for (const f of mediaFiles) {
        const row = database.prepare('SELECT id FROM media WHERE filename = ?').get(f.name);
        if (!row) {
          await supabaseStorage.remove(supabaseStorage.MEDIA_BUCKET, `media/${f.name}`).catch(()=>{});
          const base = f.name.replace(path.extname(f.name), '');
          await supabaseStorage.remove(supabaseStorage.MEDIA_BUCKET, `thumbnails/${base}.jpg`).catch(()=>{});
          removed++;
        }
      }

      const thumbFiles = await supabaseStorage.list(supabaseStorage.MEDIA_BUCKET, 'thumbnails/');
      for (const f of thumbFiles) {
        const mediaName = f.name.replace(/\.jpg$/i, '');
        const row = database.prepare("SELECT id FROM media WHERE filename LIKE ?").get(mediaName + '.%');
        if (!row) {
          await supabaseStorage.remove(supabaseStorage.MEDIA_BUCKET, `thumbnails/${f.name}`).catch(()=>{});
          removed++;
        }
      }
    } catch (e) {
      console.warn('[startup] Supabase orphan sweep failed:', e.message);
    }

    if (removed > 0) console.log(`[startup] Orphan sweep: removed ${removed} orphaned files`);
  }

  runStartupOrphanSweep();

  // ── Start ─────────────────────────────────────────────────
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`CURON.EXE running → http://localhost:${PORT}`);
  });

  // ── Graceful Shutdown (Render Support) ────────────────────
  const gracefulShutdown = async (signal) => {
    console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);
    try {
      const database = await db;
      console.log('[Server] Flushing database locally...');
      if (database.flushLocal) database.flushLocal();
      console.log('[Server] Flushing database to Supabase...');
      await database.syncToSupabase(true);
      console.log('[Server] Flush complete. Exiting.');
      process.exit(0);
    } catch (err) {
      console.error('[Server] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

main().catch(err => { console.error('Failed to start:', err); process.exit(1); });
