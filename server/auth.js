const jwt = require('jsonwebtoken');

const SECRET = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not set in .env');
  return process.env.JWT_SECRET;
};

function sign(payload) {
  return jwt.sign(payload, SECRET(), { expiresIn: '7d' });
}

function verify(token) {
  try { return jwt.verify(token, SECRET()); }
  catch { return null; }
}

/** Express middleware — attaches req.user or sends 401 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user   = token ? verify(token) : null;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

module.exports = { sign, verify, requireAuth };
