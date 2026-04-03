/**
 * /gifs — Giphy proxy
 * Proxies requests through the server so the API key never goes to the client.
 */
const router          = require('express').Router();
const { requireAuth } = require('../auth');

const API_KEY = () => process.env.GIPHY_API_KEY || '';
const BASE    = 'https://api.giphy.com/v1/gifs';

async function giphyFetch(endpoint, params) {
  const url = new URL(`${BASE}${endpoint}`);
  url.searchParams.set('api_key', API_KEY());
  url.searchParams.set('limit', '24');
  url.searchParams.set('rating', 'pg-13');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Giphy error ${res.status}`);
  return res.json();
}

// GET /gifs/trending
router.get('/trending', requireAuth, async (_req, res) => {
  try {
    const data = await giphyFetch('/trending', {});
    res.json(normalise(data));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /gifs/search?q=cats
router.get('/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const data = await giphyFetch('/search', { q });
    res.json(normalise(data));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Normalise Giphy response to a simple array of { id, url, preview }
function normalise(data) {
  return (data.data || []).map(g => ({
    id:      g.id,
    url:     g.images?.original?.url     || '',
    preview: g.images?.fixed_height_small?.url || g.images?.preview_gif?.url || '',
    width:   parseInt(g.images?.fixed_height_small?.width  || 100),
    height:  parseInt(g.images?.fixed_height_small?.height || 100),
    title:   g.title || '',
  }));
}

module.exports = router;
