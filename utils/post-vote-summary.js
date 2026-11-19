function summarizePostVotes(posts) {
  const uniquePosts = [...new Map(posts.map((post) => [post._id.toString(), post])).values()];
  const ratedShares = uniquePosts.map((post) => {
    const votes = Array.isArray(post.votes) ? post.votes : [];
    if (!votes.length) return null;
    return votes.filter((vote) => vote.value === 1).length / votes.length;
  }).filter((share) => share !== null);

  if (!ratedShares.length) return null;
  const average = ratedShares.reduce((sum, share) => sum + share, 0) / ratedShares.length;
  return {
    averagePositivePercent: Math.round(average * 100),
    ratedPostCount: ratedShares.length,
    citedPostCount: uniquePosts.length,
  };
}

module.exports = summarizePostVotes;
