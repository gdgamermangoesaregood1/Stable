const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterModel = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-nano-30b-a3b:free';
let openRouterMaxTokens = Number(process.env.OPENROUTER_MAX_TOKENS || 512);
const siteTitle = process.env.SITE_TITLE || 'Nemotron Chat Demo';
const requestTimeoutMs = 25000;
const adminPagePath = path.join(__dirname, 'public', 'backend', 'maxtokencounts', 'index.html');

function normalizeMaxTokens(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4096) {
    return null;
  }

  return parsed;
}

openRouterMaxTokens = normalizeMaxTokens(openRouterMaxTokens) || 512;

function resolveSiteUrl(req) {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL;
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' && forwardedProto.length > 0
    ? forwardedProto.split(',')[0]
    : req.protocol;

  return `${protocol}://${req.get('host')}`;
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: openRouterModel
  });
});

app.get('/api/backend/maxtokencounts', (_req, res) => {
  res.json({
    maxTokens: openRouterMaxTokens
  });
});

app.post('/api/backend/maxtokencounts', (req, res) => {
  const nextValue = normalizeMaxTokens(req.body?.maxTokens);

  if (nextValue === null) {
    return res.status(400).json({
      error: 'maxTokens must be an integer between 1 and 4096.'
    });
  }

  openRouterMaxTokens = nextValue;

  res.json({
    ok: true,
    maxTokens: openRouterMaxTokens
  });
});

app.get('/backend/maxtokencounts', (_req, res) => {
  res.sendFile(adminPagePath);
});

app.post('/api/chat', async (req, res) => {
  if (!openRouterApiKey) {
    return res.status(500).json({
      error: 'Missing OPENROUTER_API_KEY in environment.'
    });
  }

  const messages = Array.isArray(req.body.messages) ? req.body.messages : [];

  if (messages.length === 0) {
    return res.status(400).json({
      error: 'messages must be a non-empty array.'
    });
  }

  try {
    const siteUrl = resolveSiteUrl(req);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

    const requestPromise = fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': siteUrl,
        'X-Title': siteTitle
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: openRouterModel,
        messages,
        temperature: 0.4,
        max_tokens: openRouterMaxTokens,
        stream: false
      })
    }).then(async (response) => {
      const payload = await response.json();

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          payload
        };
      }

      return {
        ok: true,
        status: response.status,
        payload
      };
    }).catch((error) => ({
      ok: false,
      error
    }));

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          timedOut: true,
          error: new Error('OpenRouter took too long to respond. Try again or use a smaller/faster model.')
        });
      }, requestTimeoutMs);
    });

    const result = await Promise.race([requestPromise, timeoutPromise]);

    clearTimeout(timeoutId);

    if (result.timedOut) {
      controller.abort();
      return res.status(504).json({
        error: result.error.message
      });
    }

    if (result.error) {
      if (result.error.name === 'AbortError') {
        return res.status(504).json({
          error: 'OpenRouter took too long to respond. Try again or use a smaller/faster model.'
        });
      }

      return res.status(500).json({
        error: result.error.message || 'Unexpected server error.'
      });
    }

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.payload?.error?.message || result.payload?.message || 'OpenRouter request failed.',
        details: result.payload
      });
    }

    const payload = result.payload;

    const message = payload?.choices?.[0]?.message;
    if (!message) {
      return res.status(502).json({
        error: 'OpenRouter response did not include a message.',
        details: payload
      });
    }

    const replyText = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content || '');

    res.json({
      reply: replyText,
      raw: payload,
      model: openRouterModel
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({
        error: 'OpenRouter took too long to respond. Try again or use a smaller/faster model.'
      });
    }

    res.status(500).json({
      error: error.message || 'Unexpected server error.'
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Chat demo running on http://localhost:${port}`);
});
