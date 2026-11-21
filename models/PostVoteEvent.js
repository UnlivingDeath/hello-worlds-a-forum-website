const mongoose = require('mongoose');

const postVoteEventSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  source: { type: String, enum: ['post', 'poll'], default: 'post' },
  direction: { type: String, enum: ['upvote', 'downvote', 'remove', 'poll'], required: true },
}, { timestamps: true });

postVoteEventSchema.index({ createdAt: 1, post: 1 });
postVoteEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });
module.exports = mongoose.model('PostVoteEvent', postVoteEventSchema);
