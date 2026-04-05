/**
 * Furniture Interaction Locks (Networked Mutex)
 * Tracks which user is currently manipulating a specific furniture item.
 * 
 * Map structure: lockId (item.id) -> userId
 */

const activeLocks = new Map();

/**
 * Attempts to acquire a lock on a furniture item.
 * @param {string} lockId - The item ID to lock.
 * @param {number} userId - The ID of the user requesting the lock.
 * @returns {boolean} - True if successfully acquired or already holds it, false if held by someone else.
 */
function acquireLock(lockId, userId) {
  if (!lockId) return false;
  
  if (activeLocks.has(lockId)) {
    // If the same user already holds it, that's fine.
    return activeLocks.get(lockId) === userId;
  }
  
  activeLocks.set(lockId, userId);
  return true;
}

/**
 * Releases a lock on a furniture item, if held by the requesting user.
 * @param {string} lockId - The item ID to unlock.
 * @param {number} userId - The ID of the user requesting release.
 * @returns {boolean} - True if successfully released, false if it wasn't locked or was held by someone else.
 */
function releaseLock(lockId, userId) {
  if (!lockId || !activeLocks.has(lockId)) return true;
  
  if (activeLocks.get(lockId) === userId) {
    activeLocks.delete(lockId);
    return true;
  }
  
  return false;
}

/**
 * Sweeps and releases all locks currently held by a specific user.
 * Used during disconnection sequence.
 * @param {number} userId - The ID of the disconnecting user.
 * @returns {Array<string>} - A list of lockIds that were released.
 */
function releaseAllLocksForUser(userId) {
  const released = [];
  for (const [lockId, ownerId] of activeLocks.entries()) {
    if (ownerId === userId) {
      activeLocks.delete(lockId);
      released.push(lockId);
    }
  }
  return released;
}

/**
 * Check who owns a lock.
 * @param {string} lockId - The item ID.
 * @returns {number|null} - The userId holding the lock, or null if free.
 */
function getLockOwner(lockId) {
  return activeLocks.get(lockId) || null;
}

module.exports = {
  acquireLock,
  releaseLock,
  releaseAllLocksForUser,
  getLockOwner
};
