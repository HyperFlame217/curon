const router      = require('express').Router();
const bcrypt      = require('bcryptjs');
const dbPromise   = require('../db');
const { sign }    = require('../auth');

router.post('/login', async (req, res) => {
  const db = await dbPromise;
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Missing username or password' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok)  return res.status(401).json({ error: 'Invalid credentials' });
  const token = sign({ id: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username } });
});

router.post('/logout', (_req, res) => res.json({ ok: true }));

module.exports = router;
