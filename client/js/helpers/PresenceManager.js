/**
 * @fileoverview PresenceManager - Client-side activity tracking and heartbeat protocol
 * Handles granular presence states: ACTIVE, IDLE, AWAY, OFFLINE
 */

/**
 * Presence states enum
 * @readonly
 * @enum {string}
 */
const PresenceState = Object.freeze({
  ACTIVE: 'active',
  IDLE: 'idle',
  AWAY: 'away',
  OFFLINE: 'offline'
});

const IDLE_THRESHOLD_MS = 2 * 60 * 1000;   // 2 minutes
const AWAY_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60 seconds

let lastActivityTime = Date.now();
let presenceState = PresenceState.ACTIVE;
let heartbeatTimer = null;
let activityListenersAttached = false;

/**
 * Attaches activity listeners to track user interaction
 * @returns {void}
 */
function attachActivityListeners() {
  if (activityListenersAttached) return;

  const events = ['mousemove', 'keydown', 'touchstart'];
  events.forEach(eventType => {
    document.addEventListener(eventType, handleActivity, { passive: true });
  });

  activityListenersAttached = true;
  console.log('[PresenceManager] Activity listeners attached');
}

/**
 * Handles user activity events
 * @param {Event} event - The DOM event
 * @returns {void}
 */
function handleActivity(event) {
  lastActivityTime = Date.now();

  // If we were IDLE or AWAY, immediately reset to ACTIVE
  if (presenceState !== PresenceState.ACTIVE) {
    const oldState = presenceState;
    presenceState = PresenceState.ACTIVE;
    console.log(`[PresenceManager] State changed: ${oldState} -> ${presenceState}`);
    onPresenceStateChange(presenceState);
  }
}

/**
 * Evaluates presence state based on time since last activity
 * @returns {string} The current presence state
 */
function evaluatePresenceState() {
  const now = Date.now();
  const elapsed = now - lastActivityTime;

  if (elapsed < IDLE_THRESHOLD_MS) {
    return PresenceState.ACTIVE;
  } else if (elapsed < AWAY_THRESHOLD_MS) {
    return PresenceState.IDLE;
  } else {
    return PresenceState.AWAY;
  }
}

/**
 * Called when presence state changes
 * @param {string} newState - The new presence state
 * @returns {void}
 */
function onPresenceStateChange(newState) {
  // Emit presence update to server via WebSocket
  if (STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
    STATE.ws.send(JSON.stringify({
      type: WS_EV.C_PRESENCE_STATE,
      state: newState
    }));
  }

  // Update local state
  STATE.presenceState = newState;

  // Update UI if function exists
  if (typeof window.updatePresenceIndicator === 'function') {
    window.updatePresenceIndicator(newState);
  }
}

/**
 * Starts the presence heartbeat timer
 * @returns {void}
 */
function startHeartbeat() {
  if (heartbeatTimer) return;

  heartbeatTimer = setInterval(() => {
    const oldState = presenceState;
    const newState = evaluatePresenceState();

    if (newState !== oldState) {
      presenceState = newState;
      console.log(`[PresenceManager] Auto state change: ${oldState} -> ${newState}`);
      onPresenceStateChange(newState);
    } else {
      // Send heartbeat even if state hasn't changed (to prove we're alive)
      if (STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
        STATE.ws.send(JSON.stringify({ type: WS_EV.C_PRESENCE_HEARTBEAT }));
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  console.log('[PresenceManager] Heartbeat started');
}

/**
 * Stops the presence heartbeat timer
 * @returns {void}
 */
function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * Gets the current presence state
 * @returns {string} Current presence state
 */
function getPresenceState() {
  return presenceState;
}

/**
 * Initializes the PresenceManager
 * @returns {void}
 */
function initPresenceManager() {
  attachActivityListeners();
  startHeartbeat();
  console.log('[PresenceManager] Initialized');
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPresenceManager);
} else {
  initPresenceManager();
}

// Export for use in other modules
window.PresenceManager = {
  getPresenceState,
  initPresenceManager,
  startHeartbeat,
  stopHeartbeat,
  PresenceState
};