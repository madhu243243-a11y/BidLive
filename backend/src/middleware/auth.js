const jwt = require('jsonwebtoken');
const { ALLOWED_ROLES, parsePositiveId } = require('../utils/validation');

function authenticateToken(req, res, next) {
  const authorization = req.get('authorization') || '';
  const parts = authorization.split(' ');
  const [scheme, token] = parts;
  if (parts.length !== 2 || scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const id = parsePositiveId(claims.sub);
    if (id === null || typeof claims.name !== 'string' || !ALLOWED_ROLES.has(claims.role)) throw new Error('Invalid token claims.');
    req.user = { id, name: claims.name, email: claims.email, role: claims.role };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `${role[0].toUpperCase()}${role.slice(1)} access is required.` });
    }
    return next();
  };
}

module.exports = { authenticateToken, requireRole };

