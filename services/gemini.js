const MODEL = 'gemini-3-flash-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function generate({ system, messages, json = false }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('Chat AI is not configured yet.');
    error.status = 503;
    throw error;
  }

  const history = messages.slice(-20).map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

  const response = await fetch(`${API_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: history,
      generationConfig: {
        maxOutputTokens: 2048,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
    signal: AbortSignal.timeout(25000),
  });

  if (response.status === 429) {
    const error = new Error('The free AI limit has been reached. Please try again later.');
    error.status = 429;
    throw error;
  }
  if (!response.ok) {
    const error = new Error('The AI service is unavailable. Please try again later.');
    error.status = 502;
    throw error;
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
  if (!text) {
    const error = new Error('The AI service returned an empty response. Please try again.');
    error.status = 502;
    throw error;
  }
  return text;
}

module.exports = { generate };
