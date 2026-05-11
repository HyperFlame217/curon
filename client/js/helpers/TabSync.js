/**
 * TabSync.js — BroadcastChannel API for cross-tab state synchronization
 */

const TabSync = {
  channel: null,
  _isSelf: false,

  init() {
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('[TabSync] BroadcastChannel not supported');
      return;
    }

    this.channel = new BroadcastChannel('curon_sync');
    this.channel.onmessage = (event) => this._handleMessage(event.data);
    console.log('[TabSync] Initialized');
  },

  _handleMessage(msg) {
    if (msg.type !== 'STATE_SYNC') return;
    if (msg.sourceTab === this._getTabId()) return; // Loopback guard - ignore own messages

    console.log('[TabSync] Received:', msg.key, msg.value);

    // Dispatch event for other code to handle
    window.dispatchEvent(new CustomEvent('tabSync', { detail: msg }));
  },

  _getTabId() {
    if (!this._tabId) {
      this._tabId = Math.random().toString(36).slice(2, 10);
    }
    return this._tabId;
  },

  broadcast(key, value) {
    if (!this.channel) return;

    this.channel.postMessage({
      type: 'STATE_SYNC',
      key: key,
      value: value,
      sourceTab: this._getTabId(),
      timestamp: Date.now()
    });
  },

  // Convenience methods for specific state changes
  syncTheme(themeId) {
    this.broadcast('theme', themeId);
  },

  syncBoard(boardId) {
    this.broadcast('board', boardId);
  },

  syncReadReceipt(messageId) {
    this.broadcast('readReceipt', messageId);
  }
};

// Expose globally first, then init
window.TabSync = TabSync;

// Auto-init
if (typeof BroadcastChannel !== 'undefined') {
  TabSync.init();
}