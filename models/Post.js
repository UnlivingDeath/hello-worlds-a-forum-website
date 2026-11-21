const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    postType: { type: String, enum: ['discussion', 'poll', 'question'], default: 'discussion' },
    questionState: { type: String, enum: ['unsolved', 'solved'], default: undefined },
    isPinned: { type: Boolean, default: false },
    isMain: { type: Boolean, default: false },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    body: {
      type: String,
      trim: true,
      maxlength: 10000,
      default: '',
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    commentCount: {
      type: Number,
      default: 0,
    },
    tags: {
      type: [String],
      default: [],
    },
    score: {
      type: Number,
      default: 0,
    },
    votes: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        value: { type: Number, enum: [1, -1] },
      },
    ],
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },    
    editedAt: {
      type: Date,
      default: null,
    },
    commentsDisabled: { type: Boolean, default: false },
    poll: {
      question: { type: String, trim: true, maxlength: 200 },
      options: [{ title: { type: String, trim: true, maxlength: 100 }, votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] }],
    },
  },


  { timestamps: true }
);


postSchema.index({ title: 'text', body: 'text' });
postSchema.index({ isPinned: 1, isMain: 1, createdAt: 1 });

module.exports = mongoose.model('Post', postSchema);
