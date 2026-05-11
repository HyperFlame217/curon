const router          = require('express').Router();
const path            = require('path');
const fs              = require('fs');
const multer          = require('multer');
const sharp           = require('sharp');
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');
const presence        = require('../ws/presence');
const supabaseStorage = require('../supabase-storage');

function genFilename(ext) {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}${ext || ''}`;
}

const uploadMedia = multer({ storage: multer.memoryStorage() });
const uploadEmoji = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512*1024 } });

function broadcastEmoji() { for (const [, s] of presence.sessions) { if (s.ws && s.ws.readyState === 1) s.ws.send(JSON.stringify({ type: 'emoji_updated' })); } }
function isAdmin(user) { return user === (process.env.EMOJI_ADMIN || ''); }

// ── MEDIA (Uploads/Attachments) ─────────────────────────────
router.get('/media/:id', (q, r, n) => { if (q.query.token && !q.headers.authorization) q.headers.authorization = `Bearer ${q.query.token}`; n(); }, requireAuth, async (req, res) => {
  const db = await dbPromise;
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const url = supabaseStorage.getPublicUrl(supabaseStorage.MEDIA_BUCKET, `media/${row.filename}`);
  res.redirect(302, url);
});

router.post('/media', requireAuth, uploadMedia.single('file'), async (req, res) => {
  const db = await dbPromise;
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const ext = path.extname(req.file.originalname) || '';
  const filename = genFilename(ext);
  const contentType = req.file.mimetype || 'application/octet-stream';

  const buffer = req.file.buffer;
  await supabaseStorage.upload(supabaseStorage.MEDIA_BUCKET, `media/${filename}`, buffer, contentType);

  if (contentType.startsWith('image/')) {
    try {
      const thumbBuffer = await sharp(buffer).resize(300).jpeg({ quality: 80 }).toBuffer();
      await supabaseStorage.upload(supabaseStorage.MEDIA_BUCKET, `thumbnails/${filename.replace(ext, '')}.jpg`, thumbBuffer, 'image/jpeg');
    } catch (err) {
      console.error('[Thumbnail] Failed to generate:', err.message);
    }
  }

  const result = db.prepare('INSERT INTO media (uploader_id, filename, mime_type, size_bytes) VALUES (?, ?, ?, ?)').run(req.user.id, filename, contentType, req.file.size);
  res.json({ id: result.lastInsertRowid, mime_type: contentType, filename, size: req.file.size });
});

// ── THUMBNAIL SERVE ─────────────────────────────────────────
router.get('/media/:id/thumb', (q, r, n) => { if (q.query.token && !q.headers.authorization) q.headers.authorization = `Bearer ${q.query.token}`; n(); }, requireAuth, async (req, res) => {
  const db = await dbPromise;
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const isImage = row.mime_type && row.mime_type.startsWith('image/');
  if (!isImage) return res.status(404).json({ error: 'Not an image' });

  const ext = path.extname(row.filename);
  const base = row.filename.replace(ext, '');
  const thumbFilename = `${base}.jpg`;
  const url = supabaseStorage.getPublicUrl(supabaseStorage.MEDIA_BUCKET, `thumbnails/${thumbFilename}`);
  res.redirect(302, url);
});

// ── GALLERY PAGINATION ───────────────────────────────────────
router.get('/gallery/media', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const limit = Math.min(parseInt(req.query.limit) || 15, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  // Get total count (only image/video)
  const total = db.prepare('SELECT COUNT(*) as c FROM media WHERE mime_type LIKE "image/%" OR mime_type LIKE "video/%"').get()?.c || 0;

  // Fetch media items with sender info (only image/video types)
  const items = db.prepare(`
    SELECT m.id, m.uploader_id, m.filename, m.mime_type, m.size_bytes, m.created_at,
           (SELECT username FROM users WHERE id = m.uploader_id) as uploader_username
    FROM media m
    WHERE m.mime_type LIKE 'image/%' OR m.mime_type LIKE 'video/%'
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  res.json({ items, total, limit, offset });
});

router.get('/gallery/files', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  // Get total count (non image/video)
  const total = db.prepare(`
    SELECT COUNT(*) as c FROM media
    WHERE mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE 'video/%'
  `).get()?.c || 0;

  // Fetch file items with sender info
  const items = db.prepare(`
    SELECT m.id, m.uploader_id, m.filename, m.mime_type, m.size_bytes, m.created_at,
           (SELECT username FROM users WHERE id = m.uploader_id) as uploader_username
    FROM media m
    WHERE m.mime_type NOT LIKE 'image/%' AND m.mime_type NOT LIKE 'video/%'
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  res.json({ items, total, limit, offset });
});

// ── CUSTOM EMOJIS ───────────────────────────────────────────
router.get('/emojis', requireAuth, async (req, res) => { const db = await dbPromise; res.json(db.prepare('SELECT * FROM custom_emojis ORDER BY name ASC').all()); });

router.get('/emojis/img/:filename', (q, r, n) => { if (q.query.token && !q.headers.authorization) q.headers.authorization = `Bearer ${q.query.token}`; n(); }, requireAuth, (req, res) => {
  const filename = path.basename(req.params.filename);
  const url = supabaseStorage.getPublicUrl(supabaseStorage.MEDIA_BUCKET, `emojis/${filename}`);
  res.redirect(302, url);
});

router.post('/emojis', requireAuth, (q, r, n) => { if (!isAdmin(q.user.username)) return r.status(403).json({ error: 'Admin only' }); n(); }, uploadEmoji.single('file'), async (req, res) => {
  const db = await dbPromise;
  const name = (req.body.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!name || !req.file || db.prepare('SELECT id FROM custom_emojis WHERE name = ?').get(name)) return res.status(400).json({ error: 'Invalid' });

  const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
  const filename = `${name}${ext}`;
  const contentType = req.file.mimetype || 'image/png';

  await supabaseStorage.upload(supabaseStorage.MEDIA_BUCKET, `emojis/${filename}`, req.file.buffer, contentType);
  db.prepare('INSERT INTO custom_emojis (name, filename, uploader_id) VALUES (?, ?, ?)').run(name, filename, req.user.id);
  broadcastEmoji(); res.json({ ok: true, name });
});

router.delete('/emojis/:name', requireAuth, async (req, res) => {
  if (!isAdmin(req.user.username)) return res.status(403).json({ error: 'Admin only' });
  const db = await dbPromise;
  const row = db.prepare('SELECT * FROM custom_emojis WHERE name = ?').get(req.params.name);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM custom_emojis WHERE name = ?').run(req.params.name);
  try { await supabaseStorage.remove(supabaseStorage.MEDIA_BUCKET, `emojis/${row.filename}`); } catch {}
  broadcastEmoji(); res.json({ ok: true });
});

router.get('/emojis/admin', requireAuth, (_req, res) => res.json({ admin: process.env.EMOJI_ADMIN || '' }));

// ── KLIPY PROXY ──────────────────────────────────────────────
async function kFetch(ep, p) {
  const apiKey = process.env.KLIPY_API_KEY || '';
  if (!apiKey) throw new Error('KLIPY_API_KEY missing');
  
  // KLIPY uses API key in the URL path: api/v1/[key]/gifs/...
  const url = new URL(`https://api.klipy.com/api/v1/${apiKey}/gifs${ep}`);
  url.searchParams.set('limit', '24');
  for (const [k, v] of Object.entries(p)) url.searchParams.set(k, v);
  
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`KLIPY Error: ${res.status}`);
  return res.json();
}

function normG(d) {
  let items = [];
  if (Array.isArray(d)) items = d;
  else if (d && Array.isArray(d.data)) items = d.data;
  else if (d && d.data && Array.isArray(d.data.gifs)) items = d.data.gifs;
  else if (d && d.results && Array.isArray(d.results)) items = d.results;
  else if (d && d.data && Array.isArray(d.data.data)) items = d.data.data;

  return items.map(g => {
    const f = g.file || g.files || {};
    const hd = f.hd || f.md || f.original || {};
    const sm = f.sm || f.md || hd || {};
    
    // Klipy uses .gif.url, .webp.url etc
    const url = hd.gif?.url || hd.url || g.url || '';
    const preview = sm.gif?.url || sm.url || g.preview || url;
    
    return {
      id: g.id,
      url: url,
      preview: preview,
      width: parseInt(hd.gif?.width || hd.width || g.width || 100),
      height: parseInt(hd.gif?.height || hd.height || g.height || 100),
      title: g.title || ''
    };
  });
}

router.get('/gifs/trending', requireAuth, async (_q, r) => {
  try { r.json(normG(await kFetch('/trending', {}))); } 
  catch (e) { console.error('[Gifs] Trending Error:', e.message); r.status(502).json({ error: e.message }); }
});

router.get('/gifs/search', requireAuth, async (q, r) => {
  const qry = (q.query.q || '').trim();
  if (!qry) return r.json([]);
  try { r.json(normG(await kFetch('/search', { q: qry }))); } 
  catch (e) { console.error('[Gifs] Search Error:', e.message); r.status(502).json({ error: e.message }); }
});

module.exports = router;
