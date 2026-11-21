const { TAGS, SPECIAL_TAGS } = require('../utils/tag-taxonomy');

function attachAvailableTags(req, res, next) {
    res.locals.availableTags = TAGS;
    res.locals.availableTagFilters = [...SPECIAL_TAGS, ...TAGS];
  next();
}

module.exports = attachAvailableTags;
