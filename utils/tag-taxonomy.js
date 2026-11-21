const TAGS = [
  ['javascript', 'javaScript'], ['sql', 'sql'], ['html', 'html'], ['css', 'css'],
  ['python', 'python'], ['bash', 'bash'], ['typescript', 'typeScript'], ['java', 'java'],
  ['c#', 'c#'], ['c++', 'c++'], ['c', 'c'], ['php', 'php'], ['assembly', 'assembly'], ['mongodb', 'mongodb'],
].map(([value, label]) => ({ value, label }));

const LABELS = new Map(TAGS.map(({ value, label }) => [value, label]));
const SPECIAL_TAGS = [
  { value: 'pinned', label: 'pinned' },
  { value: 'main', label: 'main' },
  { value: 'unsolved-question', label: 'unsolved question' },
  { value: 'solved-question', label: 'solved question' },
];

function normalizeTag(value) {
  const tag = String(value || '').trim().toLowerCase();
  if (['react', 'node', 'express'].includes(tag)) return 'javascript';
  return LABELS.has(tag) ? tag : null;
}

function tagLabel(value) {
  const tag = String(value || '').toLowerCase();
  if (tag === 'pinned') return 'pinned';
  if (tag === 'main') return 'main';
  if (tag === 'solved-question') return 'solved question';
  if (tag === 'unsolved-question') return 'unsolved question';
  return LABELS.get(tag) || String(value || '');
}

module.exports = { TAGS, SPECIAL_TAGS, normalizeTag, tagLabel };
