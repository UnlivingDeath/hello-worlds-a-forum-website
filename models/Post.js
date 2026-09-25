const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10000,
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
  },


  { timestamps: true }
);


postSchema.index({ title: 'text', body: 'text' });

module.exports = mongoose.model('Post', postSchema);
