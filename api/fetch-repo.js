// api/fetch-repo.js
// Vercel / Netlify-compatible serverless function for fetching repository text and producing provider-specific prefill actions.

function setCorsHeaders(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  const origin = req.headers && (req.headers.origin || req.headers.Origin);
  setCorsHeaders(res, origin);

  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).send('Method Not Allowed');

    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : (req.body || {});
    const { action, repo, provider } = body || {};
    const queryAction = req.query && req.query.action;
    const queryRepo = req.query && req.query.repo;
    const queryProvider = req.query && req.query.provider;

    const targetAction = action || queryAction;
    const targetRepo = repo || queryRepo;
    const targetProvider = provider || queryProvider;

    if (!targetAction || !targetRepo) return res.status(400).json({ error: 'action and repo required' });

    const [owner, repoName] = String(targetRepo).split('/');
    if (!owner || !repoName) return res.status(400).json({ error: 'invalid repo format' });

    async function fetchRaw(path) {
      const url = `https://raw.githubusercontent.com/${owner}/${repoName}/main/${path}`;
      const headers = {};
      if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`raw fetch failed ${r.status} ${url}`);
      return await r.text();
    }

    async function fetchReadme() {
      const url = `https://api.github.com/repos/${owner}/${repoName}/readme`;
      const headers = { Accept: 'application/vnd.github.v3+json' };
      if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error('readme fetch failed: ' + r.status);
      const j = await r.json();
      return Buffer.from(j.content || '', 'base64').toString('utf8');
    }

    async function combinedText() {
      let readme = '';
      try { readme = await fetchReadme(); } catch (e) { readme = ''; }
      let kit = '';
      try { kit = await fetchRaw('CJC_AI_Research_Kit_PasteReady.txt'); } catch (e) { kit = ''; }
      let combined = `Repository: ${owner}/${repoName}\n\n`;
      if (readme) combined += `README:\n\n${readme}\n\n`;
      if (kit) combined += `KIT FILE (CJC_AI_Research_Kit_PasteReady.txt):\n\n${kit}\n\n`;
      if (!readme && !kit) combined += 'No README or kit file found.';
      const MAX = parseInt(process.env.MAX_CHARS || '20000', 10);
      if (combined.length > MAX) combined = combined.slice(0, MAX) + '\n\n[TRUNCATED]';
      return combined;
    }

    if (targetAction === 'fetch') {
      const text = await combinedText();
      return res.json({ text });
    }

    if (targetAction === 'prefill') {
      const kitText = await (async () => {
        try { return await fetchRaw('CJC_AI_Research_Kit_PasteReady.txt'); } catch (e) { return null; }
      })();
      const combined = await combinedText();
      const lower = (targetProvider || '').toLowerCase();

      if (lower === 'perplexity') {
        if (!kitText) return res.json({ type: 'copied', message: 'No kit file available to prefill.' });
        const q = encodeURIComponent(kitText.slice(0, 16000));
        const url = `https://www.perplexity.ai/search?q=${q}`;
        return res.json({ type: 'redirect', url });
      }

      if (lower === 'bing' || lower === 'bingchat') {
        const text = kitText || combined;
        const q = encodeURIComponent((text || '').slice(0, 16000));
        const url = `https://www.bing.com/search?q=${q}`;
        return res.json({ type: 'redirect', url });
      }

      if (lower === 'deepai') {
        return res.json({ type: 'copied', openUrl: 'https://deepai.org/' });
      }

      if (lower === 'chatgpt' || lower === 'chatgpt_web' || lower === 'chatgpt.com') {
        return res.json({ type: 'copied', openUrl: 'https://chat.openai.com/' });
      }

      if (lower === 'grok') {
        return res.json({ type: 'copied', openUrl: 'https://grok.com' });
      }

      if (lower === 'claude' || lower === 'anthropic') {
        return res.json({ type: 'copied', openUrl: 'https://claude.ai' });
      }

      if (lower === 'gemini') {
        return res.json({ type: 'copied', openUrl: 'https://gemini.google.com' });
      }

      if (lower === 'copilot') {
        return res.json({ type: 'copied', openUrl: 'https://copilot.microsoft.com' });
      }

      if (lower === 'openai_api') {
        const OPENAI_KEY = process.env.OPENAI_API_KEY;
        if (!OPENAI_KEY) return res.status(400).json({ error: 'OpenAI API key not configured on server.' });
        const prompt = `You are given the following repository text. Summarize it with headings and provide a short instruction on how to use it with an assistant.\n\n${combined.slice(0, 15000)}`;
        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are a helpful assistant.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 800
          })
        });
        if (!openaiRes.ok) {
          const t = await openaiRes.text();
          return res.status(502).json({ error: 'OpenAI error: ' + t });
        }
        const openaiJson = await openaiRes.json();
        const assistant = openaiJson?.choices?.[0]?.message?.content || openaiJson?.choices?.[0]?.text || '';
        return res.json({ type: 'assistant', text: assistant });
      }

      return res.json({ type: 'copied' });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
}
