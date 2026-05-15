/**
 * CURON.EXE — Global Data Registry
 * Central state and configuration for the two-user ecosystem.
 */

window.CONFIG = {
  THEMES: [],
  FURNITURE: [],
  ROOMS: [],
  CATS: [],
  OUTFITS: [],
  isLoaded: false
};

window.STATE = {
  token: localStorage.getItem('curon_token'),
  user: JSON.parse(localStorage.getItem('curon_user') || 'null'),
  ws: null,
  otherId: null,
  otherName: null,
  reconnTimer: null,
  typingTimer: null,
  wasDisconnected: false,
  // Theme
  theme: localStorage.getItem('curon_theme') || 'curon_classic',
  // Presence
  presenceState: 'active',
  partnerPresenceState: 'offline',
  unreadCounts: { chat: 0, notes: 0, calendar: 0 },
  // Notification preferences
  notificationPrefs: {
    soundAlerts: true,
    unreadBadges: true,
    browserAlerts: true
  },
  // Crypto
  privateKey: null,   // RSA-OAEP CryptoKey (in memory only)
  publicKey: null,    // own RSA-OAEP public CryptoKey
  otherPubKey: null,  // other user's RSA-OAEP public CryptoKey
  password: null,     // held briefly during key setup, then cleared
  userAId: null,      // first seeded user — determines slot A vs B
  // Economy (P2-A)
  wallet: {
    balance: 0,
    daily_msg_count: 0,
    user_timezone: 'UTC',
    isLoaded: false
  }
};

// Theme switching with TabSync integration
window.setTheme = function(themeId, skipSync = false) {
  STATE.theme = themeId;
  localStorage.setItem('curon_theme', themeId);

  // Apply theme CSS variables to body
  const theme = CONFIG.THEMES.find(t => t.id === themeId);
  if (theme && theme.palette) {
    const root = document.documentElement;
    Object.entries(theme.palette).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
    document.body.classList.add(`theme-${themeId}`);
  }

  // Sync to other tabs (skip if this is a sync event from another tab)
  if (!skipSync && window.TabSync) {
    TabSync.syncTheme(themeId);
  }
};

// Apply saved theme on load
window.applySavedTheme = function() {
  const savedTheme = localStorage.getItem('curon_theme') || 'curon_classic';
  if (CONFIG.THEMES.length > 0) {
    setTheme(savedTheme, true);
  }
};

// Listen for tab sync events
if (typeof window !== 'undefined') {
  window.addEventListener('tabSync', (e) => {
    const { key, value } = e.detail;
    if (key === 'theme') {
      STATE.theme = value;
      localStorage.setItem('curon_theme', value);
      const theme = CONFIG.THEMES.find(t => t.id === value);
      if (theme && theme.palette) {
        const root = document.documentElement;
        Object.entries(theme.palette).forEach(([paletteKey, paletteVal]) => {
          root.style.setProperty(`--color-${paletteKey}`, paletteVal);
        });
        document.body.classList.add(`theme-${value}`);
      }
    }
  });
}
