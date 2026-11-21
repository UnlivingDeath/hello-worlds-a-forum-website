(() => {
  const app = document.getElementById('chat-app');
  if (!app) return;

  let conversation = window.chatPageData;
  const form = document.getElementById('chat-form');
  const modeSelect = document.getElementById('chat-mode');
  const messagesEl = document.getElementById('chat-messages');
  const errorEl = document.getElementById('chat-error');
  const submitButton = document.getElementById('chat-submit');
  const postUrlField = document.getElementById('post-url-field');
  const codeField = document.getElementById('code-field');
  const instructionsField = document.getElementById('instructions-field');
  const promptField = document.getElementById('prompt-field');
  const modeDescription = document.getElementById('mode-description');
  const postAssistantPrompts = document.getElementById('post-assistant-prompts');

  const descriptions = {
    'code-review': 'paste code for a review. add instructions if you want a specific focus.',
    qna: 'ask factual questions across public posts and opted-in profile activity. single-post tasks, rewrites, and code reviews belong in other modes.',
    'post-assistant': 'choose a writing action or ask a question about this post. answers use this post and its comments only.',
  };

  function updateModeFields() {
    if (!modeSelect) return;
    const codeMode = modeSelect.value === 'code-review';
    const postMode = modeSelect.value === 'post-assistant';
    if (codeField) codeField.hidden = !codeMode;
    if (instructionsField) instructionsField.hidden = !codeMode;
    if (promptField) promptField.hidden = codeMode;
    if (postUrlField) postUrlField.hidden = !postMode;
    if (postAssistantPrompts) postAssistantPrompts.hidden = !postMode;
    if (modeDescription) modeDescription.textContent = descriptions[modeSelect.value];
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'chat request failed. please try again.');
    return result;
  }

  function addMessage(role, content, sources = [], voteSummary = null) {
    document.getElementById('chat-empty')?.remove();
    const article = document.createElement('article');
    article.className = `chat-message ${role}`;
    const label = document.createElement('strong');
    label.textContent = role === 'assistant' ? 'assistant' : 'you';
    const body = document.createElement('div');
    body.className = 'chat-message-content';
    body.textContent = content;
    article.append(label, body);
    if (role === 'assistant' && voteSummary) {
      const rating = document.createElement('p');
      rating.className = 'chat-vote-summary';
      rating.textContent = `${voteSummary.averagePositivePercent}% average positive rating of cited posts · ${voteSummary.ratedPostCount} rated posts · ${voteSummary.citedPostCount} cited posts`;
      article.append(rating);
    }
    if (role === 'assistant' && conversation?.mode === 'post-assistant') {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'chat-copy-button';
      copy.dataset.copyMessage = '';
      copy.textContent = 'copy response';
      article.append(copy);
    }
    if (sources.length) {
      const sourceRow = document.createElement('div');
      sourceRow.className = 'chat-sources';
      const sourceLabel = document.createElement('span');
      sourceLabel.textContent = 'sources:';
      sourceRow.append(sourceLabel);
      sources.forEach((source) => {
        const link = document.createElement('a');
        link.href = source.url || `/posts/${encodeURIComponent(source.id)}`;
        link.textContent = source.title;
        sourceRow.append(link);
      });
      article.append(sourceRow);
    }
    messagesEl.append(article);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  modeSelect?.addEventListener('change', updateModeFields);
  updateModeFields();

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    errorEl.textContent = '';
    let mode = conversation?.mode || modeSelect?.value;
    let payload;

    if (mode === 'code-review') {
      payload = {
        code: document.getElementById('chat-code')?.value || '',
        instructions: document.getElementById('chat-instructions')?.value || '',
      };
      if (!payload.code.trim()) {
        errorEl.textContent = 'Paste code to review.';
        errorEl.hidden = false;
        return;
      }
    } else {
      payload = { message: document.getElementById('chat-prompt')?.value.trim() || '' };
      if (!payload.message) {
        errorEl.textContent = 'Enter a message.';
        errorEl.hidden = false;
        return;
      }
    }

    submitButton.disabled = true;
    submitButton.textContent = 'thinking…';
    const isNewConversation = !conversation;
    try {
      if (!conversation) {
        const create = { mode };
        if (mode === 'post-assistant') create.postUrl = document.getElementById('post-url')?.value.trim() || '';
        const created = await api('/api/chat/conversations', { method: 'POST', body: JSON.stringify(create) });
        conversation = { id: created.id, mode: created.mode, revision: 0 };
        app.dataset.conversationId = created.id;
        history.replaceState({}, '', `/chat/${created.id}`);
        document.querySelector('.chat-new-settings')?.remove();
      }

      const userText = mode === 'code-review'
        ? `${payload.instructions.trim() ? `Instructions: ${payload.instructions.trim()}\n\n` : ''}Review this code:\n\n${payload.code}`
        : payload.message;
      const result = await api(`/api/chat/conversations/${conversation.id}/messages`, {
        method: 'POST', body: JSON.stringify(payload),
      });
      conversation.revision = result.revision;
      if (isNewConversation) {
        window.location.href = `/chat/${conversation.id}`;
        return;
      }
      addMessage('user', userText);
      addMessage('assistant', result.answer, result.sources, result.voteSummary);
      if (mode === 'code-review') {
        document.getElementById('chat-code').value = '';
        document.getElementById('chat-instructions').value = '';
      } else {
        document.getElementById('chat-prompt').value = '';
      }
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'send';
    }
  });

  document.querySelectorAll('[data-chat-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      const prompt = document.getElementById('chat-prompt');
      if (!prompt) return;
      prompt.value = button.dataset.chatPrompt;
      form.requestSubmit();
    });
  });

  messagesEl.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy-message]');
    if (!button) return;
    const text = button.closest('.chat-message')?.querySelector('.chat-message-content')?.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'copied';
    } catch {
      button.textContent = 'copy unavailable';
    }
  });

  document.querySelectorAll('[data-delete-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Delete this conversation and its messages?')) return;
      button.disabled = true;
      try {
        await api(`/api/chat/conversations/${button.dataset.deleteId}`, { method: 'DELETE' });
        if (conversation?.id === button.dataset.deleteId) window.location.href = '/chat';
        else button.closest('li')?.remove();
      } catch (error) {
        window.alert(error.message);
        button.disabled = false;
      }
    });
  });
})();
