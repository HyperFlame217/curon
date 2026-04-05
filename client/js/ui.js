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
      document.querySelectorAll('.ni').forEach(el => el.addEventListener('click', () => {
        closeDrawer();
        document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
        el.classList.add('on');
        const ico = el.querySelector('.ico')?.textContent?.trim() || '';
        if (ico === '🏠') {
          openHouse();
        } else if (ico === '🖼') {
          openGallery();
        } else if (ico === '📌') {
          openNotes();
        } else if (ico === '🗓') {
          openDates();
        } else {
          _closeAllViews();
          _showChat();
        }
      }));

      // Clear chat buttons
      document.getElementById('btn-clear-chat')?.addEventListener('click', clearChat);
      document.getElementById('btn-clear-chat-mobile')?.addEventListener('click', clearChat);
    }
    function initMobileNav() {
      document.querySelectorAll('.mn-item').forEach(item => {
        item.addEventListener('click', () => {
          document.querySelectorAll('.mn-item').forEach(i => i.classList.remove('on'));
          item.classList.add('on');
          const ico = item.querySelector('.mico')?.textContent?.trim() || '';
          if (ico === '🏠') {
            openHouse();
          } else if (ico === '🖼') {
            openGallery();
          } else if (ico === '📌') {
            openNotes();
          } else if (ico === '🗓') {
            openDates();
          } else {
            _closeAllViews();
            _showChat();
          }
        });
      });
    }
    function showToast(msg, ms = 2500) {
      const ex = document.getElementById('curon-toast'); if (ex) ex.remove();
      const el = document.createElement('div'); el.id = 'curon-toast';
      el.textContent = msg;
      el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#30253e;color:#c3c88c;border:2px solid #c3c88c;font-family:"Press Start 2P",monospace;font-size:7px;padding:8px 14px;z-index:9999;box-shadow:3px 3px 0 #c3c88c;pointer-events:none;';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), ms);
    }


    // ════════════════════════════════════════════════════════════
    //  SETTINGS PANEL
    // ════════════════════════════════════════════════════════════

    function openSettings() {
      document.getElementById('settings-panel').classList.add('open');
      document.getElementById('settings-overlay').classList.add('show');
      closeDrawer();
      // Update Spotify button state
      const spotifyData = document.getElementById('spot-song-me')?.textContent;
      const connected = spotifyData && spotifyData !== 'NOT CONNECTED';
      document.getElementById('btn-settings-spotify')?.style.setProperty('display', connected ? 'none' : '');
      document.getElementById('btn-settings-spotify-disconnect')?.style.setProperty('display', connected ? '' : 'none');
    }

    function closeSettings() {
      document.getElementById('settings-panel').classList.remove('open');
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

    function initSettings() {
      document.getElementById('btn-settings')?.addEventListener('click', openSettings);
    }


    // ════════════════════════════════════════════════════════════
    //  STATS & MILESTONES
    // ════════════════════════════════════════════════════════════

    async function openStatsModal() {
      closeDrawer();
      document.getElementById('stats-modal').classList.add('show');
      await loadStats();
    }

    function closeStatsModal() {
      document.getElementById('stats-modal').classList.remove('show');
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
        el.innerHTML = `<div style="font-family:'Press Start 2P',monospace;font-size:6px;color:#80b9b1;padding:8px 0;text-align:center;">NO MILESTONES YET</div>`;
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
      document.getElementById('milestone-input-date')?.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '').slice(0, 8);
        if (v.length >= 5) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
        else if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
        e.target.value = v;
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

      // TZ toggle button in timeline header
      document.getElementById('btn-tz-toggle')?.addEventListener('click', () => {
        _tzViewMode = _tzViewMode === 'my' ? 'their' : 'my';
        const btn = document.getElementById('btn-tz-toggle');
        if (btn) {
          btn.textContent = _tzViewMode === 'my' ? '🌐 MY TZ' : '🌐 THEIR TZ';
          btn.style.background = _tzViewMode === 'my' ? '#80b9b1' : '#c3c88c';
        }
        if (document.getElementById('dates-view').classList.contains('show')) renderTimeline();
      });
    }

