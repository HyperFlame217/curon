const router          = require('express').Router();
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');
const presence        = require('../ws/presence');

function broadcast(type, payload) { for (const [, s] of presence.sessions) { if (s.ws && s.ws.readyState === 1) s.ws.send(JSON.stringify({ type, ...payload })); } }

function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*on\w+\s*=[^>]*>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .substring(0, 500);
}

// ── CALENDAR ─────────────────────────────────────────────────
router.get('/calendar/events', requireAuth, async (req, res) => {
  const db = await dbPromise; 
  const from = parseInt(req.query.from) || 0; 
  const to = parseInt(req.query.to) || 9999999999;

  // 1. Get all non-recurring events that OVERLAP the range
  // Overlap: EventStart <= RangeEnd AND EventEnd >= RangeStart
  const evs = db.prepare("SELECT * FROM events WHERE recurrence='none' AND start_time <= ? AND end_time >= ?").all(to, from);

  // 2. Get all recurring events
  const rec = db.prepare("SELECT * FROM events WHERE recurrence != 'none'").all();
  const exp = [];

  for (const e of rec) {
    let currentStart = e.start_time;
    const duration = e.end_time - e.start_time;
    const limit = e.recurrence_end || to;

    // Safety: prevent infinite loops
    let iterations = 0;
    while (currentStart <= Math.min(to, limit) && iterations < 1000) {
      iterations++;
      const currentEnd = currentStart + duration;

      // Does this occurrence overlap with our window?
      if (currentStart <= to && currentEnd >= from) {
        exp.push({ ...e, start_time: currentStart, end_time: currentEnd, is_occurrence: true });
      }

      // Advance to next occurrence
      if (e.recurrence === 'daily') {
        currentStart += 86400;
      } else if (e.recurrence === 'weekly') {
        currentStart += 604800;
      } else if (e.recurrence === 'monthly') {
        const dt = new Date(currentStart * 1000);
        dt.setMonth(dt.getMonth() + 1);
        currentStart = Math.floor(dt.getTime() / 1000);
      } else if (e.recurrence === 'yearly') {
        const dt = new Date(currentStart * 1000);
        dt.setFullYear(dt.getFullYear() + 1);
        currentStart = Math.floor(dt.getTime() / 1000);
      } else {
        break;
      }
    }
  }
  res.json([...evs, ...exp].sort((a, b) => a.start_time - b.start_time));
});

router.post('/calendar/events', requireAuth, async (req, res) => {
  const { title, start_time, end_time } = req.body || {}; if(!title||!start_time||!end_time) return res.status(400).json({error:'Missing'});
  const safeTitle = sanitizeText(title);
  const safeNotes = req.body.notes ? sanitizeText(req.body.notes) : null;
  if (!safeTitle) return res.status(400).json({ error: 'Invalid title' });
  const db = await dbPromise; const r = db.prepare('INSERT INTO events (title, notes, color, start_time, end_time, created_by, recurrence, recurrence_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(safeTitle, safeNotes, req.body.color||'#80b9b1', start_time, end_time, req.user.id, req.body.recurrence||'none', req.body.recurrence_end||null);
  const ev = db.prepare('SELECT e.*, u.username as creator_name FROM events e JOIN users u ON u.id=e.created_by WHERE e.id=?').get(r.lastInsertRowid);
  broadcast('calendar_event_add', { event:ev }); res.json(ev);
});

router.patch('/calendar/events/:id', requireAuth, async (req, res) => {
  const { title, start_time, end_time, notes, color, recurrence, recurrence_end } = req.body || {};
  const db = await dbPromise;
  const existing = db.prepare('SELECT * FROM events WHERE id=? AND created_by=?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const safeTitle = title !== undefined ? sanitizeText(title) : existing.title;
  const safeNotes = notes !== undefined ? sanitizeText(notes) : existing.notes;
  if (!safeTitle) return res.status(400).json({ error: 'Invalid title' });
  db.prepare('UPDATE events SET title=?, notes=?, color=?, start_time=?, end_time=?, recurrence=?, recurrence_end=? WHERE id=?').run(
    safeTitle,
    safeNotes,
    color || existing.color,
    start_time || existing.start_time,
    end_time || existing.end_time,
    recurrence || 'none',
    recurrence_end !== undefined ? recurrence_end : existing.recurrence_end,
    req.params.id
  );
  const ev = db.prepare('SELECT e.*, u.username as creator_name FROM events e JOIN users u ON u.id=e.created_by WHERE e.id=?').get(req.params.id);
  broadcast('calendar_event_update', { event: ev });
  res.json(ev);
});

router.delete('/calendar/events/:id', requireAuth, async (req, res) => { const db=await dbPromise; db.prepare('DELETE FROM events WHERE id=? AND created_by=?').run(req.params.id, req.user.id); broadcast('calendar_event_delete', { id:parseInt(req.params.id) }); res.json({ok:true}); });
router.get('/calendar/schedule', requireAuth, async (q, r) => {
  const db = await dbPromise;
  r.json(db.prepare('SELECT s.*, u.username FROM schedule_blocks s JOIN users u ON u.id=s.user_id ORDER BY s.day_type, s.start_minute ASC').all());
});

router.post('/calendar/schedule', requireAuth, async (req, res) => {
  const { label, color, start_minute, end_minute, day_type } = req.body || {};
  if (!label || start_minute === undefined || end_minute === undefined || !day_type) return res.status(400).json({ error: 'Missing' });
  const safeLabel = sanitizeText(label);
  if (!safeLabel) return res.status(400).json({ error: 'Invalid label' });
  const db = await dbPromise;
  const r = db.prepare('INSERT INTO schedule_blocks (user_id, label, color, start_minute, end_minute, day_type) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.id, safeLabel, color || '#94c784', start_minute, end_minute, day_type);
  const block = db.prepare('SELECT s.*, u.username FROM schedule_blocks s JOIN users u ON u.id=s.user_id WHERE s.id=?').get(r.lastInsertRowid);
  broadcast('schedule_block_add', { block });
  res.json(block);
});

router.delete('/calendar/schedule/:id', requireAuth, async (req, res) => {
  const db = await dbPromise;
  // Use user_id to ensure only owners can delete their own blocks
  db.prepare('DELETE FROM schedule_blocks WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  broadcast('schedule_block_delete', { id: parseInt(req.params.id) });
  res.json({ ok: true });
});

module.exports = router;
