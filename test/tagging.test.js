import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaggingRequest, dictionaryCandidates, dictionaryTags } from '../lib/tagging.js';

test('実況MLBスレから辞書候補を抽出する', () => {
  const tags = dictionaryCandidates({ title: '【NHKBS】WSH@LAD★3', body: 'ドジャースとナショナルズ。大谷の出場予定とミラーの投球を実況する。' });
  assert.deepEqual(tags.map(tag => [tag.type, tag.value]), [['種別', '実況'], ['リーグ', 'MLB'], ['球団', 'ドジャース'], ['球団', 'ナショナルズ'], ['選手', '大谷翔平'], ['選手', 'ボビー・ミラー']]);
});

test('アーカイブ表示用の辞書タグはUIに必要な情報だけを返す', () => {
  const tags = dictionaryTags({ title: '【NHKBS】WSH@LAD★3', body: '' });
  assert.deepEqual(tags.map(tag => [tag.type, tag.value, tag.source]), [
    ['種別', '実況', 'dictionary'],
    ['球団', 'ドジャース', 'dictionary'],
    ['球団', 'ナショナルズ', 'dictionary']
  ]);
});

test('一般的な実況・話題スレにも検索用の辞書タグを付ける', () => {
  const tags = dictionaryTags({ title: '【フジ】ONE PIECE', body: '今日のアニメ実況スレ' });
  assert.deepEqual(tags.map(tag => [tag.type, tag.value]), [
    ['種別', '実況'],
    ['話題', 'アニメ']
  ]);
});

test('Lunaへのリクエストは構造化出力と本文上限を持つ', () => {
  const request = createTaggingRequest({ title: 'テスト', body: 'あ'.repeat(60_000), candidates: [] });
  assert.equal(request.model, 'gpt-5.6-luna');
  assert.equal(request.reasoning.effort, 'low');
  assert.equal(request.text.format.type, 'json_schema');
  assert.match(request.input[1].content, /あ{50000}/);
  assert.doesNotMatch(request.input[1].content, /あ{50001}/);
});
