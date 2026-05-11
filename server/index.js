require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

async function main() {
  await require('./db');

  const app = express();
  const server = http.createServer(app);

  // ── Security Headers ─────────────────────────────────────
  app.use(helmet({ contentSecurityPolicy: false }));

  // ── Trust Proxy (for rate limiting behind Render's proxy) ──
  app.set('trust proxy', 1);

  // ── CORS (for Render + Spotify callback) ────────────────────
  app.use((req, res, next) => {
    const allowedOrigins = [
      req.get('origin'),
      'https://spotify.com',
      'https://open.spotify.com',
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
  app.use('/', require('./routes/events')); // /spotify, /calendar
  // app.use('/', require('./routes/wallet')); // DISABLED P22-A (Economy feature)

  // ── Fallback: SPA shell ───────────────────────────────────
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
  });

  // ── WebSocket ─────────────────────────────────────────────
  require('./ws/handler')(server);

  // ── Start ─────────────────────────────────────────────────
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`CURON.EXE running → http://localhost:${PORT}`);
  });
}

main().catch(err => { console.error('Failed to start:', err); process.exit(1); });
