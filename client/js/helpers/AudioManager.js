/**
 * @fileoverview AudioManager - Retro notification sound management
 * Generates and plays 8-bit style notification chimes
 */

const AudioManager = {
  _ctx: null,
  _initialized: false,
  
  /**
   * Initializes the audio context (must be called after user interaction)
   */
  init() {
    if (this._initialized) return;
    
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._initialized = true;
    } catch (e) {
      console.warn('[AudioManager] AudioContext not supported:', e);
    }
  },
  
  /**
   * Plays the notification chime
   * @param {boolean} force - If true, plays regardless of window focus
   */
  async playChime(force = false) {
    // Check user preferences
    if (!STATE.notificationPrefs?.soundAlerts) return;
    
    // Get current active tab
    const activeTab = typeof BadgeManager !== 'undefined' 
      ? BadgeManager.getActiveTab?.() 
      : 'chat';
    
    // Skip if we're on the chat tab (user is actively viewing)
    if (activeTab === 'chat') return;
    
    // Initialize audio on first play
    this.init();
    
    if (!this._ctx) {
      console.warn('[AudioManager] Audio not available');
      return;
    }
    
    // Resume context if suspended
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
    
    this._playRetroPing();
  },
  
  /**
   * Generates and plays an 8-bit retro ping sound
   */
  _playRetroPing() {
    if (!this._ctx) return;
    
    const now = this._ctx.currentTime;
    
    // Create oscillator for the "ping" tone
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    
    // Square wave for 8-bit sound
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now); // A5 note
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.05); // Quick slide up
    
    // Envelope for short ping
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.15);
  },
  
  /**
   * Plays a different chime for new notes
   */
  async playNoteChime() {
    if (!STATE.notificationPrefs?.soundAlerts) return;
    
    this.init();
    if (!this._ctx) return;
    
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
    
    const now = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(523, now); // C5 note
    osc.frequency.setValueAtTime(659, now + 0.1); // E5
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.2);
  },
  
  /**
   * Plays a different chime for calendar events
   */
  async playCalendarChime() {
    if (!STATE.notificationPrefs?.soundAlerts) return;
    
    this.init();
    if (!this._ctx) return;
    
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
    
    const now = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(392, now); // G4
    osc.frequency.setValueAtTime(523, now + 0.1); // C5
    osc.frequency.setValueAtTime(659, now + 0.2); // E5
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.3);
  }
};

// Auto-init on first user interaction
const _unlockAudio = () => {
  AudioManager.init();
  document.removeEventListener('click', _unlockAudio);
  document.removeEventListener('keydown', _unlockAudio);
};
document.addEventListener('click', _unlockAudio, { once: true });
document.addEventListener('keydown', _unlockAudio, { once: true });

window.AudioManager = AudioManager;