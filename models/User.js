const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: { type: String, enum: ['user', 'admin', 'creator'], default: 'user' },
    profileVisibility: {
      postsCreated: { type: Boolean, default: true },
      postsUpvoted: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      allowComments: { type: Boolean, default: true },
      allowAiGathering: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
