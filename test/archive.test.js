import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveObjectName, parseArchiveJsonl } from '../lib/archive.js';

test('R2の日付別オブジェクト名とJSONLを検索用データへ変換する', () => {
  assert.equal(archiveObjectName('2026-09-06'), '2026-09-06.jsonl');
  const [thread] = parseArchiveJsonl('{"id":"1","title":"テスト","body":"1 : a\\n2 : b","createdAt":"2026-09-06-12-34-56","sourceUrl":"https://example.test/1/"}');
  assert.equal(thread.responses, 2);
  assert.equal(thread.createdAt, '2026-09-06T12:34:56+09:00');
  assert.equal(thread.url, 'https://example.test/1/');
});
