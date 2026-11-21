const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const ProfileComment = require('../models/ProfileComment');
const Notification = require('../models/Notification');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/users/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).render('user-not-found');
  const profile = await User.findById(req.params.id).select('username role profileVisibility').lean();
  if (!profile) return res.status(404).render('user-not-found');
  const visibility = { postsCreated: true, postsUpvoted: true, comments: true, allowComments: true, allowAiGathering: true, ...(profile.profileVisibility || {}) };
  const isOwner = !!req.currentUser && req.currentUser._id.toString() === profile._id.toString();
  const showCreated = visibility.postsCreated || isOwner;
  const showUpvoted = visibility.postsUpvoted || isOwner;
  const showActivities = visibility.comments || isOwner;
  const showProfileComments = visibility.allowComments || isOwner;
  const [created, createdCount, upvoted, upvotedCount, postComments, postCommentCount, profileComments, profileCommentsLeft, profileCommentCount, profileCommentsLeftCount] = await Promise.all([
    showCreated ? Post.find({ author: profile._id }).sort({ createdAt: -1 }).limit(5).lean() : [],
    showCreated ? Post.countDocuments({ author: profile._id }) : 0,
    showUpvoted ? Post.find({ 'votes.user': profile._id }).sort({ createdAt: -1 }).limit(5).lean() : [],
    showUpvoted ? Post.countDocuments({ 'votes.user': profile._id }) : 0,
    showActivities ? Comment.find({ author: profile._id }).populate('post', 'title').sort({ createdAt: -1 }).limit(5).lean() : [],
    showActivities ? Comment.countDocuments({ author: profile._id }) : 0,
    showProfileComments ? ProfileComment.find({ profile: profile._id }).populate('author', 'role').sort({ createdAt: -1 }).lean() : [],
    showActivities ? ProfileComment.find({ author: profile._id }).populate('profile', 'username').sort({ createdAt: -1 }).limit(5).lean() : [],
    showProfileComments ? ProfileComment.countDocuments({ profile: profile._id }) : 0,
    showActivities ? ProfileComment.countDocuments({ author: profile._id }) : 0,
  ]);
  const comments = [
    ...postComments.map((comment) => ({ ...comment, commentKind: 'post' })),
    ...profileCommentsLeft.map((comment) => ({ ...comment, commentKind: 'profile' })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const activityCommentCount = postCommentCount + profileCommentsLeftCount;
  res.render('user', { profile, visibility, isOwner, created, createdCount, upvoted, upvotedCount, comments, activityCommentCount, profileComments, profileCommentCount, error: null });
});

router.post('/users/:id/settings', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || req.params.id !== req.currentUser._id.toString()) return res.status(403).send('You can only edit your own page');
  const profileVisibility = Object.fromEntries(['postsCreated', 'postsUpvoted', 'comments', 'allowComments', 'allowAiGathering'].map((key) => [key, req.body[key] === 'on']));
  await User.updateOne({ _id: req.currentUser._id }, { $set: { profileVisibility } });
  res.redirect(`/users/${req.params.id}`);
});

router.post('/users/:id/comments', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).render('404');
  const profile = await User.findById(req.params.id).select('username profileVisibility').lean();
  const body = (req.body.body || '').trim();
  if (!profile) return res.status(404).render('404');
  if (!(profile.profileVisibility?.allowComments ?? true)) return res.status(403).send('profile comments are disabled');
  if (!body || body.length > 2000) return res.redirect(`/users/${profile._id}`);
  await ProfileComment.create({ profile: profile._id, author: req.currentUser._id, authorName: req.currentUser.username, body });
  if (profile._id.toString() !== req.currentUser._id.toString()) {
    await Notification.create({
      recipient: profile._id,
      type: 'profile_comment',
      actorName: req.currentUser.username,
      message: `@${req.currentUser.username} commented on your profile`,
      link: `/users/${profile._id}#profile-comments`,
    });
  }
  res.redirect(`/users/${profile._id}#profile-comments`);
});

module.exports = router;
