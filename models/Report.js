const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  postTitle: { type: String, required: true },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reporterName: { type: String, required: true },
  reason: { type: String, required: true, trim: true, maxlength: 2000 },
  status: { type: String, enum: ['open', 'kept', 'removed'], default: 'open' },
  response: { type: String, trim: true, maxlength: 2000, default: '' },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

reportSchema.index({ createdAt: -1 });
module.exports = mongoose.model('Report', reportSchema);
