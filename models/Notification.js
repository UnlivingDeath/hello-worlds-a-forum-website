const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['comment', 'upvote_milestone'],
      required: true,
    },
    // The post the notification is about
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
    },
    postTitle: {
      type: String,
      required: true,
    },
    // Optional - only set for comment notifications
    comment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
    // The person who triggered the notification
    actorName: {
      type: String,
      default: null,
    },
    // Pre-built human-readable message
    message: {
      type: String,
      required: true,
    },
    // URL the notification links to (e.g. /posts/:id or /posts/:id#comment-:cid)
    link: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);

