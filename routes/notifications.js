const express = require('express');
const Notification = require('../models/Notification');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Mark a single notification as read and redirect to its link
router.post('/notifications/:id/read', requireAuth, async (req, res) => {
  const notif = await Notification.findById(req.params.id);
  if (notif && notif.recipient.toString() === req.session.user.id) {
    notif.read = true;
    await notif.save();
    return res.redirect(notif.link);
  }
  res.redirect('/');
});

// Mark ALL notifications as read
router.post('/notifications/read-all', requireAuth, async (req, res) => {
  await Notification.updateMany(
    { recipient: req.session.user.id, read: false },
    { $set: { read: true } }
  );
  res.redirect('/');
});

module.exports = router;

