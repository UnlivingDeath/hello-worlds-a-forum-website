const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');

const CURRENT_TAGS = ['javascript', 'sql', 'html', 'css', 'python', 'bash', 'typescript', 'java', 'c#', 'c++', 'c', 'php', 'assembly', 'mongodb'];
let migrationPromise;

async function fillMissingUserFields() {
  const defaults = {
    role: 'user',
    'profileVisibility.postsCreated': true,
    'profileVisibility.postsUpvoted': true,
    'profileVisibility.comments': true,
    'profileVisibility.allowComments': true,
    // Match the current User model and existing user preference behavior.
    'profileVisibility.allowAiGathering': true,
  };
  let updated = 0;
  for (const [field, value] of Object.entries(defaults)) {
    const result = await User.collection.updateMany({ $or: [{ [field]: { $exists: false } }, { [field]: null }] }, { $set: { [field]: value } });
    updated += result.modifiedCount || 0;
  }
  const invalidRoles = await User.collection.updateMany({ role: { $nin: ['user', 'admin', 'creator'] } }, { $set: { role: 'user' } });
  updated += invalidRoles.modifiedCount || 0;
  const userCreatedAt = await User.collection.updateMany(
    { $or: [{ createdAt: { $exists: false } }, { createdAt: null }] },
    [{ $set: { createdAt: { $convert: { input: '$_id', to: 'date', onError: new Date(), onNull: new Date() } } } }]
  );
  updated += userCreatedAt.modifiedCount || 0;
  const userUpdatedAt = await User.collection.updateMany(
    { $or: [{ updatedAt: { $exists: false } }, { updatedAt: null }] },
    [{ $set: { updatedAt: { $ifNull: ['$createdAt', { $convert: { input: '$_id', to: 'date', onError: new Date(), onNull: new Date() } }] } } }]
  );
  updated += userUpdatedAt.modifiedCount || 0;
  return updated;
}

async function fillMissingPostFields() {
  const collection = Post.collection;
  let updated = 0;
  const defaults = {
    isPinned: false,
    isMain: false,
    commentsDisabled: false,
    votes: [],
    tags: [],
    editedAt: null,
  };
  for (const [field, value] of Object.entries(defaults)) {
    const result = await collection.updateMany({ $or: [{ [field]: { $exists: false } }, { [field]: null }] }, { $set: { [field]: value } });
    updated += result.modifiedCount || 0;
  }

  for (const [filter, postType] of [
    [{ postType: { $exists: false }, 'poll.question': { $exists: true } }, 'poll'],
    [{ postType: { $exists: false }, 'poll.question': { $exists: false } }, 'discussion'],
  ]) {
    const result = await collection.updateMany(filter, { $set: { postType } });
    updated += result.modifiedCount || 0;
  }
  const questions = await collection.updateMany(
    { postType: 'question', questionState: { $exists: false } },
    { $set: { questionState: 'unsolved' } }
  );
  updated += questions.modifiedCount || 0;
  const nonQuestions = await collection.updateMany(
    { postType: { $ne: 'question' }, questionState: { $exists: true } },
    { $unset: { questionState: '' } }
  );
  updated += nonQuestions.modifiedCount || 0;
  const invalidTypes = await collection.updateMany(
    { postType: { $nin: ['discussion', 'poll', 'question'] } },
    [{ $set: { postType: { $cond: [{ $ifNull: ['$poll.question', false] }, 'poll', 'discussion'] } } }]
  );
  updated += invalidTypes.modifiedCount || 0;
  const invalidQuestionStates = await collection.updateMany(
    { postType: 'question', questionState: { $nin: ['unsolved', 'solved'] } },
    { $set: { questionState: 'unsolved' } }
  );
  updated += invalidQuestionStates.modifiedCount || 0;

  const tagsResult = await collection.updateMany(
    { tags: { $exists: true } },
    [{ $set: { tags: {
      $filter: {
        input: { $map: {
          input: { $ifNull: ['$tags', []] },
          as: 'tag',
          in: {
            $let: {
              vars: { normalized: { $toLower: { $trim: { input: { $toString: '$$tag' } } } } },
              in: { $cond: [{ $in: ['$$normalized', ['react', 'node', 'express']] }, 'javascript', '$$normalized'] },
            },
          },
        } },
        as: 'tag',
        cond: { $in: ['$$tag', CURRENT_TAGS] },
      },
    } } }]
  );
  updated += tagsResult.modifiedCount || 0;

  const voteCount = await collection.updateMany(
    { $or: [{ score: { $exists: false } }, { score: null }] },
    [{ $set: {
      score: { $sum: { $map: {
        input: { $ifNull: ['$votes', []] },
        as: 'vote',
        in: { $ifNull: ['$$vote.value', 0] },
      } } },
    } }]
  );
  updated += voteCount.modifiedCount || 0;
  const activity = await collection.updateMany(
    { $or: [{ lastActivityAt: { $exists: false } }, { lastActivityAt: null }] },
    [{ $set: { lastActivityAt: { $ifNull: ['$updatedAt', { $ifNull: ['$createdAt', new Date()] }] } } }]
  );
  updated += activity.modifiedCount || 0;
  const postCreatedAt = await collection.updateMany(
    { $or: [{ createdAt: { $exists: false } }, { createdAt: null }] },
    [{ $set: { createdAt: { $convert: { input: '$_id', to: 'date', onError: new Date(), onNull: new Date() } } } }]
  );
  updated += postCreatedAt.modifiedCount || 0;
  const postUpdatedAt = await collection.updateMany(
    { $or: [{ updatedAt: { $exists: false } }, { updatedAt: null }] },
    [{ $set: { updatedAt: { $ifNull: ['$lastActivityAt', { $ifNull: ['$createdAt', new Date()] }] } } }]
  );
  updated += postUpdatedAt.modifiedCount || 0;

  const missingCountPosts = await collection.find({ $or: [{ commentCount: { $exists: false } }, { commentCount: null }] }, { projection: { _id: 1, createdAt: 1 } }).toArray();
  if (missingCountPosts.length) {
    const commentGroups = await Comment.aggregate([
      { $match: { post: { $in: missingCountPosts.map((post) => post._id) } } },
      { $group: { _id: '$post', count: { $sum: 1 }, latest: { $max: '$createdAt' } } },
    ]);
    const counts = new Map(commentGroups.map((group) => [group._id.toString(), group]));
    const operations = missingCountPosts.map((post) => {
      const group = counts.get(post._id.toString());
      return {
        updateOne: {
          filter: { _id: post._id, $or: [{ commentCount: { $exists: false } }, { commentCount: null }] },
          update: [{ $set: {
            commentCount: group?.count || 0,
            lastActivityAt: { $ifNull: ['$lastActivityAt', group?.latest || post.createdAt || new Date()] },
          } }],
        },
      };
    });
    const result = await collection.bulkWrite(operations, { ordered: false });
    updated += result.modifiedCount || 0;
  }

  const pollOptions = await collection.updateMany(
    { 'poll.options': { $exists: true, $ne: null } },
    [{ $set: { 'poll.options': { $map: {
      input: '$poll.options',
      as: 'option',
      in: { $mergeObjects: ['$$option', { votes: { $ifNull: ['$$option.votes', []] } }] },
    } } } }]
  );
  updated += pollOptions.modifiedCount || 0;

  const missingAuthorNames = await collection.find({ $or: [{ authorName: { $exists: false } }, { authorName: null }, { authorName: '' }] }, { projection: { _id: 1, author: 1 } }).toArray();
  if (missingAuthorNames.length) {
    const authors = await User.find({ _id: { $in: missingAuthorNames.map((post) => post.author).filter(Boolean) } }).select('_id username').lean();
    const usernames = new Map(authors.map((author) => [author._id.toString(), author.username]));
    const operations = missingAuthorNames.map((post) => ({ updateOne: {
      filter: { _id: post._id, $or: [{ authorName: { $exists: false } }, { authorName: null }, { authorName: '' }] },
      update: { $set: { authorName: usernames.get(post.author?.toString()) || 'Deleted user' } },
    } }));
    const result = await collection.bulkWrite(operations, { ordered: false });
    updated += result.modifiedCount || 0;
  }
  return updated;
}

async function runSchemaCompatibility() {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const [usersUpdated, postsUpdated] = await Promise.all([fillMissingUserFields(), fillMissingPostFields()]);
      const [invalidUsers, invalidPosts] = await Promise.all([
        User.collection.countDocuments({ $or: [{ username: { $exists: false } }, { passwordHash: { $exists: false } }] }),
        Post.collection.countDocuments({ $or: [{ title: { $exists: false } }, { body: { $exists: false } }, { author: { $exists: false } }] }),
      ]);
      console.info(`Schema compatibility check complete: ${usersUpdated} user documents and ${postsUpdated} post documents updated; ${invalidUsers} users and ${invalidPosts} posts lack required identity/content fields.`);
      return { usersUpdated, postsUpdated, invalidUsers, invalidPosts };
    })().catch((error) => {
      migrationPromise = undefined;
      throw error;
    });
  }
  return migrationPromise;
}

module.exports = { runSchemaCompatibility };
