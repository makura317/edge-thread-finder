import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTaggingRequest, dictionaryCandidates, readResponseJson } from './lib/tagging.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'POST' && url.pathname === '/api/tag-candidates') return handleCandidates(req, res);
  if (req.method === 'POST' && url.pathname === '/api/analyze-tags') return handleAnalysis(req, res);
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = normalize(requested).replace(/^([.][.][/\\])+/, '');
  try {
    const body = await readFile(join(root, safePath));
    res.writeHead(200, { 'content-type': mime[extname(safePath)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, () => console.log(`エッヂ落ちスレ検索: http://localhost:${port}`));

async function requestJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (raw.length > 200_000) throw new Error('本文が大きすぎます。');
  const payload = JSON.parse(raw || '{}');
  if (typeof payload.title !== 'string' || typeof payload.body !== 'string') throw new Error('title と body は文字列で指定してください。');
  return payload;
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handleCandidates(req, res) {
  try {
    const thread = await requestJson(req);
    json(res, 200, { candidates: dictionaryCandidates(thread) });
  } catch (error) { json(res, 400, { error: error.message }); }
}

async function handleAnalysis(req, res) {
  try {
    const thread = await requestJson(req);
    const candidates = dictionaryCandidates(thread);
    if (!process.env.OPENAI_API_KEY) return json(res, 503, { error: 'OPENAI_API_KEY が未設定です。辞書候補のみ利用できます。', candidates });
    const request = createTaggingRequest({ ...thread, candidates, model: process.env.TAGGING_MODEL || 'gpt-5.6-luna' });
    const upstream = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(request) });
    const response = await upstream.json();
    if (!upstream.ok) return json(res, upstream.status, { error: response.error?.message || 'OpenAI API の呼び出しに失敗しました。', candidates });
    json(res, 200, { candidates, analysis: readResponseJson(response), model: request.model, usage: response.usage });
  } catch (error) { json(res, 500, { error: error.message }); }
}
