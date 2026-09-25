function attachUser(req, res, next) {
  res.locals.user = req.session.user || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

module.exports = { attachUser, requireAuth };
