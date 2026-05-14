require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
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

  // ── Media Cleanup (auto-delete unstarred media >14 days) ──
  async function cleanupOldMedia() {
    try {
      const database = await db;
      const cutoff = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;
      const oldItems = database.prepare(`
        SELECT id, filename, mime_type, storage_provider FROM media
        WHERE created_at < ? AND id NOT IN (SELECT media_id FROM media_stars)
      `).all(cutoff);

      for (const item of oldItems) {
        // Always try Supabase deletion (backward compat with existing records)
        try {
          await supabaseStorage.remove(supabaseStorage.MEDIA_BUCKET, `media/${item.filename}`);
          if (item.mime_type && item.mime_type.startsWith('image/')) {
            const ext = path.extname(item.filename);
            const base = item.filename.replace(ext, '');
            await supabaseStorage.remove(supabaseStorage.MEDIA_BUCKET, `thumbnails/${base}.jpg`);
          }
        } catch (_) { /* file may already be gone */ }

        // Also delete local files if applicable
        if (item.storage_provider === 'local') {
          try {
            const MEDIA_DIR = path.join(__dirname, 'storage', 'media');
            const THUMB_DIR = path.join(__dirname, 'storage', 'thumbnails');
            const localPath = path.join(MEDIA_DIR, item.filename);
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
            if (item.mime_type && item.mime_type.startsWith('image/')) {
              const ext = path.extname(item.filename);
              const thumbPath = path.join(THUMB_DIR, `${item.filename.replace(ext, '')}.jpg`);
              if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
            }
          } catch (_) { /* local file may already be gone */ }
        }

        database.prepare('DELETE FROM media WHERE id = ?').run(item.id);
      }

      if (oldItems.length > 0) {
        console.log(`[cleanup] Deleted ${oldItems.length} unstarred media items >14 days old`);
      }
    } catch (err) {
      console.error('[cleanup] Error:', err.message);
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
