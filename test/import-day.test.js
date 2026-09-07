import test from 'node:test';
import assert from 'node:assert/strict';
import { archivePageUrl, dayRange, threadIdsFromHtml, decodeArchiveResponse } from '../scripts/import-day.js';

test('JSTの日付範囲と過去ログURLを組み立てる', () => {
  assert.deepEqual(dayRange('2026-09-06'), { start: 1788620400, end: 1788706800 });
  assert.equal(archivePageUrl(0), 'https://www.kyodemo.net/sdemo/b/e_e_liveedge/?kt=k_');
  assert.equal(archivePageUrl(50), 'https://www.kyodemo.net/sdemo/b/e_e_liveedge/51?j=1&kt=k_');
});

test('一覧HTMLからスレッドIDを重複なく抽出できる', () => {
  const html = '<a href="/sdemo/r/e_e_liveedge/1788678098/">x</a><a href="/sdemo/r/e_e_liveedge/1788678098/">x</a>';
  assert.deepEqual(threadIdsFromHtml(html), [1788678098, 1788678098]);
});

test('charset指定がない過去ログはShift_JISとしてデコードする', () => {
  const shiftJis = Uint8Array.from([0x82, 0xa0]); // 「あ」
  assert.equal(decodeArchiveResponse(shiftJis), 'あ');
});

test('charset指定があるページは指定された文字コードを使う', () => {
  const utf8 = new TextEncoder().encode('エッヂ');
  assert.equal(decodeArchiveResponse(utf8, 'text/html; charset=utf-8'), 'エッヂ');
});
