const router      = require('express').Router();
const dbPromise   = require('../db');
const { requireAuth } = require('../auth');

// ── GET /wallet ─────────────────────────────────────────────
// Returns the current user's coin balance and daily stats.
// Automatically initializes the row if it doesn't exist.
router.get('/wallet', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const userId = req.user.id;

  try {
    let wallet = db.prepare('SELECT balance, daily_msg_count, last_msg_reset, user_timezone FROM user_coins WHERE user_id = ?').get(userId);
    
    if (!wallet) {
      // Initialize wallet for new user
      db.prepare('INSERT INTO user_coins (user_id, balance, daily_msg_count, last_msg_reset, user_timezone) VALUES (?, 0, 0, (strftime(\'%s\',\'now\')), \'UTC\')').run(userId);
      wallet = { balance: 0, daily_msg_count: 0, last_msg_reset: Math.floor(Date.now()/1000), user_timezone: 'UTC' };
    }

    res.json(wallet);
  } catch (err) {
    console.error('[Wallet] Error fetching wallet:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST /wallet/earn ───────────────────────────────────────
// Internal endpoint for awarding coins. 
// Note: In a production app, this would be gated or only callable internally.
// For now, we allow the client to request it for simple feature demonstration.
router.post('/wallet/earn', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const userId = req.user.id;
  const { amount, source } = req.body || {};

  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  try {
    // Ensure wallet exists
    let wallet = db.prepare('SELECT id FROM user_coins WHERE user_id = ?').get(userId);
    if (!wallet) {
      db.prepare('INSERT INTO user_coins (user_id, balance) VALUES (?, 0)').run(userId);
    }

    // Award coins
    db.prepare('UPDATE user_coins SET balance = balance + ? WHERE user_id = ?').run(amount, userId);
    
    const newBalance = db.prepare('SELECT balance FROM user_coins WHERE user_id = ?').get(userId).balance;
    console.log(`[Wallet] User ${userId} earned ${amount} coins from ${source || 'unknown'}. New balance: ${newBalance}`);
    
    res.json({ ok: true, balance: newBalance });
  } catch (err) {
    console.error('[Wallet] Error awarding coins:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST /wallet/timezone ──────────────────────────────────
// Updates the user's timezone for daily reset logic.
router.post('/wallet/timezone', requireAuth, async (req, res) => {
  const db = await dbPromise;
  const userId = req.user.id;
  const { timezone } = req.body || {};

  if (!timezone) return res.status(400).json({ error: 'Missing timezone' });

  try {
    // Validate timezone string basic check
    try { 
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }); 
    } catch (e) { 
      return res.status(400).json({ error: 'Invalid timezone' }); 
    }

    db.prepare('UPDATE user_coins SET user_timezone = ? WHERE user_id = ?').run(timezone, userId);
    res.json({ ok: true, timezone });
  } catch (err) {
    console.error('[Wallet] Error updating timezone:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
