const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
};

const requireOwner = (req, res, next) => {
  if (req.user.userType !== 'stadium_owner')
    return res.status(403).json({ error: 'Only stadium owners can do this' });
  next();
};

module.exports = { authenticate, requireOwner };
