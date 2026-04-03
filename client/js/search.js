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
      menu.classList.add('show');

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
      document.getElementById('msg-context-menu').classList.remove('show');
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
      document.getElementById('reply-preview-name').textContent = senderName;
      document.getElementById('reply-preview-text').textContent = text;
      document.getElementById('reply-preview').classList.add('show');

      // Focus input
      document.getElementById('ifield')?.focus();
    }

    function cancelReply() {
      REPLY_STATE.active = false;
      REPLY_STATE.msgId = null;
      REPLY_STATE.senderName = null;
      REPLY_STATE.previewText = null;
      document.getElementById('reply-preview').classList.remove('show');
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
            row.style.outline = '2px solid #c3c88c';
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
        if (menu.classList.contains('show') && !menu.contains(e.target)) {
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
      document.getElementById('search-bar').classList.remove('show');
      document.getElementById('search-input').value = '';
      clearSearchHighlights();
      _searchResults = [];
      _searchIndex = -1;
      document.getElementById('search-count').textContent = '';
    }

    function clearSearchHighlights() {
      document.querySelectorAll('.search-highlight').forEach(el => {
        const parent = el.parentNode;
        parent.replaceChild(document.createTextNode(el.textContent), el);
        parent.normalize();
      });
    }

    function runSearch(query) {
      clearSearchHighlights();
      _searchResults = [];
      _searchIndex = -1;

      if (!query.trim()) {
        document.getElementById('search-count').textContent = '';
        return;
      }

      const q = query.toLowerCase();

      // Search through all message bubbles
      document.querySelectorAll('.b').forEach(bubble => {
        // Get text nodes inside bubble (skip timestamps and custom emoji)
        const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(node => {
          const text = node.textContent;
          const lower = text.toLowerCase();
          let idx = lower.indexOf(q);
          if (idx === -1) return;

          // Split text node and wrap matches in <mark>
          const frag = document.createDocumentFragment();
          let last = 0;
          while (idx !== -1) {
            if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
            const mark = document.createElement('mark');
            mark.className = 'search-highlight';
            mark.textContent = text.slice(idx, idx + q.length);
            frag.appendChild(mark);
            _searchResults.push(mark);
            last = idx + q.length;
            idx = lower.indexOf(q, last);
          }
          if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
          node.parentNode.replaceChild(frag, node);
        });
      });

      const count = document.getElementById('search-count');
      if (_searchResults.length === 0) {
        count.textContent = 'NO RESULTS';
        return;
      }

      _searchIndex = 0;
      highlightCurrent();
      count.textContent = `1 / ${_searchResults.length}`;
    }

    function highlightCurrent() {
      _searchResults.forEach((el, i) => {
        el.classList.toggle('current', i === _searchIndex);
      });
      if (_searchResults[_searchIndex]) {
        _searchResults[_searchIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
        const count = document.getElementById('search-count');
        count.textContent = `${_searchIndex + 1} / ${_searchResults.length}`;
      }
    }

    function searchNext() {
      if (!_searchResults.length) return;
      _searchIndex = (_searchIndex + 1) % _searchResults.length;
      highlightCurrent();
    }

    function searchPrev() {
      if (!_searchResults.length) return;
      _searchIndex = (_searchIndex - 1 + _searchResults.length) % _searchResults.length;
      highlightCurrent();
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
    }

    // ════════════════════════════════════════════════════════════