const router          = require('express').Router();
const path            = require('path');
const fs              = require('fs');
const multer          = require('multer');
const sharp           = require('sharp');
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');
const presence        = require('../ws/presence');
const supabaseStorage = require('../supabase-storage');

// ── Local Storage Config ────────────────────────────────────────
const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const MEDIA_DIR = path.join(STORAGE_DIR, 'media');
const THUMB_DIR = path.join(STORAGE_DIR, 'thumbnails');
const TMP_DIR = path.join(STORAGE_DIR, 'tmp');
const MAX_SUPABASE_SIZE = 45 * 1024 * 1024; // 45MB (buffer under 50MB limit)

// Ensure storage directories exist
[MEDIA_DIR, THUMB_DIR, TMP_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function genFilename(ext) {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}${ext || ''}`;
}

// Use diskStorage to avoid loading large files into memory
const uploadMedia = multer({
  storage: multer.diskStorage({
    destination: TMP_DIR,
    filename: (_req, file, cb) => cb(null, genFilename(path.extname(file.originalname) || ''))
  })
});
const uploadEmoji = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512*1024 } });

function broadcastEmoji() { for (const [, s] of presence.sessions) { if (s.ws && s.ws.readyState === 1) s.ws.send(JSON.stringify({ type: 'emoji_updated' })); } }
function isAdmin(user) { return user === (process.env.EMOJI_ADMIN || ''); }

// ── MEDIA STARS ────────────────────────────────────────────────
// Must be defined before /media/:id to avoid param catch-all

router.get('/media/stars', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const rows = db.prepare('SELECT media_id FROM media_stars WHERE user_id = ?').all(req.user.id);
  res.json(rows.map(r => r.media_id));
});

router.post('/media/:id/star', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const media = db.prepare('SELECT id FROM media WHERE id = ?').get(req.params.id);
  if (!media) return res.status(404).json({ error: 'Not found' });
  try {
    db.prepare('INSERT OR IGNORE INTO media_stars (media_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/media/:id/star', requireAuth, async (req, res) => {
  const db = await dbPromise;
  db.prepare('DELETE FROM media_stars WHERE media_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ── MEDIA BACKUP CHECK ──────────────────────────────────────────
router.get('/media/backup/check', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const count = db.prepare('SELECT COUNT(*) as c FROM media WHERE storage_provider = ?').get('local')?.c || 0;
  res.json({ count });
});

// ── MEDIA BACKUP DOWNLOAD ──────────────────────────────────────
const archiver = require('archiver');
router.get('/media/backup', requireAuth, async (req, res) => {
  if (req.user.username !== 'iron') return res.status(403).json({ error: 'Admin only' });
  const db = await dbPromise;
  const localFiles = db.prepare('SELECT id, filename, mime_type, size_bytes FROM media WHERE storage_provider = ?').all('local');
  if (!localFiles.length) return res.status(404).json({ error: 'No local media to back up' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="curon-media-backup-${new Date().toISOString().slice(0, 10)}.zip"`);

  const archive = archiver('zip', { zlib: { level: 0 } });
  archive.pipe(res);

  for (const f of localFiles) {
    const filePath = path.join(MEDIA_DIR, f.filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: `media/${f.filename}` });
    }
    if (f.mime_type?.startsWith('image/')) {
      const ext = path.extname(f.filename);
      const thumbPath = path.join(THUMB_DIR, `${f.filename.replace(ext, '')}.jpg`);
      if (fs.existsSync(thumbPath)) {
        archive.file(thumbPath, { name: `thumbnails/${f.filename.replace(ext, '')}.jpg` });
      }
    }
  }

  archive.finalize();
});

// ── MEDIA DOWNLOAD ─────────────────────────────────────────────
router.get('/media/:id/download', (q, r, n) => { if (q.query.token && !q.headers.authorization) q.headers.authorization = `Bearer ${q.query.token}`; n(); }, requireAuth, async (req, res) => {
  const db = await dbPromise;
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  if (row.storage_provider === 'local' && fs.existsSync(path.join(MEDIA_DIR, row.filename))) {
    return res.download(path.join(MEDIA_DIR, row.filename));
  }

  const url = supabaseStorage.getPublicUrl(supabaseStorage.MEDIA_BUCKET, `media/${row.filename}`, { download: true });
  res.redirect(302, url);
});

// ── MEDIA (Uploads/Attachments) ─────────────────────────────
router.get('/media/:id', (q, r, n) => { if (q.query.token && !q.headers.authorization) q.headers.authorization = `Bearer ${q.query.token}`; n(); }, requireAuth, async (req, res) => {
  const db = await dbPromise;
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  if (row.storage_provider === 'local' && fs.existsSync(path.join(MEDIA_DIR, row.filename))) {
    res.setHeader('Content-Type', row.mime_type);
    return res.sendFile(path.join(MEDIA_DIR, row.filename));
  }

  const url = supabaseStorage.getPublicUrl(supabaseStorage.MEDIA_BUCKET, `media/${row.filename}`);
  res.redirect(302, url);
});

router.post('/media', requireAuth, uploadMedia.single('file'), async (req, res) => {
  const db = await dbPromise;
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const filename = req.file.filename;
  const ext = path.extname(filename);
  const contentType = req.file.mimetype || 'application/octet-stream';
  const fileSize = req.file.size;
  const filePath = req.file.path;

  if (fileSize <= MAX_SUPABASE_SIZE) {
    // Small file: upload to Supabase (existing flow)
    const buffer = fs.readFileSync(filePath);
    await supabaseStorage.upload(supabaseStorage.MEDIA_BUCKET, `media/${filename}`, buffer, contentType);

    if (contentType.startsWith('image/')) {
      try {
        const thumbBuffer = await sharp(buffer).resize(300).jpeg({ quality: 80 }).toBuffer();
        await supabaseStorage.upload(supabaseStorage.MEDIA_BUCKET, `thumbnails/${filename.replace(ext, '')}.jpg`, thumbBuffer, 'image/jpeg');
      } catch (err) {
        console.error('[Thumbnail] Failed to generate:', err.message);
      }
    }

    fs.unlinkSync(filePath); // clean up temp file
    const result = db.prepare('INSERT INTO media (uploader_id, filename, mime_type, size_bytes, storage_provider) VALUES (?, ?, ?, ?, ?)').run(req.user.id, filename, contentType, fileSize, 'supabase');
    res.json({ id: result.lastInsertRowid, mime_type: contentType, filename, size: fileSize });
  } else {
    // Large file: store locally
    const destPath = path.join(MEDIA_DIR, filename);
    fs.renameSync(filePath, destPath);

    if (contentType.startsWith('image/')) {
      try {
        const thumbBuffer = await sharp(destPath).resize(300).jpeg({ quality: 80 }).toBuffer();
        fs.writeFileSync(path.join(THUMB_DIR, `${filename.replace(ext, '')}.jpg`), thumbBuffer);
      } catch (err) {
        console.error('[Thumbnail] Failed to generate:', err.message);
      }
    }

    const result = db.prepare('INSERT INTO media (uploader_id, filename, mime_type, size_bytes, storage_provider) VALUES (?, ?, ?, ?, ?)').run(req.user.id, filename, contentType, fileSize, 'local');
    res.json({ id: result.lastInsertRowid, mime_type: contentType, filename, size: fileSize });
  }
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

  if (row.storage_provider === 'local' && fs.existsSync(path.join(THUMB_DIR, thumbFilename))) {
    return res.sendFile(path.join(THUMB_DIR, thumbFilename));
  }

  const url = supabaseStorage.getPublicUrl(supabaseStorage.MEDIA_BUCKET, `thumbnails/${thumbFilename}`);
  res.redirect(302, url);
});

// ── GALLERY PAGINATION ───────────────────────────────────────
router.get('/gallery/media', requireAuth, async (req, res) => {
  const db = await dbPromise;

  // Purge stale unstarred media before returning gallery data
  db.prepare(`
    DELETE FROM media
    WHERE created_at < (strftime('%s','now') - 14*24*60*60)
    AND id NOT IN (SELECT media_id FROM media_stars)
  `).run();

  const limit = Math.min(parseInt(req.query.limit) || 15, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  // Get total count (only image/video)
  const total = db.prepare('SELECT COUNT(*) as c FROM media WHERE mime_type LIKE "image/%" OR mime_type LIKE "video/%"').get()?.c || 0;

  // Fetch media items with sender info (only image/video types)
  const items = db.prepare(`
    SELECT m.id, m.uploader_id, m.filename, m.mime_type, m.size_bytes, m.created_at,
           (SELECT username FROM users WHERE id = m.uploader_id) as uploader_username,
           (SELECT 1 FROM media_stars WHERE media_id = m.id AND user_id = ?) as is_starred
    FROM media m
    WHERE m.mime_type LIKE 'image/%' OR m.mime_type LIKE 'video/%'
    ORDER BY is_starred DESC, m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, limit, offset);

  res.json({ items, total, limit, offset });
});

router.get('/gallery/files', requireAuth, async (req, res) => {
  const db = await dbPromise;

  // Purge stale unstarred media before returning gallery data
  db.prepare(`
    DELETE FROM media
    WHERE created_at < (strftime('%s','now') - 14*24*60*60)
    AND id NOT IN (SELECT media_id FROM media_stars)
  `).run();

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
           (SELECT username FROM users WHERE id = m.uploader_id) as uploader_username,
           (SELECT 1 FROM media_stars WHERE media_id = m.id AND user_id = ?) as is_starred
    FROM media m
    WHERE m.mime_type NOT LIKE 'image/%' AND m.mime_type NOT LIKE 'video/%'
    ORDER BY is_starred DESC, m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, limit, offset);

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
