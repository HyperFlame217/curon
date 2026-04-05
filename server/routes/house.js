const router          = require('express').Router();
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');
const presence        = require('../ws/presence');

function broadcast(type, payload) {
  for (const [, s] of presence.sessions) {
    if (s.ws && s.ws.readyState === 1) s.ws.send(JSON.stringify({ type, ...payload }));
  }
}

// ── SHARED HOUSE (Furniture & Rooms) ───────────────────────
router.get('/houses/sync', requireAuth, async (req, res) => {
  const db      = await dbPromise;

  const furniture = db.prepare('SELECT * FROM houses').all();
  const rooms     = db.prepare('SELECT * FROM house_rooms').all();
  const cats      = db.prepare('SELECT * FROM cats').all();

  res.json({ furniture, rooms, cats });
});

router.get('/house', requireAuth, async (req, res) => {
  const db    = await dbPromise;
  const items = db.prepare('SELECT * FROM houses').all();
  const rooms = db.prepare('SELECT * FROM house_rooms').all();
  res.json({ placement: items, rooms });
});

router.post('/house/update', requireAuth, async (req, res) => {
  const { action, item } = req.body || {};
  const db = await dbPromise;

  if (action === 'place') {
    const existing = db.prepare('SELECT id FROM houses WHERE id = ?').get(item.id);
    if (existing) {
      db.prepare('UPDATE houses SET x = ?, y = ?, dir = ?, room_id = ?, parent_id = ?, slot_index = ? WHERE id = ?')
        .run(Math.floor(item.x||0), Math.floor(item.y||0), Math.floor(item.dir||0), item.room_id||'default_room', item.parent_id||null, item.slot_index??null, item.id);
    } else {
      db.prepare('INSERT INTO houses (id, room_id, item_id, x, y, dir, parent_id, slot_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(item.id, item.room_id||'default_room', item.item_id, Math.floor(item.x||0), Math.floor(item.y||0), Math.floor(item.dir||0), item.parent_id||null, item.slot_index??null);
    }
  } else if (action === 'remove') {
    db.prepare('DELETE FROM houses WHERE id = ?').run(item.id);
  }
  res.json({ success: true });
});

router.post('/house/room', requireAuth, async (req, res) => {
  const { id, wall_sprite, floor_sprite } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing ID' });
  const db = await dbPromise;

  db.prepare('INSERT INTO house_rooms (id, wall_sprite, floor_sprite) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET wall_sprite=excluded.wall_sprite, floor_sprite=excluded.floor_sprite').run(id, wall_sprite||null, floor_sprite||null);
  res.json({ success: true });
});

// ── MILESTONES & STATS ────────────────────────────────────
router.get('/stats', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const stats = {
    msgCount: db.prepare("SELECT COUNT(*) as c FROM messages WHERE deleted_by_a = 0 AND deleted_by_b = 0").get()?.c || 0,
    mediaCount: db.prepare("SELECT COUNT(*) as c FROM media").get()?.c || 0,
    noteCount: db.prepare("SELECT COUNT(*) as c FROM notes").get()?.c || 0,
    firstMsg: db.prepare("SELECT MIN(created_at) as t FROM messages").get()?.t || null,
    milestones: db.prepare("SELECT * FROM milestones ORDER BY date ASC").all()
  };
  res.json(stats);
});

router.post('/stats/milestones', requireAuth, async (req, res) => {
  const { name, date } = req.body || {};
  if (!name || !date) return res.status(400).json({ error: 'Missing fields' });
  const db = await dbPromise;
  const result = db.prepare('INSERT INTO milestones (name, date, created_by) VALUES (?, ?, ?)')
    .run(name, date, req.user.id);
  const milestone = db.prepare('SELECT * FROM milestones WHERE id = ?').get(result.lastInsertRowid);
  broadcast('milestone_add', { milestone });
  res.json(milestone);
});

router.delete('/stats/milestones/:id', requireAuth, async (req, res) => {
  const db = await dbPromise;
  db.prepare('DELETE FROM milestones WHERE id = ?').run(req.params.id);
  broadcast('milestone_delete', { id: parseInt(req.params.id) });
  res.json({ ok: true });
});

module.exports = router;
