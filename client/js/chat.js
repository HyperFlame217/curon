    //  HISTORY
    // ════════════════════════════════════════════════════════════
    let _historyLoading = false;
    let _oldestMsgId = null;
    let _allLoaded = false;

    async function loadHistory(before = null) {
      if (_historyLoading) return;
      if (before && _allLoaded) return;
      _historyLoading = true;
      try {
        const url = before
          ? `/messages?limit=50&before=${before}`
          : '/messages?limit=50';
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${STATE.token}` },
        }).catch(() => null);
        if (!res) return;
        if (res.status === 401) {
          localStorage.removeItem('curon_token');
          localStorage.removeItem('curon_user');
          location.reload();
          return;
        }
        if (!res.ok) return;

        const msgs = await res.json();
        console.log("[Chat] History loaded:", msgs.length, "messages");
        const container = document.getElementById('msgs');

        if (!msgs.length) {
          if (before) _allLoaded = true;
          return;
        }

        // Parallelize decryption and element creation
        // buildMsgEl is async, so we create an array of promises
        const msgPromises = msgs.map(msg => buildMsgEl(msg, !before));
        const msgElements = await Promise.all(msgPromises);

        const frag = document.createDocumentFragment();
        let lastDate = null;
        
        // If paginating, we need to know the date of the "currently oldest" message 
        // to avoid duplicate date separators
        if (before) {
          const firstVisible = container.querySelector('.dsep');
          if (firstVisible) lastDate = firstVisible.textContent;
        }

        msgElements.forEach((el, i) => {
          const msg = msgs[i];
          const d = new Date(msg.created_at * 1000);
          const dateStr = formatDate(d);
          
          if (dateStr !== lastDate) {
            const sep = makeSep(dateStr);
            frag.appendChild(sep);
            lastDate = dateStr;
          }
          frag.appendChild(el);
        });

        if (!before) {
          // Initial load — clear and render
          container.innerHTML = '';
          container.appendChild(frag);
          if (msgs.length) _oldestMsgId = msgs[0].id;
          if (msgs.length < 50) _allLoaded = true;
          scrollBottom();
        } else {
          // Lock scroll — prevent any scroll events during DOM mutation
          const prevOverflow = container.style.overflowY;
          container.style.overflowY = 'hidden';

          const scrollTopBefore = container.scrollTop;
          const scrollHeightBefore = container.scrollHeight;

          container.insertBefore(frag, container.firstChild);

          // Restore position synchronously before unlocking scroll
          container.scrollTop = scrollTopBefore + (container.scrollHeight - scrollHeightBefore);

          requestAnimationFrame(() => {
            container.style.overflowY = prevOverflow || '';
          });

          _oldestMsgId = msgs[0].id;
          if (msgs.length < 50) _allLoaded = true;
        }
      } finally {
        _historyLoading = false;
        if (window.wsSend && !before) wsSend(WS_EV.C_MESSAGE_READ);
      }
    }

    // Load more when scrolled to top
    function initScrollPagination() {
      const msgs = document.getElementById('msgs');
      if (!msgs) return;
      let _scrollDebounce = null;
      msgs.addEventListener('scroll', () => {
        if (msgs.scrollTop < 60 && !_historyLoading && !_allLoaded && _oldestMsgId) {
          clearTimeout(_scrollDebounce);
          _scrollDebounce = setTimeout(() => {
            // Double-check we're still near top after debounce
            if (msgs.scrollTop < 60 && !_historyLoading && !_allLoaded && _oldestMsgId) {
              loadHistory(_oldestMsgId);
            }
          }, 150);
        }
      });
    }

    // ════════════════════════════════════════════════════════════
    //  INCOMING EVENTS
    // ════════════════════════════════════════════════════════════
    let _incQueue = [];
    async function onMessageNew(msg) {
      if (msg.media_id) _galleryLoaded = false;
      if (_historyLoading) {
        _incQueue.push(msg);
        return;
      }
      await processNewMsg(msg);
      // If messages arrived while processing or while history finished
      while (_incQueue.length > 0) {
        const next = _incQueue.shift();
        await processNewMsg(next);
      }
      if (window.wsSend && msg.sender_id !== STATE.user?.id) wsSend(WS_EV.C_MESSAGE_READ);
    }

    async function processNewMsg(msg) {
      const container = document.getElementById('msgs');
      if (container.querySelector(`[data-msg-id="${msg.id}"]`)) return;
      const el = await buildMsgEl(msg);
      const d = new Date(msg.created_at * 1000);
      const dateStr = formatDate(d);
      const separators = container.querySelectorAll('.dsep');
      const lastSep = separators.length ? separators[separators.length - 1] : null;
      if (!lastSep || lastSep.textContent !== dateStr) {
        container.appendChild(makeSep(dateStr));
      }
      const tyrow = container.querySelector('.tyrow');
      tyrow ? container.insertBefore(el, tyrow) : container.appendChild(el);
      scrollBottom();
    }

    function onMessageStatus(msg) {
      const labels = { sent: '>> SENT ✓', delivered: '>> DELIVERED ✓✓', read: '>> SEEN ✓✓' };
      const priority = { sent: 0, delivered: 1, read: 2 };
      if (!labels[msg.status]) return;
      let attempts = 0;
      const findAndUpdate = () => {
        const bubble = document.querySelector(`.bw[data-msg-id="${msg.id}"]`);
        if (bubble) {
          const rcpt = bubble.querySelector('.rcpt');
          if (rcpt) {
            const txt = rcpt.textContent;
            const currentStatus = txt.includes('SEEN') ? 'read' : (txt.includes('DELIVERED') ? 'delivered' : 'sent');
            if (priority[msg.status] > priority[currentStatus]) {
              rcpt.textContent = labels[msg.status];
            }
            return;
          }
        }
        if (++attempts < 15) setTimeout(findAndUpdate, 200);
      };
      findAndUpdate();
    }

    function onReaction({ message_id, user_id, emoji }) {
      const bw = document.querySelector(`[data-msg-id="${message_id}"]`);
      if (!bw) return;
      let rxns = bw.querySelector('.rxns');
      if (!rxns) {
        rxns = document.createElement('div');
        rxns.className = 'rxns';
        bw.appendChild(rxns);
      }
      const ex = rxns.querySelector(`[data-emoji="${CSS.escape(emoji)}"]`);
      if (ex) {
        // If this user already reacted with this emoji, don't increment again
        const reactors = ex.dataset.reactors ? ex.dataset.reactors.split(',') : [];
        if (reactors.includes(String(user_id))) return; // already counted this user
        reactors.push(String(user_id));
        ex.dataset.reactors = reactors.join(',');
        const n = reactors.length;
        ex.dataset.count = n;
        ex.innerHTML = `${emojiDisplay(emoji)} ${n}`;
        if (user_id === STATE.user.id) ex.classList.add('mine');
      } else {
        const el = document.createElement('div');
        el.className = 'rxn' + (user_id === STATE.user.id ? ' mine' : '');
        el.dataset.emoji = emoji;
        el.dataset.count = '1';
        el.dataset.reactors = String(user_id);
        el.innerHTML = `${emojiDisplay(emoji)} 1`;
        rxns.appendChild(el);
      }
    }

    function onReactionRemoved({ message_id, user_id, emoji }) {
      const bw = document.querySelector(`[data-msg-id="${message_id}"]`);
      if (!bw) return;
      const el = bw.querySelector(`[data-emoji="${CSS.escape(emoji)}"]`);
      if (!el) return;

      // Remove this user from reactors list
      const reactors = el.dataset.reactors ? el.dataset.reactors.split(',').filter(id => id !== String(user_id)) : [];
      el.dataset.reactors = reactors.join(',');

      if (reactors.length === 0) {
        el.remove();
      } else {
        el.dataset.count = reactors.length;
        el.innerHTML = `${emojiDisplay(emoji)} ${reactors.length}`;
        // Update mine class
        if (!reactors.includes(String(STATE.user.id))) el.classList.remove('mine');
      }
    }
    
    function onCharMove({ userId, x, y, charId, parent_id, slot_index }) {
      if (userId == STATE.user.id) return;
      console.log("[House] Remote character move:", charId, x, y, parent_id, slot_index);
      const target = HOUSE_STATE[charId]; // Usually 'partner'
      if (!target) return;
      
      const dist = Math.abs(target.x - x) + Math.abs(target.y - y);
      const el = document.getElementById('char-' + charId);
      
      // Update sitting/attachment state
      target.parent_id = parent_id !== undefined ? parent_id : null;
      target.slot_index = slot_index !== undefined ? slot_index : null;

      // If the jump is large (likely desync correction), skip the transition
      if (dist > 3 && el) {
        el.style.transition = 'none';
        target.x = x;
        target.y = y;
        renderCharacters();
        setTimeout(() => { if (el) el.style.transition = ''; }, 50);
      } else {
        target.x = x;
        target.y = y;
        renderCharacters();
      }
    }

    function onHouseUpdate({ action, item, userId }) {
      if (userId == STATE.user.id) return;
      if (!action || !item || !item.id) return;
      
      // Normalize item_id to config_id (Step 9.2)
      item.config_id = item.config_id || item.item_id;
      
      if (action === 'place') {
        const idx = HOUSE_STATE.furniture.findIndex(p => p.id === item.id);
        if (idx !== -1) {
          HOUSE_STATE.furniture[idx] = { ...HOUSE_STATE.furniture[idx], ...item };
        } else {
          HOUSE_STATE.furniture.push(item);
        }
      } else if (action === 'remove') {
        HOUSE_STATE.furniture = HOUSE_STATE.furniture.filter(p => p.id !== item.id);
      }
      
      renderHouse();
      renderInventory();

      // Ensure no one is trapped after furniture change (Phase 1-C)
      if (typeof relocateToSafeSpawn === 'function') {
        relocateToSafeSpawn('player', HOUSE_STATE.player.x, HOUSE_STATE.player.y);
        relocateToSafeSpawn('partner', HOUSE_STATE.partner.x, HOUSE_STATE.partner.y);
      }
    }

    function onSocialInteraction({ kind, userId }) {
      if (userId == STATE.user.id) return;
      if (kind === 'heart') showSocialHeart(false);
      if (kind === 'hug') showSocialInteractionFX('🫂', false);
      if (kind === 'kiss') showSocialInteractionFX('💋', false);
    }

    const STATUS_COLORS = { online: '#94c784', idle: '#c3c88c', offline: '#80b9b1', in_call: '#638872' };

    function onPresence({ userId, status }) {
      if (userId === STATE.user.id) return;
      updateNameUI();

      // If the other user just came ONLINE, sync full state to them
      if (status === 'online') {
        // 1. Broadcast our current position so they see us correctly
        const p = HOUSE_STATE.player;
        if (p) wsSend(WS_EV.C_CHAR_MOVE, { userId: STATE.user.id, x: p.x, y: p.y, charId: 'partner' });

        // 2. Re-fetch full house furniture from DB and re-render
        // (catches all furniture changes made while partner was offline)
        refreshHouseData().then(() => {
          console.log('[House] Partner joined — re-synced furniture from DB');
        });

        // 3. If we don't have their key yet, fetch it
        if (!STATE.otherPubKey) {
          fetch('/auth/keys', { headers: { Authorization: `Bearer ${STATE.token}` } })
            .then(r => r.json())
            .then(async k => {
              if (k.other_public_key) {
                STATE.otherPubKey = await importPublicKey(k.other_public_key);
                if (STATE._keyPoller) { clearInterval(STATE._keyPoller); STATE._keyPoller = null; }
                // Also apply partner position from DB if we just got it
                if (HOUSE_STATE.partner) {
                  HOUSE_STATE.partner.x = k.other_house_x || 5;
                  HOUSE_STATE.partner.y = k.other_house_y || 5;
                  renderCharacters();
                }
                _historyLoading = false;
                await loadHistory();
              }
            }).catch(() => {});
        }
      }

      const color = STATUS_COLORS[status] || '#80b9b1';
      const sub = document.querySelector('.status-sub');
      if (sub) sub.textContent = status;
      const mhSub = document.querySelector('.mh-sub');
      if (mhSub) mhSub.innerHTML = `<div class="mh-dot" style="background:${color};width:6px;height:6px;animation:blink 1.2s steps(1) infinite;"></div>${status}`;
      document.querySelectorAll('.pxava.her .sdot').forEach(d => d.style.backgroundColor = color);
    }

    function onTyping({ userId, typing }) {
      if (userId === STATE.user.id) return;
      const container = document.getElementById('msgs');
      const existing = container.querySelector('.tyrow');
      if (typing && !existing) {
        const row = document.createElement('div');
        row.className = 'tyrow';
        row.innerHTML = `<div class="ra">👾</div><div class="tybub"><span></span><span></span><span></span></div><div style="font-size:13px;color:#80b9b1;font-style:italic;">typing...</div>`;
        container.appendChild(row);
        scrollBottom();
      } else if (!typing && existing) {
        existing.remove();
      }
    }

    // ════════════════════════════════════════════════════════════
    //  SEND
    // ════════════════════════════════════════════════════════════
    function initInput() {
      const field = document.getElementById('ifield');
      const btn = document.getElementById('sb');
      if (!field || !btn) return;

      // ── Delegated reaction click handler ────────────────────
      document.getElementById('msgs').addEventListener('click', (e) => {
        const rxn = e.target.closest('.rxn');
        if (!rxn) return;
        const bw = rxn.closest('[data-msg-id]');
        if (!bw) return;
        const message_id = parseInt(bw.dataset.msgId);
        const emoji = rxn.dataset.emoji;
        if (!emoji) return;

        if (rxn.classList.contains('mine')) {
          // Remove my reaction
          wsSend(WS_EV.C_MESSAGE_REACT_REMOVE, { message_id, emoji });
        } else {
          // Add same reaction as other user
          wsSend(WS_EV.C_MESSAGE_REACT, { message_id, emoji });
        }
      });

      btn.addEventListener('click', async () => {
        const text = field.value.trim();
        if (!text) return;

        if (!STATE.otherPubKey) {
          // Other user hasn't logged in yet — no public key available
          showToast('OTHER USER HASN\'T SET UP YET');
          return;
        }

        // Always encrypt: slot A = user_a's key, slot B = user_b's key
        const amUserA = STATE.user.id === STATE.userAId;
        const pubKeyA = amUserA ? STATE.publicKey : STATE.otherPubKey;
        const pubKeyB = amUserA ? STATE.otherPubKey : STATE.publicKey;
        const cipher = await encryptMessage(text, pubKeyA, pubKeyB);
        wsSend(WS_EV.C_MESSAGE_SEND, {
          cipher,
          reply_to_id: REPLY_STATE.active ? REPLY_STATE.msgId : null,
        });
        field.value = '';
        field.style.height = 'auto';
        cancelReply();
        wsSend(WS_EV.C_TYPING_STOP);
        clearTimeout(STATE.typingTimer);
      });

      field.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btn.click(); } });

      field.addEventListener('input', () => {
        field.style.height = 'auto';
        field.style.height = Math.min(field.scrollHeight, 100) + 'px';
        wsSend(WS_EV.C_TYPING_START);
        clearTimeout(STATE.typingTimer);
        STATE.typingTimer = setTimeout(() => wsSend(WS_EV.C_TYPING_STOP), 2000);
      });
    }

    // ════════════════════════════════════════════════════════════
    //  RENDER
    // ════════════════════════════════════════════════════════════
    async function buildMsgEl(msg, isInitialLoad = false) {
      const isMe = msg.sender_id === STATE.user.id;
      let text = '';

      // Media messages store mime type in content — no decryption needed
      if (msg.media_id) {
        text = ''; // content rendered via buildMediaEl
      } else if (STATE.privateKey && msg.encrypted_content && msg.encrypted_key && msg.iv &&
        msg.encrypted_key !== 'plaintext') {
        try {
          text = await decryptMessage({
            encrypted_content: msg.encrypted_content,
            encrypted_key: msg.encrypted_key,
            iv: msg.iv,
          }, STATE.privateKey);
        } catch {
          text = '[could not decrypt]';
        }
      } else if (msg.encrypted_key === 'plaintext') {
        text = msg.encrypted_content || '';
      } else {
        text = '[encrypted]';
      }

      // Check if this is a GIF message
      const isGif = text.startsWith('[gif]');
      const gifUrl = isGif ? text.slice(5) : null;
      if (isGif) text = '';

      const time = formatTime(new Date(msg.created_at * 1000));
      const reactions = msg.reactions || [];
      const row = document.createElement('div');
      row.className = `row ${isMe ? 'me' : 'them'}`;

      const otherAvatarImg = getOtherAvatar();
      const avatar = isMe ? '' : `<div class="ra">${otherAvatarImg ? `<img src="${otherAvatarImg}" style="width:100%;height:100%;object-fit:cover;display:block;">` : '👧'}</div>`;
      // Determine receipt status from read_at field
      let receiptText = '>> SENT ✓';
      if (isMe) {
        if (msg.read_at) receiptText = '>> SEEN ✓✓';
      }
      const rcpt = isMe ? `<div class="rcpt">${receiptText}</div>` : '';
      // Group reactions by emoji for history rendering
      const rxnGroups = {};
      reactions.forEach(r => {
        if (!rxnGroups[r.emoji]) rxnGroups[r.emoji] = [];
        rxnGroups[r.emoji].push(r.user_id);
      });
      const rxnsHtml = Object.keys(rxnGroups).length
        ? `<div class="rxns">${Object.entries(rxnGroups).map(([emoji, uids]) => {
          const isMine = uids.includes(STATE.user?.id);
          const reactors = uids.join(',');
          return `<div class="rxn${isMine ? ' mine' : ''}" data-emoji="${escAttr(emoji)}" data-count="${uids.length}" data-reactors="${reactors}">${emojiDisplay(emoji)} ${uids.length}</div>`;
        }).join('')}</div>` : '';

      // For media messages, encrypted_content holds the mime type (not sensitive)
      const mimeType = msg.media_id ? (msg.encrypted_content || '') : null;

      // Build reply quote if this message is a reply
      let replyQuoteEl = null;
      if (msg.reply_to_id) {
        const replyRow = document.querySelector(`[data-msg-id="${msg.reply_to_id}"]`);
        let replyName = '', replyText = '📎 Media';
        if (replyRow) {
          const replyBubble = replyRow.querySelector('.b');
          const replyIsMe = replyRow.closest('.row')?.classList.contains('me');
          replyName = replyIsMe
            ? (STATE.user?.username || 'YOU').toUpperCase()
            : (STATE.otherName || 'THEM').toUpperCase();
          if (replyBubble) {
            const clone = replyBubble.cloneNode(true);
            clone.querySelectorAll('.ts, .reply-quote').forEach(el => el.remove());
            replyText = clone.textContent.trim().slice(0, 80) || '📎 Media';
          }
        } else {
          // Message not in current view
          replyName = '...';
          replyText = 'click to find message';
        }
        replyQuoteEl = buildReplyQuote(msg.reply_to_id, replyName, replyText);
      }

      row.innerHTML = `
    ${avatar}
    <div class="bw" data-msg-id="${msg.id}">
      ${(msg.media_id || isGif)
          ? `<div class="b" style="padding:4px;"></div>`
          : `<div class="b">${renderMessageText(text)}<span class="ts">${time}</span></div>`
        }
      ${rxnsHtml}${rcpt}
    </div>`;

      // Prepend reply quote inside the bubble
      if (replyQuoteEl) {
        const bubble = row.querySelector('.b');
        if (bubble) bubble.insertBefore(replyQuoteEl, bubble.firstChild);
      }

      // Inject media/gif element into bubble
      if (msg.media_id || isGif) {
        const bubble = row.querySelector('.b');
        let mediaEl;
        if (isGif) {
          const img = document.createElement('img');
          img.src = gifUrl;
          img.className = 'media-img';
          img.alt = 'GIF';
          img.style.maxWidth = '240px';
          img.addEventListener('click', () => showLightbox(gifUrl));
          img.addEventListener('load', isInitialLoad ? scrollBottom : scrollIfNearBottom);
          mediaEl = img;
        } else {
          mediaEl = buildMediaEl(msg.media_id, mimeType);
          // Scroll after images load — only if user is near the bottom
          const imgs = mediaEl.tagName === 'IMG' ? [mediaEl] : mediaEl.querySelectorAll('img');
          imgs.forEach(img => img.addEventListener('load', isInitialLoad ? scrollBottom : scrollIfNearBottom));
        }
        bubble.appendChild(mediaEl);
        const ts = document.createElement('span');
        ts.className = 'ts';
        ts.textContent = time;
        bubble.appendChild(ts);
      }

      // Reaction clicks handled by delegated listener on #msgs

      // Attach long-press / right-click to open emoji picker
      attachReactionTrigger(row, msg.id);

      return row;
    }

    function makeSep(label) {
      const el = document.createElement('div');
      el.className = 'dsep'; el.textContent = label; return el;
    }

    function scrollBottom() {
      const msgs = document.getElementById('msgs');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }

    // Only scroll to bottom if user is already near the bottom
    // Prevents scroll hijacking when loading older messages
    function scrollIfNearBottom() {
      const msgs = document.getElementById('msgs');
      if (!msgs) return;
      const distFromBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight;
      if (distFromBottom < 200) msgs.scrollTop = msgs.scrollHeight;
    }

    // ════════════════════════════════════════════════════════════