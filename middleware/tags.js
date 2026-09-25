const CURATED_TAGS = ['react', 'node', 'express', 'mongodb', 'javascript', 'css', 'homework', 'help'];

function attachAvailableTags(req, res, next) {
    res.locals.availableTags = CURATED_TAGS;
  next();
}

module.exports = attachAvailableTags;