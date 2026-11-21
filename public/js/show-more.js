document.querySelectorAll('[data-show-more-group]').forEach((group) => {
  const items = Array.from(group.querySelectorAll('[data-show-more-item]'));
  const button = group.querySelector('[data-show-more]');
  if (!button || !items.length) return;

  const initialCount = Number.parseInt(group.dataset.initialCount, 10) || 5;
  const batchSize = Number.parseInt(group.dataset.batchSize, 10) || initialCount;
  let visibleCount = Math.min(initialCount, items.length);
  items.slice(visibleCount).forEach((item) => { item.hidden = true; });

  const update = () => {
    const remaining = items.length - visibleCount;
    button.textContent = `show more (${remaining} remaining)`;
    button.hidden = remaining <= 0;
  };
  update();
  button.addEventListener('click', () => {
    const nextCount = Math.min(visibleCount + batchSize, items.length);
    items.slice(visibleCount, nextCount).forEach((item) => { item.hidden = false; });
    visibleCount = nextCount;
    update();
  });
});
