    // ════════════════════════════════════════════════════════════
    //  WEBSOCKET
    // ════════════════════════════════════════════════════════════
    function connectWS() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/?token=${encodeURIComponent(STATE.token)}`);
      STATE.ws = ws;

      ws.addEventListener('open', () => {
        if (STATE.reconnTimer) { clearTimeout(STATE.reconnTimer); STATE.reconnTimer = null; }
        // If we were in a call when connection dropped, end it gracefully
        if (CALL.pc && CALL.pc.connectionState === 'failed') {
          endCall(false);
          showToast('CALL ENDED — CONNECTION LOST');
        }
      });
      ws.addEventListener('message', e => { let m; try { m = JSON.parse(e.data); } catch { return; } handleWsEvent(m); });
      ws.addEventListener('close', () => {
        // If in a call, notify user connection dropped
        if (CALL.pc) showToast('CONNECTION LOST...');
        STATE.reconnTimer = setTimeout(connectWS, 3000);
      });
      ws.addEventListener('error', () => ws.close());
    }

    function wsSend(type, payload = {}) {
      if (STATE.ws && STATE.ws.readyState === WebSocket.OPEN)
        STATE.ws.send(JSON.stringify({ type, ...payload }));
    }

    setInterval(() => wsSend('presence_heartbeat'), 30000);

    function handleWsEvent(msg) {
      switch (msg.type) {
        case 'message_new': return onMessageNew(msg);
        case 'message_status': return onMessageStatus(msg);
        case 'message_reaction': return onReaction(msg);
        case 'message_reaction_removed': return onReactionRemoved(msg);
        case 'typing': return onTyping(msg);
        case 'presence_update': return onPresence(msg);
        case 'emoji_updated': return onEmojiUpdated();
        case 'spotify_update': return onSpotifyUpdate(msg);
        case 'note_add': return onNoteAdd(msg);
        case 'note_delete': return onNoteDelete(msg);
        case 'calendar_event_add': return onCalendarEventAdd(msg);
        case 'calendar_event_update': return onCalendarEventUpdate(msg);
        case 'calendar_event_delete': return onCalendarEventDelete(msg);
        case 'schedule_block_add': return onScheduleBlockAdd(msg);
        case 'schedule_block_update': return onScheduleBlockUpdate(msg);
        case 'schedule_block_delete': return onScheduleBlockDelete(msg);
        case 'call_offer': return onCallOffer(msg);
        case 'call_answer': return onCallAnswer(msg);
        case 'call_ice_candidate': return onCallIce(msg);
        case 'call_ended': return onCallEnded();
        case 'avatar_update': return onAvatarUpdate(msg);
        case 'tz_update': return onTzUpdate(msg);
        case 'house_update': return onHouseUpdate(msg);
        case 'char_move': return onCharMove(msg);
        case 'social_interaction': return onSocialInteraction(msg);
        case 'room_update': return typeof onRoomUpdate === 'function' && onRoomUpdate(msg);
      }
    }
