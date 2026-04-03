/**
 * Spotify OAuth + now-playing routes
 */
require('dotenv').config();
const router          = require('express').Router();
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');
const presence        = require('../ws/presence');

const CLIENT_ID     = () => process.env.SPOTIFY_CLIENT_ID     || '';
const CLIENT_SECRET = () => process.env.SPOTIFY_CLIENT_SECRET || '';
const REDIRECT_URI  = () => process.env.SPOTIFY_REDIRECT_URI  || '';

const SCOPES = 'user-read-currently-playing user-read-playback-state';

// ── OAuth flow ────────────────────────────────────────────────

// GET /spotify/connect  — start OAuth, accept token in query param
router.get('/connect', (req, res, next) => {
  if (req.query.token && !req.headers.authorization)
    req.headers.authorization = `Bearer ${req.query.token}`;
  next();
}, requireAuth, (req, res) => {
  const state  = Buffer.from(JSON.stringify({ userId: req.user.id })).toString('base64');
  const url    = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('client_id',     CLIENT_ID());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri',  REDIRECT_URI());
  url.searchParams.set('scope',         SCOPES);
  url.searchParams.set('state',         state);
  res.redirect(url.toString());
});

// GET /spotify/callback  — Spotify redirects here with ?code=...&state=...
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) return res.send('<script>window.close()</script>');

  let userId;
  try { userId = JSON.parse(Buffer.from(state, 'base64').toString()).userId; }
  catch { return res.status(400).send('Invalid state'); }

  // Exchange code for tokens
  const body = new URLSearchParams({
    grant_type:   'authorization_code',
    code,
    redirect_uri: REDIRECT_URI(),
  });
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID()}:${CLIENT_SECRET()}`).toString('base64'),
    },
    body,
  });

  if (!resp.ok) return res.status(502).send('Spotify token exchange failed');

  const data       = await resp.json();
  const expiresAt  = Math.floor(Date.now() / 1000) + data.expires_in;

  const db = await dbPromise;
  db.prepare(`INSERT INTO spotify_tokens (user_id, access_token, refresh_token, expires_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                access_token  = excluded.access_token,
                refresh_token = excluded.refresh_token,
                expires_at    = excluded.expires_at`)
    .run(userId, data.access_token, data.refresh_token, expiresAt);

  console.log(`[spotify] user ${userId} connected`);

  // Close the popup and reload the parent
  res.send(`<html><body><script>
    if (window.opener) { window.opener.location.reload(); window.close(); }
    else { window.location = '/'; }
  </script></body></html>`);
});

// GET /spotify/disconnect  — remove tokens
router.post('/disconnect', requireAuth, async (req, res) => {
  const db = await dbPromise;
  db.prepare('DELETE FROM spotify_tokens WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// GET /spotify/status  — returns both users' now-playing (cached)
router.get('/status', requireAuth, async (req, res) => {
  res.json(getNowPlayingCache());
});

// ── Token refresh ─────────────────────────────────────────────
async function refreshToken(db, userId, refreshToken) {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  });
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID()}:${CLIENT_SECRET()}`).toString('base64'),
    },
    body,
  });
  if (!resp.ok) return null;
  const data      = await resp.json();
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  db.prepare('UPDATE spotify_tokens SET access_token = ?, expires_at = ? WHERE user_id = ?')
    .run(data.access_token, expiresAt, userId);
  return data.access_token;
}

// ── Now-playing fetcher ───────────────────────────────────────
let _nowPlayingCache = {};

function getNowPlayingCache() { return _nowPlayingCache; }

async function fetchNowPlaying(db, userId, accessToken) {
  const resp = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 204 || resp.status === 404) return null; // nothing playing
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data || !data.item) return null;
  return {
    userId,
    playing:    data.is_playing,
    song:       data.item.name,
    artist:     data.item.artists.map(a => a.name).join(', '),
    album:      data.item.album.name,
    albumArt:   data.item.album.images[1]?.url || data.item.album.images[0]?.url || null,
    progress:   data.progress_ms,
    duration:   data.item.duration_ms,
  };
}

// ── Background poller ─────────────────────────────────────────
async function pollSpotify() {
  let db;
  try { db = await dbPromise; } catch { return; }

  const tokens = db.prepare('SELECT * FROM spotify_tokens').all();
  const updated = {};

  for (const row of tokens) {
    let token = row.access_token;

    // Refresh if expiring within 60s
    if (row.expires_at - Math.floor(Date.now() / 1000) < 60) {
      token = await refreshToken(db, row.user_id, row.refresh_token);
      if (!token) continue;
    }

    try {
      const np = await fetchNowPlaying(db, row.user_id, token);
      updated[row.user_id] = np;
    } catch {}
  }

  // Only broadcast if something changed
  const changed = JSON.stringify(updated) !== JSON.stringify(_nowPlayingCache);
  _nowPlayingCache = updated;

  if (changed) {
    // Broadcast to all connected users
    for (const [, s] of presence.sessions) {
      if (s.ws && s.ws.readyState === 1) {
        s.ws.send(JSON.stringify({ type: 'spotify_update', data: updated }));
      }
    }
  }
}

// Start polling every 10s
setInterval(pollSpotify, 10_000);
// Also poll immediately on startup
setTimeout(pollSpotify, 2000);

module.exports = router;
