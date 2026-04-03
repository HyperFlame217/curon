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

  // ── REST Routes ───────────────────────────────────────────
  app.use('/auth',     require('./routes/auth'));
  app.use('/auth/keys', require('./routes/keys'));
  app.use('/emojis',    require('./routes/emojis'));
  app.use('/gifs',      require('./routes/gifs'));
  app.use('/spotify',   require('./routes/spotify'));
  app.use('/chat',      require('./routes/clearchat'));
  app.use('/notes',     require('./routes/notes'));
  app.use('/calendar',  require('./routes/calendar'));
  app.use('/stats',     require('./routes/stats'));
  app.use('/messages', require('./routes/messages'));
  app.use('/media',    require('./routes/media'));
  app.use('/house',    require('./routes/houses'));

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
