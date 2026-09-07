const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function tagArchiveObjectName(date) {
  if (!DATE.test(date)) throw new Error('date は YYYY-MM-DD 形式で指定してください。');
  return `tags/${date}.jsonl`;
}

export function parseTagArchiveJsonl(text) {
  return new Map(text.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const record = JSON.parse(line);
    return [record.id, record];
  }));
}

export function serializeTagArchive(records) {
  return [...records.values()]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map(record => JSON.stringify(record))
    .join('\n');
}

export function finalTags(analysis) {
  return analysis.tags
    .filter(tag => tag.decision !== 'drop')
    .map(({ type, value, confidence }) => ({ type, value, confidence, source: 'luna' }));
}
