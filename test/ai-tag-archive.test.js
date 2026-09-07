import test from 'node:test';
import assert from 'node:assert/strict';
import { finalTags, parseTagArchiveJsonl, serializeTagArchive, tagArchiveObjectName } from '../lib/ai-tag-archive.js';

test('AIタグ用R2オブジェクトは日付ごとに分離する', () => {
  assert.equal(tagArchiveObjectName('2026-09-06'), 'tags/2026-09-06.jsonl');
  assert.throws(() => tagArchiveObjectName('2026/09/06'));
});

test('AIタグのJSONLはIDで再開可能な形に読み書きできる', () => {
  const records = new Map([['2', { id: '2', tags: [] }], ['1', { id: '1', tags: [{ type: '話題', value: 'ゲーム' }] }]]);
  const restored = parseTagArchiveJsonl(serializeTagArchive(records));
  assert.equal(restored.get('1').tags[0].value, 'ゲーム');
  assert.equal(restored.get('2').id, '2');
});

test('Lunaのdrop判断は表示用タグから除外する', () => {
  assert.deepEqual(finalTags({ tags: [
    { type: '話題', value: 'ゲーム', decision: 'keep', confidence: 0.9 },
    { type: '人物', value: '誤検出', decision: 'drop', confidence: 0.8 }
  ] }), [{ type: '話題', value: 'ゲーム', confidence: 0.9, source: 'luna' }]);
});
