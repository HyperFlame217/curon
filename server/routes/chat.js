const router          = require('express').Router();
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');
const presence        = require('../ws/presence');

function broadcast(type, payload) {
  for (const [, s] of presence.sessions) {
    if (s.ws && s.ws.readyState === 1) s.ws.send(JSON.stringify({ type, ...payload }));
  }
}

// ── MESSAGES ─────────────────────────────────────────────────
router.get('/messages', requireAuth, async (req, res) => {
  const db    = await dbPromise;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const before = parseInt(req.query.before) || null;
  const userARow = db.prepare('SELECT MIN(id) as min_id FROM users').get();
  const isUserA  = req.user.id === userARow?.min_id;
  const delCol   = isUserA ? 'deleted_by_a' : 'deleted_by_b';
  const encContent = isUserA ? 'encrypted_content_a' : 'encrypted_content_b';
  const encKey     = isUserA ? 'encrypted_key_a'     : 'encrypted_key_b';
  const rows = before
    ? db.prepare(`SELECT id, sender_id, ${encContent} AS encrypted_content, ${encKey} AS encrypted_key, iv, media_id, created_at, read_at, reply_to_id FROM messages WHERE ${delCol} = 0 AND id < ? ORDER BY id DESC LIMIT ?`).all(before, limit)
    : db.prepare(`SELECT id, sender_id, ${encContent} AS encrypted_content, ${encKey} AS encrypted_key, iv, media_id, created_at, read_at, reply_to_id FROM messages WHERE ${delCol} = 0 ORDER BY id DESC LIMIT ?`).all(limit);
  const withReactions = rows.map(row => ({ ...row, reactions: db.prepare('SELECT emoji, user_id FROM reactions WHERE message_id = ?').all(row.id) }));
  const unreadIds = db.prepare(`SELECT id FROM messages WHERE ${delCol} = 0 AND sender_id != ? AND read_at IS NULL`).all(req.user.id).map(r => r.id);
  if (unreadIds.length) {
    db.prepare(`UPDATE messages SET read_at = ? WHERE ${delCol} = 0 AND sender_id != ? AND read_at IS NULL`).run(Math.floor(Date.now() / 1000), req.user.id);
    const senderWs = presence.getOtherWs(req.user.id);
    if (senderWs && senderWs.readyState === 1) unreadIds.forEach(id => senderWs.send(JSON.stringify({ type: 'message_status', id, status: 'read' })));
  }
  res.json(withReactions.reverse());
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
  const db = await dbPromise;
  const result = db.prepare('INSERT INTO notes (author_id, content) VALUES (?, ?)').run(req.user.id, content.trim().slice(0, 500));
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
