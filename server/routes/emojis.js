/**
 * /emojis — Custom emoji management
 * Upload: EMOJI_ADMIN username only
 * View/use: both users
 */
const router          = require('express').Router();
const path            = require('path');
const multer          = require('multer');
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');
const presence        = require('../ws/presence');

function broadcastEmojiUpdate() {
  for (const [, s] of presence.sessions) {
    if (s.ws && s.ws.readyState === 1) {
      s.ws.send(JSON.stringify({ type: 'emoji_updated' }));
    }
  }
}

const EMOJI_DIR = path.join(__dirname, '../storage/emojis');

const storage = multer.diskStorage({
  destination: EMOJI_DIR,
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.png';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 512 * 1024 }, // 512kb max
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png','image/jpeg','image/webp','image/gif'].includes(file.mimetype);
    cb(null, ok);
  },
});

function isAdmin(username) {
  return username === (process.env.EMOJI_ADMIN || '');
}

// GET /emojis — list all custom emojis
router.get('/', requireAuth, async (req, res) => {
  const db     = await dbPromise;
  const emojis = db.prepare('SELECT id, name, filename, created_at FROM custom_emojis ORDER BY name ASC').all();
  res.json(emojis);
});

// GET /emojis/img/:filename — serve emoji image (auth gated, token in query ok)
router.get('/img/:filename', (req, res, next) => {
  if (req.query.token && !req.headers.authorization)
    req.headers.authorization = `Bearer ${req.query.token}`;
  next();
}, requireAuth, (req, res) => {
  const safe = path.basename(req.params.filename);
  res.sendFile(path.join(EMOJI_DIR, safe));
});

// POST /emojis — upload a new emoji (admin only)
router.post('/', requireAuth, (req, res, next) => {
  if (!isAdmin(req.user.username))
    return res.status(403).json({ error: 'Only the emoji admin can upload emojis' });
  next();
}, upload.single('file'), async (req, res) => {
  const db   = await dbPromise;
  const name = (req.body.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!name)    return res.status(400).json({ error: 'Invalid emoji name' });
  if (!req.file) return res.status(400).json({ error: 'No file or unsupported type' });

  // Check name not taken
  const existing = db.prepare('SELECT id FROM custom_emojis WHERE name = ?').get(name);
  if (existing)  return res.status(409).json({ error: `Emoji :${name}: already exists` });

  db.prepare('INSERT INTO custom_emojis (name, filename, uploader_id) VALUES (?, ?, ?)')
    .run(name, req.file.filename, req.user.id);

  broadcastEmojiUpdate();
  res.json({ ok: true, name });
});

// DELETE /emojis/:name — remove an emoji (admin only)
router.delete('/:name', requireAuth, async (req, res) => {
  if (!isAdmin(req.user.username))
    return res.status(403).json({ error: 'Only the emoji admin can delete emojis' });

  const db  = await dbPromise;
  const row = db.prepare('SELECT * FROM custom_emojis WHERE name = ?').get(req.params.name);
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM custom_emojis WHERE name = ?').run(req.params.name);

  // Delete file from disk
  const fs   = require('fs');
  const file = path.join(EMOJI_DIR, path.basename(row.filename));
  try { fs.unlinkSync(file); } catch {}

  broadcastEmojiUpdate();
  res.json({ ok: true });
});

// GET /emojis/admin — returns the emoji admin username (so client can show UI)
router.get('/admin', requireAuth, (_req, res) => {
  res.json({ admin: process.env.EMOJI_ADMIN || '' });
});

module.exports = router;
