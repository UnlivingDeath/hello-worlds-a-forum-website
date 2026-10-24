const express = require('express');

const router = express.Router();
const EXECUTION_API_URL = 'https://wandbox.org/api/compile.json';
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 8;
const MAX_CODE_LENGTH = 10000;
const MAX_STDIN_LENGTH = 2000;
const MAX_OUTPUT_LENGTH = 20000;
const requestsByIp = new Map();
const compilers = {
  javascript: 'nodejs-20.17.0',
  python: 'cpython-3.13.8',
  typescript: 'typescript-5.6.2',
};

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [ip, request] of requestsByIp) {
    if (request.windowStartedAt < cutoff) requestsByIp.delete(ip);
  }
}, WINDOW_MS);
cleanupTimer.unref();

router.post('/execute', async (req, res) => {
  const now = Date.now();
  const ip = req.ip;
  let requestWindow = requestsByIp.get(ip);

  if (!requestWindow || now - requestWindow.windowStartedAt >= WINDOW_MS) {
    requestWindow = { windowStartedAt: now, count: 0 };
    requestsByIp.set(ip, requestWindow);
  }

  if (requestWindow.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Execution limit reached. Please wait a minute and try again.' });
  }
  requestWindow.count += 1;

  const { language, code, stdin = '' } = req.body || {};
  if (!Object.hasOwn(compilers, language)) {
    return res.status(400).json({ error: 'Choose JavaScript, Python, or TypeScript.' });
  }
  if (typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'Add some code before running it.' });
  }
  if (code.length > MAX_CODE_LENGTH) {
    return res.status(400).json({ error: `Code must be ${MAX_CODE_LENGTH} characters or fewer.` });
  }
  if (typeof stdin !== 'string' || stdin.length > MAX_STDIN_LENGTH) {
    return res.status(400).json({ error: `Input must be ${MAX_STDIN_LENGTH} characters or fewer.` });
  }

  try {
    const apiResponse = await fetch(EXECUTION_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compiler: compilers[language],
        code,
        stdin,
        save: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!apiResponse.ok) {
      console.error(`Wandbox execution API returned HTTP ${apiResponse.status}`);
      return res.status(502).json({ error: 'The code execution service is unavailable. Please try again later.' });
    }

    const result = await apiResponse.json();
    if (!result || typeof result !== 'object' || typeof result.status === 'undefined') {
      console.error('Wandbox execution API returned an invalid response');
      return res.status(502).json({ error: 'The code execution service returned an invalid response.' });
    }

    const status = Number.parseInt(result.status, 10);
    const stdout = typeof result.program_output === 'string' ? result.program_output : '';
    const stderr = [result.compiler_error, result.program_error]
      .filter((output) => typeof output === 'string' && output)
      .join('\n');
    const compilerOutput = typeof result.compiler_output === 'string' ? result.compiler_output : '';
    res.json({
      stdout: stdout.slice(0, MAX_OUTPUT_LENGTH),
      stderr: stderr.slice(0, MAX_OUTPUT_LENGTH),
      compilerOutput: compilerOutput.slice(0, MAX_OUTPUT_LENGTH),
      exitCode: Number.isNaN(status) ? null : status,
      signal: typeof result.signal === 'string' ? result.signal : '',
      outputTruncated: stdout.length > MAX_OUTPUT_LENGTH
        || stderr.length > MAX_OUTPUT_LENGTH
        || compilerOutput.length > MAX_OUTPUT_LENGTH,
    });
  } catch (error) {
    console.error('Wandbox execution request failed:', error.message);
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? 'Code execution timed out. Please try again.'
        : 'Could not reach the code execution service. Please try again later.',
    });
  }
});

module.exports = router;
