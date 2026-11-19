const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 20000 },
    code: { type: String, maxlength: 10000 },
    sources: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    profileSources: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    voteSummary: {
      type: new mongoose.Schema({
        averagePositivePercent: { type: Number, min: 0, max: 100, required: true },
        ratedPostCount: { type: Number, min: 1, required: true },
        citedPostCount: { type: Number, min: 1, required: true },
      }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true }
);

const chatConversationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 120 },
    mode: { type: String, enum: ['code-review', 'qna', 'post-assistant'], required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
    messages: { type: [messageSchema], default: [] },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true }
);

chatConversationSchema.index({ owner: 1, updatedAt: -1 });

module.exports = mongoose.model('ChatConversation', chatConversationSchema);
