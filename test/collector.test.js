import test from 'node:test';
import assert from 'node:assert/strict';
import { currentDatUrl, kakoDatUrl, parseDatBody, parseSubjectTxt, threadDateFromId } from '../lib/collector.js';

test('公式subject.txtからスレッドID・タイトル・レス数を読む', () => {
  assert.deepEqual(parseSubjectTxt('1788775243.dat<>【TBS】CDTVライブ!ライブ! (286)\r\n'), [
    { id: '1788775243', title: '【TBS】CDTVライブ!ライブ!', responses: 286 }
  ]);
});

test('スレッドIDからJST日付と現行・過去dat URLを作る', () => {
  assert.equal(threadDateFromId('1788703800'), '2026-09-06');
  assert.equal(currentDatUrl('1788703800'), 'https://bbs.eddibb.cc/liveedge/dat/1788703800.dat');
  assert.equal(kakoDatUrl('1788703800'), 'https://bbs.eddibb.cc/liveedge/kako/1788/17887/1788703800.dat');
});

test('Shift_JISでデコード済みのdat本文を検索用テキストにする', () => {
  const dat = '名前<><>日時<>1行目<br>2行目<>タイトル\n名前<><>日時<>次のレス<>タイトル';
  assert.equal(parseDatBody(dat), '1 : 1行目\n2行目\n2 : 次のレス');
});
