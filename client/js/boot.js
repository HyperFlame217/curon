/**
 * CURON.EXE — App Boot Controller
 * Coordinates the startup sequence, configuration loading, and gesture unlocking.
 */

window.loadConfig = async function() {
  try {
    const [themes] = await Promise.all([
      fetch('/config/themes.json').then(r => r.json())
      // fetch('/config/furniture.json').then(r => r.json()),
      // fetch('/config/rooms.json').then(r => r.json()),
      // fetch('/config/cats.json').then(r => r.json())
    ]);

    CONFIG.THEMES = themes;
    // CONFIG.FURNITURE = furniture;
    // CONFIG.ROOMS = rooms;
    // CONFIG.CATS = cats;
    CONFIG.isLoaded = true;
    console.log('[CONFIG] All data registries loaded successfully.');
  } catch (err) {
    console.error('[CONFIG] Failed to load data registries:', err);
  }
};

window.unlockAudio = function() {
  if (window._audioCtx && window._audioCtx.state === 'suspended') {
    window._audioCtx.resume();
  }
  document.querySelectorAll('audio, video').forEach(el => {
    if (el.paused && el.srcObject) el.play().catch(() => { });
  });
};

window.onTzUpdate = function(msg) {
  if (window.setOtherTz) setOtherTz(msg.tz);
  if (window.showToast) showToast(`${(STATE.otherName || 'THEM').toUpperCase()} SET TIMEZONE: ${msg.tz}`);
  if (document.getElementById('dates-view').classList.contains('show') && window.renderTimeline) {
    renderTimeline();
  }
};

let _bootInProgress = false;
window.bootApp = async function(password) {
  if (_bootInProgress) return;
  _bootInProgress = true;
  STATE.password = password;


  // 0. Load Data Configs
  await loadConfig();

  // Theme system disabled for now - uncomment after themes are updated with all CSS variables
  // if (window.applySavedTheme) applySavedTheme();

  // 1. Fetch metadata & key bundle from server
  const res = await fetch('/auth/keys', {
    headers: { Authorization: `Bearer ${STATE.token}` },
  });
  if (res.status === 401) {
    localStorage.removeItem('curon_token');
    localStorage.removeItem('curon_user');
    location.reload();
    return;
  }
  if (!res.ok) throw new Error('Failed to fetch keys');
  const keys = await res.json();

  STATE.otherId = keys.other_id;
  STATE.otherName = keys.other_username;
  STATE.userAId = keys.userAId;

  // Sync Avatars from DB
  if (keys.my_avatar_img) localStorage.setItem('curon_my_avatar_img', keys.my_avatar_img);
  if (keys.other_avatar_img) localStorage.setItem('curon_other_avatar_img', keys.other_avatar_img);

  setTimeout(() => window.applyAvatars && applyAvatars(), 100);

  setTimeout(() => window.applyAvatars && applyAvatars(), 100);

  STATE.password = null;

  // Display UI
  const lockScreen = document.getElementById('unlock-screen') || document.getElementById('login-screen');
  if (lockScreen) lockScreen.remove();
  document.querySelector('.shell').style.display = '';

  if (window.updateNameUI) updateNameUI();

  // Boot All Subsystems
  if (window.connectWS) connectWS();
  if (window.initInput) initInput();
  if (window.initMediaButtons) initMediaButtons();
  if (window.initGifPicker) initGifPicker();
  if (window.initCalls) initCalls();
  if (window.initEmojis) await initEmojis();
  if (window.initDrawer) initDrawer();

  if (window.initSettings) initSettings();
  if (window.initSearch) initSearch();
  if (window.initReplies) initReplies();
  if (window.initGallery) initGallery();
  if (window.initNotes) initNotes();
  if (window.initCalendar) initCalendar();
  if (window.initSchedulePanel) initSchedulePanel();
  if (window.initTzSettings) initTzSettings();
  if (window.initAvatars) initAvatars();
  if (window.initStats) initStats();
  if (window.BadgeManager) BadgeManager.init(); // Unread badges
  // if (window.initHouseSystem) await initHouseSystem(); // Disabled for MVP
  // if (window.WalletManager) window.WalletManager.load(); // Economy (P2-A) DISABLED P22-A

  if (window._showChat) _showChat();
  if (window.initScrollPagination) initScrollPagination();

  if (window.loadHistory) await loadHistory();

  // Sunday backup reminder check
  if (window.checkBackupReminder) checkBackupReminder();
};

// Global Boot Trigger
document.addEventListener('DOMContentLoaded', () => {
  ['click', 'touchstart', 'keydown'].forEach(evt => {
    document.addEventListener(evt, unlockAudio, { once: true, passive: true });
  });

  if (!STATE.token || !STATE.user) {
    showLogin();
  } else {
    showPasswordPrompt();
  }
});
