const router          = require('express').Router();
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');

// POST /chat/clear — sets deleted_by_a or deleted_by_b for the requesting user
router.post('/clear', requireAuth, async (req, res) => {
  const db = await dbPromise;

  const userARow = db.prepare('SELECT MIN(id) as min_id FROM users').get();
  const isUserA  = req.user.id === userARow?.min_id;
  const col      = isUserA ? 'deleted_by_a' : 'deleted_by_b';

  const result = db.prepare(`UPDATE messages SET ${col} = 1 WHERE ${col} = 0`).run();
  console.log(`[chat] user ${req.user.id} cleared chat — ${result.changes} messages hidden`);

  res.json({ ok: true, cleared: result.changes });
});

module.exports = router;

// POST /chat/restore — restores cleared messages for the requesting user
router.post('/restore', requireAuth, async (req, res) => {
  const db = await dbPromise;

  const userARow = db.prepare('SELECT MIN(id) as min_id FROM users').get();
  const isUserA  = req.user.id === userARow?.min_id;
  const col      = isUserA ? 'deleted_by_a' : 'deleted_by_b';

  const result = db.prepare(`UPDATE messages SET ${col} = 0 WHERE ${col} = 1`).run();
  console.log(`[chat] user ${req.user.id} restored chat — ${result.changes} messages restored`);

  res.json({ ok: true, restored: result.changes });
});
