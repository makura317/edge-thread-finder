import { archiveObjectName, parseArchiveJsonl } from './lib/archive.js';
import { dictionaryTags } from './lib/tagging.js';

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
  }
};
