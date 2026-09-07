import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaggingRequest, dictionaryCandidates } from '../lib/tagging.js';

test('実況MLBスレから辞書候補を抽出する', () => {
  const tags = dictionaryCandidates({ title: '【NHKBS】WSH@LAD★3', body: 'ドジャースとナショナルズ。大谷の出場予定とミラーの投球を実況する。' });
  assert.deepEqual(tags.map(tag => [tag.type, tag.value]), [['種別', '実況'], ['リーグ', 'MLB'], ['球団', 'ドジャース'], ['球団', 'ナショナルズ'], ['選手', '大谷翔平'], ['選手', 'ボビー・ミラー']]);
});

test('Lunaへのリクエストは構造化出力と本文上限を持つ', () => {
  const request = createTaggingRequest({ title: 'テスト', body: 'あ'.repeat(60_000), candidates: [] });
  assert.equal(request.model, 'gpt-5.6-luna');
  assert.equal(request.reasoning.effort, 'low');
  assert.equal(request.text.format.type, 'json_schema');
  assert.match(request.input[1].content, /あ{50000}/);
  assert.doesNotMatch(request.input[1].content, /あ{50001}/);
});
