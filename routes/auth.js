const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const { password } = req.body;

    if (username.length < 3) {
      return res.render('register', { error: 'username must be at least 3 characters.' });
    }
    if (!password || password.length < 6) {
      return res.render('register', { error: 'password must be at least 6 characters.' });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.render('register', { error: 'that username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, passwordHash });

    req.session.user = { id: user._id.toString(), username: user.username };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('register', { error: 'something went wrong. try again.' });
  }
});

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const { password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.render('login', { error: 'invalid username or password' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.render('login', { error: 'invalid username or password' });
    }

    req.session.user = { id: user._id.toString(), username: user.username };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'something went wrong. try again.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
