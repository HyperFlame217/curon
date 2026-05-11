/**
 * @fileoverview PresenceSync - Server-side presence synchronization
 * Maintains a global registry of presence states and broadcasts to partners
 */

const EV = require('../ws/events');

/**
 * Global presence registry: userId -> { state, timestamp }
 * @type {Map<number, { state: string, timestamp: number }>}
 */
const PRESENCE_REGISTRY = new Map();

/**
 * Broadcasts presence sync to the other user
 * @param {number} userId - The user whose presence changed
 * @param {string} state - The new presence state
 * @param {object} wss - WebSocket server instance for sending
 * @returns {void}
 */
function broadcastPresenceSync(userId, state, wss) {
  const payload = {
    type: EV.S_PRESENCE_SYNC || 'presence_sync',
    userId,
    state,
    timestamp: Date.now()
  };

  // Get all connected clients
  wss.clients.forEach(ws => {
    if (ws.userId && ws.userId !== userId && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  });
}

/**
 * Updates the presence registry for a user
 * @param {number} userId - User ID
 * @param {string} state - New presence state
 * @returns {void}
 */
function updatePresence(userId, state) {
  PRESENCE_REGISTRY.set(userId, {
    state,
    timestamp: Date.now()
  });
}

/**
 * Gets the last known state for a user
 * @param {number} userId - User ID
 * @returns {string|null} The last known state or null
 */
function getPresence(userId) {
  const record = PRESENCE_REGISTRY.get(userId);
  return record ? record.state : null;
}

/**
 * Removes a user from the registry (cleanup)
 * @param {number} userId - User ID to remove
 * @returns {void}
 */
function removePresence(userId) {
  PRESENCE_REGISTRY.delete(userId);
}

/**
 * Gets all presence records
 * @returns {Map<number, { state: string, timestamp: number }>} The full registry
 */
function getRegistry() {
  return PRESENCE_REGISTRY;
}

/**
 * Broadcasts offline state for a disconnected user
 * @param {number} userId - The disconnected user ID
 * @param {object} wss - WebSocket server instance
 * @returns {void}
 */
function broadcastOffline(userId, wss) {
  PRESENCE_REGISTRY.delete(userId);
  
  const payload = {
    type: EV.S_PRESENCE_SYNC || 'presence_sync',
    userId,
    state: 'offline',
    timestamp: Date.now()
  };

  wss.clients.forEach(ws => {
    if (ws.userId && ws.userId !== userId && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  });
}

module.exports = {
  PRESENCE_REGISTRY,
  updatePresence,
  getPresence,
  removePresence,
  getRegistry,
  broadcastPresenceSync,
  broadcastOffline
};