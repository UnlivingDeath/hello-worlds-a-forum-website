const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');
const sanitizeHtml = require('sanitize-html');

const md = new MarkdownIt({
  html: false, 
  linkify: true, 
  breaks: true,  
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      const out = hljs.highlight(code, { language: lang }).value;
      return `<pre><code class="hljs language-${lang}">${out}</code></pre>`;
    }
    return `<pre><code class="hljs">${md.utils.escapeHtml(code)}</code></pre>`;
  },
});

function renderMarkdown(text) {
  const html = md.render(text || '');
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'span', 'del'],
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title'],
    },
    allowedClasses: {
      code: ['hljs', 'language-*'],
      span: ['hljs-*', 'function_', 'class_'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
    },
  });
}

function excerpt(text, max = 160) {
  const plain = sanitizeHtml(md.render(text || ''), { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? plain.slice(0, max).trim() + '…' : plain;
}

module.exports = { renderMarkdown, excerpt };