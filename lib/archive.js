export function archiveObjectName(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date は YYYY-MM-DD 形式で指定してください。');
  return `${date}.jsonl`;
}

export function parseArchiveJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)).map(thread => ({
    ...thread,
    responses: countResponses(thread.body),
    op: firstResponse(thread.body),
    url: thread.sourceUrl,
    createdAt: thread.createdAt.replace(/-/g, (match, offset) => offset === 4 || offset === 7 ? '-' : match).replace(/^(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})-(\d{2})$/, '$1T$2:$3:$4+09:00'),
    tags: thread.tags || []
  }));
}

function countResponses(body) {
  const lineMarkers = body.match(/(?:^|\n)\d+(?:\s+\(\d+\))?\s*:/g) || [];
  const flattenedMarkers = body.match(/(?:^|\s)\d+(?:\s+\(\d+\))?\s*:\s+エッヂの名無し/g) || [];
  return Math.max(lineMarkers.length, flattenedMarkers.length);
}

function firstResponse(body) {
  const normal = body.match(/^1(?:\s+\(\d+\))?\s*:\s*([\s\S]*?)(?=\n2(?:\s+\(\d+\))?\s*:)/);
  if (normal) return normal[1].trim();
  const header = /^1(?:\s+\(\d+\))?\s*:\s+エッヂの名無し\s+\d{4}\/\d{2}\/\d{2}\([^)]*\)\s+\d{2}:\d{2}:\d{2}\.\d+\s+\S+(?:\s+\(\d+\/\d+\))?\s+/;
  const opening = header.test(body) ? body.replace(header, '') : body.replace(/^1(?:\s+\(\d+\))?\s*:\s*/, '');
  const nextResponse = opening.search(/\s+2(?:\s+\(\d+\))?\s*:\s+エッヂの名無し/);
  return (nextResponse === -1 ? opening : opening.slice(0, nextResponse)).trim();
}
