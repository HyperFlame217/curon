//  HISTORY
// ════════════════════════════════════════════════════════════
let _historyLoading = false;
let _oldestMsgId = null;
let _allLoaded = false;

// P1-H: E2EE shim to prevent crashes during key exchange
async function importPublicKey(key) { return key; }

async function renderHistory(msgs, before = null, isTeleport = false) {
  const container = document.getElementById('msgs');

  if (!msgs.length) {
    if (before) _allLoaded = true;
    return;
  }

  // Parallelize decryption and element creation
  // 'bottom' = initial load (snap to bottom), 'none' = paginated history, 'teleport' = centered around msg
  let scrollCtx = 'none';
  if (!before && !isTeleport) scrollCtx = 'bottom';
  else if (isTeleport) scrollCtx = 'teleport';
  const msgPromises = msgs.map(msg => buildMsgEl(msg, scrollCtx));
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
}

async function loadHistory(before = null, reqAround = null) {
  if (_historyLoading) return;
  if (before && _allLoaded) return;
  _historyLoading = true;
  try {
    let url = '/messages?limit=50';
    if (reqAround) url = `/messages?limit=50&around=${reqAround}`;
    else if (before) url = `/messages?limit=50&before=${before}`;
    let res = null;
    let retries = 3;
    let delay = 1000;
    while (retries > 0) {
      res = await fetch(url, { headers: { Authorization: `Bearer ${STATE.token}` } }).catch(() => null);
      if (res) break;
      retries--;
      if (retries > 0) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }

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
    await renderHistory(msgs, before, !!reqAround);

  } finally {
    _historyLoading = false;
    updateReceipts();
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

  // Play notification chime for incoming messages (not our own)
  if (msg.sender_id !== STATE.user?.id) {
    if (typeof AudioManager !== 'undefined' && AudioManager.playChime) {
      AudioManager.playChime();
    }
  }

  await processNewMsg(msg);
  // If messages arrived while processing or while history finished
  while (_incQueue.length > 0) {
    const next = _incQueue.shift();
    await processNewMsg(next);
  }
  if (window.wsSend && msg.sender_id !== STATE.user?.id) wsSend(WS_EV.C_MESSAGE_READ);

  // Handle unread badge - only show if not on chat tab
  if (msg.sender_id !== STATE.user?.id && typeof BadgeManager !== 'undefined') {
    BadgeManager.handleIncoming('chat');
  }
}

async function processNewMsg(msg) {
  const container = document.getElementById('msgs');
  if (container.querySelector(`[data-msg-id="${msg.id}"]`)) return;

  if (msg.sender_id === STATE.user?.id) {
    const pendingBw = container.querySelector('.row.me .bw[data-status="pending"]');
    if (pendingBw) pendingBw.closest('.row').remove();
  }

  // Remove typing indicator when partner sends a message
  if (msg.sender_id !== STATE.user?.id) {
    const tyrow = container.querySelector('.tyrow');
    if (tyrow) tyrow.remove();
    // Stop our own typing indicator if we were showing one
    if (typeof TypingManager !== 'undefined' && TypingManager.clearTypingTimers) {
      TypingManager.clearTypingTimers();
    }
  }

  const el = await buildMsgEl(msg, 'near'); // new incoming message — scroll only if near bottom
  const d = new Date(msg.created_at * 1000);
  const dateStr = formatDate(d);
  const separators = container.querySelectorAll('.dsep');
  const lastSep = separators.length ? separators[separators.length - 1] : null;
  if (!lastSep || lastSep.textContent !== dateStr) {
    container.appendChild(makeSep(dateStr));
  }
  const tyrow = container.querySelector('.tyrow');
  tyrow ? container.insertBefore(el, tyrow) : container.appendChild(el);
  updateReceipts();
  scrollBottom();
}

function onMessageStatus(msg) {
  const bubble = document.querySelector(`.bw[data-msg-id="${msg.id}"]`);
  if (bubble) {
    if (msg.status === 'read') bubble.dataset.read = 'true';
    if (msg.status === 'delivered') bubble.dataset.delivered = 'true';
    bubble.dataset.status = msg.status;
    updateReceipts();
  }
}

function updateReceipts() {
  // Receipt labels with retro styling
  const labels = {
    sent: '>> sent',
    delivered: '>> delivered',
    read: '>> seen'
  };

  // Clear all current receipts
  document.querySelectorAll('.rcpt').forEach(r => r.textContent = '');

  const rows = Array.from(document.querySelectorAll('.row.me .bw'));
  if (!rows.length) return;

  // Find last SEEN message (most recent read)
  const seenRows = rows.filter(r => r.dataset.read === 'true');
  const lastSeen = seenRows[seenRows.length - 1];
  if (lastSeen) {
    const rcpt = lastSeen.querySelector('.rcpt');
    if (rcpt) {
      rcpt.textContent = labels.read;
      rcpt.style.color = 'var(--color-dark)'; // Primary color for read
      rcpt.className = 'rcpt';
    }
  }

  // Find last DELIVERED (not seen yet)
  const deliveredRows = rows.filter(r => r.dataset.delivered === 'true' && r.dataset.read !== 'true');
  const lastDelivered = deliveredRows[deliveredRows.length - 1];
  if (lastDelivered && lastDelivered !== lastSeen) {
    const rcpt = lastDelivered.querySelector('.rcpt');
    if (rcpt) {
      rcpt.textContent = labels.delivered;
      rcpt.style.color = 'var(--color-dark)'; // Highlight for delivered
      rcpt.className = 'rcpt';
    }
  }

  // Last SENT (just sent, not delivered yet)
  const lastMsg = rows[rows.length - 1];
  if (lastMsg && lastMsg !== lastDelivered && lastMsg !== lastSeen) {
    const rcpt = lastMsg.querySelector('.rcpt');
    if (rcpt) {
      if (lastMsg.dataset.status === 'pending') {
        rcpt.innerHTML = '<span class="pending-clock"></span>';
        rcpt.className = 'rcpt pending';
      } else {
        rcpt.textContent = labels.sent;
        rcpt.style.color = 'var(--color-muted)'; // Muted for sent
        rcpt.className = 'rcpt';
      }
    }
  }
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

const STATUS_COLORS = { online: '#3ddc84', idle: '#b8860b', offline: '#999999', in_call: '#E58DA3' };

function onPresence({ userId, status }) {
  if (userId === STATE.user.id) return;
  updateNameUI();

  // If the other user just came ONLINE, sync full state to them
  if (status === 'online') {
    // 1. Broadcast our current position so they see us correctly
    if (window.HOUSE_STATE && HOUSE_STATE.player) {
      const p = HOUSE_STATE.player;
      wsSend(WS_EV.C_CHAR_MOVE, { userId: STATE.user.id, x: p.x, y: p.y, charId: 'partner' });
    }

    // 2. Re-fetch full house furniture from DB and re-render
    if (window.refreshHouseData) {
      refreshHouseData().then(() => {
        console.log('[House] Partner joined — re-synced furniture from DB');
      });
    }

    // 3. If we don't have their key yet, fetch it
    if (!STATE.otherPubKey) {
      fetch('/auth/keys', { headers: { Authorization: `Bearer ${STATE.token}` } })
        .then(r => r.json())
        .then(async k => {
          if (k.other_public_key) {
            STATE.otherPubKey = await importPublicKey(k.other_public_key);
            if (STATE._keyPoller) { clearInterval(STATE._keyPoller); STATE._keyPoller = null; }
            // Also apply partner position from DB if we just got it
            if (window.HOUSE_STATE && HOUSE_STATE.partner) {
              HOUSE_STATE.partner.x = k.other_house_x || 5;
              HOUSE_STATE.partner.y = k.other_house_y || 5;
              if (window.renderCharacters) renderCharacters();
            }
            _historyLoading = false;
            await loadHistory();
          }
        }).catch(() => { });
    }
  }

  const color = STATUS_COLORS[status] || '#80b9b1';
  const dotHtml = `<div class="status-dot" style="background-color:${color};"></div>`;

  // Desktop Status Bar
  const sub = document.querySelector('.status-bar .status-sub');
  if (sub) {
    sub.innerHTML = dotHtml;
    sub.append(status);
  }
  // Mobile Header Status
  const mhSub = document.querySelector('.mh-sub');
  if (mhSub) {
    mhSub.innerHTML = dotHtml;
    mhSub.append(status);
  }

  // Update sidebar avatar dots (e.g. Iron & Cubby)
  document.querySelectorAll('.pxava.her .sdot').forEach(d => {
    d.classList.remove('on', 'idl', 'online', 'offline');
    d.classList.add(status);
    d.style.background = color;
  });

  // Also update the global app-dot in the header if it exists
  const appDot = document.querySelector('.app-dot');
  if (appDot) {
    appDot.style.background = color;
  }
}

// Handle granular presence sync from server (active/idle/away/offline)
function onPresenceSync({ userId, state }) {
  // Skip if it's our own ID
  if (userId === STATE.user?.id) return;

  STATE.partnerPresenceState = state;

  // Update presence colors for the partner
  const partnerColors = {
    active: '#4ADE80',
    idle: '#FACC15',
    away: '#FB923C',
    offline: '#94A3B8'
  };
  const color = partnerColors[state] || partnerColors.offline;

  // Update sidebar partner dot - remove ALL status classes first
  const partnerDots = document.querySelectorAll('.pxava.her .sdot');
  partnerDots.forEach(d => {
    d.removeAttribute('data-status');
    d.classList.remove('on', 'idl', 'away', 'offline', 'active', 'online', 'idle', 'in_call');
    d.setAttribute('data-status', state);
    d.classList.add(state);
    d.style.background = color;
    // Remove any blink animation for non-offline
    d.style.animation = state === 'offline' ? 'blink 1.2s steps(1) infinite' : 'none';
  });

  // Update app-dot
  const appDot = document.querySelector('.app-dot');
  if (appDot) {
    appDot.removeAttribute('data-status');
    appDot.classList.remove('on', 'idl', 'away', 'offline', 'active', 'online', 'idle', 'in_call');
    appDot.setAttribute('data-status', state);
    appDot.classList.add(state);
    appDot.style.background = color;
  }

  // Update status bar text (desktop)
  const statusSub = document.querySelector('.status-bar .status-sub');
  if (statusSub) {
    statusSub.textContent = state;
    statusSub.insertAdjacentHTML('afterbegin', `<div class="status-dot" style="background-color:${color};"></div>`);
  }

  // Update mobile header
  const mhSub = document.querySelector('.mh-sub');
  if (mhSub) {
    mhSub.textContent = state;
    mhSub.insertAdjacentHTML('afterbegin', `<div class="status-dot" style="background-color:${color};"></div>`);
  }
}

function onTyping({ userId, typing }) {
  if (userId === STATE.user.id) return;
  const container = document.getElementById('msgs');
  const existing = container.querySelector('.tyrow');

  if (typing && !existing) {
    const row = document.createElement('div');
    row.className = 'tyrow';

    // Use actual avatar if available
    const otherAva = typeof getOtherAvatar === 'function' ? getOtherAvatar() : null;
    let avatarHtml = '👧';
    if (otherAva) {
      avatarHtml = `<img src="${escAttr(otherAva)}" alt="${escAttr(STATE.otherName || 'THEM')} avatar" class="avatar-img">`;
    }

    row.innerHTML = `
          <div class="ra">${avatarHtml}</div>
          <div class="tybub"><span></span><span></span><span></span></div>
          <div style="font-size:16px;color:var(--color-muted);font-style:italic;">typing...</div>
        `;
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
    const message_id = parseInt(bw.dataset.msgId, 10);
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

  let _resizeTimer;
  field.addEventListener('input', () => {
    const val = field.value.trim();
    const ibox = field.closest('.ibox');

    // 1. Toggle 'is-typing' class
    if (ibox) {
      ibox.classList.toggle('is-typing', val.length > 0);
    }

    // 2. Debounced auto-resize to avoid per-keystroke reflow
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      field.style.height = 'auto';
      field.style.height = Math.min(field.scrollHeight, 100) + 'px';
    }, 50);

    // 3. Typing WebSocket state
    if (val.length > 0) {
      if (!STATE.typingTimer) wsSend(WS_EV.C_TYPING_START);
      clearTimeout(STATE.typingTimer);
      STATE.typingTimer = setTimeout(() => {
        wsSend(WS_EV.C_TYPING_STOP);
        STATE.typingTimer = null;
      }, 3000);
    } else {
      wsSend(WS_EV.C_TYPING_STOP);
      clearTimeout(STATE.typingTimer);
      STATE.typingTimer = null;
    }
  });

  btn.addEventListener('click', async () => {
    const text = field.value.trim();
    if (!text) return;

    // --- Optimistic UI: Create pending bubble ---
    const pendingMsg = {
      id: `pending-${Date.now()}`,
      sender_id: STATE.user.id,
      content: text,
      created_at: Math.floor(Date.now() / 1000),
      status: 'pending',
      reply_to_id: REPLY_STATE.active ? REPLY_STATE.msgId : null,
      reactions: []
    };

    const el = await buildMsgEl(pendingMsg, 'bottom');
    const container = document.getElementById('msgs');
    const tyrow = container.querySelector('.tyrow');
    tyrow ? container.insertBefore(el, tyrow) : container.appendChild(el);
    updateReceipts();
    scrollBottom();
    // --- End Optimistic UI ---

    wsSend(WS_EV.C_MESSAGE_SEND, {
      content: text,
      reply_to_id: REPLY_STATE.active ? REPLY_STATE.msgId : null,
    });

    field.value = '';
    field.style.height = 'auto';

    const ibox = field.closest('.ibox');
    if (ibox) ibox.classList.remove('is-typing');

    cancelReply();
    wsSend(WS_EV.C_TYPING_STOP);
    clearTimeout(STATE.typingTimer);
    STATE.typingTimer = null;
  });

  field.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const ac = document.getElementById('emoji-autocomplete');
      if (ac && ac.classList.contains('show')) return;
      e.preventDefault();
      btn.click();
    }
  });

  // Paste images from clipboard
  field.addEventListener('paste', async (e) => {
    const files = Array.from(e.clipboardData.files || []);
    const images = files.filter(f => f.type.startsWith('image/'));
    if (!images.length) return;
    for (const img of images) {
      await sendMediaMessage(img);
    }
  });

  // Mark messages as read when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      markAllVisibleAsRead();
    }
  });
}

function markAllVisibleAsRead() {
  const myRows = document.querySelectorAll('.row.me .bw[data-read="false"]');
  if (myRows.length === 0) return;

  myRows.forEach(row => {
    wsSend(WS_EV.C_MESSAGE_READ);
  });
}

// ════════════════════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════════════════════

function isEmojiOnlyMsg(text) {
  if (!text) return false;
  const stripped = text
    .replace(/:[a-zA-Z0-9_]+:/g, '')
    .replace(/[\p{Emoji}\p{Emoji_Modifier}\p{Extended_Pictographic}\uFE0F\u200D\u20E3\uFE0E\u200B\u200C\uFEFF\u200E\u200F\u2060\u2061\u2062\u2063\u2064]/gu, '')
    .replace(/\s+/g, '');
  return text.trim().length > 0 && stripped.length === 0;
}

// scrollCtx: 'bottom' = snap to bottom on load, 'near' = scroll if near bottom, 'none' = never scroll
async function buildMsgEl(msg, scrollCtx = 'near') {
  const isMe = msg.sender_id === STATE.user.id;
  let text = '';

  if (msg.content) {
    text = msg.content;
    // Background migration: if it has content but also has encrypted fields on the server, 
    // it's already migrated. If it only has encrypted fields, we migrate.
  } else if (msg.media_id) {
    text = ''; // content rendered via buildMediaEl
  } else {
    text = '[unsupported format]';
  }

  // Check if this is a GIF message
  const isGif = text.startsWith('[gif]');
  const gifUrl = isGif ? text.slice(5) : null;
  if (isGif) text = '';

  const isEmojiOnly = !msg.media_id && !isGif && isEmojiOnlyMsg(text);

  const time = formatTime(new Date(msg.created_at * 1000));
  const reactions = msg.reactions || [];
  const row = document.createElement('div');
  row.className = `row ${isMe ? 'me' : 'them'}`;

  const otherAvatarImg = getOtherAvatar();
  const avatar = isMe ? '' : `<div class="ra" aria-label="${escAttr(STATE.otherName || 'THEM')} avatar">${otherAvatarImg ? `<img src="${otherAvatarImg}" alt="${escAttr(STATE.otherName || 'THEM')} avatar" class="avatar-img">` : '👧'}</div>`;
  const rcpt = isMe ? `<div class="rcpt"></div>` : '';
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

  // For media messages, content holds the mime type (sent as plaintext)
  const mimeType = msg.media_id ? (msg.content || '') : null;

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
    <div class="bw" data-msg-id="${msg.id}" data-read="${!!msg.read_at}" data-delivered="${msg.read_at || msg.delivered_at ? 'true' : 'false'}" data-status="${msg.read_at ? 'read' : (msg.delivered_at ? 'delivered' : 'sent')}">
      ${(msg.media_id || isGif)
      ? `<div class="b" style="padding:4px;"></div>`
      : `<div class="b ${isEmojiOnly ? 'emoji-only' : ''}">${renderMessageText(text)}<span class="ts">${time}</span></div>`
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
      const container = document.createElement('div');
      container.className = 'gif-container';
      const img = document.createElement('img');
      img.src = gifUrl;
      img.className = 'media-img';
      img.alt = 'GIF';
      img.style.maxWidth = '240px';
      img.addEventListener('click', () => showLightbox(gifUrl));
      img.addEventListener('load', scrollCtx === 'bottom' ? scrollBottom : scrollCtx === 'near' ? scrollIfNearBottom : () => { });
      container.appendChild(img);
      mediaEl = container;
    } else {
      mediaEl = buildMediaEl(msg.media_id, mimeType);
      const container = document.createElement('div');
      container.className = 'gif-container'; // Reuse container for layout stability
      container.appendChild(mediaEl);
      mediaEl = container;
      // Scroll after images load — only if user is near the bottom
      const imgs = container.tagName === 'IMG' ? [container] : container.querySelectorAll('img');
      imgs.forEach(img => img.addEventListener('load', scrollCtx === 'bottom' ? scrollBottom : scrollCtx === 'near' ? scrollIfNearBottom : () => { }));
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