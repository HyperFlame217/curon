/**
 * server/economy.js
 * Core logic for the Curon House Economy.
 * Handles coin issuance, daily caps, and timezone-aware resets.
 */
const dbPromise = require('./db');

const DAILY_MSG_CAP = 100;
const COINS_PER_MSG = 1;

/**
 * Returns a sortable date string (YYYY-MM-DD) for a given timestamp and timezone.
 * Uses Intl.DateTimeFormat for reliable timezone conversion without external deps.
 */
function getDateString(timestampInSeconds, timeZone = 'UTC') {
  try {
    const date = new Date(timestampInSeconds * 1000);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch (e) {
    // Fallback to UTC if timezone is invalid
    return getDateString(timestampInSeconds, 'UTC');
  }
}

/**
 * processes a chat message event for economy rewards.
 * Returns the updated wallet object if coins were earned, otherwise null.
 */
async function processChatMessage(userId) {
  const db = await dbPromise;
  const now = Math.floor(Date.now() / 1000);

  try {
    // 1. Fetch current wallet/coin state
    let wallet = db.prepare(`
      SELECT balance, daily_msg_count, last_msg_reset, user_timezone 
      FROM user_coins 
      WHERE user_id = ?
    `).get(userId);

    if (!wallet) {
      // Row should exist via /wallet route, but safety first
      db.prepare('INSERT INTO user_coins (user_id, balance, daily_msg_count, last_msg_reset) VALUES (?, 0, 0, ?)')
        .run(userId, now);
      wallet = { balance: 0, daily_msg_count: 0, last_msg_reset: now, user_timezone: 'UTC' };
    }

    const tz = wallet.user_timezone || 'UTC';
    const todayStr = getDateString(now, tz);
    const lastResetStr = getDateString(wallet.last_msg_reset, tz);

    let currentCount = wallet.daily_msg_count;
    let currentBalance = wallet.balance;
    let didReset = false;

    // 2. Check for Daily Reset
    if (todayStr !== lastResetStr) {
      console.log(`[Economy] New day detected (${todayStr} != ${lastResetStr}) for User ${userId}. Resetting daily counter.`);
      currentCount = 0;
      didReset = true;
    }

    // 3. Award Logic
    if (currentCount < DAILY_MSG_CAP) {
      currentCount += 1;
      currentBalance += COINS_PER_MSG;

      // Persist changes
      db.prepare(`
        UPDATE user_coins 
        SET balance = ?, daily_msg_count = ?, last_msg_reset = ? 
        WHERE user_id = ?
      `).run(currentBalance, currentCount, didReset ? now : wallet.last_msg_reset, userId);

      return {
        balance: currentBalance,
        daily_msg_count: currentCount,
        user_timezone: tz
      };
    }

    // If reset happened but cap reached (impossible for first msg, but for completeness)
    if (didReset) {
       db.prepare(`UPDATE user_coins SET daily_msg_count = 0, last_msg_reset = ? WHERE user_id = ?`).run(now, userId);
    }

    return null; // Cap reached, no coins earned
  } catch (err) {
    console.error('[Economy] Reward processing error:', err);
    return null;
  }
}

module.exports = {
  processChatMessage,
  getDateString
};
