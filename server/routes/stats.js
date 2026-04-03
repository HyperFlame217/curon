const router          = require('express').Router();
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');
const presence        = require('../ws/presence');

function broadcast(type, payload) {
  for (const [, s] of presence.sessions) {
    if (s.ws && s.ws.readyState === 1)
      s.ws.send(JSON.stringify({ type, ...payload }));
  }
}

// Ensure milestones table exists
async function ensureTable() {
  const db = await dbPromise;
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS milestones (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      date       INTEGER NOT NULL,
      created_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`).run();
  } catch {}
}
ensureTable();

// GET /stats
router.get('/', requireAuth, async (req, res) => {
  const db = await dbPromise;
  try {
    const msgCount  = db.prepare("SELECT COUNT(*) as c FROM messages WHERE deleted_by_a = 0 AND deleted_by_b = 0").get()?.c || 0;
    const mediaCount= db.prepare("SELECT COUNT(*) as c FROM media").get()?.c || 0;
    const noteCount = db.prepare("SELECT COUNT(*) as c FROM notes").get()?.c || 0;
    const firstMsg  = db.prepare("SELECT MIN(created_at) as t FROM messages").get()?.t || null;
    const milestones= db.prepare("SELECT * FROM milestones ORDER BY date ASC").all();
    res.json({ msgCount, mediaCount, noteCount, firstMsg, milestones });
  } catch (e) {
    res.json({ msgCount: 0, mediaCount: 0, noteCount: 0, firstMsg: null, milestones: [] });
  }
});

// POST /stats/milestones
router.post('/milestones', requireAuth, async (req, res) => {
  const { name, date } = req.body || {};
  if (!name || !date) return res.status(400).json({ error: 'Missing fields' });
  const db = await dbPromise;
  const result = db.prepare('INSERT INTO milestones (name, date, created_by) VALUES (?, ?, ?)')
    .run(name, date, req.user.id);
  const milestone = db.prepare('SELECT * FROM milestones WHERE id = ?').get(result.lastInsertRowid);
  broadcast('milestone_add', { milestone });
  res.json(milestone);
});

// DELETE /stats/milestones/:id
router.delete('/milestones/:id', requireAuth, async (req, res) => {
  const db = await dbPromise;
  db.prepare('DELETE FROM milestones WHERE id = ?').run(req.params.id);
  broadcast('milestone_delete', { id: parseInt(req.params.id) });
  res.json({ ok: true });
});

module.exports = router;
