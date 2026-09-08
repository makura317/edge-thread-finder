import { archiveObjectName, parseArchiveJsonl } from './lib/archive.js';
import { finalTags, parseTagArchiveJsonl, serializeTagArchive, tagArchiveObjectName } from './lib/ai-tag-archive.js';
import { currentDatUrl, kakoDatUrl, parseDatBody, parseSubjectTxt, threadDateFromId } from './lib/collector.js';
import { createTaggingRequest, dictionaryCandidates, dictionaryTags, readResponseJson } from './lib/tagging.js';

const BOARD_URL = 'https://bbs.eddibb.cc/liveedge';
const DEFAULT_TAG_BATCH_SIZE = 6;
// A dat fetch can need a second request for the kako fallback. Keep well below
// Workers' per-invocation subrequest limit and let the next hourly run continue.
const MAX_COLLECT_PER_RUN = 20;
const COLLECT_CONCURRENCY = 5;
const TAGGING_STATUS_KEY = 'status/tagging.json';
const decoder = new TextDecoder('shift_jis', { fatal: true });

const json = (body, status = 200, cacheControl = 'public, max-age=300') => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cacheControl }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/status') {
      try {
        const object = await env.ARCHIVE.get(TAGGING_STATUS_KEY);
        return json({
          keyConfigured: Boolean(env.OPENAI_API_KEY),
          tagging: object ? JSON.parse(await object.text()) : null
        }, 200, 'no-store');
      } catch (error) {
        return json({ error: error.message }, 500, 'no-store');
      }
    }
    if (url.pathname === '/api/archive') {
      const date = url.searchParams.get('date');
      try {
        const [object, tagObject] = await Promise.all([
          env.ARCHIVE.get(archiveObjectName(date)),
          env.ARCHIVE.get(tagArchiveObjectName(date))
        ]);
        if (!object) return json({ error: '指定日のアーカイブはありません。' }, 404);
        const savedTags = tagObject ? parseTagArchiveJsonl(await tagObject.text()) : new Map();
        const threads = parseArchiveJsonl(await object.text()).map(thread => {
          const tagged = savedTags.get(thread.id);
          return {
            ...thread,
            tags: tagged?.tags || dictionaryTags(thread),
            tagSource: tagged ? 'luna' : 'dictionary',
            tagSummary: tagged?.summary
          };
        });
        return json({ date, partial: true, threads });
      } catch (error) { return json({ error: error.message }, 400); }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledWork(env));
  }
};

async function runScheduledWork(env) {
  let collection = { state: 'success' };
  try {
    await collectNewThreads(env);
  } catch (error) {
    console.error('ログ収集に失敗しました', error);
    collection = { state: 'failed', error: errorMessage(error) };
  }

  let tagging;
  try {
    tagging = await refineArchiveBatch(env);
  } catch (error) {
    console.error('タグ精査のバッチ処理に失敗しました', error);
    tagging = { state: 'failed', processed: 0, error: errorMessage(error) };
  }

  await writeTaggingStatus(env, { collection, tagging });
}

async function refineArchiveBatch(env) {
  if (!env.OPENAI_API_KEY) {
    return { state: 'skipped', processed: 0, reason: 'missing_openai_api_key' };
  }
  const listed = await env.ARCHIVE.list({ limit: 1000 });
  const dates = listed.objects
    .map(object => object.key.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/)?.[1])
    .filter(Boolean)
    .sort();
  const batchSize = boundedBatchSize(env.TAG_BATCH_SIZE);
  let remaining = batchSize;
  let processed = 0;

  for (const date of dates) {
    if (!remaining) break;
    const [archiveObject, tagObject] = await Promise.all([
      env.ARCHIVE.get(archiveObjectName(date)),
      env.ARCHIVE.get(tagArchiveObjectName(date))
    ]);
    if (!archiveObject) continue;
    const threads = parseArchiveJsonl(await archiveObject.text());
    const records = tagObject ? parseTagArchiveJsonl(await tagObject.text()) : new Map();
    const pending = threads.filter(thread => !records.has(thread.id)).slice(0, remaining);

    for (const thread of pending) {
      const result = await refineThread(thread, env);
      if (result.error) {
        return { state: 'failed', processed, error: result.error };
      }
      records.set(thread.id, result.record);
      await env.ARCHIVE.put(tagArchiveObjectName(date), serializeTagArchive(records), {
        httpMetadata: { contentType: 'application/x-ndjson; charset=utf-8' }
      });
      remaining -= 1;
      processed += 1;
      if (!remaining) break;
    }
  }

  return { state: 'success', processed, reason: processed ? 'tagged' : 'no_pending_threads' };
}

function boundedBatchSize(value) {
  const parsed = Number(value || DEFAULT_TAG_BATCH_SIZE);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 12) : DEFAULT_TAG_BATCH_SIZE;
}

async function refineThread(thread, env) {
  const candidates = dictionaryCandidates(thread);
  const payload = createTaggingRequest({ ...thread, candidates, model: env.TAGGING_MODEL || 'gpt-5.6-luna' });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const upstream = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const response = await upstream.json().catch(() => ({}));
      if (upstream.status === 429 && attempt < 2) {
        await sleep((attempt + 1) * 2000);
        continue;
      }
      if (!upstream.ok) {
        console.error(`タグ精査に失敗しました: ${upstream.status}`, response.error?.message);
        return { error: {
          code: `openai_${upstream.status}`,
          message: errorMessage(response.error?.message || 'OpenAI API がエラーを返しました。')
        } };
      }
      const analysis = readResponseJson(response);
      return { record: {
        id: thread.id,
        analyzedAt: new Date().toISOString(),
        model: payload.model,
        summary: analysis.summary,
        tags: finalTags(analysis),
        decisions: analysis.tags,
        usage: response.usage
      } };
    } catch (error) {
      if (attempt === 2) {
        console.error('タグ精査中に例外が発生しました', error);
        return { error: { code: 'request_exception', message: errorMessage(error) } };
      }
      else await sleep((attempt + 1) * 2000);
    }
  }
  return { error: { code: 'request_failed', message: 'OpenAI API リクエストに失敗しました。' } };
}

async function writeTaggingStatus(env, status) {
  try {
    await env.ARCHIVE.put(TAGGING_STATUS_KEY, JSON.stringify({
      updatedAt: new Date().toISOString(),
      keyConfigured: Boolean(env.OPENAI_API_KEY),
      ...status
    }), { httpMetadata: { contentType: 'application/json; charset=utf-8' } });
  } catch (error) {
    console.error('タグ精査ステータスの保存に失敗しました', error);
  }
}

function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || '不明なエラー');
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 240);
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

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
  const fresh = subjects.filter(thread => !knownIds.has(thread.id)).slice(0, MAX_COLLECT_PER_RUN);
  const collected = await collectWithConcurrency(fresh, COLLECT_CONCURRENCY);

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

async function collectWithConcurrency(subjects, concurrency) {
  const collected = [];
  for (let index = 0; index < subjects.length; index += concurrency) {
    const batch = await Promise.all(subjects.slice(index, index + concurrency).map(fetchThread));
    collected.push(...batch);
  }
  return collected;
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
