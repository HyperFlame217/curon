const router      = require('express').Router();
const bcrypt      = require('bcryptjs');
const dbPromise   = require('../db');
const { sign, requireAuth } = require('../auth');

// ── SESSION ──────────────────────────────────────────────────
router.post('/auth/login', async (req, res) => {
  const db = await dbPromise;
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = sign({ id: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username } });
});

router.post('/auth/logout', (_req, res) => res.json({ ok: true }));

// ── KEYS & ASSETS ─────────────────────────────────────────────
router.get('/auth/keys', requireAuth, async (req, res) => {
  const db    = await dbPromise;
  const users = db.prepare('SELECT id, username, public_key, encrypted_private_key, avatar_img, house_x, house_y FROM users').all();
  if (users.length < 2) return res.status(503).json({ error: 'Both users must be seeded first' });
  const me      = users.find(u => u.id === req.user.id);
  const other   = users.find(u => u.id !== req.user.id);
  const userAId = Math.min(...users.map(u => u.id));
  res.json({
    my_encrypted_private_key: me?.encrypted_private_key || null,
    my_public_key: me?.public_key || null,
    other_public_key: other?.public_key || null,
    other_id: other?.id || null,
    other_username: other?.username || null,
    my_avatar_img: me?.avatar_img || null,
    other_avatar_img: other?.avatar_img || null,
    my_house_x: me?.house_x || 0,
    my_house_y: me?.house_y || 0,
    other_house_x: other?.house_x || 0,
    other_house_y: other?.house_y || 0,
    user_a_id: userAId,
  });
});

router.post('/auth/keys', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const { public_key, encrypted_private_key } = req.body || {};
  if (!public_key || !encrypted_private_key) return res.status(400).json({ error: 'Missing keys' });
  db.prepare('UPDATE users SET public_key = ?, encrypted_private_key = ? WHERE id = ?').run(public_key, encrypted_private_key, req.user.id);
  res.json({ ok: true });
});

router.post('/auth/avatar', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const { img } = req.body || {};
  if (!img) return res.status(400).json({ error: 'Missing image data' });
  db.prepare('UPDATE users SET avatar_img = ? WHERE id = ?').run(img, req.user.id);
  res.json({ ok: true });
});

router.post('/auth/char-pos', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const { x, y } = req.body || {};
  if (x === undefined || y === undefined) return res.status(400).json({ error: 'Missing coordinates' });
  db.prepare('UPDATE users SET house_x = ?, house_y = ? WHERE id = ?').run(Math.floor(x), Math.floor(y), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
