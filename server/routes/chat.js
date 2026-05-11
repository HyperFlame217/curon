const router          = require('express').Router();
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');
const presence        = require('../ws/presence');

function broadcast(type, payload) {
  for (const [, s] of presence.sessions) {
    if (s.ws && s.ws.readyState === 1) s.ws.send(JSON.stringify({ type, ...payload }));
  }
}

function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*on\w+\s*=[^>]*>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .substring(0, 500);
}

// ── MESSAGES ─────────────────────────────────────────────────
router.get('/messages', requireAuth, async (req, res) => {
  const db    = await dbPromise;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const userARow = db.prepare('SELECT MIN(id) as min_id FROM users').get();
  const isUserA  = req.user.id === userARow?.min_id;
  const delCol   = isUserA ? 'deleted_by_a' : 'deleted_by_b';

  const around = parseInt(req.query.around) || null;
  const before = parseInt(req.query.before) || null;

  let rows = [];
  if (around) {
    const half = Math.floor(limit / 2);
    // Fetch older
    const older = db.prepare(`SELECT id, sender_id, content, media_id, created_at, read_at, reply_to_id FROM messages WHERE ${delCol} = 0 AND id < ? ORDER BY id DESC LIMIT ?`).all(around, half);
    // Fetch target + newer
    const newer = db.prepare(`SELECT id, sender_id, content, media_id, created_at, read_at, reply_to_id FROM messages WHERE ${delCol} = 0 AND id >= ? ORDER BY id ASC LIMIT ?`).all(around, half + 1);
    rows = [...older, ...newer].sort((a, b) => b.id - a.id); // Sorted DESC for the map below
  } else if (before) {
    rows = db.prepare(`SELECT id, sender_id, content, media_id, created_at, read_at, reply_to_id FROM messages WHERE ${delCol} = 0 AND id < ? ORDER BY id DESC LIMIT ?`).all(before, limit);
  } else {
    rows = db.prepare(`SELECT id, sender_id, content, media_id, created_at, read_at, reply_to_id FROM messages WHERE ${delCol} = 0 ORDER BY id DESC LIMIT ?`).all(limit);
  }
  const withReactions = rows.map(row => ({ ...row, reactions: db.prepare('SELECT emoji, user_id FROM reactions WHERE message_id = ?').all(row.id) }));
  const unreadIds = db.prepare(`SELECT id FROM messages WHERE ${delCol} = 0 AND sender_id != ? AND read_at IS NULL`).all(req.user.id).map(r => r.id);
  if (unreadIds.length) {
    db.prepare(`UPDATE messages SET read_at = ? WHERE ${delCol} = 0 AND sender_id != ? AND read_at IS NULL`).run(Math.floor(Date.now() / 1000), req.user.id);
    const senderWs = presence.getOtherWs(req.user.id);
    if (senderWs && senderWs.readyState === 1) unreadIds.forEach(id => senderWs.send(JSON.stringify({ type: 'message_status', id, status: 'read' })));
  }
  res.json(withReactions.reverse());
});

router.post('/messages/migrate', requireAuth, async (req, res) => {
  const { id, content } = req.body || {};
  if (!id || content === undefined) return res.status(400).json({ error: 'Missing id or content' });
  const db = await dbPromise;
  db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id);
  res.json({ ok: true });
});

// ── CLEAR / RESTORE ──────────────────────────────────────────
router.post('/chat/clear', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const userARow = db.prepare('SELECT MIN(id) as min_id FROM users').get();
  const col = (req.user.id === userARow?.min_id) ? 'deleted_by_a' : 'deleted_by_b';
  const result = db.prepare(`UPDATE messages SET ${col} = 1 WHERE ${col} = 0`).run();
  res.json({ ok: true, cleared: result.changes });
});

router.post('/chat/restore', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const userARow = db.prepare('SELECT MIN(id) as min_id FROM users').get();
  const col = (req.user.id === userARow?.min_id) ? 'deleted_by_a' : 'deleted_by_b';
  const result = db.prepare(`UPDATE messages SET ${col} = 0 WHERE ${col} = 1`).run();
  res.json({ ok: true, restored: result.changes });
});

// ── STICKY NOTES ─────────────────────────────────────────────
router.get('/notes', requireAuth, async (req, res) => {
  const db    = await dbPromise;
  res.json(db.prepare('SELECT n.*, u.username AS author_name FROM notes n JOIN users u ON u.id = n.author_id ORDER BY n.created_at ASC').all());
});

router.post('/notes', requireAuth, async (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'No content' });
  const safeContent = sanitizeText(content);
  if (!safeContent) return res.status(400).json({ error: 'Invalid content' });
  const db = await dbPromise;
  const result = db.prepare('INSERT INTO notes (author_id, content) VALUES (?, ?)').run(req.user.id, safeContent);
  const note = db.prepare('SELECT n.*, u.username AS author_name FROM notes n JOIN users u ON u.id = n.author_id WHERE n.id = ?').get(result.lastInsertRowid);
  if (note) broadcast('note_add', { note });
  res.json(note);
});

router.delete('/notes/:id', requireAuth, async (req, res) => {
  const db = await dbPromise;
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  broadcast('note_delete', { id: parseInt(req.params.id) });
  res.json({ ok: true });
});

module.exports = router;
