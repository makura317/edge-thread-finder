import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const textObject = text => ({ text: async () => text });

test('公開Workerはユーザー起点のLuna実行APIを公開しない', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/analyze-tags', { method: 'POST' }), {
    ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) }
  });
  assert.equal(response.status, 404);
});

test('保存済みLunaタグがあるスレは辞書タグより優先して返す', async () => {
  const objects = new Map([
    ['2026-09-06.jsonl', textObject('{"id":"1","title":"テスト","body":"本文","createdAt":"2026-09-06-12-34-56","sourceUrl":"https://example.test/1/"}')],
    ['tags/2026-09-06.jsonl', textObject('{"id":"1","summary":"要約","tags":[{"type":"話題","value":"テスト","confidence":0.9,"source":"luna"}]}')]
  ]);
  const response = await worker.fetch(new Request('https://example.test/api/archive?date=2026-09-06'), {
    ARCHIVE: { get: async key => objects.get(key) || null },
    ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) }
  });
  const archive = await response.json();
  assert.equal(archive.threads[0].tagSource, 'luna');
  assert.equal(archive.threads[0].tagSummary, '要約');
  assert.equal(archive.threads[0].tags[0].value, 'テスト');
});
