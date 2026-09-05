// api/fetch-repo.js
// Vercel / Netlify-compatible serverless function for fetching repository text and producing provider-specific prefill actions.

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const { action, repo, provider } = req.body || {};
    if (!action || !repo) return res.status(400).json({ error: 'action and repo required' });

    const [owner, repoName] = String(repo).split('/');
    if (!owner || !repoName) return res.status(400).json({ error: 'invalid repo format' });

    // Helper to fetch raw files from GitHub
    async function fetchRaw(path) {
      const url = `https://raw.githubusercontent.com/${owner}/${repoName}/main/${path}`;
      const headers = {};
      if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`raw fetch failed ${r.status} ${url}`);
      return await r.text();
    }

    // Fetch README via GitHub REST API (gives base64) as a fallback
    async function fetchReadme() {
      const url = `https://api.github.com/repos/${owner}/${repoName}/readme`;
      const headers = { 'Accept': 'application/vnd.github.v3+json' };
      if (process.env.GITHUB_TOKEN) headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error('readme fetch failed: ' + r.status);
      const j = await r.json();
      return Buffer.from(j.content || '', 'base64').toString('utf8');
    }

    // Combine README + kit file if present
    async function combinedText() {
      let readme = '';
      try { readme = await fetchReadme(); } catch (e) { readme = '' }
      let kit = '';
      try { kit = await fetchRaw('cjckit.txt'); } catch (e) { kit = '' }
      let combined = `Repository: ${owner}/${repoName}\n\n`;
      if (readme) combined += `README:\n\n${readme}\n\n`;
      if (kit) combined += `KIT FILE (cjckit.txt):\n\n${kit}\n\n`;
      if (!readme && !kit) combined += `No README or kit file found.`;
      // Trim to reasonable size
      const MAX = parseInt(process.env.MAX_CHARS || '20000', 10);
      if (combined.length > MAX) combined = combined.slice(0, MAX) + '\n\n[TRUNCATED]';
      return combined;
    }

    if (action === 'fetch') {
      const text = await combinedText();
      return res.json({ text });
    }

    if (action === 'prefill') {
      const kitText = await (async () => { try { return await fetchRaw('cjckit.txt'); } catch(e){ return null } })();
      const combined = await combinedText();

      // Provider-specific behaviors
      const lower = (provider||'').toLowerCase();

      // Providers that accept a query param (search-style) — construct a search/prefill link
      if (lower === 'perplexity') {
        if (!kitText) return res.json({ type:'copied', message:'No kit file available to prefill.' });
        const q = encodeURIComponent(kitText.slice(0, 16000));
        const url = `https://www.perplexity.ai/search?q=${q}`;
        return res.json({ type: 'redirect', url });
      }

      if (lower === 'bing' || lower === 'bingchat') {
        const text = kitText || combined;
        const q = encodeURIComponent((text||'').slice(0,16000));
        const url = `https://www.bing.com/search?q=${q}`; // Bing Chat doesn't accept a stable prefill param; search is a reasonable fallback
        return res.json({ type:'redirect', url });
      }

      if (lower === 'deepai') {
        // DeepAI is primarily an API; open their site and copy kit to clipboard client-side
        return res.json({ type:'copied', openUrl: 'https://deepai.org/' });
      }

      if (lower === 'chatgpt' || lower === 'chatgpt_web' || lower === 'chatgpt.com' || lower === 'chatgpt_web') {
        // ChatGPT web does not provide a public prefill API. We'll instruct client to copy and open.
        return res.json({ type:'copied', openUrl: 'https://chat.openai.com/' });
      }

      if (lower === 'grok') {
        return res.json({ type:'copied', openUrl: 'https://grok.com' });
      }

      if (lower === 'claude' || lower === 'anthropic') {
        return res.json({ type:'copied', openUrl: 'https://claude.ai' });
      }

      if (lower === 'gemini' || lower === 'copilot') {
        return res.json({ type:'copied', openUrl: provider === 'copilot' ? 'https://copilot.microsoft.com' : 'https://gemini.google.com' });
      }

      // Example: if OPENAI_API_KEY is set, call OpenAI Chat Completion API and return assistant's response
      if (lower === 'openai_api') {
        const OPENAI_KEY = process.env.OPENAI_API_KEY;
        if (!OPENAI_KEY) return res.status(400).json({ error: 'OpenAI API key not configured on server.' });
        const prompt = `You are given the following repository text. Summarize it with headings and provide a short instruction on how to use it with an assistant.\n\n${combined.slice(0, 15000)}`;
        // Call OpenAI Chat Completions (note: adapt model as desired)
        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: prompt }], max_tokens: 800 })
        });
        if (!openaiRes.ok) {
          const t = await openaiRes.text();
          return res.status(502).json({ error: 'OpenAI error: ' + t });
        }
        const openaiJson = await openaiRes.json();
        const assistant = openaiJson?.choices?.[0]?.message?.content || openaiJson?.choices?.[0]?.text || '';
        return res.json({ type: 'assistant', text: assistant });
      }

      // Default: copy behavior
      return res.json({ type:'copied' });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
}
