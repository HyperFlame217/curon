/**
 * wallet.js — Phase 2: Economy & Engine APIs (P2-A)
 * Manages the current user's personal coin balance and UI synchronization.
 */

const WalletManager = {
  /**
   * Fetches the current user's wallet state from the server.
   */
  async load() {
    try {
      const resp = await fetch('/wallet', {
        headers: { 'Authorization': `Bearer ${STATE.token}` }
      });
      if (!resp.ok) throw new Error('Failed to fetch wallet');
      
      const data = await resp.json();
      
      // Update global state
      STATE.wallet.balance = data.balance;
      STATE.wallet.daily_msg_count = data.daily_msg_count;
      STATE.wallet.user_timezone = data.user_timezone;
      STATE.wallet.isLoaded = true;
      
      this.updateUI();
      console.log(`[Wallet] Loaded: ${data.balance} coins`);
    } catch (err) {
      console.error('[Wallet] Load failed:', err);
    }
  },

  /**
   * Refreshes the DOM elements displaying the coin balance.
   */
  updateUI() {
    const el = document.getElementById('coin-balance');
    if (el) {
      // Simple update (can add animation here later)
      el.textContent = STATE.wallet.balance;
    }
  },

  /**
   * Utility to request a coin award (e.g., from minigames).
   * Note: Chat awards (P2-B) will be handled server-side.
   */
  async earn(amount, source = 'unknown') {
    try {
      const resp = await fetch('/wallet/earn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${STATE.token}`
        },
        body: JSON.stringify({ amount, source })
      });
      
      if (resp.ok) {
        const data = await resp.json();
        STATE.wallet.balance = data.balance;
        this.updateUI();
        
        // Visual feedback
        if (typeof showToast === 'function') {
          showToast(`+${amount} coins! (${source})`);
        }
      }
    } catch (err) {
      console.error('[Wallet] Earn failed:', err);
    }
  }
};

// No auto-load here — instead, bootApp() in boot.js calls WalletManager.load()
// when the session is fully unlocked.

// Export to window for global access
window.WalletManager = WalletManager;
