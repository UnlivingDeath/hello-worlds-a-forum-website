const runnableLanguages = {
  javascript: { label: 'JavaScript', aliases: ['javascript', 'js', 'node', 'nodejs'] },
  python: { label: 'Python', aliases: ['python', 'py'] },
  typescript: { label: 'TypeScript', aliases: ['typescript', 'ts'] },
};

function getCodeLanguage(codeElement) {
  const languageClass = Array.from(codeElement.classList)
    .find((className) => className.startsWith('language-'));
  if (!languageClass) return null;

  const alias = languageClass.slice('language-'.length).toLowerCase();
  return Object.entries(runnableLanguages)
    .find(([, language]) => language.aliases.includes(alias))?.[0] || null;
}

function formatRunResult(result) {
  const sections = [];
  if (result.compilerOutput) sections.push(`Compiler output:\n${result.compilerOutput.trim()}`);
  if (result.stdout.trim()) sections.push(result.stdout.trimEnd());
  if (result.stderr.trim()) sections.push(`Errors:\n${result.stderr.trimEnd()}`);
  if (result.signal) sections.push(`Stopped by signal: ${result.signal}`);
  else if (result.exitCode !== null) sections.push(`Exit code: ${result.exitCode}`);
  if (result.outputTruncated) sections.push('Output truncated at 20,000 characters.');
  return sections.join('\n\n') || 'Program finished without output.';
}

document.querySelectorAll('.post-detail .md-content pre > code').forEach((codeElement) => {
  const initialLanguage = getCodeLanguage(codeElement);

  const toolbar = document.createElement('div');
  toolbar.className = 'code-runner-toolbar';

  const languageLabel = document.createElement('label');
  languageLabel.textContent = 'run as ';

  const languageSelect = document.createElement('select');
  languageSelect.setAttribute('aria-label', 'Code language');
  if (!initialLanguage) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'choose language';
    placeholder.selected = true;
    languageSelect.append(placeholder);
  }
  Object.entries(runnableLanguages).forEach(([value, language]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = language.label;
    option.selected = value === initialLanguage;
    languageSelect.append(option);
  });
  languageLabel.append(languageSelect);

  const runButton = document.createElement('button');
  runButton.type = 'button';
  runButton.className = 'btn btn-small';
  runButton.textContent = 'run code';
  runButton.disabled = !initialLanguage;

  const inputDetails = document.createElement('details');
  inputDetails.className = 'code-runner-input';
  const inputSummary = document.createElement('summary');
  inputSummary.textContent = 'optional input';
  const inputArea = document.createElement('textarea');
  inputArea.rows = 3;
  inputArea.maxLength = 2000;
  inputArea.setAttribute('aria-label', 'Optional standard input');
  inputArea.placeholder = 'Text provided to the program as standard input';
  inputDetails.append(inputSummary, inputArea);

  const output = document.createElement('pre');
  output.className = 'code-runner-output';
  output.setAttribute('role', 'status');
  output.setAttribute('aria-live', 'polite');
  output.hidden = true;

  const notice = document.createElement('p');
  notice.className = 'code-runner-notice';
  notice.textContent = 'Code is sent to Wandbox to run. Only run code you trust.';

  const runnerWindow = document.createElement('section');
  runnerWindow.className = 'code-runner-window';
  runnerWindow.setAttribute('aria-label', 'Code execution');

  const titleBar = document.createElement('div');
  titleBar.className = 'window-title-bar';
  const title = document.createElement('span');
  title.textContent = 'code runner';

  const windowControls = document.createElement('div');
  windowControls.className = 'code-runner-window-controls';
  windowControls.setAttribute('aria-hidden', 'true');
  ['_', '□', 'X'].forEach((label) => {
    const control = document.createElement('span');
    control.textContent = label;
    windowControls.append(control);
  });
  titleBar.append(title, windowControls);

  const windowContents = document.createElement('div');
  windowContents.className = 'window-contents';
  windowContents.append(toolbar, inputDetails, output, notice);
  runnerWindow.append(titleBar, windowContents);

  const codeBlock = codeElement.parentElement;
  codeBlock.after(runnerWindow);
  toolbar.append(languageLabel, runButton);

  languageSelect.addEventListener('change', () => {
    runButton.disabled = !languageSelect.value;
  });

  runButton.addEventListener('click', async () => {
    runButton.disabled = true;
    runButton.textContent = 'running...';
    output.hidden = false;
    output.dataset.state = 'running';
    output.textContent = 'Running code...';

    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: languageSelect.value,
          code: codeElement.textContent,
          stdin: inputArea.value,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Code execution failed.');

      output.dataset.state = result.exitCode === 0 ? 'success' : 'error';
      output.textContent = formatRunResult(result);
    } catch (error) {
      output.dataset.state = 'error';
      output.textContent = error.message || 'Could not run this code. Please try again.';
    } finally {
      runButton.disabled = false;
      runButton.textContent = 'run code';
    }
  });
});
