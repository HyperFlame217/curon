const router          = require('express').Router();
const path            = require('path');
const fs              = require('fs');
const multer          = require('multer');
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');
const presence        = require('../ws/presence');

const MEDIA_DIR = path.join(__dirname, '../storage/media');
const EMOJI_DIR = path.join(__dirname, '../storage/emojis');

const uploadMedia = multer({ storage: multer.diskStorage({ destination: MEDIA_DIR, filename: (_r, f, c) => c(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(f.originalname)||""}`) }), limits: { fileSize: 50*1024*1024 } });
const uploadEmoji = multer({ storage: multer.diskStorage({ destination: EMOJI_DIR, filename: (_r, f, c) => c(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(f.originalname).toLowerCase()||".png"}`) }), limits: { fileSize: 512*1024 } });

function broadcastEmoji() { for (const [, s] of presence.sessions) { if (s.ws && s.ws.readyState === 1) s.ws.send(JSON.stringify({ type: 'emoji_updated' })); } }
function isAdmin(user) { return user === (process.env.EMOJI_ADMIN || ''); }

// ── MEDIA (Uploads/Attachments) ─────────────────────────────
router.get('/media/:id', (q, r, n) => { if (q.query.token && !q.headers.authorization) q.headers.authorization = `Bearer ${q.query.token}`; n(); }, requireAuth, async (req, res) => {
  const db = await dbPromise;
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const mime = (row.mime_type || 'application/octet-stream').split(';')[0].trim();
  res.sendFile(path.join(MEDIA_DIR, path.basename(row.filename)), { headers: { 'Content-Type': mime } });
});

router.post('/media', requireAuth, uploadMedia.single('file'), async (req, res) => {
  const db = await dbPromise;
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const result = db.prepare('INSERT INTO media (uploader_id, filename, mime_type, size_bytes) VALUES (?, ?, ?, ?)').run(req.user.id, req.file.filename, req.file.mimetype, req.file.size);
  res.json({ id: result.lastInsertRowid, mime_type: req.file.mimetype, filename: req.file.filename, size: req.file.size });
});

// ── CUSTOM EMOJIS ───────────────────────────────────────────
router.get('/emojis', requireAuth, async (req, res) => { const db = await dbPromise; res.json(db.prepare('SELECT * FROM custom_emojis ORDER BY name ASC').all()); });

router.get('/emojis/img/:filename', (q, r, n) => { if (q.query.token && !q.headers.authorization) q.headers.authorization = `Bearer ${q.query.token}`; n(); }, requireAuth, (req, res) => { res.sendFile(path.join(EMOJI_DIR, path.basename(req.params.filename))); });

router.post('/emojis', requireAuth, (q, r, n) => { if (!isAdmin(q.user.username)) return r.status(403).json({ error: 'Admin only' }); n(); }, uploadEmoji.single('file'), async (req, res) => {
  const db = await dbPromise;
  const name = (req.body.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!name || !req.file || db.prepare('SELECT id FROM custom_emojis WHERE name = ?').get(name)) return res.status(400).json({ error: 'Invalid' });
  db.prepare('INSERT INTO custom_emojis (name, filename, uploader_id) VALUES (?, ?, ?)').run(name, req.file.filename, req.user.id);
  broadcastEmoji(); res.json({ ok: true, name });
});

router.delete('/emojis/:name', requireAuth, async (req, res) => {
  if (!isAdmin(req.user.username)) return res.status(403).json({ error: 'Admin only' });
  const db = await dbPromise;
  const row = db.prepare('SELECT * FROM custom_emojis WHERE name = ?').get(req.params.name);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM custom_emojis WHERE name = ?').run(req.params.name);
  try { fs.unlinkSync(path.join(EMOJI_DIR, path.basename(row.filename))); } catch {}
  broadcastEmoji(); res.json({ ok: true });
});

router.get('/emojis/admin', requireAuth, (_req, res) => res.json({ admin: process.env.EMOJI_ADMIN || '' }));

// ── GIPHY PROXY ──────────────────────────────────────────────
async function gFetch(ep, p) {
  const url = new URL(`https://api.giphy.com/v1/gifs${ep}`);
  url.searchParams.set('api_key', process.env.GIPHY_API_KEY || '');
  url.searchParams.set('limit', '24');
  for (const [k, v] of Object.entries(p)) url.searchParams.set(k, v);
  return (await fetch(url.toString())).json();
}

function normG(d) { return (d.data || []).map(g => ({ id: g.id, url: g.images?.original?.url || '', preview: g.images?.fixed_height_small?.url || '', width: parseInt(g.images?.fixed_height_small?.width || 100), height: parseInt(g.images?.fixed_height_small?.height || 100), title: g.title || '' })); }

router.get('/gifs/trending', requireAuth, async (_q, r) => { try { r.json(normG(await gFetch('/trending', {}))); } catch (e) { r.status(502).json({ error: e.message }); } });
router.get('/gifs/search', requireAuth, async (q, r) => { const qry = (q.query.q || '').trim(); if (!qry) return r.json([]); try { r.json(normG(await gFetch('/search', { q: qry }))); } catch (e) { r.status(502).json({ error: e.message }); } });

module.exports = router;
