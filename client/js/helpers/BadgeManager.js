/**
 * @fileoverview BadgeManager - Unread notification badge management
 * Tracks unread counts per category: chat, notes, calendar
 */

const BadgeManager = {
  /**
   * Updates the badge count for a category
   * @param {string} category - 'chat', 'notes', or 'calendar'
   * @param {number} count - The new count
   */
  setCount(category, count) {
    STATE.unreadCounts[category] = count;
    this.renderBadge(category, count);
  },
  
  /**
   * Increments the badge count for a category
   * @param {string} category - 'chat', 'notes', or 'calendar'
   */
  increment(category) {
    const current = STATE.unreadCounts[category] || 0;
    this.setCount(category, current + 1);
  },
  
  /**
   * Clears the badge count for a category
   * @param {string} category - 'chat', 'notes', or 'calendar'
   */
  clear(category) {
    this.setCount(category, 0);
  },
  
  /**
   * Gets the current active tab/category
   * @returns {string} The current active category
   */
  getActiveTab() {
    const activeNi = document.querySelector('.ni.on');
    if (!activeNi) return 'chat';
    
    const ico = activeNi.querySelector('.ico')?.textContent?.trim() || '';
    
    if (ico === '📌') return 'notes';
    if (ico === '🗓') return 'calendar';
    if (ico === '🖼') return 'gallery';
    
    return 'chat';
  },
  
  /**
   * Renders a badge for a category
   * @param {string} category - The category name
   * @param {number} count - The count to display
   */
  renderBadge(category, count) {
    if (!STATE.notificationPrefs?.unreadBadges) return;
    
    let badgeEl = document.getElementById(`badge-${category}`);
    
    if (count <= 0) {
      if (badgeEl) badgeEl.remove();
      return;
    }
    
    if (!badgeEl) {
      // Find the nav item for this category
      let targetIco = '💬';
      if (category === 'notes') targetIco = '📌';
      else if (category === 'calendar') targetIco = '🗓';
      
      const navItem = Array.from(document.querySelectorAll('.ni'))
        .find(ni => ni.querySelector('.ico')?.textContent?.trim() === targetIco);
      
      if (!navItem) return;
      
      badgeEl = document.createElement('div');
      badgeEl.id = `badge-${category}`;
      badgeEl.className = 'unread-badge';
      badgeEl.style.cssText = 'position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;background:var(--color-danger);border:2px solid var(--color-base);border-radius:8px;font-family:var(--font-main);font-size:var(--font-size-win-title);color:var(--color-base);display:flex;align-items:center;justify-content:center;padding:0 4px;z-index:10;';
      navItem.style.position = 'relative';
      navItem.appendChild(badgeEl);
    }
    
    badgeEl.textContent = count > 9 ? '9+' : count.toString();
  },
  
  /**
   * Handles incoming message/note/event
   * @param {object} msg - The incoming message
   * @param {string} type - 'chat', 'notes', or 'calendar'
   */
  handleIncoming(type) {
    const activeTab = this.getActiveTab();
    
    // Only increment if not on the same tab
    if (activeTab !== type) {
      this.increment(type);
    } else {
      // Mark as read immediately if on same tab
      if (type === 'chat' && typeof window.wsSend === 'function') {
        window.wsSend(WS_EV.C_MESSAGE_READ);
      }
    }
  },
  
  /**
   * Initializes badge tracking
   */
  init() {
    // Set up listeners for tab changes (works for both click and touch)
    document.querySelectorAll('.ni').forEach(ni => {
      ni.addEventListener('click', () => {
        const ico = ni.querySelector('.ico')?.textContent?.trim() || '';
        
        // Clear badge when clicking on that tab
        if (ico === '💬') this.clear('chat');
        else if (ico === '📌') this.clear('notes');
        else if (ico === '🗓') this.clear('calendar');
      });
    });
    
    // Also check on visibility change (tab switching / coming back to app)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const activeTab = this.getActiveTab();
        if (activeTab === 'chat') this.clear('chat');
        else if (activeTab === 'notes') this.clear('notes');
        else if (activeTab === 'calendar') this.clear('calendar');
      }
    });
    
    // Initialize from storage if available (persist across page loads)
    if (STATE.unreadCounts) {
      Object.keys(STATE.unreadCounts).forEach(cat => {
        if (STATE.unreadCounts[cat] > 0) {
          this.renderBadge(cat, STATE.unreadCounts[cat]);
        }
      });
    }
  }
};

window.BadgeManager = BadgeManager;