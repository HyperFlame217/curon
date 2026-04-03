const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuth } = require('../auth');

/**
 * GET /house
 * Fetch the current state of the shared house.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const d = await db;
    const items = d.prepare('SELECT * FROM houses').all();
    const rooms = d.prepare('SELECT * FROM house_rooms').all();
    // Rename to 'placement' so the client's HOUSE_STATE.placement matches
    res.json({ placement: items, rooms: rooms }); 
  } catch (err) {
    console.error('[GET /house] Failed:', err);
    res.status(500).json({ error: 'Failed to fetch house state' });
  }
});

/**
 * POST /house/update
 * Add, move, or remove a piece of furniture.
 * This is a simplified "bulk sync" or "upsert" endpoint for now.
 */
router.post('/update', requireAuth, async (req, res) => {
  const { action, item } = req.body;
  
  try {
    const d = await db;
    if (action === 'place') {
      // Upsert or insert new 
      const existing = d.prepare('SELECT id FROM houses WHERE id = ?').get(item.id);
    try {
      if (existing) {
        d.prepare('UPDATE houses SET x = ?, y = ?, dir = ?, room_id = ?, parent_id = ?, slot_index = ? WHERE id = ?')
          .run(
            Math.floor(Number(item.x) || 0), 
            Math.floor(Number(item.y) || 0), 
            Math.floor(Number(item.dir) || 0), 
            String(item.room_id || 'default_room'), 
            item.parent_id ? String(item.parent_id) : null, 
            item.slot_index !== undefined ? item.slot_index : null,
            String(item.id)
          );
      } else {
        d.prepare('INSERT INTO houses (id, room_id, item_id, x, y, dir, parent_id, slot_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(
            String(item.id), 
            String(item.room_id || 'default_room'), 
            String(item.item_id), 
            Math.floor(Number(item.x) || 0), 
            Math.floor(Number(item.y) || 0), 
            Math.floor(Number(item.dir) || 0), 
            item.parent_id ? String(item.parent_id) : null,
            item.slot_index !== undefined ? item.slot_index : null
          );
      }
    } catch (e) {
      console.error("[POST /house/update] Mismatch Data:", JSON.stringify(item));
      throw e;
    }
    } else if (action === 'remove') {
      d.prepare('DELETE FROM houses WHERE id = ?').run(item.id);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[POST /house/update] Failed:', err);
    res.status(500).json({ error: 'Failed to update house state' });
  }
});

/**
 * POST /house/room
 * Update room-level textures (tiles, wallpaper).
 */
router.post('/room', requireAuth, async (req, res) => {
  const { id, wall_sprite, floor_sprite } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing room ID' });

  try {
    const d = await db;
    const existing = d.prepare('SELECT id FROM house_rooms WHERE id = ?').get(id);

    if (existing) {
      d.prepare('UPDATE house_rooms SET wall_sprite = ?, floor_sprite = ?, updated_at = (strftime(\'%s\',\'now\')) WHERE id = ?')
        .run(wall_sprite || null, floor_sprite || null, id);
    } else {
      d.prepare('INSERT INTO house_rooms (id, wall_sprite, floor_sprite) VALUES (?, ?, ?)')
        .run(id, wall_sprite || null, floor_sprite || null);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[POST /house/room] Failed:', err);
    res.status(500).json({ error: 'Failed to save room settings' });
  }
});

module.exports = router;
