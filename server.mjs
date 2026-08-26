import { createServer } from 'node:http';

const port = Number(process.env.PORT || 3000);
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
const llmBase = (process.env.OPENAI_API_BASE || '').replace(/\/+$/, '');
const llmKey = process.env.OPENAI_API_KEY || '';
const model = process.env.LLM_MODEL || 'gpt-5-mini';
const streamWindowMs = 60_000;
const streamLimit = 10;
const streamClients = new Map();

function clientKey(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(); }
function rateLimit(req, res) { const key = clientKey(req); const now = Date.now(); const current = streamClients.get(key); if (!current || current.resetAt <= now) { streamClients.set(key, { count: 1, resetAt: now + streamWindowMs }); return true; } if (current.count >= streamLimit) { const retryAfter = Math.ceil((current.resetAt - now) / 1000); res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(retryAfter), 'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin' }); res.end(JSON.stringify({ error: 'Too many stream requests', retryAfter })); return false; } current.count += 1; return true; }

const json = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Vary': 'Origin',
  });
  res.end(JSON.stringify(payload));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 6_000_000) reject(new Error('Request too large')); });
  req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); } });
  req.on('error', reject);
});

async function invokeLLM(messages, responseFormat) {
  if (!llmBase || !llmKey) throw new Error('LLM is not configured. Set OPENAI_API_BASE and OPENAI_API_KEY on the server.');
  const response = await fetch(`${llmBase}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${llmKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, ...(responseFormat ? { response_format: responseFormat } : {}) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `LLM request failed (${response.status})`);
  return payload.choices?.[0]?.message?.content || '';
}

async function streamLLM(messages, res) {
  if (!llmBase || !llmKey) throw new Error('LLM is not configured. Set OPENAI_API_BASE and OPENAI_API_KEY on the server.');
  const upstream = await fetch(`${llmBase}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${llmKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages, stream: true }) });
  if (!upstream.ok) { const error = await upstream.text(); throw new Error(`LLM stream failed (${upstream.status}): ${error.slice(0, 400)}`); }
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', Vary: 'Origin' });
  const reader = upstream.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  const send = payload => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  try { while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (!line.startsWith('data:')) continue; const raw = line.slice(5).trim(); if (!raw || raw === '[DONE]') continue; try { const delta = JSON.parse(raw).choices?.[0]?.delta?.content; if (delta) send({ delta }); } catch { /* ignore incomplete provider frames */ } } } send({ done: true }); } finally { reader.releaseLock(); res.end(); }
}

const analysisSchema = {
  type: 'json_schema', json_schema: { name: 'scriptguard_analysis', strict: true, schema: {
    type: 'object', additionalProperties: false,
    properties: { fileName: { type: 'string' }, language: { type: 'string' }, safety: { type: 'integer' }, efficiency: { type: 'integer' }, quality: { type: 'integer' }, status: { type: 'string' }, statusTitle: { type: 'string' }, statusDesc: { type: 'string' }, statusBadge: { type: 'string' }, statusIcon: { type: 'string' }, statusIconBg: { type: 'string' }, fixCode: { type: 'string' }, issues: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'integer' }, type: { type: 'string' }, severity: { type: 'string' }, icon: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, line: { type: 'integer' }, code: { type: 'string' } }, required: ['id','type','severity','icon','title','description','line','code'] } } },
    required: ['fileName','language','safety','efficiency','quality','status','statusTitle','statusDesc','statusBadge','statusIcon','statusIconBg','fixCode','issues'],
  } }
};

async function route(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method === 'GET' && req.url === '/api/health') return json(res, 200, { ok: true, llmConfigured: Boolean(llmBase && llmKey), model });
  if (req.method !== 'POST' || !['/api/analyze', '/api/translate', '/api/chat/stream'].includes(req.url)) return json(res, 404, { error: 'Not found' });
  try {
    const body = await readBody(req);
    if (req.url === '/api/chat/stream') {
      if (!rateLimit(req, res)) return;
      const messages = Array.isArray(body.messages) ? body.messages.slice(-12).filter(item => item && ['user','assistant'].includes(item.role) && typeof item.content === 'string').map(item => ({ role: item.role, content: item.content.slice(0, 4000) })) : [];
      if (!messages.length || messages[messages.length - 1].role !== 'user') return json(res, 400, { error: 'A user message is required' });
      const locale = ['ar-MA', 'ar', 'en-US'].includes(body.locale) ? body.locale : 'ar-MA'; const localeGuidance = locale === 'ar-MA' ? 'Use accurate natural Moroccan Darija (الدارجة المغربية), with Moroccan vocabulary such as آش، دابا، واخا، بزاف، خذ راحتك. Do not mix in Algerian or Tunisian dialect. Keep it warm and concise.' : locale === 'en-US' ? 'Reply in natural concise English.' : 'Reply in clear Modern Standard Arabic.'; const context = body.context && typeof body.context === 'object' ? JSON.stringify({ temperature: body.context.temperature, wind: body.context.wind, sunrise: body.context.sunrise, sunset: body.context.sunset, advice: body.context.advice }) : 'No location or weather context is available.';
      return await streamLLM([{ role: 'system', content: `You are Sentinel, a warm futuristic AI companion. ${localeGuidance} Offer weather, sunrise, sunset, and safety advice only when relevant. Current optional context: ${context}. Never claim to sense a device unless the browser explicitly reports a sensor event. Never perform external actions; ask for confirmation before anything consequential. You are an AI, not a human; do not misrepresent your identity.` }, ...messages], res);
    }
    if (req.url === '/api/analyze') {
      if (typeof body.code !== 'string' || !body.code.trim()) return json(res, 400, { error: 'code is required' });
      const content = await invokeLLM([
        { role: 'system', content: 'You are ScriptGuard, a careful multilingual code reviewer. Return JSON only. Analyze security, performance, and quality. Never invent issues; quote exact lines when possible. Keep fixCode syntactically valid and preserve behavior.' },
        { role: 'user', content: JSON.stringify({ fileName: body.fileName || 'source.py', language: body.language || 'python', code: body.code }) },
      ], analysisSchema);
      return json(res, 200, JSON.parse(content));
    }
    if (typeof body.code !== 'string' || !['ar-en', 'en-ar'].includes(body.direction)) return json(res, 400, { error: 'code and direction are required' });
    const translated = await invokeLLM([
      { role: 'system', content: `Translate only human-language text in Python comments and string literals from ${body.direction === 'ar-en' ? 'Arabic to English' : 'English to Arabic'}. Preserve every keyword, identifier, indentation, quote, escape, placeholder, and f-string expression exactly. Return code only.` },
      { role: 'user', content: body.code },
    ]);
    return json(res, 200, { code: translated, mode: 'llm' });
  } catch (error) { return json(res, error.message.includes('not configured') ? 503 : 500, { error: error.message }); }
}

createServer((req, res) => route(req, res).catch(error => json(res, 500, { error: error.message }))).listen(port, '0.0.0.0', () => console.log(`ScriptGuard API listening on ${port}`));
