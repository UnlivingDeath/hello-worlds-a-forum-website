const express = require('express');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Report = require('../models/Report');
const PostVoteEvent = require('../models/PostVoteEvent');
const { requireAuth, isModerator } = require('../middleware/auth');
const { normalizeTag } = require('../utils/tag-taxonomy');
const getTrendingPosts = require('../services/trending');


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

async function findSearchPosts(filter, sort) {
  const pinned = await Post.find({ $and: [filter, { isPinned: true }] }).sort({ createdAt: 1 }).limit(100);
  const normalLimit = Math.max(0, 100 - pinned.length);
  const normal = normalLimit
    ? await Post.find({ $and: [filter, { isPinned: { $ne: true } }] }).sort(buildSort(sort)).limit(normalLimit)
    : [];
  return [...pinned, ...normal];
}

async function findIndexPosts(sort) {
  const pinned = await Post.find({ isPinned: true, isMain: true }).sort({ createdAt: 1 }).limit(100);
  const normalLimit = Math.max(0, 100 - pinned.length);
  const normal = normalLimit
    ? await Post.find({ isPinned: { $ne: true } }).sort(buildSort(sort)).limit(normalLimit)
    : [];
  return [...pinned, ...normal];
}

function parseTags(raw) {
  const values = (Array.isArray(raw) ? raw : String(raw || '').split(',')).map((value) => String(value).trim()).filter(Boolean);
  const tags = [...new Set(values.map(normalizeTag).filter(Boolean))];
  return { tags, invalid: values.filter((value) => !normalizeTag(value)) };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', async (req, res) => {
  const sort = req.query.sort || 'latest';
  const [posts, trendingPosts] = await Promise.all([
    findIndexPosts(sort),
    getTrendingPosts(100),
  ]);
  await addAuthorRoles(posts);
  await addAuthorRoles(trendingPosts);
  const reports = isModerator(req.currentUser) ? await Report.find({ status: 'open' }).sort({ createdAt: -1 }).limit(10).lean() : [];
  res.render('index', { posts, trendingPosts, query: '', activeTags: [], activeUsers: '', activeSort: sort, reports });
});













router.post('/posts/:id/vote', requireAuth, async (req, res) => {
  const value = parseInt(req.body.value, 10);
  if (value !== 1 && value !== -1) return res.status(400).send('Invalid vote value');

  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).render('404');

  const userId = req.session.user.id;
  const existing = post.votes.find((v) => v.user.toString() === userId);
  const eventDirection = existing && existing.value === value ? 'remove' : value === 1 ? 'upvote' : 'downvote';
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
  await PostVoteEvent.create({ post: post._id, user: userId, source: 'post', direction: eventDirection })
    .catch((error) => console.error('Unable to record post vote activity:', error.message));

  
  
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
  const activeUsers = typeof req.query.users === 'string'
    ? req.query.users.trim()
    : Array.isArray(req.query.users) ? req.query.users.join(', ').trim() : '';
  const usernames = [...new Set(activeUsers.split(',').map((username) => username.trim().replace(/^@/, '')).filter(Boolean))];

  let requestedTags = req.query.tags || [];
  if (typeof requestedTags === 'string') requestedTags = [requestedTags];
  if (req.query.tag) requestedTags.push(req.query.tag);
  const tags = [...new Set(requestedTags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))];

  const filter = {};
  if (usernames.length) {
    const accounts = await User.find({
      username: { $in: usernames.map((username) => new RegExp(`^${escapeRegex(username)}$`, 'i')) },
    }).select('_id').lean();
    filter.author = { $in: accounts.map((account) => account._id) };
  }
  const languageTags = tags.map(normalizeTag).filter(Boolean);
  if (languageTags.length) filter.tags = { $all: [...new Set(languageTags)] };
  if (tags.includes('pinned')) filter.isPinned = true;
  if (tags.includes('main')) filter.isMain = true;
  if (tags.includes('solved-question')) { filter.postType = 'question'; filter.questionState = 'solved'; }
  if (tags.includes('unsolved-question')) { filter.postType = 'question'; filter.questionState = 'unsolved'; }

  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: regex }, { body: regex }];
  }

  const posts = await findSearchPosts(filter, sort);
  await addAuthorRoles(posts);
  const trendingPosts = await getTrendingPosts(100);
  await addAuthorRoles(trendingPosts);
  const reports = isModerator(req.currentUser) ? await Report.find({ status: 'open' }).sort({ createdAt: -1 }).limit(10).lean() : [];
  res.render('index', { posts, trendingPosts, query: q, activeTags: tags, activeUsers, activeSort: sort, reports });
});





router.get('/posts/new', requireAuth, async (req, res) => {
  res.render('new-post', { error: null, title: '', body: '', tagsInput: '', selectedType: 'discussion', pollQuestion: '', pollOptions: [] });
});

router.post('/posts', requireAuth, async (req, res) => {
  const title = (req.body.title || '').trim();
  const body = (req.body.body || '').trim();
  const { tags, invalid: invalidTags } = parseTags(req.body.tags);
  const postType = ['discussion', 'poll', 'question'].includes(req.body.postType) ? req.body.postType : 'discussion';
  const commentsDisabled = req.body.commentsDisabled === 'on';
  const pollQuestion = (req.body.pollQuestion || '').trim();
  const pollOptions = Array.isArray(req.body.pollOptions) ? req.body.pollOptions : req.body.pollOptions ? [req.body.pollOptions] : [];
  const options = pollOptions.map((title) => ({ title: String(title).trim(), votes: [] })).filter((option) => option.title).slice(0, 8);
  if (invalidTags.length) {
    return res.status(400).render('new-post', { error: `Unsupported tag: ${invalidTags[0]}`, title, body, tagsInput: req.body.tags || '', selectedType: postType, pollQuestion, pollOptions, commentsDisabled, isPinned: req.body.isPinned === 'on', isMain: req.body.isMain === 'on' });
  }
  if (postType === 'poll' && (!String(pollOptions[0] || '').trim() || !String(pollOptions[1] || '').trim() || options.length < 2 || options.length > 8 || pollOptions.length > 8)) {
    return res.status(400).render('new-post', { error: 'A poll needs between 2 and 8 non-empty options.', title, body, tagsInput: req.body.tags || '', selectedType: postType, pollQuestion, pollOptions, commentsDisabled, isPinned: req.body.isPinned === 'on', isMain: req.body.isMain === 'on' });
  }


  if (!title) {
    return res.render('new-post', {
      error: 'A title is required',
      title, body,
      tagsInput: req.body.tags || '',
      selectedType: postType,
      pollQuestion,
      pollOptions,
      commentsDisabled,
      isPinned: req.body.isPinned === 'on',
      isMain: req.body.isMain === 'on',
    });
  }

  const post = await Post.create({
    title,
    body,
    tags,
    author: req.session.user.id,
    authorName: req.session.user.username,
    postType,
    ...(postType === 'question' ? { questionState: 'unsolved' } : {}),
    ...(isModerator(req.currentUser) ? { isPinned: req.body.isPinned === 'on', isMain: req.body.isPinned === 'on' && req.body.isMain === 'on' } : {}),
    commentsDisabled,
    ...(postType === 'poll' ? { poll: { question: pollQuestion.slice(0, 200), options } } : {}),
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
    const reports = isModerator(req.currentUser) ? await Report.find({ status: 'open' }).sort({ createdAt: -1 }).limit(10).lean() : [];
    res.render('post', { post, comments, reports, error: null});
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
  const { tags, invalid: invalidTags } = parseTags(req.body.tags);
  post.title = title;
  post.body = body;
  post.commentsDisabled = req.body.commentsDisabled === 'on';
  if (post.postType === 'question' && ['solved', 'unsolved'].includes(req.body.questionState)) post.questionState = req.body.questionState;
  if (isModerator(req.currentUser)) {
    post.isPinned = req.body.isPinned === 'on';
    post.isMain = post.isPinned && req.body.isMain === 'on';
  }

  if (invalidTags.length) {
    return res.status(400).render('edit-post', { post, error: `Unsupported tag: ${invalidTags[0]}`, tagsInput: req.body.tags || '' });
  }

  if (!title) {
    return res.render('edit-post', { post, error: 'A title is required', tagsInput: req.body.tags || '' });
  }

  post.tags = tags;
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
  await Report.deleteMany({ post: post._id });
  await post.deleteOne();

  res.redirect('/');
});

router.post('/posts/:id/poll/vote', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post || post.postType !== 'poll' || !post.poll?.options?.length) return res.status(404).render('404');
  const removingVote = req.body.action === 'remove';
  const index = removingVote ? -1 : Number.parseInt(req.body.option, 10);
  if (!removingVote && (!Number.isInteger(index) || index < 0 || index >= post.poll.options.length)) {
    return res.status(400).send('Choose a valid option');
  }
  const previousIndex = post.poll.options.findIndex((option) => option.votes.some((id) => id.toString() === req.currentUser._id.toString()));
  if (removingVote && previousIndex < 0) return res.redirect(req.get('Referer') || `/posts/${post._id}`);
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
              { $cond: [{ $and: [{ $eq: ['$$optionIndex', index] }, { $eq: [removingVote, false] }] }, [req.currentUser._id], []] },
            ] } }] },
          },
        },
      },
    } },
  }]);
  if (!removingVote && previousIndex !== index) {
    await PostVoteEvent.create({ post: post._id, user: req.currentUser._id, source: 'poll', direction: 'poll' })
      .catch((error) => console.error('Unable to record poll vote activity:', error.message));
  }
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
