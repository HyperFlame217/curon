const router          = require('express').Router();
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');
const presence        = require('../ws/presence');

function broadcast(type, payload) {
  for (const [, s] of presence.sessions) {
    if (s.ws && s.ws.readyState === 1) {
      s.ws.send(JSON.stringify({ type, ...payload }));
    }
  }
}

// GET /notes
router.get('/', requireAuth, async (req, res) => {
  const db    = await dbPromise;
  const notes = db.prepare(`
    SELECT n.id, n.author_id, n.content, n.created_at, u.username AS author_name
    FROM notes n JOIN users u ON u.id = n.author_id
    ORDER BY n.created_at ASC
  `).all();
  res.json(notes);
});

// POST /notes
router.post('/', requireAuth, async (req, res) => {
  const { content } = req.body || {};
  if (!content || typeof content !== 'string') return res.status(400).json({ error: 'Missing content' });
  const text = content.trim().slice(0, 200);
  if (!text) return res.status(400).json({ error: 'Empty note' });

  const db     = await dbPromise;
  const result = db.prepare('INSERT INTO notes (author_id, content) VALUES (?, ?)').run(req.user.id, text);

  const note = db.prepare(`
    SELECT n.id, n.author_id, n.content, n.created_at, u.username AS author_name
    FROM notes n JOIN users u ON u.id = n.author_id WHERE n.id = ?
  `).get(result.lastInsertRowid);

  broadcast('note_add', { note });
  res.json(note);
});

// DELETE /notes/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const db  = await dbPromise;
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  broadcast('note_delete', { id: parseInt(req.params.id) });
  res.json({ ok: true });
});

module.exports = router;
