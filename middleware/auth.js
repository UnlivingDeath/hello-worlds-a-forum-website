const User = require('../models/User');

function attachUser(req, res, next) {
  if (!req.session.user) {
    res.locals.user = null;
    return next();
  }
  User.findById(req.session.user.id).select('_id username role profileVisibility').lean()
    .then((user) => {
      req.currentUser = user || null;
      res.locals.user = user ? { id: user._id.toString(), username: user.username, role: user.role } : null;
      next();
    }).catch(next);
}

function requireAuth(req, res, next) {
  if (!req.session.user || !req.currentUser) {
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.currentUser || !roles.includes(req.currentUser.role)) return res.status(403).send('Restricted page');
    next();
  };
}

function isModerator(user) {
  return !!user && (user.role === 'admin' || user.role === 'creator');
}

module.exports = { attachUser, requireAuth, requireRole, isModerator };
