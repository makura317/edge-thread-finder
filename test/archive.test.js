import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveObjectName, parseArchiveJsonl } from '../lib/archive.js';

test('R2の日付別オブジェクト名とJSONLを検索用データへ変換する', () => {
  assert.equal(archiveObjectName('2026-09-06'), '2026-09-06.jsonl');
  const [thread] = parseArchiveJsonl('{"id":"1","title":"テスト","body":"1 : a\\n2 : b","createdAt":"2026-09-06-12-34-56","sourceUrl":"https://example.test/1/"}');
  assert.equal(thread.responses, 2);
  assert.equal(thread.op, 'a');
  assert.equal(thread.createdAt, '2026-09-06T12:34:56+09:00');
  assert.equal(thread.url, 'https://example.test/1/');
});

test('旧アーカイブの平坦化された本文からも>>1だけを切り出す', () => {
  const body = '1 :  エッヂの名無し  2026/09/06(日) 23:40:46.180   user1         1レス目の1行目\n1レス目の2行目      2 :  エッヂの名無し  2026/09/06(日) 23:41:48.285   user2         2レス目';
  const [thread] = parseArchiveJsonl(JSON.stringify({ id: '1', title: 'テスト', body, createdAt: '2026-09-06-12-34-56', sourceUrl: 'https://example.test/1/' }));
  assert.equal(thread.op, '1レス目の1行目\n1レス目の2行目');
  assert.equal(thread.op.includes('2レス目'), false);
  assert.equal(thread.opHeader, '1 エッヂの名無し 09/06(日) 23:40:46.180 ID:user1');
});
