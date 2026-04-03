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

// ── EVENTS ────────────────────────────────────────────────────

// GET /calendar/events?from=&to=  (unix timestamps)
router.get('/events', requireAuth, async (req, res) => {
  const db   = await dbPromise;
  const from = parseInt(req.query.from) || 0;
  const to   = parseInt(req.query.to)   || 9999999999;

  // Fetch non-recurring events in range
  const events   = db.prepare(`SELECT * FROM events WHERE recurrence = 'none' AND start_time >= ? AND start_time <= ? ORDER BY start_time ASC`).all(from, to);
  const recurring = db.prepare(`SELECT * FROM events WHERE recurrence != 'none'`).all();

  const expanded = [];
  for (const ev of recurring) {
    let cur = ev.start_time;
    const duration = ev.end_time - ev.start_time;
    const endLimit = ev.recurrence_end || to;

    while (cur <= Math.min(to, endLimit)) {
      if (cur >= from) {
        expanded.push({ ...ev, start_time: cur, end_time: cur + duration, is_occurrence: true });
      }
      if (ev.recurrence === 'daily')   cur += 86400;
      else if (ev.recurrence === 'weekly')  cur += 604800;
      else if (ev.recurrence === 'monthly') {
        const d = new Date(cur * 1000);
        d.setMonth(d.getMonth() + 1);
        cur = Math.floor(d.getTime() / 1000);
      } else break;
    }
  }

  res.json([...events, ...expanded].sort((a, b) => a.start_time - b.start_time));
});

// POST /calendar/events
router.post('/events', requireAuth, async (req, res) => {
  const { title, notes, color, start_time, end_time, recurrence, recurrence_end } = req.body || {};
  if (!title || !start_time || !end_time) return res.status(400).json({ error: 'Missing fields' });

  const db     = await dbPromise;
  const result = db.prepare(`
    INSERT INTO events (title, notes, color, start_time, end_time, created_by, recurrence, recurrence_end)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, notes || null, color || '#80b9b1', start_time, end_time, req.user.id,
         recurrence || 'none', recurrence_end || null);

  const event = db.prepare(`SELECT events.id, events.title, events.notes, events.color, events.start_time, events.end_time, events.created_by, events.recurrence, events.recurrence_end, users.username as creator_name FROM events JOIN users ON users.id = events.created_by WHERE events.id = ?`).get(result.lastInsertRowid);

  broadcast('calendar_event_add', { event });
  res.json(event);
});

// PATCH /calendar/events/:id
router.patch('/events/:id', requireAuth, async (req, res) => {
  const db  = await dbPromise;
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const { title, notes, color, start_time, end_time, recurrence, recurrence_end } = req.body || {};
  db.prepare(`
    UPDATE events SET
      title = ?, notes = ?, color = ?, start_time = ?, end_time = ?,
      recurrence = ?, recurrence_end = ?
    WHERE id = ?
  `).run(
    title ?? row.title, notes ?? row.notes, color ?? row.color,
    start_time ?? row.start_time, end_time ?? row.end_time,
    recurrence ?? row.recurrence, recurrence_end ?? row.recurrence_end,
    req.params.id
  );

  const event = db.prepare(`SELECT events.id, events.title, events.notes, events.color, events.start_time, events.end_time, events.created_by, events.recurrence, events.recurrence_end, users.username as creator_name FROM events JOIN users ON users.id = events.created_by WHERE events.id = ?`).get(req.params.id);

  broadcast('calendar_event_update', { event });
  res.json(event);
});

// DELETE /calendar/events/:id
router.delete('/events/:id', requireAuth, async (req, res) => {
  const db = await dbPromise;
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  broadcast('calendar_event_delete', { id: parseInt(req.params.id) });
  res.json({ ok: true });
});

// ── SCHEDULE BLOCKS ───────────────────────────────────────────

// GET /calendar/schedule
router.get('/schedule', requireAuth, async (req, res) => {
  const db     = await dbPromise;
  const blocks = db.prepare(`
    SELECT schedule_blocks.*, users.username
    FROM schedule_blocks JOIN users ON users.id = schedule_blocks.user_id
    ORDER BY schedule_blocks.day_type, schedule_blocks.start_minute ASC
  `).all();
  res.json(blocks);
});

// POST /calendar/schedule
router.post('/schedule', requireAuth, async (req, res) => {
  const { label, color, start_minute, end_minute, day_type } = req.body || {};
  if (!label || start_minute === undefined || end_minute === undefined)
    return res.status(400).json({ error: 'Missing fields' });

  const db     = await dbPromise;
  const result = db.prepare(`
    INSERT INTO schedule_blocks (user_id, label, color, start_minute, end_minute, day_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, label, color || '#94c784', start_minute, end_minute, day_type || 'weekday');

  const block = db.prepare('SELECT schedule_blocks.*, users.username FROM schedule_blocks JOIN users ON users.id = schedule_blocks.user_id WHERE schedule_blocks.id = ?').get(result.lastInsertRowid);

  broadcast('schedule_block_add', { block });
  res.json(block);
});

// PATCH /calendar/schedule/:id
router.patch('/schedule/:id', requireAuth, async (req, res) => {
  const db  = await dbPromise;
  const row = db.prepare('SELECT * FROM schedule_blocks WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Not your block' });

  const { label, color, start_minute, end_minute, day_type } = req.body || {};
  db.prepare(`
    UPDATE schedule_blocks SET label=?, color=?, start_minute=?, end_minute=?, day_type=? WHERE id=?
  `).run(label ?? row.label, color ?? row.color,
         start_minute ?? row.start_minute, end_minute ?? row.end_minute,
         day_type ?? row.day_type, req.params.id);

  const block = db.prepare('SELECT schedule_blocks.*, users.username FROM schedule_blocks JOIN users ON users.id = schedule_blocks.user_id WHERE schedule_blocks.id = ?').get(req.params.id);

  broadcast('schedule_block_update', { block });
  res.json(block);
});

// DELETE /calendar/schedule/:id
router.delete('/schedule/:id', requireAuth, async (req, res) => {
  const db  = await dbPromise;
  const row = db.prepare('SELECT * FROM schedule_blocks WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Not your block' });

  db.prepare('DELETE FROM schedule_blocks WHERE id = ?').run(req.params.id);
  broadcast('schedule_block_delete', { id: parseInt(req.params.id) });
  res.json({ ok: true });
});

module.exports = router;
