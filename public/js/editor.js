document.querySelectorAll('textarea[data-markdown]').forEach((ta) => {
  const mde = new EasyMDE({
    element: ta,
    spellChecker: false,
    status: false,
    minHeight: ta.id === 'body' && ta.rows > 5 ? '220px' : '100px',
    toolbar: [
      'bold', 'italic', 'heading', '|',
      'quote', 'code', 'unordered-list', 'ordered-list', '|',
      { 
            name: "link",
            action: function customLinkAction(editor) {
                let url = prompt("type in a url:");
                let unmodified_url = url;
                if (!url) return;

                if (!url.includes('://')) {
                    url = 'https://' + url;
                }

                const cm = editor.codemirror;
                const selectedText = cm.getSelection() || unmodified_url;
                cm.replaceSelection(`[${selectedText}](${url})`);
            },
            className: "fa fa-link",
            title: "Insert Link",
      }, 'image', 'table', '|',
      'preview', 'side-by-side', 'fullscreen', '|',
      'guide',
    ],
  });


  if (ta.form) {
    ta.form.addEventListener('submit', () => { ta.value = mde.value(); });
  }
});
