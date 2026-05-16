/**
 * CURON.EXE — WebSocket Event Manifest (Client)
 * Browser-compatible mirror of server/ws/events.js.
 * Exposes WS_EV as a frozen global — load this before ALL other scripts.
 *
 * Naming convention:
 *   C_ = client → server
 *   S_ = server → client
 */
/* global WS_EV */
const WS_EV = Object.freeze({

  // ── Special ──────────────────────────────────────────────────
  BUNDLE:                    'bundle',

  // ── Messaging ────────────────────────────────────────────────
  C_MESSAGE_SEND:            'message_send',
  C_MESSAGE_READ:            'message_read',
  C_MESSAGE_REACT:           'message_react',
  C_MESSAGE_REACT_REMOVE:    'message_react_remove',
  C_TYPING_START:            'typing_start',
  C_TYPING_STOP:             'typing_stop',

  S_MESSAGE_NEW:             'message_new',
  S_MESSAGE_STATUS:          'message_status',
  S_MESSAGE_REACTION:        'message_reaction',
  S_MESSAGE_REACTION_REMOVED:'message_reaction_removed',
  S_TYPING:                  'typing',

  // ── Presence ─────────────────────────────────────────────────
  C_PRESENCE_HEARTBEAT:      'presence_heartbeat',
  C_PRESENCE_STATE:         'presence_state',         // granular presence (active/idle/away)
  C_PRESENCE_UPDATE:         'presence_update',     // sit/stand state (chair attachment)

  S_PRESENCE_UPDATE:         'presence_update',
  S_PRESENCE_SYNC:           'presence_sync',

  // ── Calls — WebRTC signaling (passthrough, unchanged) ────────
  C_CALL_OFFER:              'call_offer',
  C_CALL_ANSWER:             'call_answer',
  C_CALL_ICE:                'call_ice_candidate',

  S_CALL_OFFER:              'call_offer',
  S_CALL_ANSWER:             'call_answer',
  S_CALL_ICE:                'call_ice_candidate',

  // ── Calls — Persistent room lifecycle ─────────────────────────
  C_CALL_ROOM_START:         'call_room_start',
  C_CALL_JOIN:               'call_room_join',
  C_CALL_LEAVE:              'call_room_leave',
  C_CALL_END_ALL:            'call_room_end_all',

  C_CALL_ROOM_MODIFY:        'call_room_modify',

  S_CALL_ROOM_STARTED:       'call_room_started',
  S_CALL_SEND_OFFER:         'call_send_offer',
  S_CALL_PARTICIPANT_UPDATE: 'call_participant_update',
  S_CALL_ROOM_MODIFIED:      'call_room_modified',
  S_CALL_ROOM_ENDED:         'call_room_ended',

  // ── Calls — Legacy (kept for rollback safety, not actively used) ─
  C_CALL_END:                'call_end',
  S_CALL_ENDED:              'call_ended',

  // ── Avatar & Identity ─────────────────────────────────────────
  C_AVATAR_UPDATE:           'avatar_update',
  C_TZ_UPDATE:               'tz_update',

  S_AVATAR_UPDATE:           'avatar_update',
  S_TZ_UPDATE:               'tz_update',
  S_EMOJI_UPDATED:           'emoji_updated',

  // ── Notes ─────────────────────────────────────────────────────
  S_NOTE_ADD:                'note_add',
  S_NOTE_DELETE:             'note_delete',

  // ── Calendar ──────────────────────────────────────────────────
  S_CALENDAR_EVENT_ADD:      'calendar_event_add',
  S_CALENDAR_EVENT_UPDATE:   'calendar_event_update',
  S_CALENDAR_EVENT_DELETE:   'calendar_event_delete',
  S_SCHEDULE_BLOCK_ADD:      'schedule_block_add',
  S_SCHEDULE_BLOCK_UPDATE:   'schedule_block_update',
  S_SCHEDULE_BLOCK_DELETE:   'schedule_block_delete',

  // ── House — Furniture & Room ──────────────────────────────────
  C_HOUSE_UPDATE:            'house_update',
  C_ROOM_UPDATE:             'room_update',

  S_HOUSE_UPDATE:            'house_update',
  S_ROOM_UPDATE:             'room_update',

  // ── House — Characters ────────────────────────────────────────
  C_CHAR_MOVE:               'char_move',
  S_CHAR_MOVE:               'char_move',

  // ── House — Social ────────────────────────────────────────────
  C_SOCIAL_INTERACTION:      'social_interaction',
  S_SOCIAL_INTERACTION:      'social_interaction',

  // ── House — Room Navigation ────────────────────────────────────
  S_ROOM_CHANGE:             'room_change',

  // ── House — Interaction Lock ───────────────────────────────────
  C_FURNITURE_LOCK:          'furniture_lock',
  C_FURNITURE_UNLOCK:        'furniture_unlock',
  S_FURNITURE_LOCK:          'furniture_lock',
  S_FURNITURE_UNLOCK:        'furniture_unlock',

  // ── Minigames ─────────────────────────────────────────────────
  C_GAME_CHALLENGE:          'game_challenge',
  C_GAME_ACCEPT:             'game_accept',
  C_GAME_DECLINE:            'game_decline',
  S_GAME_CHALLENGE:          'game_challenge',
  S_GAME_START:              'game_start',
  S_GAME_END:                'game_end',
  S_GAME_CANCEL:             'game_cancel',

  // ── Cats ──────────────────────────────────────────────────────
  // DISABLED P22-A (Cats feature removed)
  // S_CAT_HAPPINESS_UPDATE:    'cat_happiness_update',
  // S_CAT_RENAME_PROPOSAL:     'cat_rename_proposal',
  // C_CAT_RENAME_ACCEPT:       'cat_rename_accept',
  // C_CAT_RENAME_DECLINE:      'cat_rename_decline',

  // ── Outfits ───────────────────────────────────────────────────
  S_OUTFIT_GIFT:             'outfit_gift',

  // ── Progression ───────────────────────────────────────────────
  S_MILESTONE_UNLOCKED:      'milestone_unlocked',

  // ── Economy (P2-A, P2-B) ──────────────────────────────────────
  S_WALLET_UPDATE:           'wallet_update',

  // ── Errors ────────────────────────────────────────────────────
  S_ERROR:                   'error',
});
