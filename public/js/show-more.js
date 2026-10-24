const postCards = Array.from(document.querySelectorAll('[data-post-card]'));
const showMoreButton = document.querySelector('[data-show-more]');

if (showMoreButton && postCards.length > 5) {
  const batchSize = 5;
  let visibleCount = batchSize;

  function updateShowMoreButton() {
    const remainingCount = postCards.length - visibleCount;
    showMoreButton.textContent = `show more posts (${remainingCount} remaining)`;
    showMoreButton.hidden = remainingCount <= 0;
  }

  postCards.slice(visibleCount).forEach((postCard) => {
    postCard.hidden = true;
  });

  updateShowMoreButton();
  showMoreButton.hidden = false;

  showMoreButton.addEventListener('click', () => {
    const nextVisibleCount = Math.min(visibleCount + batchSize, postCards.length);

    postCards.slice(visibleCount, nextVisibleCount).forEach((postCard) => {
      postCard.hidden = false;
    });

    visibleCount = nextVisibleCount;
    updateShowMoreButton();
  });
}
