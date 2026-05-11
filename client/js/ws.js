    // ════════════════════════════════════════════════════════════
    //  WEBSOCKET
    // ════════════════════════════════════════════════════════════
    let _reconnectAttempts = 0;
    const _maxReconnectDelay = 30000;
    const _baseReconnectDelay = 1000;

    function showReconnectOverlay() {
      const overlay = document.getElementById('reconnect-overlay');
      if (overlay) overlay.style.display = 'flex';
    }

    function hideReconnectOverlay() {
      const overlay = document.getElementById('reconnect-overlay');
      const status = document.getElementById('reconnect-status');
      if (overlay) overlay.style.display = 'none';
      if (status) status.textContent = '';
    }

    function getReconnectDelay() {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
      const delay = Math.min(_baseReconnectDelay * Math.pow(2, _reconnectAttempts), _maxReconnectDelay);
      const status = document.getElementById('reconnect-status');
      if (status) {
        status.textContent = `Retry in ${delay/1000}s... (attempt ${_reconnectAttempts + 1})`;
      }
      return delay;
    }

    function connectWS() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/?token=${encodeURIComponent(STATE.token)}`);
      STATE.ws = ws;

      // Show overlay immediately when connecting
      showReconnectOverlay();

      ws.addEventListener('open', () => {
        if (STATE.reconnTimer) { clearTimeout(STATE.reconnTimer); STATE.reconnTimer = null; }
        _reconnectAttempts = 0; // Reset backoff on success
        
        // Hide overlay
        hideReconnectOverlay();
        
        // P1-I: Silent Reconnect Reconciliation
        if (STATE.wasDisconnected) {
          console.log("[WS] Reconnected. Syncing house state...");
          if (typeof window.refreshHouseData === 'function') {
            refreshHouseData(); 
          }
          STATE.wasDisconnected = false;
        }

        // If we were in a call when connection dropped, end it gracefully
        if (typeof CALL !== 'undefined' && CALL.pc && CALL.pc.connectionState === 'failed') {
          endCall(false);
          showToast('CALL ENDED — CONNECTION LOST');
        }
      });
      ws.addEventListener('message', e => { let m; try { m = JSON.parse(e.data); } catch { return; } handleWsEvent(m); });
      ws.addEventListener('close', () => {
        // Show overlay on disconnect
        showReconnectOverlay();

        // If in a call, notify user connection dropped
        if (typeof CALL !== 'undefined' && CALL.pc) showToast('CONNECTION LOST...');
        STATE.wasDisconnected = true;
        
        // Exponential backoff
        _reconnectAttempts++;
        const delay = getReconnectDelay();
        console.log(`[WS] Connection lost. Reconnecting in ${delay/1000}s (attempt ${_reconnectAttempts})...`);
        
        STATE.reconnTimer = setTimeout(connectWS, delay);
      });
      ws.addEventListener('error', () => ws.close());
    }

    let _wsBatch = [];
    let _wsBatchTimer = null;

    function wsSend(type, payload = {}, options = {}) {
      if (!STATE.ws || STATE.ws.readyState !== WebSocket.OPEN) return;

      if (options.batch) {
        // Deduplicate high-frequency updates (keep latest per type/charId)
        if (type === WS_EV.C_CHAR_MOVE) {
          _wsBatch = _wsBatch.filter(m => !(m.type === WS_EV.C_CHAR_MOVE && m.charId === payload.charId));
        }
        _wsBatch.push({ type, ...payload });

        if (!_wsBatchTimer) {
          _wsBatchTimer = setTimeout(() => {
            if (_wsBatch.length > 0) {
              STATE.ws.send(JSON.stringify({ type: WS_EV.BUNDLE, messages: _wsBatch }));
              _wsBatch = [];
            }
            _wsBatchTimer = null;
          }, 50); // 50ms window is perfect for real-time responsiveness
        }
      } else {
        STATE.ws.send(JSON.stringify({ type, ...payload }));
      }
    }

    // P1-I: Wake up and reconnect if mobile OS killed WS while in background
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && (!STATE.ws || (STATE.ws.readyState !== WebSocket.OPEN && STATE.ws.readyState !== WebSocket.CONNECTING))) {
        console.log("[WS] Woke up, reconnecting...");
        connectWS();
      }
    });

    function handleWsEvent(msg) {
      switch (msg.type) {
        case WS_EV.S_MESSAGE_NEW:               return onMessageNew(msg);
        case WS_EV.S_MESSAGE_STATUS:            return onMessageStatus(msg);
        case WS_EV.S_MESSAGE_REACTION:          return onReaction(msg);
        case WS_EV.S_MESSAGE_REACTION_REMOVED:  return onReactionRemoved(msg);
        case WS_EV.S_TYPING:                    return onTyping(msg);
        case WS_EV.S_PRESENCE_UPDATE:           return onPresence(msg);
        case WS_EV.S_PRESENCE_SYNC:             return onPresenceSync(msg);
        case WS_EV.S_EMOJI_UPDATED:             return onEmojiUpdated();
        case WS_EV.S_SPOTIFY_UPDATE:            return onSpotifyUpdate(msg);
        case WS_EV.S_NOTE_ADD:                  return onNoteAdd(msg);
        case WS_EV.S_NOTE_DELETE:               return onNoteDelete(msg);
        case WS_EV.S_CALENDAR_EVENT_ADD:        return onCalendarEventAdd(msg);
        case WS_EV.S_CALENDAR_EVENT_UPDATE:     return onCalendarEventUpdate(msg);
        case WS_EV.S_CALENDAR_EVENT_DELETE:     return onCalendarEventDelete(msg);
        case WS_EV.S_SCHEDULE_BLOCK_ADD:        return onScheduleBlockAdd(msg);
        case WS_EV.S_SCHEDULE_BLOCK_UPDATE:     return onScheduleBlockUpdate(msg);
        case WS_EV.S_SCHEDULE_BLOCK_DELETE:     return onScheduleBlockDelete(msg);
        case WS_EV.S_CALL_OFFER:                return onCallOffer(msg);
        case WS_EV.S_CALL_ANSWER:               return onCallAnswer(msg);
        case WS_EV.S_CALL_ICE:                  return onCallIce(msg);
        case WS_EV.S_CALL_ROOM_STARTED:         return onCallRoomStarted(msg);
        case WS_EV.S_CALL_SEND_OFFER:           return onCallSendOffer(msg);
        case WS_EV.S_CALL_PARTICIPANT_UPDATE:   return onCallParticipantUpdate(msg);
        case WS_EV.S_CALL_ROOM_ENDED:           return onCallRoomEnded();
        case WS_EV.S_CALL_ENDED:                return onCallRoomEnded(); // legacy fallback
        case WS_EV.S_AVATAR_UPDATE:             return typeof onAvatarUpdate === 'function' && onAvatarUpdate(msg);
        case WS_EV.S_TZ_UPDATE:                return onTzUpdate(msg);
        case WS_EV.S_HOUSE_UPDATE:             return typeof onHouseUpdate === 'function' && onHouseUpdate(msg);
        case WS_EV.S_ROOM_UPDATE:              return typeof onRoomUpdate === 'function' && onRoomUpdate(msg);
        case WS_EV.S_FURNITURE_LOCK:           return typeof onFurnitureLock === 'function' && onFurnitureLock(msg); // DISABLED P22-A
        case WS_EV.S_FURNITURE_UNLOCK:         return typeof onFurnitureUnlock === 'function' && onFurnitureUnlock(msg); // DISABLED P22-A
        case WS_EV.S_CHAR_MOVE:               return typeof onCharMove === 'function' && onCharMove(msg); // DISABLED P22-A
        case WS_EV.S_SOCIAL_INTERACTION:        return typeof onSocialInteraction === 'function' && onSocialInteraction(msg); // DISABLED P22-A
        // case WS_EV.S_WALLET_UPDATE:             return typeof WalletManager !== 'undefined' && WalletManager.updateState(msg, false); // DISABLED P22-A
      }
    }
