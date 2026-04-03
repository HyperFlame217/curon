const router          = require('express').Router();
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');
const presence        = require('../ws/presence');

router.get('/', requireAuth, async (req, res) => {
  const db    = await dbPromise;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const before = parseInt(req.query.before) || null;

  const userARow = db.prepare('SELECT MIN(id) as min_id FROM users').get();
  const isUserA  = req.user.id === userARow?.min_id;
  const delCol   = isUserA ? 'deleted_by_a' : 'deleted_by_b';
  const encContent = isUserA ? 'encrypted_content_a' : 'encrypted_content_b';
  const encKey     = isUserA ? 'encrypted_key_a'     : 'encrypted_key_b';

  const rows = before
    ? db.prepare(`SELECT id, sender_id, ${encContent} AS encrypted_content,
                  ${encKey} AS encrypted_key, iv, media_id, created_at, read_at, reply_to_id
                  FROM messages WHERE ${delCol} = 0 AND id < ?
                  ORDER BY id DESC LIMIT ?`).all(before, limit)
    : db.prepare(`SELECT id, sender_id, ${encContent} AS encrypted_content,
                  ${encKey} AS encrypted_key, iv, media_id, created_at, read_at, reply_to_id
                  FROM messages WHERE ${delCol} = 0
                  ORDER BY id DESC LIMIT ?`).all(limit);

  const withReactions = rows.map(row => ({
    ...row,
    reactions: db.prepare('SELECT emoji, user_id FROM reactions WHERE message_id = ?').all(row.id),
  }));

  // Mark all unread messages (sent by the OTHER user) as read now
  const now         = Math.floor(Date.now() / 1000);
  const unreadIds   = db.prepare(`SELECT id FROM messages WHERE ${delCol} = 0 AND sender_id != ? AND read_at IS NULL`).all(req.user.id).map(r => r.id);
  if (unreadIds.length) {
    db.prepare(`UPDATE messages SET read_at = ? WHERE ${delCol} = 0 AND sender_id != ? AND read_at IS NULL`).run(now, req.user.id);
    // Notify the sender via WS that their messages have been read
    const senderWs = presence.getOtherWs(req.user.id);
    if (senderWs && senderWs.readyState === 1) {
      unreadIds.forEach(id => {
        senderWs.send(JSON.stringify({ type: 'message_status', id, status: 'read' }));
      });
    }
  }

  res.json(withReactions.reverse());
});

module.exports = router;
