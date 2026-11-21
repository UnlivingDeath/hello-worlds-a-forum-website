const Post = require('../models/Post');
const Comment = require('../models/Comment');
const PostVoteEvent = require('../models/PostVoteEvent');

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const HALF_LIFE_DAYS = 7;

async function getTrendingPosts(limit = 100) {
  const now = new Date();
  const recentSince = new Date(now.getTime() - RECENT_WINDOW_MS);
  const [posts, recentComments, recentVotes] = await Promise.all([
    Post.find({ $or: [{ isPinned: { $ne: true } }, { isMain: true }] })
      .select('title body author authorName score votes commentCount tags postType questionState isPinned isMain createdAt')
      .lean(),
    Comment.aggregate([
      { $match: { createdAt: { $gte: recentSince } } },
      { $group: { _id: '$post', count: { $sum: 1 } } },
    ]),
    PostVoteEvent.aggregate([
      { $match: { createdAt: { $gte: recentSince }, $or: [{ source: 'poll' }, { direction: 'upvote' }] } },
      { $group: { _id: '$post', count: { $sum: 1 } } },
    ]),
  ]);
  const commentCounts = new Map(recentComments.map((entry) => [entry._id.toString(), entry.count]));
  const voteCounts = new Map(recentVotes.map((entry) => [entry._id.toString(), entry.count]));

  return posts.map((post) => {
    const id = post._id.toString();
    const ageDays = Math.max(0, (now - new Date(post.createdAt || now)) / RECENT_WINDOW_MS * 7);
    const currentUpvotes = (post.votes || []).filter((vote) => vote.value === 1).length;
    const lifetime = currentUpvotes + Math.max(0, Number(post.score) || 0) + (Number(post.commentCount) || 0);
    const recent = 2 * ((commentCounts.get(id) || 0) + (voteCounts.get(id) || 0));
    const trendScore = (lifetime + recent) * (0.5 ** (ageDays / HALF_LIFE_DAYS));
    return { ...post, trendScore };
  }).sort((a, b) => b.trendScore - a.trendScore || new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
}

module.exports = getTrendingPosts;
