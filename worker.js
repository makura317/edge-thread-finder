import { archiveObjectName, parseArchiveJsonl } from './lib/archive.js';
import { currentDatUrl, kakoDatUrl, parseDatBody, parseSubjectTxt, threadDateFromId } from './lib/collector.js';
import { dictionaryTags } from './lib/tagging.js';

const BOARD_URL = 'https://bbs.eddibb.cc/liveedge';
const decoder = new TextDecoder('shift_jis', { fatal: true });

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/archive') {
      const date = url.searchParams.get('date');
      try {
        const object = await env.ARCHIVE.get(archiveObjectName(date));
        if (!object) return json({ error: '指定日のアーカイブはありません。' }, 404);
        const threads = parseArchiveJsonl(await object.text()).map(thread => ({
          ...thread,
          tags: dictionaryTags(thread)
        }));
        return json({ date, partial: true, threads });
      } catch (error) { return json({ error: error.message }, 400); }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(collectNewThreads(env));
  }
};

async function collectNewThreads(env) {
  const subjectResponse = await fetch(`${BOARD_URL}/subject.txt`, {
    headers: { 'user-agent': 'edge-thread-finder/0.1 (archive collector)' }
  });
  if (!subjectResponse.ok) throw new Error(`subject.txt の取得に失敗しました: ${subjectResponse.status}`);

  const subjects = parseSubjectTxt(decoder.decode(await subjectResponse.arrayBuffer()));
  const dates = [...new Set(subjects.map(thread => threadDateFromId(thread.id)))];
  const archives = new Map();
  for (const date of dates) {
    const object = await env.ARCHIVE.get(archiveObjectName(date));
    archives.set(date, object ? parseArchiveJsonl(await object.text()) : []);
  }

  const knownIds = new Set([...archives.values()].flatMap(threads => threads.map(thread => thread.id)));
  const fresh = subjects.filter(thread => !knownIds.has(thread.id));
  const collected = await Promise.all(fresh.map(thread => fetchThread(thread)));

  for (const thread of collected.filter(Boolean)) {
    const date = threadDateFromId(thread.id);
    archives.get(date).push(thread);
  }
  await Promise.all([...archives.entries()].map(([date, threads]) => {
    if (!collected.some(thread => thread && threadDateFromId(thread.id) === date)) return undefined;
    const body = threads.sort((a, b) => Number(a.id) - Number(b.id)).map(thread => JSON.stringify({
      id: thread.id,
      title: thread.title,
      body: thread.body,
      sourceUrl: thread.sourceUrl,
      createdAt: thread.createdAt,
      importedAt: thread.importedAt,
      contentHash: thread.contentHash
    })).join('\n');
    return env.ARCHIVE.put(archiveObjectName(date), body, { httpMetadata: { contentType: 'application/x-ndjson; charset=utf-8' } });
  }));
}

async function fetchThread(subject) {
  let response = await fetch(currentDatUrl(subject.id));
  if (!response.ok) response = await fetch(kakoDatUrl(subject.id));
  if (!response.ok) return null;
  const body = parseDatBody(decoder.decode(await response.arrayBuffer()));
  if (!body) return null;
  const createdAt = new Date(Number(subject.id) * 1000 + 9 * 60 * 60 * 1000).toISOString().replace('T', '-').replace(/:/g, '-').slice(0, 19);
  const contentHash = await sha256(`${subject.id}\n${subject.title}\n${body}`);
  return {
    id: subject.id,
    title: subject.title,
    body,
    sourceUrl: `https://bbs.eddibb.cc/test/read.cgi/liveedge/${subject.id}/`,
    createdAt,
    importedAt: new Date().toISOString(),
    contentHash
  };
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
