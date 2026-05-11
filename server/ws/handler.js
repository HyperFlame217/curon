const { WebSocketServer } = require('ws');
const { verify }          = require('../auth');
const dbPromise = require('../db');
const presence            = require('./presence');
const locks               = require('./locks');
const EV                  = require('./events');
const Economy             = require('../economy');
const PresenceSync        = require('../helpers/PresenceSync');

// ── Input Sanitization ───────────────────────────────────────
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*on\w+\s*=[^>]*>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .substring(0, 10000);
}

// ── Persistent call room (singleton — 2-user app) ────────────────────────
const callRoom = {
  active: false,
  participants: new Set(),
  initiatorId: null,
  startedAt: null,
  isVideo: false,
};

function broadcastCallParticipants() {
  const participants = [...callRoom.participants];
  for (const [, s] of presence.sessions) {
    if (s.ws && s.ws.readyState === s.ws.OPEN) {
      s.ws.send(JSON.stringify({ type: EV.S_CALL_PARTICIPANT_UPDATE, participants }));
    }
  }
}

function endCallRoom() {
  callRoom.active = false;
  callRoom.participants = new Set();
  callRoom.initiatorId = null;
  callRoom.startedAt = null;
  callRoom.isVideo = false;
  for (const [, s] of presence.sessions) {
    if (s.ws && s.ws.readyState === s.ws.OPEN) {
      s.ws.send(JSON.stringify({ type: EV.S_CALL_ROOM_ENDED }));
    }
  }
}

function send(ws, type, payload = {}) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

// ═════════════════════════════════════════════════════════════════════
// GLOBAL STATE (accessed inside setup())
// ═════════════════════════════════════════════════════════════════════
let _wss = null; // WebSocket server instance for broadcasting

function broadcastPresence(userId, status) {
  const other = presence.getOtherWs(userId);
  if (other) send(other, EV.S_PRESENCE_UPDATE, { userId, status });
  
  // Also broadcast to presence sync registry if wss is available
  if (_wss) {
    PresenceSync.updatePresence(userId, status);
    PresenceSync.broadcastPresenceSync(userId, status, _wss);
  }
}

function setup(server) {
  const wss = new WebSocketServer({ server, maxPayload: 4 * 1024 * 1024 }); // 4MB — allows avatar images
  _wss = wss; // Store global reference for broadcastPresence()

  wss.on('connection', async (ws, req) => {
    // ── Auth via ?token= query param ────────────────────────
    const url   = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const user  = verify(token);

    if (!user) { ws.close(4001, 'Unauthorized'); return; }

    const db = await dbPromise;

    ws.userId   = user.id;
    ws.username = user.username;
    ws.isAlive  = true;

    // ── Register presence ───────────────────────────────────
    presence.connect(user.id, ws, broadcastPresence);

    // Send the other user's current presence to this new client
    const otherUser = db.prepare('SELECT id FROM users WHERE id != ?').get(user.id);
    if (otherUser) {
      const s = presence.sessions.get(otherUser.id);
      const status = s ? s.status : 'offline';
      send(ws, EV.S_PRESENCE_UPDATE, { userId: otherUser.id, status });
    }

    // Sync active call room state if a call is already in progress
    if (callRoom.active) {
      send(ws, EV.S_CALL_ROOM_STARTED, {
        initiatorId: callRoom.initiatorId,
        startedAt: callRoom.startedAt,
        isVideo: callRoom.isVideo,
        participants: [...callRoom.participants],
      });
    }

    console.log(`[WS] + ${user.username}`);

    // Cache userAId once at connection time (lowest user id = slot A)
    const userARow = db.prepare('SELECT MIN(id) as min_id FROM users').get();
    const userAId  = userARow?.min_id;
    const senderIsA = user.id === userAId;

    // ── Message handler ─────────────────────────────────────
    const handleOne = (msg) => {
      if (!msg || !msg.type) return;
      
      // Support bundled messages to reduce processing overhead
      if (msg.type === 'bundle' && Array.isArray(msg.messages)) {
        msg.messages.forEach(handleOne);
        return;
      }

      presence.recordActivity(user.id, broadcastPresence);

      switch (msg.type) {

        case EV.C_MESSAGE_SEND: {
          const { content, media_id, reply_to_id } = msg;
          if (!content && !media_id)
            return send(ws, EV.S_ERROR, { message: 'Invalid message data' });

          // Sanitize content server-side (defense in depth)
          const safeContent = content ? sanitizeText(content) : null;

          // Validate reply_to_id if provided
          const validReplyId = reply_to_id
            ? db.prepare('SELECT id FROM messages WHERE id = ?').get(reply_to_id)?.id || null
            : null;

          const result = db.prepare(`
            INSERT INTO messages
              (sender_id, content, media_id, reply_to_id)
            VALUES (?, ?, ?, ?)
          `).run(
            user.id,
            safeContent,
            media_id || null,
            validReplyId
          );

          const msgId     = result.lastInsertRowid;
          const createdAt = Math.floor(Date.now() / 1000);

          // Echo to sender
          send(ws, EV.S_MESSAGE_NEW, {
            id: msgId, sender_id: user.id, created_at: createdAt,
            content: content || null,
            media_id: media_id || null, reactions: [],
            reply_to_id: validReplyId,
          });

          // ── Economy: Chat Reward (P2-B) ─────────────────────────
          // Economy.processChatMessage(user.id).then(newWallet => { // DISABLED P22-A
          //   if (newWallet) {
          //     send(ws, EV.S_WALLET_UPDATE, newWallet);
          //   }
          // }).catch(err => console.error('[Economy] WS Reward error:', err));

          // Forward to recipient
          const other = presence.getOtherWs(user.id);
          if (other) {
            send(other, EV.S_MESSAGE_NEW, {
              id: msgId, sender_id: user.id, created_at: createdAt,
              content: content || null,
              media_id: media_id || null, reactions: [],
              reply_to_id: validReplyId,
            });
            // Recipient is online — mark as delivered
            send(ws, EV.S_MESSAGE_STATUS, { id: msgId, status: 'delivered' });
          } else {
            send(ws, EV.S_MESSAGE_STATUS, { id: msgId, status: 'sent' });
          }
          break;
        }

        case EV.C_MESSAGE_REACT: {
          const { message_id, emoji } = msg;
          if (!message_id || !emoji || typeof emoji !== 'string' || emoji.length > 64) break;
          const msgExists = db.prepare('SELECT id FROM messages WHERE id = ?').get(message_id);
          if (!msgExists) break;
          // Only broadcast if the reaction is new (not a duplicate)
          const result = db.prepare(
            'INSERT OR IGNORE INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)'
          ).run(message_id, user.id, emoji);
          if (result.changes === 0) break; // already existed — do nothing
          const payload = { message_id, user_id: user.id, emoji };
          send(ws, EV.S_MESSAGE_REACTION, payload);
          const other = presence.getOtherWs(user.id);
          if (other) send(other, EV.S_MESSAGE_REACTION, payload);
          break;
        }

        case EV.C_MESSAGE_REACT_REMOVE: {
          const { message_id, emoji } = msg;
          if (!message_id || !emoji) break;
          db.prepare(
            'DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?'
          ).run(message_id, user.id, emoji);
          const payload = { message_id, user_id: user.id, emoji };
          send(ws, EV.S_MESSAGE_REACTION_REMOVED, payload);
          const other = presence.getOtherWs(user.id);
          if (other) send(other, EV.S_MESSAGE_REACTION_REMOVED, payload);
          break;
        }

        case EV.C_TYPING_START: {
          const other = presence.getOtherWs(user.id);
          if (other) send(other, EV.S_TYPING, { userId: user.id, typing: true });
          break;
        }

        case EV.C_TYPING_STOP: {
          const other = presence.getOtherWs(user.id);
          if (other) send(other, EV.S_TYPING, { userId: user.id, typing: false });
          break;
        }

        // ── Presence State (granular: active/idle/away) ─────────────────────
        case EV.C_PRESENCE_STATE: {
          const { state } = msg;
          // Validate state - must be one of: active, idle, away
          if (state && ['active', 'idle', 'away'].includes(state)) {
            // Update presence registry
            PresenceSync.updatePresence(user.id, state);
            // Broadcast to partner
            PresenceSync.broadcastPresenceSync(user.id, state, _wss);
          }
          break;
        }

        // ── Presence Update (sit/stand chair state - original use) ───────
        case EV.C_PRESENCE_UPDATE: {
          // Original use: chair attachment state - just log for now
          break;
        }

        case EV.C_MESSAGE_READ:
        case EV.C_PRESENCE_HEARTBEAT: {
          // Identify messages that are about to be marked as read
          const toRead = db.prepare(`SELECT id FROM messages WHERE read_at IS NULL AND sender_id != ?`).all(user.id);
          if (toRead.length > 0) {
            db.prepare(`UPDATE messages SET read_at = strftime('%s','now') WHERE read_at IS NULL AND sender_id != ?`).run(user.id);
            const other = presence.getOtherWs(user.id);
            toRead.forEach(m => {
              const payload = { id: m.id, status: 'read' };
              send(ws, EV.S_MESSAGE_STATUS, payload);
              if (other) send(other, EV.S_MESSAGE_STATUS, payload);
            });
          }
          break;
        }

        // ── WebRTC signaling passthrough (unchanged) ──────────────
        case EV.C_CALL_OFFER:
        case EV.C_CALL_ANSWER:
        case EV.C_CALL_ICE: {
          const other = presence.getOtherWs(user.id);
          if (other) send(other, msg.type, { from: user.id, ...msg });
          break;
        }

        // ── Persistent room lifecycle ──────────────────────────────
        case EV.C_CALL_ROOM_START: {
          if (callRoom.active) {
            // Room already exists — send current state to caller
            send(ws, EV.S_CALL_ROOM_STARTED, {
              initiatorId: callRoom.initiatorId,
              startedAt: callRoom.startedAt,
              isVideo: callRoom.isVideo,
              participants: [...callRoom.participants],
            });
            break;
          }
          callRoom.active = true;
          callRoom.initiatorId = user.id;
          callRoom.startedAt = Date.now();
          callRoom.isVideo = !!msg.isVideo;
          callRoom.participants = new Set([user.id]);
          const roomPayload = {
            initiatorId: user.id,
            startedAt: callRoom.startedAt,
            isVideo: callRoom.isVideo,
            participants: [...callRoom.participants],
          };
          send(ws, EV.S_CALL_ROOM_STARTED, roomPayload);
          const otherR = presence.getOtherWs(user.id);
          if (otherR) send(otherR, EV.S_CALL_ROOM_STARTED, roomPayload);
          break;
        }

        case EV.C_CALL_JOIN: {
          if (!callRoom.active) break;
          callRoom.participants.add(user.id);
          broadcastCallParticipants();
          // Ask the peer already in the room to send a WebRTC offer
          const inPeerId = [...callRoom.participants].find(id => id !== user.id);
          if (inPeerId) {
            const peerWs = presence.getWsById(inPeerId);
            if (peerWs) send(peerWs, EV.S_CALL_SEND_OFFER, { to: user.id });
          }
          break;
        }

        case EV.C_CALL_LEAVE: {
          callRoom.participants.delete(user.id);
          if (callRoom.participants.size === 0) {
            endCallRoom();
          } else {
            broadcastCallParticipants();
          }
          break;
        }

        case EV.C_CALL_END_ALL: {
          endCallRoom();
          break;
        }

        // Legacy — kept for rollback safety
        case EV.C_CALL_END: {
          const other = presence.getOtherWs(user.id);
          if (other) send(other, EV.S_CALL_ENDED, { from: user.id });
          break;
        }

        case EV.C_AVATAR_UPDATE: {
          const other = presence.getOtherWs(user.id);
          if (other) send(other, EV.S_AVATAR_UPDATE, { userId: user.id, img: msg.img });
          break;
        }

        case EV.C_TZ_UPDATE: {
          const other = presence.getOtherWs(user.id);
          if (other) send(other, EV.S_TZ_UPDATE, { userId: user.id, tz: msg.tz });
          break;
        }
        // case EV.C_HOUSE_UPDATE: { // DISABLED P22-A
        //   const { action, item } = msg;
        //   if (!action || !item || !item.id) break;
        //   const ownerId = locks.getLockOwner(item.id);
        //   if (ownerId && ownerId !== user.id) {
        //     console.log(`[Locks] Blocking C_HOUSE_UPDATE for ${item.id} from ${user.username} (locked by other)`);
        //     send(ws, EV.S_ERROR, { message: "Item is currently being moved by your partner." });
        //     break;
        //   }
        //   try {
        //     if (action === 'place') {
        //       db.prepare(`INSERT INTO houses (id, room_id, item_id, x, y, dir, parent_id, slot_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET x = excluded.x, y = excluded.y, dir = excluded.dir, room_id = excluded.room_id, parent_id = excluded.parent_id, slot_index = excluded.slot_index`).run(item.id, item.room_id || 'default_room', item.item_id || item.config_id, Math.floor(Number(item.x) || 0), Math.floor(Number(item.y) || 0), Math.floor(Number(item.dir) || 0), item.parent_id || null, item.slot_index !== undefined ? item.slot_index : null);
        //     } else if (action === 'remove') { db.prepare('DELETE FROM houses WHERE id = ?').run(item.id); }
        //   } catch (e) { console.error('[WS/House] Save failed:', e); }
        //   const other = presence.getOtherWs(user.id);
        //   if (other) send(other, EV.S_HOUSE_UPDATE, msg);
        //   break;
        // }
        // case EV.C_ROOM_UPDATE: { // DISABLED P22-A
        //   const { id, wall_sprite, floor_sprite } = msg;
        //   if (!id) break;
        //   try {
        //     const existing = db.prepare('SELECT id FROM house_rooms WHERE id = ?').get(id);
        //     if (existing) {
        //       if (wall_sprite !== undefined) db.prepare('UPDATE house_rooms SET wall_sprite = ? WHERE id = ?').run(wall_sprite, id);
        //       if (floor_sprite !== undefined) db.prepare('UPDATE house_rooms SET floor_sprite = ? WHERE id = ?').run(floor_sprite, id);
        //     } else { db.prepare('INSERT INTO house_rooms (id, wall_sprite, floor_sprite) VALUES (?, ?, ?)').run(id, wall_sprite || null, floor_sprite || null); }
        //   } catch (e) { console.error('[WS/Room] Save failed:', e); }
        //   const other = presence.getOtherWs(user.id);
        //   if (other) send(other, EV.S_ROOM_UPDATE, msg);
        //   break;
        // }
        // case EV.C_CHAR_MOVE: { // DISABLED P22-A
        //   const other = presence.getOtherWs(user.id);
        //   if (other) send(other, EV.S_CHAR_MOVE, { userId: user.id, x: msg.x, y: msg.y, charId: msg.charId });
        //   break;
        // }
        // case EV.C_FURNITURE_LOCK: { // DISABLED P22-A
        //   const { itemId } = msg;
        //   if (!itemId) break;
        //   const success = locks.acquireLock(itemId, user.id);
        //   if (success) { const other = presence.getOtherWs(user.id); if (other) send(other, EV.S_FURNITURE_LOCK, { itemId, userId: user.id }); }
        //   break;
        // }
        // case EV.C_FURNITURE_UNLOCK: { // DISABLED P22-A
        //   const { itemId } = msg;
        //   if (!itemId) break;
        //   const success = locks.releaseLock(itemId, user.id);
        //   if (success) { const other = presence.getOtherWs(user.id); if (other) send(other, EV.S_FURNITURE_UNLOCK, { itemId, userId: user.id }); }
        //   break;
        // }
        // case EV.C_SOCIAL_INTERACTION: { // DISABLED P22-A
        //   const other = presence.getOtherWs(user.id);
        //   if (other) send(other, EV.S_SOCIAL_INTERACTION, { userId: user.id, ...msg });
        //   break;
        // }

        default:
          send(ws, EV.S_ERROR, { message: `Unknown event: ${msg.type}` });
      }
    };

    ws.on('message', (raw) => {
      try { handleOne(JSON.parse(raw)); }
      catch (e) { 
        console.error('[WS] Message parse/handle failed:', e.message);
        send(ws, EV.S_ERROR, { message: 'Invalid message format' }); 
      }
    });

    ws.on('close', () => {
      // 1. Release locks held by user and inform partner // DISABLED P22-A (House feature)
      // const releasedIds = locks.releaseAllLocksForUser(user.id);
      // if (releasedIds.length > 0) {
      //   const other = presence.getOtherWs(user.id);
      //   if (other) {
      //     releasedIds.forEach(itemId => {
      //       send(other, EV.S_FURNITURE_UNLOCK, { itemId, userId: user.id });
      //     });
      //   }
      // }

      // 2. Handle call room departure on disconnect
      if (callRoom.active && callRoom.participants.has(user.id)) {
        callRoom.participants.delete(user.id);
        if (callRoom.participants.size === 0) {
          endCallRoom();
        } else {
          broadcastCallParticipants();
        }
      }

      // 3. Teardown presence
      presence.disconnect(user.id, broadcastPresence);
      
      // 4. Broadcast offline to partner
      PresenceSync.broadcastOffline(user.id, _wss);
      console.log(`[WS] - ${user.username}`);
    });

    ws.on('error', (err) => console.error(`[WS] error (${user.username}):`, err.message));
    ws.on('pong',  () => { ws.isAlive = true; });
  });

  // Ping every 30s to detect dead connections
  setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) { presence.disconnect(ws.userId, broadcastPresence); return ws.terminate(); }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);
}

module.exports = setup;
