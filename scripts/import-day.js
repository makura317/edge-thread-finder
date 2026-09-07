import { createHash } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const ARCHIVE_ROOT = 'https://www.kyodemo.net/sdemo/b/e_e_liveedge';
const THREAD_ROOT = 'https://www.kyodemo.net/sdemo/r/e_e_liveedge';
const JST_OFFSET = '+09:00';

export function dayRange(date) {
  const start = Math.floor(Date.parse(`${date}T00:00:00${JST_OFFSET}`) / 1000);
  if (!Number.isFinite(start)) throw new Error('日付は YYYY-MM-DD 形式で指定してください。');
  return { start, end: start + 86_400 };
}

export function archivePageUrl(offset) {
  return offset === 0 ? `${ARCHIVE_ROOT}/?kt=k_` : `${ARCHIVE_ROOT}/${offset + 1}?j=1&kt=k_`;
}

export function threadIdsFromHtml(html) {
  return [...html.matchAll(/href=["']\/sdemo\/r\/e_e_liveedge\/(\d+)\/?["']/g)].map(match => Number(match[1]));
}

function charsetFromContentType(contentType) {
  return contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1]?.toLowerCase();
}

function charsetFromHtmlBytes(bytes) {
  // The meta tag is ASCII-compatible, so it can be inspected before decoding the page.
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 4_096));
  return head.match(/<meta[^>]+charset\s*=\s*["']?([^\s"'>]+)/i)?.[1]?.toLowerCase();
}

export function decodeArchiveResponse(bytes, contentType = '') {
  // kyodemo's past-log pages omit a charset header but are Shift_JIS.
  const charset = charsetFromContentType(contentType) || charsetFromHtmlBytes(bytes) || 'shift_jis';
  let decoded;
  try {
    decoded = new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`文字コード ${charset} としてデコードできません。保存を中止しました。`);
  }
  if (decoded.includes('\uFFFD')) throw new Error('文字化けを検出したため保存を中止しました。');
  return decoded;
}

function decodeHtml(text) {
  return text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function threadFromHtml(html, id, importedAt) {
  const title = decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s*-\s*エッヂ\s*$/u, '').trim();
  const body = decodeHtml((html.match(/<main[\s\S]*?<\/main>/i)?.[0]) || html);
  const createdAt = body.match(/(20\d{2})\/(\d{2})\/(\d{2}).{0,12}(\d{2}):(\d{2}):(\d{2})/)?.slice(1).join('-');
  return {
    id: String(id), title, body, sourceUrl: `${THREAD_ROOT}/${id}/`,
    createdAt: createdAt || new Date(id * 1000).toISOString(), importedAt,
    contentHash: createHash('sha256').update(`${title}\n${body}`).digest('hex')
  };
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'edge-thread-finder/0.1 (+local archive import)' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return decodeArchiveResponse(new Uint8Array(await response.arrayBuffer()), response.headers.get('content-type') || '');
}

async function parallelMap(values, concurrency, callback) {
  const results = []; let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < values.length) { const index = cursor++; results[index] = await callback(values[index]); }
  }));
  return results;
}

export async function discoverThreadIds(date, { fetchPage = fetchText } = {}) {
  const { start, end } = dayRange(date); const ids = new Set();
  for (let offset = 0; offset < 5_000; offset += 50) {
    const pageIds = threadIdsFromHtml(await fetchPage(archivePageUrl(offset)));
    if (!pageIds.length) break;
    pageIds.filter(id => id >= start && id < end).forEach(id => ids.add(id));
    if (Math.min(...pageIds) < start) break;
  }
  return [...ids].sort((a, b) => a - b);
}

async function main() {
  const [date, ...flags] = process.argv.slice(2);
  if (!date) throw new Error('使い方: node scripts/import-day.js 2026-09-06 [--dry-run]');
  const dryRun = flags.includes('--dry-run'); const allowPartial = flags.includes('--allow-partial');
  const ids = await discoverThreadIds(date);
  if (!ids.length) throw new Error(`${date} の過去ログは公開ミラーにまだありません。公開後に同じコマンドを再実行してください。`);
  const { start } = dayRange(date);
  if (!allowPartial && ids[0] > start + 300) throw new Error(`${date} のアーカイブは ${new Date(ids[0] * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} からしか公開されていません。--allow-partial なしでは保存しません。`);
  if (dryRun) return console.log(JSON.stringify({ date, threads: ids.length, firstId: ids[0], lastId: ids.at(-1), partial: ids[0] > start + 300 }));
  const destination = resolve(`data/archive/${date}.jsonl`); const manifest = resolve(`data/archive/${date}.manifest.json`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, '');
  const importedAt = new Date().toISOString();
  let completed = 0; const failures = [];
  await parallelMap(ids, 8, async id => {
    try {
      const thread = threadFromHtml(await fetchText(`${THREAD_ROOT}/${id}/`), id, importedAt);
      await appendFile(destination, `${JSON.stringify(thread)}\n`);
      completed += 1;
      if (completed % 100 === 0 || completed + failures.length === ids.length) console.log(`保存: ${completed}/${ids.length}`);
    } catch (error) { failures.push({ id: String(id), error: error.message }); }
  });
  await writeFile(manifest, `${JSON.stringify({ date, discoveredThreads: ids.length, savedThreads: completed, failures, source: 'kyodemo public archive', importedAt, partial: ids[0] > start + 300 }, null, 2)}\n`);
  console.log(`完了: ${destination} (${completed}/${ids.length})`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) main().catch(error => { console.error(error.message); process.exitCode = 1; });
