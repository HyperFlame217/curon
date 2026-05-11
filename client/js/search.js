    //  REPLIES
    // ════════════════════════════════════════════════════════════

    const REPLY_STATE = {
      active: false,
      msgId: null,
      senderName: null,
      previewText: null,
    };

    // ── Context menu ─────────────────────────────────────────────
    let _ctxMsgId = null;

    function showContextMenu(e, msgId, row) {
      e.preventDefault();
      _ctxMsgId = msgId;

      const menu = document.getElementById('msg-context-menu');
      if (menu) menu.classList.add('show');

      // Position near tap/click
      let x = e.clientX || (e.touches?.[0]?.clientX) || 0;
      let y = e.clientY || (e.touches?.[0]?.clientY) || 0;

      // Keep within viewport
      if (x + 160 > window.innerWidth) x = window.innerWidth - 160;
      if (y + 80 > window.innerHeight) y = window.innerHeight - 80;

      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
    }

    function closeContextMenu() {
      document.getElementById('msg-context-menu')?.classList.remove('show');
      _ctxMsgId = null;
    }

    // ── Start a reply ─────────────────────────────────────────────
    function startReply(msgId) {
      const bw = document.querySelector(`[data-msg-id="${msgId}"]`);
      if (!bw) return;

      const row = bw.closest('.row');
      const isMe = row?.classList.contains('me');
      const senderName = isMe
        ? (STATE.user?.username || 'YOU').toUpperCase()
        : (STATE.otherName || 'THEM').toUpperCase();

      // Get the text content of the bubble (skip timestamp, reactions)
      const bubble = bw.querySelector('.b');
      let text = '';
      if (bubble) {
        // Get text nodes only, skip the .ts timestamp span
        const clone = bubble.cloneNode(true);
        clone.querySelectorAll('.ts, .reply-quote').forEach(el => el.remove());
        text = clone.textContent.trim().slice(0, 80);
      }
      if (!text) text = '📎 Media';

      REPLY_STATE.active = true;
      REPLY_STATE.msgId = msgId;
      REPLY_STATE.senderName = senderName;
      REPLY_STATE.previewText = text;

      // Show preview bar
      const previewName = document.getElementById('reply-preview-name');
      const previewText = document.getElementById('reply-preview-text');
      const previewBar = document.getElementById('reply-preview');
      if (previewName) previewName.textContent = senderName;
      if (previewText) previewText.textContent = text;
      if (previewBar) previewBar.classList.add('show');

      // Focus input
      document.getElementById('ifield')?.focus();
    }

    function cancelReply() {
      REPLY_STATE.active = false;
      REPLY_STATE.msgId = null;
      REPLY_STATE.senderName = null;
      REPLY_STATE.previewText = null;
      document.getElementById('reply-preview')?.classList.remove('show');
    }

    // ── Build reply quote block ───────────────────────────────────
    function buildReplyQuote(replyToId, senderName, text) {
      const quote = document.createElement('div');
      quote.className = 'reply-quote';
      quote.dataset.replyTo = replyToId;
      quote.innerHTML = `
    <div class="reply-quote-name">${escHtml(senderName || '')}</div>
    <div class="reply-quote-text">${escHtml(text || '📎 Media')}</div>
  `;
      // Click to scroll to original
      quote.addEventListener('click', () => {
        const target = document.querySelector(`[data-msg-id="${replyToId}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Flash highlight
          const row = target.closest('.row');
          if (row) {
            row.style.outline = '2px solid var(--color-accent)';
            setTimeout(() => { row.style.outline = ''; }, 1200);
          }
        } else {
          showToast('MESSAGE NOT IN VIEW — SCROLL UP');
        }
      });
      return quote;
    }

    // ── Init replies ──────────────────────────────────────────────
    function initReplies() {
      // Close context menu on click outside
      document.addEventListener('click', (e) => {
        const menu = document.getElementById('msg-context-menu');
        if (menu && menu.classList.contains('show') && !menu.contains(e.target)) {
          closeContextMenu();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { closeContextMenu(); cancelReply(); }
      });

      // Context menu actions
      document.getElementById('ctx-reply').addEventListener('click', () => {
        if (_ctxMsgId) startReply(_ctxMsgId);
        closeContextMenu();
      });

      document.getElementById('ctx-react').addEventListener('click', () => {
        const msgId = _ctxMsgId;
        const bw = msgId ? document.querySelector(`[data-msg-id="${msgId}"]`) : null;
        const bubble = bw?.querySelector('.b');
        closeContextMenu(); // close first so z-index doesn't conflict
        if (msgId && bubble) {
          // Small delay to let context menu close before showing picker
          setTimeout(() => showReactionPicker(msgId, bubble), 50);
        }
      });

      document.getElementById('ctx-copy').addEventListener('click', () => {
        const msgId = _ctxMsgId;
        const bw = msgId ? document.querySelector(`[data-msg-id="${msgId}"]`) : null;
        const bubble = bw?.querySelector('.b');
        if (bubble) {
          const clone = bubble.cloneNode(true);
          clone.querySelectorAll('.ts', '.reply-quote', '.rxns').forEach(el => el.remove());
          const text = clone.textContent.trim();
          if (text) navigator.clipboard.writeText(text);
        }
        closeContextMenu();
      });

      // Reply preview close
      document.getElementById('reply-preview-close').addEventListener('click', cancelReply);
    }

    // ════════════════════════════════════════════════════════════
    //  CHAT SEARCH
    // ════════════════════════════════════════════════════════════

    let _searchResults = [];
    let _searchIndex = -1;
    let _searchActive = false;

    function openSearch() {
      _searchActive = true;
      document.getElementById('search-bar').classList.add('show');
      document.getElementById('search-input').focus();
      document.getElementById('search-input').select();
    }

    function closeSearch() {
      _searchActive = false;
      document.getElementById('search-bar')?.classList.remove('show');
      document.getElementById('search-results-panel')?.classList.remove('show');
      const input = document.getElementById('search-input');
      if (input) input.value = '';
      clearSearchHighlights();
      _searchResults = [];
      _searchIndex = -1;
      const count = document.getElementById('search-count');
      if (count) count.textContent = '';
    }

    function clearSearchHighlights() {
      document.querySelectorAll('.search-highlight').forEach(el => {
        const parent = el.parentNode;
        parent.replaceChild(document.createTextNode(el.textContent), el);
        parent.normalize();
      });
      document.querySelectorAll('.row.teleported').forEach(row => row.classList.remove('teleported'));
    }

    async function runSearch(query) {
      if (!query.trim()) {
        document.getElementById('search-results-panel')?.classList.remove('show');
        return;
      }
      const panel = document.getElementById('search-results-panel');
      const list = document.getElementById('search-results-list');
      if (panel) panel.classList.add('show');
      if (list) list.innerHTML = `<div class="loading-container"><div class="pixel-loader"></div> SCANNING DATABASE...</div>`;

      try {
        const res = await fetch(`/chat/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${STATE.token}` }
        });
        const results = await res.json();
        renderSearchResults(results);
      } catch (e) {
        console.error('[Search] Error:', e);
      }
    }

    function renderSearchResults(results) {
      const panel = document.getElementById('search-results-panel');
      const list = document.getElementById('search-results-list');
      const count = document.getElementById('search-count');
      
      if (list) list.innerHTML = '';
      if (count) count.textContent = `${results.length} RESULTS`;

      if (results.length === 0) {
        list.innerHTML = `
          <div class="search-no-results">
            No messages found.<br>
            <span style="text-decoration:underline; cursor:pointer; font-size:6px; display:block; margin-top:10px;" id="search-clear-hint">CLEAR SEARCH</span>
          </div>
        `;
        document.getElementById('search-clear-hint').addEventListener('click', closeSearch);
      } else {
        results.forEach(res => {
          const item = document.createElement('div');
          item.className = 'search-item';
          const date = new Date(res.created_at * 1000).toLocaleDateString();
          item.innerHTML = `
            <div class="search-item-meta">
              <span class="search-item-user">${escHtml(res.username)}</span>
              <span class="search-item-date">${date}</span>
            </div>
            <div class="search-item-snippet">${res.snippet}</div>
          `;
          item.addEventListener('click', () => teleportToMessage(res.id));
          list.appendChild(item);
        });
      }
      panel.classList.add('show');
    }

    async function teleportToMessage(msgId) {
      closeSearch();
      showToast('TELEPORTING...');
      
      // Clear current history state
      const container = document.getElementById('msgs');
      container.innerHTML = '';
      _oldestMsgId = null;
      _allLoaded = false;
      
      // Load history around this message
      await loadHistory(null, msgId);
      
      // Show "Jump to Present" button
      document.getElementById('jump-to-present').classList.add('show');
      
      setTimeout(() => {
        const wrapper = document.querySelector(`[data-msg-id="${msgId}"]`);
        const target = wrapper?.closest('.row');
        if (target) {
          target.classList.add('teleported');
          target.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
      }, 500);
    }

    async function jumpToPresent() {
      document.getElementById('jump-to-present').classList.remove('show');
      const container = document.getElementById('msgs');
      container.innerHTML = '';
      _oldestMsgId = null;
      _allLoaded = false;
      await loadHistory();
    }

    function initSearch() {
      document.getElementById('btn-search')?.addEventListener('click', openSearch);
      document.getElementById('btn-search-mobile')?.addEventListener('click', openSearch);

      const input = document.getElementById('search-input');
      let timer = null;
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => runSearch(input.value), 200);
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.shiftKey ? searchPrev() : searchNext(); }
        if (e.key === 'Escape') closeSearch();
      });

      document.getElementById('search-next')?.addEventListener('click', searchNext);
      document.getElementById('search-prev')?.addEventListener('click', searchPrev);
      document.getElementById('search-close')?.addEventListener('click', closeSearch);
      document.getElementById('jump-to-present')?.addEventListener('click', jumpToPresent);

      // Close search results if clicking outside
      document.addEventListener('mousedown', (e) => {
        const panel = document.getElementById('search-results-panel');
        const bar = document.getElementById('search-bar');
        const searchBtn = document.getElementById('btn-search');
        if (_searchActive && !panel.contains(e.target) && !bar.contains(e.target) && !searchBtn.contains(e.target)) {
          closeSearch();
        }
      });
    }

    // ════════════════════════════════════════════════════════════