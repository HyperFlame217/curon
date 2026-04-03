const router          = require('express').Router();
const path            = require('path');
const multer          = require('multer');
const dbPromise = require('../db');
const { requireAuth } = require('../auth');

const MEDIA_DIR = path.join(__dirname, '../storage/media');

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
  'video/mp4',  'video/webm',
]);

const storage = multer.diskStorage({
  destination: MEDIA_DIR,
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname) || '';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  // No fileFilter — accept any file type for general attachments
});

// GET /media/:id — auth via header OR ?token= query param (needed for img/audio src)
router.get('/:id', (req, res, next) => {
  // Allow token in query string for browser media elements
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, requireAuth, async (req, res) => {
  const db  = await dbPromise;
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const safe     = path.basename(row.filename);
  const mimeBase = (row.mime_type || 'application/octet-stream').split(';')[0].trim();
  // sendFile with explicit headers option overrides Express mime guessing
  res.sendFile(path.join(MEDIA_DIR, safe), {
    headers: { 'Content-Type': mimeBase }
  });
});

// POST /media
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  const db = await dbPromise;
  if (!req.file) return res.status(400).json({ error: 'No file or unsupported type' });

  const result = db.prepare(
    'INSERT INTO media (uploader_id, filename, mime_type, size_bytes) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, req.file.filename, req.file.mimetype, req.file.size);

  res.json({
    id:        result.lastInsertRowid,
    mime_type: req.file.mimetype,
    filename:  req.file.filename,
    size:      req.file.size,
  });
});

module.exports = router;
