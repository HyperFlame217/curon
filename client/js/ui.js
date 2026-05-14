    // ════════════════════════════════════════════════════════════
    //  UI HELPERS
    // ════════════════════════════════════════════════════════════
    function openDrawer() { document.getElementById('sidebar')?.classList.add('open'); document.getElementById('drawerOverlay')?.classList.add('show'); }
    function closeDrawer() { document.getElementById('sidebar')?.classList.remove('open'); document.getElementById('drawerOverlay')?.classList.remove('show'); }
    async function clearChat() {
      const res = await fetch('/chat/clear', {
        method: 'POST',
        headers: { Authorization: `Bearer ${STATE.token}` },
      });
      if (!res.ok) { showToast('CLEAR FAILED'); return; }
      // Clear the message container immediately
      document.getElementById('msgs').innerHTML = '';
      _oldestMsgId = null;
      _allLoaded = false;
      showToast('CHAT CLEARED');
    }

    function initDrawer() {
      document.getElementById('drawerOverlay')?.addEventListener('click', closeDrawer);
      document.querySelector('.mh-menu')?.addEventListener('click', openDrawer);
      document.querySelectorAll('button.ni').forEach(el => el.addEventListener('click', () => {
        closeDrawer();
        document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
        el.classList.add('on');
        const btnText = el.textContent.trim();
        if (btnText.includes('HOUSE')) {
          openHouse();
        } else if (btnText.includes('GALLERY')) {
          openGallery();
        } else if (btnText.includes('NOTES')) {
          openNotes();
        } else if (btnText.includes('DATES')) {
          openDates();
        } else {
          _closeAllViews();
          _showChat();
        }
      }));

      // Clear chat buttons
      document.getElementById('btn-clear-chat')?.addEventListener('click', clearChat);
      document.getElementById('btn-clear-chat-mobile')?.addEventListener('click', clearChat);

      // Mobile menu button
      document.getElementById('mh-menu')?.addEventListener('click', openDrawer);

      // Drawer overlay click to close
      document.getElementById('drawerOverlay')?.addEventListener('click', closeDrawer);

      // Settings close button
      document.getElementById('settings-close')?.addEventListener('click', closeSettings);

      // Escape key closes drawer or settings
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const sidebar = document.getElementById('sidebar');
        if (sidebar?.classList.contains('open')) {
          closeDrawer();
        } else if (document.getElementById('settings-panel')?.classList.contains('show')) {
          closeSettings();
        }
      });

      // Settings action buttons
      document.getElementById('btn-clear-chat-settings')?.addEventListener('click', async () => { await clearChat(); closeSettings(); });
      document.getElementById('btn-restore-chat')?.addEventListener('click', restoreChat);

      document.getElementById('btn-logout')?.addEventListener('click', logout);
      document.getElementById('btn-export-data')?.addEventListener('click', exportData);

      // Call mini bar
      document.getElementById('call-mini')?.addEventListener('click', maximizeCall);
    }

    let _toastTimeout = null;
    function showToast(msg, ms = 2500) {
      let el = document.getElementById('curon-toast');
      if (el) {
        clearTimeout(_toastTimeout);
      } else {
        el = document.createElement('div');
        el.id = 'curon-toast';
        el.setAttribute('role', 'alert');
        el.setAttribute('aria-live', 'assertive');
        el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--color-dark);color:var(--color-accent);border:2px solid var(--color-accent);font-family:var(--font-header);font-size:var(--font-size-sidebar-label);padding:8px 14px;z-index:9999;box-shadow:3px 3px 0 var(--color-accent);pointer-events:none;transition:opacity 0.2s;';
        document.body.appendChild(el);
      }
      
      el.textContent = msg;
      el.style.opacity = '1';
      
      _toastTimeout = setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 200);
      }, ms);
    }

    // Sunday backup reminder (admin only)
    function checkBackupReminder() {
      const d = new Date();
      if (d.getDay() !== 0) return; // 0 = Sunday
      if (STATE.user?.username !== 'iron') return;

      fetch('/media/backup/check', { headers: { Authorization: `Bearer ${STATE.token}` } })
        .then(r => r.json())
        .then(data => {
          if (data.count > 0) {
            const existing = document.getElementById('backup-banner');
            if (existing) return;

            const banner = document.createElement('div');
            banner.id = 'backup-banner';
            banner.style.cssText = 'background:var(--color-dark);color:var(--color-accent);border-bottom:2px solid var(--color-accent);padding:10px 16px;font-family:var(--font-header);font-size:var(--font-size-sidebar-label);display:flex;align-items:center;justify-content:space-between;gap:12px;z-index:1000;';
            banner.innerHTML = `
              <span>📦 BACKUP: ${data.count} local media files need backup — <a href="#" onclick="downloadBackup(event)" style="color:var(--color-accent);text-decoration:underline;">DOWNLOAD</a></span>
              <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--color-accent);cursor:pointer;font-size:16px;line-height:1;padding:0 4px;">✕</button>
            `;
            const chat = document.querySelector('.chat');
            const chatWin = document.querySelector('.chat-win');
            if (chat && chatWin) chat.insertBefore(banner, chatWin);
          }
        })
        .catch(() => {});
    }

    window.checkBackupReminder = checkBackupReminder;

    window.downloadBackup = async function(e) {
      e.preventDefault();
      try {
        const res = await fetch('/media/backup', {
          headers: { Authorization: `Bearer ${STATE.token}` }
        });
        if (!res.ok) throw new Error('Backup failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `curon-media-backup-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        showToast('BACKUP DOWNLOAD FAILED');
      }
    };


    // ════════════════════════════════════════════════════════════
    //  SETTINGS PANEL
    // ════════════════════════════════════════════════════════════

    function openSettings() {
      document.getElementById('settings-panel').classList.add('show');
      document.getElementById('settings-overlay').classList.add('show');
      closeDrawer();
    }

    function closeSettings() {
      document.getElementById('settings-panel').classList.remove('show');
      document.getElementById('settings-overlay').classList.remove('show');
    }

    async function restoreChat() {
      const res = await fetch('/chat/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${STATE.token}` },
      });
      if (!res.ok) { showToast('RESTORE FAILED'); return; }
      const data = await res.json();
      if (data.restored === 0) { showToast('NOTHING TO RESTORE'); return; }
      // Reload history to show restored messages
      _oldestMsgId = null;
      _allLoaded = false;
      await loadHistory();
      showToast(`${data.restored} MESSAGES RESTORED`);
      closeSettings();
    }

    function logout() {
      if (CALL.pc) endCall(true);
      localStorage.removeItem('curon_token');
      localStorage.removeItem('curon_user');
      location.reload();
    }

    async function exportData() {
      showToast('EXPORTING...');
      try {
        const res = await fetch('/auth/export', {
          headers: { Authorization: `Bearer ${STATE.token}` }
        });
        if (!res.ok) throw new Error('Export failed');
        const data = await res.json();

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `curon-export-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast(`EXPORTED: ${data.messages_count} msgs, ${data.media_count} files`);
        closeSettings();
      } catch (e) {
        showToast('EXPORT FAILED');
      }
    }

    let _settingsInitialized = false;
function initSettings() {
  if (_settingsInitialized) return;
  _settingsInitialized = true;

      document.getElementById('btn-settings')?.addEventListener('click', openSettings);
      document.getElementById('settings-overlay')?.addEventListener('click', closeSettings);
      document.querySelector('.settings-close')?.addEventListener('click', closeSettings);

      // Show admin section for user 'iron'
      if (STATE.user?.username === 'iron') {
        document.getElementById('settings-admin-section').style.display = 'block';
      }

      // Load saved notification preferences
      loadNotificationPrefs();
    }

    window.saveNotificationPrefs = function() {
      if (!STATE.notificationPrefs) STATE.notificationPrefs = {};
      STATE.notificationPrefs.soundAlerts = !!document.getElementById('setting-sound-alerts')?.checked;
      STATE.notificationPrefs.unreadBadges = !!document.getElementById('setting-unread-badges')?.checked;
      localStorage.setItem('curon_notification_prefs', JSON.stringify(STATE.notificationPrefs));
    }

    function loadNotificationPrefs() {
      const saved = localStorage.getItem('curon_notification_prefs');
      if (saved) {
        try {
          STATE.notificationPrefs = JSON.parse(saved);
        } catch (e) {}
      }
      // Update UI checkboxes
      if (document.getElementById('setting-sound-alerts')) {
        document.getElementById('setting-sound-alerts').checked = STATE.notificationPrefs?.soundAlerts !== false;
      }
      if (document.getElementById('setting-unread-badges')) {
        document.getElementById('setting-unread-badges').checked = STATE.notificationPrefs?.unreadBadges !== false;
      }
    }

    // Expose for global access
    window.loadNotificationPrefs = loadNotificationPrefs;


    // ════════════════════════════════════════════════════════════
    //  STATS & MILESTONES
    // ════════════════════════════════════════════════════════════

    async function openStatsModal() {
      closeDrawer();
      MODAL.open('stats-modal', {
        onOpen: async () => {
          await loadStats();
        }
      });
    }

    function closeStatsModal() {
      MODAL.close('stats-modal');
    }

    async function loadStats() {
      try {
        const res = await fetch('/stats', { headers: { Authorization: `Bearer ${STATE.token}` } });
        if (!res.ok) return;
        const data = await res.json();
        // Days together from anniversary: 14 May 2025
        const anniversary = new Date('2025-05-14T00:00:00');
        const days = Math.floor((Date.now() - anniversary.getTime()) / 86400000);
        document.getElementById('stat-days').textContent = days > 0 ? days : 0;
        document.getElementById('stat-msgs').textContent = data.msgCount ?? 0;
        document.getElementById('stat-media').textContent = data.mediaCount ?? 0;
        document.getElementById('stat-notes').textContent = data.noteCount ?? 0;
        renderMilestones(data.milestones || []);
      } catch { }
    }

    function renderMilestones(list) {
      const el = document.getElementById('milestone-list');
      if (!list.length) {
        el.innerHTML = `<div style="font-family:var(--font-header);font-size:var(--font-size-tiny);color:var(--color-tertiary);padding:8px 0;text-align:center;">NO MILESTONES YET</div>`;
        return;
      }
      el.innerHTML = '';
      const now = Date.now();
      list.forEach(m => {
        const row = document.createElement('div');
        row.className = 'milestone-row';
        const ts = new Date(m.date * 1000);
        const dStr = ts.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const diff = Math.ceil((ts - now) / 86400000);
        const countdown = diff > 0 ? `in ${diff}d` : diff === 0 ? 'TODAY!' : `${Math.abs(diff)}d ago`;
        row.innerHTML = `
      <span class="milestone-name">${escHtml(m.name)}</span>
      <span class="milestone-date">${dStr}<br>${countdown}</span>
      <button class="milestone-del" data-id="${m.id}" title="Delete">✕</button>`;
        row.querySelector('.milestone-del').addEventListener('click', () => deleteMilestone(m.id));
        el.appendChild(row);
      });
    }

    async function addMilestone() {
      const nameEl = document.getElementById('milestone-input-name');
      const dateEl = document.getElementById('milestone-input-date');
      const name = nameEl.value.trim();
      const dateStr = dateEl.value.trim();
      if (!name || !dateStr) return;
      // Parse DD/MM/YYYY
      const parts = dateStr.split('/');
      if (parts.length !== 3) { showToast('DATE FORMAT: DD/MM/YYYY'); return; }
      const [dd, mm, yyyy] = parts.map(Number);
      const ts = Math.floor(new Date(yyyy, mm - 1, dd).getTime() / 1000);
      if (isNaN(ts)) { showToast('INVALID DATE'); return; }
      try {
        const res = await fetch('/stats/milestones', {
          method: 'POST',
          headers: { Authorization: `Bearer ${STATE.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, date: ts }),
        });
        if (!res.ok) { showToast('ERROR SAVING'); return; }
        nameEl.value = ''; dateEl.value = '';
        await loadStats();
      } catch { showToast('ERROR SAVING'); }
    }

    async function deleteMilestone(id) {
      try {
        await fetch(`/stats/milestones/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${STATE.token}` },
        });
        await loadStats();
      } catch { }
    }

    // WS handlers for milestone sync
    function onMilestoneAdd() { if (document.getElementById('stats-modal').classList.contains('show')) loadStats(); }
    function onMilestoneDelete() { if (document.getElementById('stats-modal').classList.contains('show')) loadStats(); }

    function initStats() {
      const pairWin = document.querySelector('.pair-win');
      if (pairWin) {
        pairWin.style.cursor = 'pointer';
        pairWin.addEventListener('click', openStatsModal);
      }
      document.getElementById('stats-modal-close')?.addEventListener('click', closeStatsModal);
      document.getElementById('stats-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('stats-modal')) closeStatsModal();
      });
      document.getElementById('milestone-add-btn')?.addEventListener('click', addMilestone);
      const msDateInput = document.getElementById('milestone-input-date');
      const msFormatFn = (el) => {
        let v = el.value.replace(/\D/g, '').slice(0, 8);
        if (v.length >= 5) v = v.slice(0, 2) + ' / ' + v.slice(2, 4) + ' / ' + v.slice(4);
        else if (v.length >= 3) v = v.slice(0, 2) + ' / ' + v.slice(2);
        el.value = v;
      };

      msDateInput?.addEventListener('input', (e) => msFormatFn(e.target));
      msDateInput?.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        e.target.value = text.replace(/\D/g, '').slice(0, 8);
        msFormatFn(e.target);
      });
    }


    // ════════════════════════════════════════════════════════════
    //  TIMEZONE
    // ════════════════════════════════════════════════════════════
    let _myTz = localStorage.getItem('curon_my_tz') || Intl.DateTimeFormat().resolvedOptions().timeZone;
    let _otherTz = localStorage.getItem('curon_other_tz') || Intl.DateTimeFormat().resolvedOptions().timeZone;

    function saveMyTz(tz) { _myTz = tz; localStorage.setItem('curon_my_tz', tz); }
    function setOtherTz(tz) { _otherTz = tz; localStorage.setItem('curon_other_tz', tz); }
    function getMyTz() { return _myTz; }
    function getOtherTz() { return _otherTz; }

    let _tzViewMode = 'my'; // 'my' | 'their'

    function isValidTz(tz) {
      // Robust validation that works cross-browser
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch { return false; }
    }

    function updateTzCurrentLabel() {
      const el = document.getElementById('settings-tz-current');
      if (el) el.textContent = _myTz ? `CURRENT: ${_myTz}` : '';
    }

    function initTzSettings() {
      const myInput = document.getElementById('settings-tz-input');
      if (myInput) myInput.value = _myTz;
      updateTzCurrentLabel();

      document.getElementById('settings-tz-save')?.addEventListener('click', () => {
        const val = myInput?.value.trim();
        if (!val) return;
        if (!isValidTz(val)) {
          showToast('INVALID TIMEZONE — TRY e.g. Asia/Kolkata');
          return;
        }
        saveMyTz(val);
        updateTzCurrentLabel();
        showToast('TIMEZONE SAVED');
        // Broadcast to other user so their timeline shows correct "their TZ"
        wsSend(WS_EV.C_TZ_UPDATE, { tz: val });
        if (document.getElementById('dates-view').classList.contains('show')) renderTimeline();
      });

      document.getElementById('btn-tz-toggle')?.addEventListener('click', () => {
        _tzViewMode = _tzViewMode === 'my' ? 'their' : 'my';
        const btn = document.getElementById('btn-tz-toggle');
        if (btn) {
          btn.textContent = _tzViewMode === 'my' ? '🌐 MY TZ' : '🌐 THEIR TZ';
          btn.classList.toggle('their-tz', _tzViewMode === 'their');
        }
        if (document.getElementById('dates-view').classList.contains('show')) renderTimeline();
      });

      // Mobile timezone toggle
      document.getElementById('btn-tz-toggle-mobile')?.addEventListener('click', () => {
        _tzViewMode = _tzViewMode === 'my' ? 'their' : 'my';
        const btn = document.getElementById('btn-tz-toggle');
        if (btn) {
          btn.textContent = _tzViewMode === 'my' ? '🌐 MY TZ' : '🌐 THEIR TZ';
          btn.classList.toggle('their-tz', _tzViewMode === 'their');
        }
        // Also sync mobile button state
        const mobileBtn = document.getElementById('btn-tz-toggle-mobile');
        if (mobileBtn) mobileBtn.classList.toggle('their-tz', _tzViewMode === 'their');
        if (document.getElementById('dates-view').classList.contains('show')) renderTimeline();
      });

      // Free time toggle button
      window._showFreeTime = false;
      document.getElementById('btn-free-time')?.addEventListener('click', () => {
        window._showFreeTime = !window._showFreeTime;
        const btn = document.getElementById('btn-free-time');
        if (btn) {
          btn.classList.toggle('active', window._showFreeTime);
          btn.textContent = window._showFreeTime ? 'CLOSE FREE TIME' : 'FIND FREE TIME';
        }
        if (document.getElementById('dates-view').classList.contains('show')) renderTimeline();
      });

      // Mobile free time toggle
      document.getElementById('btn-free-time-mobile')?.addEventListener('click', () => {
        window._showFreeTime = !window._showFreeTime;
        // Sync desktop button state
        const desktopBtn = document.getElementById('btn-free-time');
        if (desktopBtn) {
          desktopBtn.classList.toggle('active', window._showFreeTime);
          desktopBtn.textContent = window._showFreeTime ? 'CLOSE FREE TIME' : 'FIND FREE TIME';
        }
        // Also sync mobile button state
        const mobileBtn = document.getElementById('btn-free-time-mobile');
        if (mobileBtn) mobileBtn.classList.toggle('active', window._showFreeTime);
        if (document.getElementById('dates-view').classList.contains('show')) renderTimeline();
      });
    }

