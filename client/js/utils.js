    // ════════════════════════════════════════════════════════════
    //  UTILS
    // ════════════════════════════════════════════════════════════

    function updateNameUI() {
      if (!STATE.otherName) return;
      const n = STATE.otherName.toUpperCase();
      const myN = (STATE.user?.username || 'YOU').toUpperCase();
      const pair = `${myN} & ${n}`;

      const updates = {
        'pair-win-title': pair,
        'pair-name-label': pair,
        'mh-name': n,
        'chat-win-title': `CHAT.EXE — ${n}`,
        'status-name': n,
      };
      Object.entries(updates).forEach(([id, text]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      });
    }

    // Render emoji as text or <img> for custom emojis
    function emojiDisplay(emoji) {
      if (emoji && emoji.startsWith(':') && emoji.endsWith(':')) {
        const name = emoji.slice(1, -1);
        const ce = _customEmojis.find(e => e.name === name);
        if (ce) return `<img src="${emojiImgUrl(ce.filename)}" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;" alt="${emoji}">`;
      }
      return escHtml(emoji || '');
    }

    function formatTime(d) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); }
    function formatDate(d) {
      const t = new Date(), y = new Date(t); y.setDate(t.getDate() - 1);
      if (sameDay(d, t)) return 'TODAY';
      if (sameDay(d, y)) return 'YESTERDAY';
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    }
    function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>'); }
    function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
