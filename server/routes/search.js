const router          = require('express').Router();
const dbPromise       = require('../db');
const { requireAuth } = require('../auth');

// ── GLOBAL SEARCH ───────────────────────────────────────────
router.get('/chat/search', requireAuth, async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.json([]);

  const db = await dbPromise;
  try {
    // Transform query for prefix matching (e.g. "hel" -> "hel*")
    // This allows searching for partial words.
    const ftsQuery = query.split(/\s+/).filter(x => x).map(q => `${q}*`).join(' ');

    const rows = db.prepare(`
      SELECT 
        m.id, 
        m.sender_id, 
        m.created_at,
        u.username,
        snippet(messages_fts, '<mark class="search-hit">', '</mark>', '...', 0, 10) as snippet
      FROM messages_fts f
      JOIN messages m ON m.id = f.rowid
      JOIN users u ON u.id = m.sender_id
      WHERE f.content MATCH ?
      ORDER BY m.created_at DESC
      LIMIT 100
    `).all(ftsQuery);

    res.json(rows);
  } catch (e) {
    console.error('[Search] Error:', e.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
