const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const Report = require('../models/Report');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/posts/:id/report', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.id).select('title author').lean();
  const reason = (req.body.reason || '').trim();
  if (!post) return res.status(404).render('404');
  if (post.author.toString() === req.currentUser._id.toString()) return res.status(400).send('You cannot report your own post');
  if (!reason || reason.length > 2000) return res.redirect(`/posts/${post._id}`);
  await Report.create({ post: post._id, postTitle: post.title, reporter: req.currentUser._id, reporterName: req.currentUser.username, reason });
  res.redirect('/');
});

router.post('/reports/:id/respond', requireAuth, requireRole('admin', 'creator'), async (req, res) => {
  const existingReport = await Report.findById(req.params.id).lean();
  if (!existingReport || existingReport.status !== 'open') return res.redirect('/');
  const response = (req.body.response || '').trim().slice(0, 2000);
  const remove = req.body.decision === 'remove';
  const post = await Post.findById(existingReport.post);
  if (!post) {
    await Report.deleteMany({ post: existingReport.post });
    await Notification.create({
      recipient: existingReport.reporter,
      type: 'report_response',
      post: existingReport.post,
      postTitle: existingReport.postTitle,
      actorName: req.currentUser.username,
      message: 'Your report was reviewed. The reported post is no longer available.',
      link: '#',
    });
    return res.redirect('/');
  }
  const report = await Report.findOneAndUpdate(
    { _id: existingReport._id, status: 'open' },
    { $set: { response, status: remove ? 'removed' : 'kept', resolvedBy: req.currentUser._id } },
    { new: true }
  );
  if (!report) return res.redirect('/');
  if (remove && post) {
    const relatedReports = await Report.find({ post: post._id, status: 'open' }).select('_id reporter post postTitle').lean();
    await Promise.all([Comment.deleteMany({ post: post._id }), post.deleteOne()]);
    await Report.deleteMany({ post: post._id });
    await Promise.all(relatedReports.filter((item) => item._id.toString() !== report._id.toString()).map((item) => Notification.create({
      recipient: item.reporter, type: 'report_response', post: item.post, postTitle: item.postTitle,
      actorName: req.currentUser.username, message: `Your reported post was removed${response ? `: ${response}` : '.'}`, link: '#',
    })));
  } else {
    await Report.deleteOne({ _id: report._id });
  }
  await Notification.create({ recipient: report.reporter, type: 'report_response', post: report.post, postTitle: report.postTitle,
    actorName: req.currentUser.username, message: `${remove ? 'Your reported post was removed' : 'Your report was reviewed and the post was kept'}${response ? `: ${response}` : '.'}`, link: '#' });
  res.redirect('/');
});

router.get('/admin/reports', requireAuth, requireRole('admin', 'creator'), async (req, res) => {
  const sort = ['user', 'post', 'recent'].includes(req.query.sort) ? req.query.sort : 'recent';
  let reports = await Report.find({ status: 'open' }).sort({ createdAt: -1 }).lean();
  if (sort === 'user') reports = reports.sort((a, b) => a.reporterName.localeCompare(b.reporterName));
  if (sort === 'post') reports = reports.sort((a, b) => a.postTitle.localeCompare(b.postTitle));
  res.render('reports', { reports, sort });
});

router.get('/creator/dashboard', requireAuth, requireRole('creator'), async (req, res) => {
  const admins = await User.find({ role: 'admin' }).select('_id username').sort({ username: 1 }).lean();
  res.render('creator-dashboard', { admins, error: null });
});

router.post('/creator/admins', requireAuth, requireRole('creator'), async (req, res) => {
  const username = (req.body.username || '').trim();
  const user = await User.findOne({ username });
  if (!user) return res.status(404).send('User not found');
  if (user.role === 'creator') return res.status(400).send('Creator role cannot be changed here');
  user.role = 'admin'; await user.save();
  res.redirect('/creator/dashboard');
});

router.post('/creator/admins/:id/revoke', requireAuth, requireRole('creator'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).render('404');
  await User.updateOne({ _id: req.params.id, role: 'admin' }, { $set: { role: 'user' } });
  res.redirect('/creator/dashboard');
});

module.exports = router;
