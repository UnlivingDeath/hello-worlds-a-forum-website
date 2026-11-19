const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const ProfileComment = require('../models/ProfileComment');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/users/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).render('404');
  const profile = await User.findById(req.params.id).select('username role profileVisibility').lean();
  if (!profile) return res.status(404).render('404');
  const visibility = { postsCreated: true, postsUpvoted: true, comments: true, allowComments: true, allowAiGathering: false, ...(profile.profileVisibility || {}) };
  const isOwner = !!req.currentUser && req.currentUser._id.toString() === profile._id.toString();
  const [created, upvoted, comments, profileComments, profileCommentsLeft] = await Promise.all([
    visibility.postsCreated || isOwner ? Post.find({ author: profile._id }).sort({ createdAt: -1 }).lean() : [],
    visibility.postsUpvoted || isOwner ? Post.find({ 'votes.user': profile._id }).sort({ createdAt: -1 }).lean() : [],
    visibility.comments || isOwner ? Comment.find({ author: profile._id }).populate('post', 'title').sort({ createdAt: -1 }).lean() : [],
    visibility.allowComments || isOwner ? ProfileComment.find({ profile: profile._id }).sort({ createdAt: -1 }).lean() : [],
    visibility.comments || isOwner ? ProfileComment.find({ author: profile._id }).populate('profile', 'username').sort({ createdAt: -1 }).lean() : [],
  ]);
  const commentAuthors = await User.find({ _id: { $in: [...new Set(profileComments.map((comment) => comment.author.toString()))] } }).select('_id role').lean();
  const authorRoles = new Map(commentAuthors.map((account) => [account._id.toString(), account.role]));
  profileComments.forEach((comment) => { comment.authorRole = authorRoles.get(comment.author.toString()) || 'user'; });
  res.render('user', { profile, visibility, isOwner, created, upvoted, comments, profileComments, profileCommentsLeft, error: null });
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
  if (!(profile.profileVisibility?.allowComments ?? true)) return res.status(403).send('Profile comments are disabled');
  if (!body || body.length > 2000) return res.redirect(`/users/${profile._id}`);
  await ProfileComment.create({ profile: profile._id, author: req.currentUser._id, authorName: req.currentUser.username, body });
  res.redirect(`/users/${profile._id}#profile-comments`);
});

module.exports = router;
