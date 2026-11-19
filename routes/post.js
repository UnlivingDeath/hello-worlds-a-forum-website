const express = require('express');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Report = require('../models/Report');
const { requireAuth, isModerator } = require('../middleware/auth');


const router = express.Router();


const VOTE_MILESTONES = [5, 10, 25, 50, 100, 250, 500];






function buildSort(sort) {
  if (sort === 'votes') return { score: -1 };
  if (sort === 'active') return { lastActivityAt: -1 };
  return { createdAt: -1 }; 
}

async function addAuthorRoles(posts) {
  const ids = [...new Set(posts.map((post) => post.author.toString()))];
  const users = await User.find({ _id: { $in: ids } }).select('_id role').lean();
  const roles = new Map(users.map((account) => [account._id.toString(), account.role]));
  posts.forEach((post) => { post.authorRole = roles.get(post.author.toString()) || 'user'; });
}

router.get('/', async (req, res) => {
  const sort = req.query.sort || 'latest';
  const posts = await Post.find().sort(buildSort(sort)).limit(100);
  await addAuthorRoles(posts);
  const reports = isModerator(req.currentUser) ? await Report.find().sort({ createdAt: -1 }).limit(10).lean() : [];
  res.render('index', { posts, query: '', activeTags: [], activeSort: sort, reports });
});













router.post('/posts/:id/vote', requireAuth, async (req, res) => {
  const value = parseInt(req.body.value, 10);
  if (value !== 1 && value !== -1) return res.status(400).send('Invalid vote value');

  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).render('404');

  const userId = req.session.user.id;
  const existing = post.votes.find((v) => v.user.toString() === userId);
  const scoreBefore = post.score;

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

  
  
  if (post.author.toString() !== userId) {
    for (const milestone of VOTE_MILESTONES) {
      if (scoreBefore < milestone && post.score >= milestone) {
        
        const alreadyNotified = await Notification.findOne({
          recipient: post.author,
          post: post._id,
          type: 'upvote_milestone',
          message: new RegExp(`${milestone} upvote`),
        });
        if (!alreadyNotified) {
          await Notification.create({
            recipient: post.author,
            type: 'upvote_milestone',
            post: post._id,
            postTitle: post.title,
            actorName: null,
            message: `your post "${post.title}" reached ${milestone} upvote${milestone === 1 ? '' : 's'}!`,
            link: `/posts/${post._id}`,
          });
        }
        break; 
      }
    }
  }

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
  await addAuthorRoles(posts);
  const reports = isModerator(req.currentUser) ? await Report.find().sort({ createdAt: -1 }).limit(10).lean() : [];
  res.render('index', { posts, query: q, activeTags: tags, activeSort: sort, reports });
});





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
  const commentsDisabled = req.body.commentsDisabled === 'on';
  const pollQuestion = (req.body.pollQuestion || '').trim();
  const pollOptions = Array.isArray(req.body.pollOptions) ? req.body.pollOptions : req.body.pollOptions ? [req.body.pollOptions] : [];
  const options = pollOptions.map((title) => ({ title: String(title).trim(), votes: [] })).filter((option) => option.title).slice(0, 8);
  if (pollQuestion && (options.length < 2 || pollOptions.length > 8)) {
    return res.status(400).render('new-post', { error: 'A poll needs a question and between 2 and 8 non-empty options.', title, body, tagsInput: req.body.tags || '' });
  }


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
    commentsDisabled,
    ...(pollQuestion && options.length >= 2 ? { poll: { question: pollQuestion.slice(0, 200), options } } : {}),
  });

  res.redirect(`/posts/${post._id}`);
});

router.get('/posts/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).render('404');

    const comments = await Comment.find({ post: post._id }).sort({ createdAt: 1 });
    const accounts = await User.find({ _id: { $in: [...new Set(comments.map((comment) => comment.author.toString()))] } }).select('_id role').lean();
    const roles = new Map(accounts.map((account) => [account._id.toString(), account.role]));
    comments.forEach((comment) => { comment.authorRole = roles.get(comment.author.toString()) || 'user'; });
    const authorAccount = await User.findById(post.author).select('role').lean();
    post.authorRole = authorAccount?.role || 'user';
    res.render('post', { post, comments, error: null});
  } catch (err) {
    res.status(404).render('404');
  }
});

router.post('/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).render('404');
    if (post.commentsDisabled) return res.status(403).send('Comments are disabled for this post');

    const body = (req.body.body || '').trim();

    if (!body) {
      const comments = await Comment.find({ post: post._id }).sort({ createdAt: 1 });
      return res.render('post', { post, comments, error: 'Comment cannot be empty' });
    }

    const newComment = await Comment.create({
      post: post._id,
      body,
      author: req.session.user.id,
      authorName: req.session.user.username,
    });

    post.commentCount += 1;
    post.lastActivityAt = new Date();
    await post.save();

    
    if (post.author.toString() !== req.session.user.id) {
      await Notification.create({
        recipient: post.author,
        type: 'comment',
        post: post._id,
        postTitle: post.title,
        comment: newComment._id,
        actorName: req.session.user.username,
        message: `@${req.session.user.username} commented on "${post.title}"`,
        link: `/posts/${post._id}#comment-${newComment._id}`,
      });
    }

    res.redirect(`/posts/${post._id}#comment-${newComment._id}`);
  } catch (err) {
    res.status(404).render('404');
  }
});

router.get('/posts/:id/edit', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).render('404');
  if (post.author.toString() !== req.session.user.id && !isModerator(req.currentUser)) {
    return res.status(403).send('You can only edit your own posts');
  }
  res.render('edit-post', { post, error: null, tagsInput: post.tags.join(',') });
});

router.post('/posts/:id/edit', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).render('404');
  if (post.author.toString() !== req.session.user.id && !isModerator(req.currentUser)) {
    return res.status(403).send('You can only edit your own posts');
  }

  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  const tags = parseTags(req.body.tags);

  if (!title || !body) {
    return res.render('edit-post', { post, error: 'Title and post are both required', tagsInput: req.body.tags || '' });
  }

  post.title = title;
  post.body = body;
  post.tags = tags;
  post.commentsDisabled = req.body.commentsDisabled === 'on';
  post.editedAt = new Date();
  await post.save();

  res.redirect(`/posts/${post._id}`);
});

router.post('/posts/:id/delete', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).render('404');
  if (post.author.toString() !== req.session.user.id && !isModerator(req.currentUser)) {
    return res.status(403).send('You can only delete your own posts');
  }

  await Comment.deleteMany({ post: post._id });
  await post.deleteOne();

  res.redirect('/');
});

router.post('/posts/:id/poll/vote', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post || !post.poll?.options?.length) return res.status(404).render('404');
  const index = Number.parseInt(req.body.option, 10);
  if (!Number.isInteger(index) || index < 0 || index >= post.poll.options.length) return res.status(400).send('Choose a valid option');
  await Post.updateOne({ _id: post._id, 'poll.options.1': { $exists: true } }, [{
    $set: { 'poll.options': {
      $map: {
        input: { $range: [0, { $size: '$poll.options' }] },
        as: 'optionIndex',
        in: {
          $let: {
            vars: { option: { $arrayElemAt: ['$poll.options', '$$optionIndex'] } },
            in: { $mergeObjects: ['$$option', { votes: { $concatArrays: [
              { $filter: { input: '$$option.votes', as: 'voter', cond: { $ne: ['$$voter', req.currentUser._id] } } },
              { $cond: [{ $eq: ['$$optionIndex', index] }, [req.currentUser._id], []] },
            ] } }] },
          },
        },
      },
    } },
  }]);
  res.redirect(req.get('Referer') || `/posts/${post._id}`);
});

router.get('/posts/:postId/comments/:commentId/edit', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.postId);
  const comment = await Comment.findById(req.params.commentId);
  if (!post || !comment) return res.status(404).render('404');
  if (comment.author.toString() !== req.session.user.id) {
    return res.status(403).send('You can only edit your own comments');
  }
  res.render('edit-comment', { post, comment, error: null });
});

router.post('/posts/:postId/comments/:commentId/edit', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.postId);
  const comment = await Comment.findById(req.params.commentId);
  if (!post || !comment) return res.status(404).render('404');
  if (comment.author.toString() !== req.session.user.id) {
    return res.status(403).send('You can only edit your own comments');
  }

  const body = (req.body.body || '').trim();
  if (!body) {
    return res.render('edit-comment', { post, comment, error: 'Comment cannot be empty' });
  }

  comment.body = body;
  comment.editedAt = new Date();
  await comment.save();

  res.redirect(`/posts/${post._id}`);
});

router.post('/posts/:postId/comments/:commentId/delete', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.postId);
  const comment = await Comment.findById(req.params.commentId);
  if (!post || !comment) return res.status(404).render('404');
  if (comment.author.toString() !== req.session.user.id) {
    return res.status(403).send('You can only delete your own comments');
  }

  await comment.deleteOne();
  post.commentCount = Math.max(0, post.commentCount - 1);
  await post.save();

  res.redirect(`/posts/${post._id}`);
});

module.exports = router;
