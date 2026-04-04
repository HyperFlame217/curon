require('dotenv').config();
const express = require('express');
const http    = require('http');
const path    = require('path');

async function main() {
  await require('./db');

  const app    = express();
  const server = http.createServer(app);

  // ── Middleware ────────────────────────────────────────────
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(path.join(__dirname, '../client')));
  app.use('/config', express.static(path.join(__dirname, '../config')));

  // ── REST Routes (Consolidated Domains) ────────────────────
  app.use('/', require('./routes/auth'));   // /auth/login, /auth/keys, /auth/avatar
  app.use('/', require('./routes/chat'));   // /messages, /chat/clear, /notes
  app.use('/', require('./routes/assets')); // /media, /emojis, /gifs
  app.use('/', require('./routes/house'));  // /house, /stats
  app.use('/', require('./routes/events')); // /spotify, /calendar

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
