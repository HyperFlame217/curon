/**
 * Presence module
 *
 * Tracks online/idle/offline state for both users.
 *
 * States:
 *   online  — connected + active within last 3 min
 *   idle    — connected but no activity for 3+ min (never auto-offlines)
 *   offline — WebSocket disconnected
 *   typing  — actively typing (transient, overlaid on online/idle)
 *   in_call — in an active call
 *
 * sessions map: userId → { ws, status, lastActivity, idleTimer }
 */

const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

/** userId → { ws, status, lastActivity, idleTimer } */
const sessions = new Map();

function getStatus(userId) {
  const s = sessions.get(userId);
  if (!s) return 'offline';
  return s.status;
}

function setStatus(userId, status, broadcast) {
  const s = sessions.get(userId);
  if (!s) return;
  if (s.status === status) return; // no change
  s.status = status;
  broadcast(userId, status);
}

function recordActivity(userId, broadcast) {
  const s = sessions.get(userId);
  if (!s) return;
  s.lastActivity = Date.now();

  // Clear any existing idle timer
  if (s.idleTimer) clearTimeout(s.idleTimer);

  // Only transition to online if currently idle
  if (s.status === 'idle') {
    setStatus(userId, 'online', broadcast);
  }

  // Set new idle timer
  s.idleTimer = setTimeout(() => {
    setStatus(userId, 'idle', broadcast);
  }, IDLE_TIMEOUT_MS);
}

function connect(userId, ws, broadcast) {
  // Clear any previous session for this user
  disconnect(userId, broadcast);

  const idleTimer = setTimeout(() => {
    setStatus(userId, 'idle', broadcast);
  }, IDLE_TIMEOUT_MS);

  sessions.set(userId, {
    ws,
    status:       'online',
    lastActivity: Date.now(),
    idleTimer,
  });

  broadcast(userId, 'online');
}

function disconnect(userId, broadcast) {
  const s = sessions.get(userId);
  if (!s) return;
  if (s.idleTimer) clearTimeout(s.idleTimer);
  sessions.delete(userId);
  broadcast(userId, 'offline');
}

/** Returns the ws for the *other* user (there are only two) */
function getOtherWs(userId) {
  for (const [id, s] of sessions) {
    if (id !== userId) return s.ws;
  }
  return null;
}

module.exports = {
  sessions,
  connect,
  disconnect,
  recordActivity,
  setStatus,
  getStatus,
  getOtherWs,
  IDLE_TIMEOUT_MS,
};
