const router          = require('express').Router();
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');
const presence        = require('../ws/presence');

function broadcast(type, payload) { for (const [, s] of presence.sessions) { if (s.ws && s.ws.readyState === 1) s.ws.send(JSON.stringify({ type, ...payload })); } }

// ── SPOTIFY ──────────────────────────────────────────────────
router.get('/spotify/connect', (q,r,n) => { if(q.query.token && !q.headers.authorization) q.headers.authorization=`Bearer ${q.query.token}`; n(); }, requireAuth, (req, res) => {
  const state = Buffer.from(JSON.stringify({ userId: req.user.id })).toString('base64');
  const url = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('client_id', process.env.SPOTIFY_CLIENT_ID||'');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', process.env.SPOTIFY_REDIRECT_URI||'');
  url.searchParams.set('scope', 'user-read-currently-playing user-read-playback-state');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

router.get('/spotify/callback', async (req, res) => {
  const { code, state, error } = req.query; if (error || !code) return res.send('<script>window.close()</script>');
  let userId; try { userId = JSON.parse(Buffer.from(state, 'base64').toString()).userId; } catch { return res.status(400).send('Bad state'); }
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64') }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: process.env.SPOTIFY_REDIRECT_URI }) });
  if (!r.ok) return res.status(502).send('Failed');
  const d = await r.json(); const db = await dbPromise;
  db.prepare('INSERT INTO spotify_tokens (user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET access_token=excluded.access_token, refresh_token=excluded.refresh_token, expires_at=excluded.expires_at').run(userId, d.access_token, d.refresh_token, Math.floor(Date.now()/1000)+d.expires_in);
  res.send('<html><body><script>if(window.opener){window.opener.location.reload();window.close();}else{window.location="/";}</script></body></html>');
});

router.post('/spotify/disconnect', requireAuth, async (req, res) => { const db = await dbPromise; db.prepare('DELETE FROM spotify_tokens WHERE user_id = ?').run(req.user.id); res.json({ ok:true }); });
let _np = {}; router.get('/spotify/status', requireAuth, (q,r)=>r.json(_np));

async function pSpot() {
  const db = await dbPromise; const rows = db.prepare('SELECT * FROM spotify_tokens').all(); const up = {};
  for(const row of rows) {
    let t = row.access_token;
    if(row.expires_at - Math.floor(Date.now()/1000) < 60) {
      const r = await fetch('https://accounts.spotify.com/api/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','Authorization':'Basic '+Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}, body: new URLSearchParams({ grant_type:'refresh_token', refresh_token:row.refresh_token }) });
      if(r.ok) { const d=await r.json(); t=d.access_token; db.prepare('UPDATE spotify_tokens SET access_token=?, expires_at=? WHERE user_id=?').run(t, Math.floor(Date.now()/1000)+d.expires_in, row.user_id); } else continue;
    }
    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing',{headers:{Authorization:`Bearer ${t}`}});
    if(r.ok && r.status===200) { const d=await r.json(); if(d && d.item) up[row.user_id]={ userId:row.user_id, playing:d.is_playing, song:d.item.name, artist:d.item.artists.map(a=>a.name).join(', '), albumArt:d.item.album.images[1]?.url||null, progress:d.progress_ms, duration:d.item.duration_ms }; }
  }
  if(JSON.stringify(up)!==JSON.stringify(_np)) { _np=up; broadcast('spotify_update', { data:up }); }
}
setInterval(pSpot, 10_000);

// ── CALENDAR ─────────────────────────────────────────────────
router.get('/calendar/events', requireAuth, async (req, res) => {
  const db = await dbPromise; const from = parseInt(req.query.from)||0; const to = parseInt(req.query.to)||9999999999;
  const evs = db.prepare("SELECT * FROM events WHERE recurrence='none' AND start_time>=? AND start_time<=?").all(from, to);
  const rec = db.prepare("SELECT * FROM events WHERE recurrence!='none'").all();
  const exp = [];
  for(const e of rec) {
    let c = e.start_time; const d=e.end_time-e.start_time; const l=e.recurrence_end||to;
    while(c <= Math.min(to, l)) {
      if(c >= from) exp.push({...e, start_time:c, end_time:c+d, is_occurrence:true});
      if(e.recurrence==='daily') c+=86400; else if(e.recurrence==='weekly') c+=604800;
      else if(e.recurrence==='monthly') { const dt=new Date(c*1000); dt.setMonth(dt.getMonth()+1); c=Math.floor(dt.getTime()/1000); } else break;
    }
  }
  res.json([...evs, ...exp].sort((a,b)=>a.start_time-b.start_time));
});

router.post('/calendar/events', requireAuth, async (req, res) => {
  const { title, start_time, end_time } = req.body || {}; if(!title||!start_time||!end_time) return res.status(400).json({error:'Missing'});
  const db = await dbPromise; const r = db.prepare('INSERT INTO events (title, notes, color, start_time, end_time, created_by, recurrence, recurrence_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(title, req.body.notes||null, req.body.color||'#80b9b1', start_time, end_time, req.user.id, req.body.recurrence||'none', req.body.recurrence_end||null);
  const ev = db.prepare('SELECT e.*, u.username as creator_name FROM events e JOIN users u ON u.id=e.created_by WHERE e.id=?').get(r.lastInsertRowid);
  broadcast('calendar_event_add', { event:ev }); res.json(ev);
});

router.delete('/calendar/events/:id', requireAuth, async (req, res) => { const db=await dbPromise; db.prepare('DELETE FROM events WHERE id=?').run(req.params.id); broadcast('calendar_event_delete', { id:parseInt(req.params.id) }); res.json({ok:true}); });
router.get('/calendar/schedule', requireAuth, async (q,r) => { const db=await dbPromise; r.json(db.prepare('SELECT s.*, u.username FROM schedule_blocks s JOIN users u ON u.id=s.user_id ORDER BY s.day_type, s.start_minute ASC').all()); });

module.exports = router;
