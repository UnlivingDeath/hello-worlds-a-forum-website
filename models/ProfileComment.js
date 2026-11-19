const mongoose = require('mongoose');

const profileCommentSchema = new mongoose.Schema({
  profile: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String, required: true },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
}, { timestamps: true });

module.exports = mongoose.model('ProfileComment', profileCommentSchema);
