const { WebSocketServer } = require('ws');
const { verify }          = require('../auth');
const dbPromise = require('../db');
const { isValidCipherBundle } = require('../crypto');
const presence            = require('./presence');
const EV                  = require('./events');

function send(ws, type, payload = {}) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function broadcastPresence(userId, status) {
  const other = presence.getOtherWs(userId);
  if (other) send(other, EV.S_PRESENCE_UPDATE, { userId, status });
}

function setup(server) {
  const wss = new WebSocketServer({ server, maxPayload: 4 * 1024 * 1024 }); // 4MB — allows avatar images

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

    console.log(`[WS] + ${user.username}`);

    // Cache userAId once at connection time (lowest user id = slot A)
    const userARow = db.prepare('SELECT MIN(id) as min_id FROM users').get();
    const userAId  = userARow?.min_id;
    const senderIsA = user.id === userAId;

    // ── Message handler ─────────────────────────────────────
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); }
      catch { return send(ws, EV.S_ERROR, { message: 'Invalid JSON' }); }

      presence.recordActivity(user.id, broadcastPresence);

      switch (msg.type) {

        case EV.C_MESSAGE_SEND: {
          const { cipher, media_id, reply_to_id } = msg;
          if (!isValidCipherBundle(cipher))
            return send(ws, EV.S_ERROR, { message: 'Invalid cipher bundle' });

          // Validate reply_to_id if provided
          const validReplyId = reply_to_id
            ? db.prepare('SELECT id FROM messages WHERE id = ?').get(reply_to_id)?.id || null
            : null;

          const result = db.prepare(`
            INSERT INTO messages
              (sender_id, encrypted_content_a, encrypted_content_b,
               encrypted_key_a, encrypted_key_b, iv, media_id, reply_to_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            user.id,
            cipher.encrypted_content_a, cipher.encrypted_content_b,
            cipher.encrypted_key_a,     cipher.encrypted_key_b,
            cipher.iv, media_id || null, validReplyId
          );

          const msgId     = result.lastInsertRowid;
          const createdAt = Math.floor(Date.now() / 1000);

          // Echo to sender with THEIR slot (senderIsA cached at connection time)
          send(ws, EV.S_MESSAGE_NEW, {
            id: msgId, sender_id: user.id, created_at: createdAt,
            encrypted_content: senderIsA ? cipher.encrypted_content_a : cipher.encrypted_content_b,
            encrypted_key:     senderIsA ? cipher.encrypted_key_a     : cipher.encrypted_key_b,
            iv: cipher.iv, media_id: media_id || null, reactions: [],
            reply_to_id: validReplyId,
          });

          // Forward to recipient with THEIR slot
          const other = presence.getOtherWs(user.id);
          if (other) {
            send(other, EV.S_MESSAGE_NEW, {
              id: msgId, sender_id: user.id, created_at: createdAt,
              encrypted_content: senderIsA ? cipher.encrypted_content_b : cipher.encrypted_content_a,
              encrypted_key:     senderIsA ? cipher.encrypted_key_b     : cipher.encrypted_key_a,
              iv: cipher.iv, media_id: media_id || null, reactions: [],
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

        case EV.C_PRESENCE_HEARTBEAT:
          // Also mark any unread messages from the other user as read
          db.prepare(`UPDATE messages SET read_at = strftime('%s','now') WHERE read_at IS NULL AND sender_id != ?`).run(user.id);
          const unread = db.prepare(`SELECT id FROM messages WHERE sender_id != ? AND read_at IS NOT NULL`).all(user.id);
          unread.forEach(m => {
            send(ws, EV.S_MESSAGE_STATUS, { id: m.id, status: 'read' });
            const other = presence.getOtherWs(user.id);
            if (other) send(other, EV.S_MESSAGE_STATUS, { id: m.id, status: 'read' });
          });
          break; // recordActivity already called above

        case EV.C_CALL_OFFER:
        case EV.C_CALL_ANSWER:
        case EV.C_CALL_ICE: {
          const other = presence.getOtherWs(user.id);
          if (other) send(other, msg.type, { from: user.id, ...msg });
          break;
        }

        case EV.C_CALL_END: {
          const other = presence.getOtherWs(user.id);
          if (other) send(other, EV.S_CALL_ENDED, { from: user.id });
          presence.setStatus(user.id, 'online', broadcastPresence);
          break;
        }

        case 'avatar_update': {
          const other = presence.getOtherWs(user.id);
          if (other) send(other, 'avatar_update', { userId: user.id, img: msg.img });
          break;
        }

        case 'tz_update': {
          const other = presence.getOtherWs(user.id);
          if (other) send(other, 'tz_update', { userId: user.id, tz: msg.tz });
          break;
        }
        case EV.C_HOUSE_UPDATE: {
          const { action, item } = msg;
          if (!action || !item || !item.id) break;
          try {
            if (action === 'place') {
              const existing = db.prepare('SELECT id FROM houses WHERE id = ?').get(item.id);
              if (existing) {
                db.prepare('UPDATE houses SET x = ?, y = ?, dir = ?, room_id = ?, parent_id = ? WHERE id = ?')
                  .run(Math.floor(Number(item.x) || 0), Math.floor(Number(item.y) || 0), Math.floor(Number(item.dir) || 0), item.room_id || 'default_room', item.parent_id || null, item.id);
              } else {
                db.prepare('INSERT INTO houses (id, room_id, item_id, x, y, dir, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
                  .run(item.id, item.room_id || 'default_room', item.item_id || item.config_id, Math.floor(Number(item.x) || 0), Math.floor(Number(item.y) || 0), Math.floor(Number(item.dir) || 0), item.parent_id || null);
              }
            } else if (action === 'remove') {
              db.prepare('DELETE FROM houses WHERE id = ?').run(item.id);
            }
          } catch (e) { console.error('[WS/House] Save failed:', e); }

          const other = presence.getOtherWs(user.id);
          if (other) send(other, EV.S_HOUSE_UPDATE, msg);
          break;
        }
        case EV.C_CHAR_MOVE: {
          const other = presence.getOtherWs(user.id);
          if (other) send(other, EV.S_CHAR_MOVE, { 
            userId: user.id, 
            x: msg.x, 
            y: msg.y, 
            charId: msg.charId 
          });
          break;
        }

        case 'social_interaction': {
          const other = presence.getOtherWs(user.id);
          if (other) send(other, 'social_interaction', { userId: user.id, ...msg });
          break;
        }

        default:
          send(ws, EV.S_ERROR, { message: `Unknown event: ${msg.type}` });
      }
    });

    ws.on('close', () => {
      presence.disconnect(user.id, broadcastPresence);
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
