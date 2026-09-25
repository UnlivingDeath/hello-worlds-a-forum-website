const express = require('express');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const { requireAuth } = require('../middleware/auth');

// const CURATED_TAGS = ['react', 'node', 'express', 'mongodb', 'javascript', 'css', 'homework', 'help', 'showcase'];
const router = express.Router();


// router.get('/', async (req, res) => {
//   const posts = await Post.find().sort({ createdAt: -1 }).limit(100);
//   res.render('index', { posts, query: '', activeTags: null });
// });
function buildSort(sort) {
  if (sort === 'votes') return { score: -1 };
  if (sort === 'active') return { lastActivityAt: -1 };
  return { createdAt: -1 }; // 'latest', and the default
}

router.get('/', async (req, res) => {
  const sort = req.query.sort || 'latest';
  const posts = await Post.find().sort(buildSort(sort)).limit(100);
  res.render('index', { posts, query: '', activeTags: [], activeSort: sort });
});

// router.get('/search', async (req, res) => {
//   const q = (req.query.q || '').trim();
//   const tag = (req.query.tag || '').trim().toLowerCase();
//   const filter = {};
//   if (tag) filter.tags = tag;
//   if (q) {
//     const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
//     filter.$or = [{ title: regex }, { body: regex }];
//   }
//   const posts = await Post.find(filter).sort({ createdAt: -1 }).limit(100);
//   res.render('index', { posts, query: q, activeTags: tag || null });
// });
router.post('/posts/:id/vote', requireAuth, async (req, res) => {
  const value = parseInt(req.body.value, 10);
  if (value !== 1 && value !== -1) return res.status(400).send('Invalid vote value');

  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).render('404');

  const userId = req.session.user.id;
  const existing = post.votes.find((v) => v.user.toString() === userId);

  if (existing && existing.value === value) {
    post.score -= existing.value;
    post.votes = post.votes.filter((v) => v.user.toString() !== userId);
  } else if (existing) {
    post.score += value - existing.value;
    existing.value = value;
  } else {
    post.score += value;
    post.votes.push({ user: userId, value });
  }

  await post.save();
  res.redirect(req.get('Referer') || '/');
});
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  const sort = req.query.sort || 'latest';

  let tags = req.query.tags || [];
  if (typeof tags === 'string') tags = [tags];
  if (req.query.tag) tags.push(req.query.tag);
  tags = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];

  const filter = {};
  if (tags.length) filter.tags = { $all: tags };
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: regex }, { body: regex }];
  }

  const posts = await Post.find(filter).sort(buildSort(sort)).limit(100);
  res.render('index', { posts, query: q, activeTags: tags, activeSort: sort });
});

// router.get('/posts/new', requireAuth, (req, res) => {
//   res.render('new-post', { error: null, title: '', body: '', tagsInput: '' });
// });

router.get('/posts/new', requireAuth, async (req, res) => {
  res.render('new-post', { error: null, title: '', body: '', tagsInput: '' });
});

function parseTags(raw) {
  if (!raw) return [];
  const tags = raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)];
}

router.post('/posts', requireAuth, async (req, res) => {
  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  const tags = parseTags(req.body.tags);


  if (!title || !body) {
    return res.render('new-post', {
      error: 'Title and post are both required',
      title, body,
      tagsInput: req.body.tags || '',
    });
  }

  const post = await Post.create({
    title,
    body,
    tags,
    author: req.session.user.id,
    authorName: req.session.user.username,
  });

  res.redirect(`/posts/${post._id}`);
});

router.get('/posts/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).render('404');

    const comments = await Comment.find({ post: post._id }).sort({ createdAt: 1 });
    res.render('post', { post, comments, error: null});
  } catch (err) {
    res.status(404).render('404');
  }
});

router.post('/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).render('404');

    const body = (req.body.body || '').trim();

    if (!body) {
      const comments = await Comment.find({ post: post._id }).sort({ createdAt: 1 });
      return res.render('post', { post, comments, error: 'Comment cannot be empty' });
    }

    await Comment.create({
      post: post._id,
      body,
      author: req.session.user.id,
      authorName: req.session.user.username,
    });

    post.commentCount += 1;
    post.lastActivityAt = new Date();
    await post.save();

    res.redirect(`/posts/${post._id}`);
  } catch (err) {
    res.status(404).render('404');
  }
});

module.exports = router;
